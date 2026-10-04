"""Convert verified KOTE 44-score output into the selected five report emotions.

This is an app-independent handoff adapter. It reads the JSON produced by
infer_a0_kote.py, keeps item IDs, and returns derived scores and assignment
decisions without copying diary text. It does not call Firebase or a model.
"""

from __future__ import annotations

import argparse
from decimal import Decimal
import json
import math
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MAPPING = ROOT / "reports/emotion-mapping/official_mapping_v0_3/MAPPING_RULES_V0_3.json"
DEFAULT_ASSIGNMENT = ROOT / "reports/emotion-mapping/REPORT_ASSIGNMENT_RULE_V0_1.json"


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return value


def map_document(
    kote: dict[str, Any], mapping: dict[str, Any], assignment: dict[str, Any]
) -> dict[str, Any]:
    order = mapping.get("emotion_order")
    if order != ["행복", "피곤함", "슬픔", "화남", "불안함"]:
        raise ValueError("Unexpected five-emotion order")
    if assignment.get("mapping_version") != mapping.get("mapping_version"):
        raise ValueError("Mapping and assignment versions differ")
    if mapping.get("aggregation") != "maximum" or assignment.get("score_aggregation") != "maximum_of_connected_kote_labels_per_emotion":
        raise ValueError("Only the adopted maximum aggregation is supported")
    if kote.get("schema_version") != "1.0":
        raise ValueError("Expected KOTE inference schema version 1.0")

    labels = kote.get("label_order")
    if not isinstance(labels, list) or len(labels) != 44:
        raise ValueError("KOTE label_order must contain 44 labels")
    for index, label in enumerate(labels):
        if not isinstance(label, dict) or label.get("label_id") != index:
            raise ValueError(f"Invalid KOTE label ID at position {index}")
    connections = mapping.get("mapping")
    if not isinstance(connections, dict):
        raise ValueError("Missing mapping connections")
    for emotion in order:
        linked = connections.get(emotion)
        if not isinstance(linked, list) or not linked:
            raise ValueError(f"Missing connections for {emotion}")
        for entry in linked:
            label_id = entry.get("label_id") if isinstance(entry, dict) else None
            if not isinstance(label_id, int) or not 0 <= label_id < 44:
                raise ValueError(f"Invalid label ID for {emotion}")
            if labels[label_id].get("label") != entry.get("label"):
                raise ValueError(f"KOTE label order mismatch at ID {label_id}")

    items = kote.get("items")
    if not isinstance(items, list):
        raise ValueError("KOTE items must be an array")
    threshold = Decimal(assignment["s1_threshold"])
    minimum_margin = Decimal(assignment["margin_threshold"])
    if assignment.get("comparison") != "inclusive" or assignment.get("top1_tie_policy") != "withhold_no_arbitrary_choice":
        raise ValueError("Unexpected assignment policy")

    output_items: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("KOTE item must be an object")
        item_id = item.get("id")
        if not isinstance(item_id, str) or not item_id.strip() or item_id in seen_ids:
            raise ValueError("KOTE item IDs must be unique nonempty strings")
        seen_ids.add(item_id)
        raw = item.get("probabilities_44")
        if not isinstance(raw, list) or len(raw) != 44:
            raise ValueError(f"{item_id}: expected 44 KOTE scores")
        if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1 for value in raw):
            raise ValueError(f"{item_id}: invalid KOTE score")

        scores = {
            emotion: max(raw[entry["label_id"]] for entry in connections[emotion])
            for emotion in order
        }
        descending = sorted((Decimal(str(value)) for value in scores.values()), reverse=True)
        s1, s2 = descending[:2]
        top1 = [emotion for emotion in order if Decimal(str(scores[emotion])) == s1]
        margin = s1 - s2
        passed = len(top1) == 1 and s1 >= threshold and margin >= minimum_margin
        output_items.append({
            "id": item_id,
            "scores5": scores,
            "top1_candidates": top1,
            "s1": float(s1),
            "s2": float(s2),
            "margin": float(margin),
            "decision_status": "assigned" if passed else "withheld",
            "representative_emotion": top1[0] if passed else None,
        })

    model = kote.get("model")
    return {
        "schema_version": "app5-mapping-handoff-v0.1",
        "source_kote_schema_version": kote["schema_version"],
        "source_model_version": model.get("version") if isinstance(model, dict) else None,
        "mapping_version": mapping["mapping_version"],
        "assignment_version": assignment["policy_version"],
        "items": output_items,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-json", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--mapping", type=Path, default=DEFAULT_MAPPING)
    parser.add_argument("--assignment", type=Path, default=DEFAULT_ASSIGNMENT)
    args = parser.parse_args()
    result = map_document(
        load_json(args.input_json), load_json(args.mapping), load_json(args.assignment)
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write("\n")


if __name__ == "__main__":
    main()
