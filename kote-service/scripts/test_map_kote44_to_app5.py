"""Boundary checks for the app-independent 44-to-5 handoff adapter."""

import json
from pathlib import Path
import unittest

from map_kote44_to_app5 import map_document


ROOT = Path(__file__).resolve().parents[1]
MAPPING = json.loads((ROOT / "reports/emotion-mapping/official_mapping_v0_3/MAPPING_RULES_V0_3.json").read_text(encoding="utf-8"))
ASSIGNMENT = json.loads((ROOT / "reports/emotion-mapping/REPORT_ASSIGNMENT_RULE_V0_1.json").read_text(encoding="utf-8"))
SMOKE = json.loads((ROOT / "reports/team_kote_setup_v0_1/SMOKE_OUTPUT_LOCAL_CPU.json").read_text(encoding="utf-8"))


def source(scores):
    return {
        "schema_version": "1.0",
        "label_order": [dict(label) for label in SMOKE["label_order"]],
        "model": {"version": "synthetic-test"},
        "items": [{"id": "event-1", "probabilities_44": scores}],
    }


def item(scores):
    return map_document(source(scores), MAPPING, ASSIGNMENT)["items"][0]


class MappingTests(unittest.TestCase):
    def test_real_smoke_output_has_five_scores_without_diary_text(self):
        result = map_document(SMOKE, MAPPING, ASSIGNMENT)
        self.assertEqual(len(result["items"]), len(SMOKE["items"]))
        self.assertEqual(list(result["items"][0]["scores5"]), MAPPING["emotion_order"])
        self.assertNotIn("text", result["items"][0])

    def test_inclusive_margin_boundary_assigns_unique_top(self):
        scores = [0.01] * 44
        scores[40] = 0.7
        scores[41] = 0.5
        result = item(scores)
        self.assertEqual(result["decision_status"], "assigned")
        self.assertEqual(result["representative_emotion"], "행복")
        self.assertEqual(result["margin"], 0.2)

    def test_tie_and_low_margin_are_withheld(self):
        scores = [0.01] * 44
        scores[40] = scores[41] = 0.8
        self.assertEqual(item(scores)["representative_emotion"], None)
        scores[41] = 0.7
        self.assertEqual(item(scores)["decision_status"], "withheld")

    def test_excluded_label_ten_does_not_raise_sadness(self):
        scores = [0.01] * 44
        scores[10] = 0.99
        result = item(scores)
        self.assertEqual(result["scores5"]["슬픔"], 0.01)
        self.assertEqual(result["decision_status"], "withheld")

    def test_rejects_wrong_label_order_and_invalid_scores(self):
        invalid = source([0.01] * 44)
        invalid["label_order"][40] = {"label_id": 40, "label": "wrong"}
        with self.assertRaises(ValueError):
            map_document(invalid, MAPPING, ASSIGNMENT)
        with self.assertRaises(ValueError):
            item([0.01] * 43)


if __name__ == "__main__":
    unittest.main()
