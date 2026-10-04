#!/usr/bin/env python3
"""Validate synthetic diary-event extraction mocks.

This is a schema-specific validator and fixture test harness for the v0.1
diary-event pipeline.  It deliberately does not attempt to implement a full
JSON Schema Draft 2020-12 engine.

Deterministic checks (shape, enums, source offsets, evidence presence, and
obvious duplicates) can be reused for runtime payloads.  Semantic checks
(grounding, unsupported claims, and split/merge consistency) use the gold
annotations in SYNTHETIC_DIARY_FIXTURES.json and therefore apply only to this
fixture evaluation mode.  Production semantic validation still requires a
separate reviewer, additional rules, or human review.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from typing import Any


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


REJECTION_PRIORITY = [
    "schema_invalid",
    "missing_required_field",
    "unsupported_event_type",
    "unsupported_inclusion_basis",
    "invalid_character_range",
    "evidence_not_found",
    "evidence_offset_mismatch",
    "duplicate_event",
    "inclusion_basis_not_grounded",
    "unsupported_claim_added",
    "split_merge_review_required",
]

ISSUE_DETAILS = {
    "schema_invalid": ("후보가 v0.1 이벤트 형식을 만족하지 않는다.", None),
    "missing_required_field": ("필수 이벤트 필드가 누락되었다.", None),
    "unsupported_event_type": ("허용되지 않은 이벤트 유형이다.", "event_type"),
    "unsupported_inclusion_basis": (
        "허용되지 않은 이벤트 포함 근거가 있다.",
        "inclusion_basis",
    ),
    "invalid_character_range": (
        "원문 근거의 문자 위치 범위가 올바르지 않다.",
        "start_char",
    ),
    "evidence_not_found": (
        "evidence_text가 일기 원문에 존재하지 않는다.",
        "evidence_text",
    ),
    "evidence_offset_mismatch": (
        "evidence_text는 원문에 있지만 지정된 문자 위치와 일치하지 않는다.",
        "start_char",
    ),
    "duplicate_event": ("동일한 사건을 중복 추출한 후보이다.", None),
    "inclusion_basis_not_grounded": (
        "이벤트 포함 근거가 gold 원문 판정으로 뒷받침되지 않는다.",
        "inclusion_basis",
    ),
    "unsupported_claim_added": (
        "요약 또는 분류에 gold 근거로 확인되지 않는 내용이 추가되었다.",
        "summary",
    ),
    "split_merge_review_required": (
        "gold 이벤트의 분리·병합 기준과 후보 구성이 일치하지 않는다.",
        None,
    ),
}

ACCEPTED_CHECKS = {
    "schema_valid": True,
    "evidence_found": True,
    "offset_match": True,
    "duplicate_free": True,
    "inclusion_basis_grounded": True,
    "no_unsupported_claims": True,
    "split_merge_consistent": True,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "가상 일기와 mock LLM 이벤트 응답을 v0.1 규칙으로 검증하고 "
            "기대 결과와 비교한다."
        )
    )
    parser.add_argument("--fixtures", required=True, type=Path)
    parser.add_argument("--mocks", required=True, type=Path)
    parser.add_argument("--extraction-schema", required=True, type=Path)
    parser.add_argument("--validation-schema", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument(
        "--validated-at",
        required=True,
        help="시간대가 포함된 RFC 3339 검증 시각. 고정값을 쓰면 결과를 재현할 수 있다.",
    )
    return parser.parse_args()


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValueError(f"입력 파일을 찾을 수 없습니다: {path}") from exc
    except UnicodeDecodeError as exc:
        raise ValueError(f"UTF-8로 읽을 수 없는 파일입니다: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"JSON 문법 오류: {path} (line {exc.lineno}, column {exc.colno})"
        ) from exc


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def is_nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def is_integer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def is_iso_date(value: Any) -> bool:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def is_rfc3339_datetime(value: Any) -> bool:
    if not isinstance(value, str) or "T" not in value:
        return False
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return False
    return parsed.tzinfo is not None


def json_pointer(index: int, field: str | None = None) -> str:
    base = f"/events/{index}"
    return f"{base}/{field}" if field else base


def schema_definitions(schema: dict[str, Any]) -> dict[str, Any]:
    definitions = schema.get("$defs")
    if not isinstance(definitions, dict):
        raise ValueError("Schema에 $defs 객체가 없습니다.")
    return definitions


def build_schema_config(
    extraction_schema: dict[str, Any], validation_schema: dict[str, Any]
) -> dict[str, Any]:
    extraction_defs = schema_definitions(extraction_schema)
    validation_defs = schema_definitions(validation_schema)
    event_schema = extraction_defs.get("event")
    if not isinstance(event_schema, dict):
        raise ValueError("EVENT_EXTRACTION_SCHEMA의 $defs/event가 올바르지 않습니다.")

    config = {
        "extraction_version": extraction_schema["properties"]["schema_version"][
            "const"
        ],
        "validation_version": validation_schema["properties"]["schema_version"][
            "const"
        ],
        "rules_version": validation_schema["properties"][
            "validation_rules_version"
        ]["const"],
        "top_required": set(extraction_schema.get("required", [])),
        "top_allowed": set(extraction_schema.get("properties", {})),
        "event_required": list(event_schema.get("required", [])),
        "event_allowed": set(event_schema.get("properties", {})),
        "event_types": set(extraction_defs["event_type"]["enum"]),
        "inclusion_bases": set(extraction_defs["inclusion_basis_value"]["enum"]),
        "temporal_relations": set(extraction_defs["temporal_relation"]["enum"]),
        "rejection_codes": set(validation_defs["rejection_code"]["enum"]),
        "validation_required": set(validation_schema.get("required", [])),
        "validation_allowed": set(validation_schema.get("properties", {})),
    }

    if set(REJECTION_PRIORITY) != config["rejection_codes"]:
        raise ValueError("코드의 거부 사유 목록이 Validation Schema와 다릅니다.")
    return config


def validate_suite_inputs(
    fixtures_data: dict[str, Any],
    mocks_data: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    if not isinstance(fixtures_data, dict) or not isinstance(
        fixtures_data.get("fixtures"), list
    ):
        raise ValueError("fixture 파일의 fixtures가 배열이 아닙니다.")
    if not isinstance(mocks_data, dict) or not isinstance(
        mocks_data.get("responses"), list
    ):
        raise ValueError("mock 파일의 responses가 배열이 아닙니다.")

    fixture_by_id: dict[str, dict[str, Any]] = {}
    diary_ids: set[str] = set()
    gold_event_ids: set[str] = set()
    for fixture in fixtures_data["fixtures"]:
        if not isinstance(fixture, dict):
            raise ValueError("fixture 항목은 객체여야 합니다.")
        fixture_id = fixture.get("fixture_id")
        diary_id = fixture.get("diary_id")
        if not is_nonempty_string(fixture_id) or fixture_id in fixture_by_id:
            raise ValueError(f"fixture_id가 없거나 중복되었습니다: {fixture_id!r}")
        if not is_nonempty_string(diary_id) or diary_id in diary_ids:
            raise ValueError(f"diary_id가 없거나 중복되었습니다: {diary_id!r}")
        if not is_nonempty_string(fixture.get("diary_text")):
            raise ValueError(f"{fixture_id}: diary_text가 비어 있습니다.")
        if not is_iso_date(fixture.get("diary_date")):
            raise ValueError(f"{fixture_id}: diary_date 형식이 올바르지 않습니다.")

        diary_text = fixture["diary_text"]
        for event in fixture.get("expected_events", []):
            if set(event) != config["event_allowed"]:
                raise ValueError(f"{fixture_id}: gold 이벤트 필드가 Schema와 다릅니다.")
            event_id = event["event_id"]
            if event_id in gold_event_ids:
                raise ValueError(f"gold event_id가 중복되었습니다: {event_id}")
            gold_event_ids.add(event_id)
            start = event["start_char"]
            end = event["end_char"]
            if not (is_integer(start) and is_integer(end) and 0 <= start < end):
                raise ValueError(f"{fixture_id}/{event_id}: gold 문자 범위 오류")
            if end > len(diary_text) or diary_text[start:end] != event["evidence_text"]:
                raise ValueError(f"{fixture_id}/{event_id}: gold 원문 근거 불일치")

        for exclusion in fixture.get("expected_exclusions", []):
            start = exclusion.get("start_char")
            end = exclusion.get("end_char")
            text = exclusion.get("text")
            if not (is_integer(start) and is_integer(end) and 0 <= start < end):
                raise ValueError(f"{fixture_id}: 제외 근거 문자 범위 오류")
            if end > len(diary_text) or diary_text[start:end] != text:
                raise ValueError(f"{fixture_id}: 제외 근거 원문 불일치")

        fixture_by_id[fixture_id] = fixture
        diary_ids.add(diary_id)

    mock_ids: set[str] = set()
    for mock in mocks_data["responses"]:
        if not isinstance(mock, dict):
            raise ValueError("mock 응답 항목은 객체여야 합니다.")
        mock_id = mock.get("mock_id")
        if not is_nonempty_string(mock_id) or mock_id in mock_ids:
            raise ValueError(f"mock_id가 없거나 중복되었습니다: {mock_id!r}")
        fixture_id = mock.get("diary_fixture_id")
        if fixture_id not in fixture_by_id:
            raise ValueError(f"{mock_id}: 존재하지 않는 fixture 참조 {fixture_id!r}")
        if mock.get("case_kind") not in {"valid", "invalid", "mixed"}:
            raise ValueError(f"{mock_id}: case_kind가 올바르지 않습니다.")
        if not isinstance(mock.get("expected_validation"), dict):
            raise ValueError(f"{mock_id}: expected_validation이 없습니다.")
        mock_ids.add(mock_id)

    return fixture_by_id


def envelope_problem(
    payload: Any, fixture: dict[str, Any], config: dict[str, Any]
) -> str | None:
    if not isinstance(payload, dict):
        return "최상위 응답이 객체가 아니다."
    if config["top_required"] - set(payload):
        return "최상위 필수 필드가 누락되었다."
    if set(payload) - config["top_allowed"]:
        return "최상위 응답에 허용되지 않은 필드가 있다."
    if payload.get("schema_version") != config["extraction_version"]:
        return "schema_version이 EVENT_EXTRACTION_SCHEMA와 다르다."
    if payload.get("diary_id") != fixture["diary_id"]:
        return "diary_id가 참조 fixture와 다르다."
    if payload.get("diary_date") != fixture["diary_date"]:
        return "diary_date가 참조 fixture와 다르다."
    if not isinstance(payload.get("events"), list):
        return "events가 배열이 아니다."
    return None


def candidate_shape_error(
    candidate: Any, index: int, config: dict[str, Any]
) -> tuple[str, str, str | None] | None:
    if not isinstance(candidate, dict):
        return (
            "schema_invalid",
            "이벤트 후보가 객체가 아니다.",
            json_pointer(index),
        )

    missing = [field for field in config["event_required"] if field not in candidate]
    if missing:
        fields = ", ".join(missing)
        return (
            "missing_required_field",
            f"필수 필드가 누락되었다: {fields}",
            json_pointer(index, missing[0]),
        )

    extra = sorted(set(candidate) - config["event_allowed"])
    if extra:
        return (
            "schema_invalid",
            f"허용되지 않은 필드가 있다: {', '.join(extra)}",
            json_pointer(index, extra[0]),
        )

    if not isinstance(candidate["event_type"], str) or candidate[
        "event_type"
    ] not in config["event_types"]:
        return (
            "unsupported_event_type",
            f"허용되지 않은 event_type이다: {candidate['event_type']!r}",
            json_pointer(index, "event_type"),
        )

    inclusion_basis = candidate["inclusion_basis"]
    if isinstance(inclusion_basis, list):
        unsupported = [
            value
            for value in inclusion_basis
            if not isinstance(value, str) or value not in config["inclusion_bases"]
        ]
        if unsupported:
            return (
                "unsupported_inclusion_basis",
                f"허용되지 않은 inclusion_basis가 있다: {unsupported!r}",
                json_pointer(index, "inclusion_basis"),
            )

    string_fields = ["event_id", "summary", "evidence_text"]
    if any(not is_nonempty_string(candidate[field]) for field in string_fields):
        return (
            "schema_invalid",
            "event_id, summary, evidence_text는 비어 있지 않은 문자열이어야 한다.",
            json_pointer(index),
        )
    if not isinstance(inclusion_basis, list) or not inclusion_basis:
        return (
            "schema_invalid",
            "inclusion_basis는 하나 이상의 값을 가진 배열이어야 한다.",
            json_pointer(index, "inclusion_basis"),
        )
    if len(inclusion_basis) != len(set(inclusion_basis)):
        return (
            "schema_invalid",
            "inclusion_basis에 중복 값이 있다.",
            json_pointer(index, "inclusion_basis"),
        )
    if not isinstance(candidate["temporal_relation"], str) or candidate[
        "temporal_relation"
    ] not in config["temporal_relations"]:
        return (
            "schema_invalid",
            "temporal_relation이 허용값이 아니다.",
            json_pointer(index, "temporal_relation"),
        )

    time_expression = candidate["time_expression"]
    if time_expression is not None and not is_nonempty_string(time_expression):
        return (
            "schema_invalid",
            "time_expression은 null 또는 비어 있지 않은 문자열이어야 한다.",
            json_pointer(index, "time_expression"),
        )

    confidence = candidate["extractor_confidence"]
    if confidence is not None and not (
        is_number(confidence) and 0 <= confidence <= 1
    ):
        return (
            "schema_invalid",
            "extractor_confidence는 null 또는 0 이상 1 이하의 숫자여야 한다.",
            json_pointer(index, "extractor_confidence"),
        )

    start = candidate["start_char"]
    end = candidate["end_char"]
    if not (
        is_integer(start)
        and is_integer(end)
        and 0 <= start
        and 1 <= end
        and start < end
    ):
        return (
            "invalid_character_range",
            "start_char와 end_char가 유효한 [start_char, end_char) 범위가 아니다.",
            json_pointer(index, "start_char"),
        )
    return None


def source_error(
    candidate: dict[str, Any], index: int, diary_text: str
) -> tuple[str, str, str] | None:
    start = candidate["start_char"]
    end = candidate["end_char"]
    if end > len(diary_text):
        return (
            "invalid_character_range",
            f"end_char {end}가 일기 길이 {len(diary_text)}를 초과한다.",
            json_pointer(index, "end_char"),
        )

    evidence = candidate["evidence_text"]
    if evidence not in diary_text:
        return (
            "evidence_not_found",
            "evidence_text가 일기 원문 어디에도 존재하지 않는다.",
            json_pointer(index, "evidence_text"),
        )
    if diary_text[start:end] != evidence:
        return (
            "evidence_offset_mismatch",
            "원문 슬라이스와 evidence_text가 정확히 일치하지 않는다.",
            json_pointer(index, "start_char"),
        )
    return None


def duplicate_indices(candidates: list[Any]) -> set[int]:
    span_groups: dict[tuple[Any, Any, Any], list[int]] = {}
    id_groups: dict[Any, list[int]] = {}
    for index, candidate in enumerate(candidates):
        if not isinstance(candidate, dict):
            continue
        required = {"start_char", "end_char", "evidence_text", "event_id"}
        if not required <= set(candidate):
            continue
        key = (
            candidate.get("start_char"),
            candidate.get("end_char"),
            candidate.get("evidence_text"),
        )
        span_groups.setdefault(key, []).append(index)
        event_id = candidate.get("event_id")
        if isinstance(event_id, str):
            id_groups.setdefault(event_id, []).append(index)

    duplicates: set[int] = set()
    for group in list(span_groups.values()) + list(id_groups.values()):
        if len(group) > 1:
            duplicates.update(group)
    return duplicates


def split_merge_indices(
    candidates: list[Any], gold_events: list[dict[str, Any]]
) -> set[int]:
    review: set[int] = set()
    for gold in gold_events:
        contained: list[int] = []
        for index, candidate in enumerate(candidates):
            if not isinstance(candidate, dict):
                continue
            start = candidate.get("start_char")
            end = candidate.get("end_char")
            evidence = candidate.get("evidence_text")
            if not (is_integer(start) and is_integer(end) and isinstance(evidence, str)):
                continue
            is_inside = gold["start_char"] <= start < end <= gold["end_char"]
            is_exact = (
                start == gold["start_char"]
                and end == gold["end_char"]
                and evidence == gold["evidence_text"]
            )
            if is_inside and not is_exact:
                contained.append(index)
        if len(contained) >= 2:
            review.update(contained)
    return review


def gold_semantic_error(
    candidate: dict[str, Any],
    index: int,
    fixture: dict[str, Any],
) -> tuple[str, str, str | None] | None:
    gold_events = fixture.get("expected_events", [])
    exclusions = fixture.get("expected_exclusions", [])
    span_key = (
        candidate["start_char"],
        candidate["end_char"],
        candidate["evidence_text"],
    )

    for exclusion in exclusions:
        exclusion_key = (
            exclusion["start_char"],
            exclusion["end_char"],
            exclusion["text"],
        )
        if span_key == exclusion_key:
            return (
                "inclusion_basis_not_grounded",
                "gold fixture에서 이벤트 제외 대상으로 판정된 원문 구간이다.",
                json_pointer(index, "inclusion_basis"),
            )

    matching_gold = next(
        (
            gold
            for gold in gold_events
            if span_key
            == (gold["start_char"], gold["end_char"], gold["evidence_text"])
        ),
        None,
    )
    if matching_gold is None:
        return (
            "inclusion_basis_not_grounded",
            "후보 원문 범위가 어떤 gold 이벤트 또는 제외 구간과도 일치하지 않는다.",
            json_pointer(index, "inclusion_basis"),
        )

    if set(candidate["inclusion_basis"]) != set(matching_gold["inclusion_basis"]):
        return (
            "inclusion_basis_not_grounded",
            "후보의 inclusion_basis가 gold 포함 근거와 일치하지 않는다.",
            json_pointer(index, "inclusion_basis"),
        )

    gold_factual_fields = [
        "summary",
        "event_type",
        "time_expression",
        "temporal_relation",
    ]
    differing = [
        field
        for field in gold_factual_fields
        if candidate.get(field) != matching_gold.get(field)
    ]
    if differing:
        return (
            "unsupported_claim_added",
            "후보의 파생 내용이 gold 정답과 다르다: " + ", ".join(differing),
            json_pointer(index, differing[0]),
        )
    return None


def make_issue(
    code: str,
    index: int,
    message: str | None = None,
    field_path: str | None = None,
) -> dict[str, Any]:
    default_message, default_field = ISSUE_DETAILS[code]
    if field_path is None and default_field is not None:
        field_path = json_pointer(index, default_field)
    elif field_path is None and default_field is None:
        field_path = json_pointer(index)
    return {
        "code": code,
        "message": message or default_message,
        "field_path": field_path,
    }


def validate_payload(
    payload: Any,
    fixture: dict[str, Any],
    config: dict[str, Any],
    validated_at: str,
) -> dict[str, Any]:
    envelope_issue = envelope_problem(payload, fixture, config)
    if isinstance(payload, dict) and isinstance(payload.get("events"), list):
        candidates = payload["events"]
    else:
        candidates = [payload]

    duplicates = duplicate_indices(candidates)
    split_merge = split_merge_indices(candidates, fixture.get("expected_events", []))
    accepted: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []

    for index, candidate in enumerate(candidates):
        error: tuple[str, str, str | None] | None = None
        if envelope_issue is not None:
            error = (
                "schema_invalid",
                envelope_issue,
                json_pointer(index),
            )
        if error is None:
            error = candidate_shape_error(candidate, index, config)
        if error is None:
            error = source_error(candidate, index, fixture["diary_text"])
        if error is None and index in duplicates:
            error = (
                "duplicate_event",
                "동일한 event_id 또는 동일한 원문 범위의 후보가 반복되었다.",
                json_pointer(index),
            )
        if error is None and index in split_merge:
            error = (
                "split_merge_review_required",
                "하나의 gold 이벤트 범위를 둘 이상의 부분 후보로 분리했다.",
                json_pointer(index),
            )
        if error is None:
            error = gold_semantic_error(candidate, index, fixture)

        if error is not None:
            code, message, field_path = error
            rejected.append(
                {
                    "candidate_index": index,
                    "raw_candidate": copy.deepcopy(candidate),
                    "reason_codes": [code],
                    "issues": [make_issue(code, index, message, field_path)],
                }
            )
        else:
            accepted.append(
                {
                    "candidate_index": index,
                    "event": copy.deepcopy(candidate),
                    "checks": copy.deepcopy(ACCEPTED_CHECKS),
                }
            )

    if rejected and accepted:
        status = "partial"
    elif rejected:
        status = "failed"
    else:
        status = "passed"

    result = {
        "schema_version": config["validation_version"],
        "extraction_schema_version": config["extraction_version"],
        "validation_rules_version": config["rules_version"],
        "diary_id": fixture["diary_id"],
        "diary_date": fixture["diary_date"],
        "validated_at": validated_at,
        "status": status,
        "validation_summary": {
            "total_candidates": len(candidates),
            "accepted_count": len(accepted),
            "rejected_count": len(rejected),
        },
        "accepted_events": accepted,
        "rejected_events": rejected,
    }
    validate_generated_result(result, config)
    return result


def validate_generated_event(event: Any, config: dict[str, Any]) -> None:
    error = candidate_shape_error(event, 0, config)
    if error is not None:
        raise ValueError(f"생성된 accepted event가 Event Schema를 위반했습니다: {error}")


def validate_generated_result(result: dict[str, Any], config: dict[str, Any]) -> None:
    if set(result) != config["validation_allowed"]:
        raise ValueError("생성된 검증 결과의 최상위 필드가 Validation Schema와 다릅니다.")
    if config["validation_required"] - set(result):
        raise ValueError("생성된 검증 결과에 필수 필드가 누락되었습니다.")
    if result["schema_version"] != config["validation_version"]:
        raise ValueError("생성된 검증 결과의 schema_version이 다릅니다.")
    if result["extraction_schema_version"] != config["extraction_version"]:
        raise ValueError("생성된 검증 결과의 extraction_schema_version이 다릅니다.")
    if result["validation_rules_version"] != config["rules_version"]:
        raise ValueError("생성된 검증 결과의 validation_rules_version이 다릅니다.")
    if not is_iso_date(result["diary_date"]):
        raise ValueError("생성된 검증 결과의 diary_date 형식이 올바르지 않습니다.")
    if not is_rfc3339_datetime(result["validated_at"]):
        raise ValueError("validated_at은 시간대가 포함된 RFC 3339 형식이어야 합니다.")
    if result["status"] not in {"passed", "partial", "failed"}:
        raise ValueError("생성된 검증 결과의 status가 올바르지 않습니다.")

    accepted = result["accepted_events"]
    rejected = result["rejected_events"]
    summary = result["validation_summary"]
    if not isinstance(accepted, list) or not isinstance(rejected, list):
        raise ValueError("accepted_events와 rejected_events는 배열이어야 합니다.")
    if set(summary) != {"total_candidates", "accepted_count", "rejected_count"}:
        raise ValueError("validation_summary 필드가 Schema와 다릅니다.")
    if summary["accepted_count"] != len(accepted):
        raise ValueError("accepted_count가 accepted_events 길이와 다릅니다.")
    if summary["rejected_count"] != len(rejected):
        raise ValueError("rejected_count가 rejected_events 길이와 다릅니다.")
    if summary["total_candidates"] != len(accepted) + len(rejected):
        raise ValueError("total_candidates 합계가 올바르지 않습니다.")
    if result["status"] == "passed" and rejected:
        raise ValueError("passed 결과에 rejected_events가 있습니다.")
    if result["status"] == "partial" and (not accepted or not rejected):
        raise ValueError("partial 결과에는 통과와 거부가 모두 있어야 합니다.")
    if result["status"] == "failed" and (accepted or not rejected):
        raise ValueError("failed 결과에는 거부만 하나 이상 있어야 합니다.")

    candidate_indices: list[int] = []
    accepted_ids: list[str] = []
    for item in accepted:
        if set(item) != {"candidate_index", "event", "checks"}:
            raise ValueError("accepted_event 필드가 Schema와 다릅니다.")
        if item["checks"] != ACCEPTED_CHECKS:
            raise ValueError("accepted_event의 checks가 모두 true가 아닙니다.")
        validate_generated_event(item["event"], config)
        if not is_integer(item["candidate_index"]) or item["candidate_index"] < 0:
            raise ValueError("accepted_event의 candidate_index가 올바르지 않습니다.")
        candidate_indices.append(item["candidate_index"])
        accepted_ids.append(item["event"]["event_id"])

    for item in rejected:
        if set(item) != {"candidate_index", "raw_candidate", "reason_codes", "issues"}:
            raise ValueError("rejected_event 필드가 Schema와 다릅니다.")
        if not is_integer(item["candidate_index"]) or item["candidate_index"] < 0:
            raise ValueError("rejected_event의 candidate_index가 올바르지 않습니다.")
        codes = item["reason_codes"]
        if not codes or len(codes) != len(set(codes)):
            raise ValueError("reason_codes가 비었거나 중복되었습니다.")
        if not set(codes) <= config["rejection_codes"]:
            raise ValueError("Schema에 없는 거부 코드가 생성되었습니다.")
        issue_codes = [issue.get("code") for issue in item["issues"]]
        if set(issue_codes) != set(codes):
            raise ValueError("reason_codes와 issues.code가 일치하지 않습니다.")
        for issue in item["issues"]:
            if set(issue) != {"code", "message", "field_path"}:
                raise ValueError("validation_issue 필드가 Schema와 다릅니다.")
            if not is_nonempty_string(issue["message"]):
                raise ValueError("validation_issue.message가 비어 있습니다.")
            if issue["field_path"] is not None and not isinstance(
                issue["field_path"], str
            ):
                raise ValueError("validation_issue.field_path 형식이 잘못되었습니다.")
        candidate_indices.append(item["candidate_index"])

    if len(candidate_indices) != len(set(candidate_indices)):
        raise ValueError("candidate_index가 중복되었습니다.")
    if len(accepted_ids) != len(set(accepted_ids)):
        raise ValueError("통과 event_id가 중복되었습니다.")


def actual_expectation(
    validation_result: dict[str, Any], original_candidates: list[Any]
) -> dict[str, Any]:
    accepted_ids = [
        item["event"]["event_id"] for item in validation_result["accepted_events"]
    ]
    rejected_indices = [
        item["candidate_index"] for item in validation_result["rejected_events"]
    ]
    code_set = {
        code
        for item in validation_result["rejected_events"]
        for code in item["reason_codes"]
    }
    ordered_codes = [code for code in REJECTION_PRIORITY if code in code_set]
    if not validation_result["rejected_events"]:
        raw_preserved = False
    else:
        raw_preserved = all(
            item["candidate_index"] < len(original_candidates)
            and item["raw_candidate"]
            == original_candidates[item["candidate_index"]]
            for item in validation_result["rejected_events"]
        )
    return {
        "expected_status": validation_result["status"],
        "expected_accepted_event_ids": accepted_ids,
        "expected_rejected_candidate_indices": rejected_indices,
        "expected_rejection_codes": ordered_codes,
        "raw_candidate_must_be_preserved": raw_preserved,
    }


def compare_expectations(
    expected: dict[str, Any], actual: dict[str, Any]
) -> list[str]:
    fields = [
        "expected_status",
        "expected_accepted_event_ids",
        "expected_rejected_candidate_indices",
        "expected_rejection_codes",
        "raw_candidate_must_be_preserved",
    ]
    mismatches = []
    for field in fields:
        if expected.get(field) != actual.get(field):
            mismatches.append(
                f"{field}: expected={expected.get(field)!r}, actual={actual.get(field)!r}"
            )
    return mismatches


def portable_path(path: Path) -> str:
    return path.as_posix()


def build_test_results(
    args: argparse.Namespace,
    fixtures_data: dict[str, Any],
    mocks_data: dict[str, Any],
    fixture_by_id: dict[str, dict[str, Any]],
    config: dict[str, Any],
) -> dict[str, Any]:
    cases = []
    actual_statuses: Counter[str] = Counter()
    rejection_counts: Counter[str] = Counter()

    for mock in mocks_data["responses"]:
        fixture = fixture_by_id[mock["diary_fixture_id"]]
        payload = mock["response_payload"]
        validation_result = validate_payload(
            payload, fixture, config, args.validated_at
        )
        if isinstance(payload, dict) and isinstance(payload.get("events"), list):
            original_candidates = payload["events"]
        else:
            original_candidates = [payload]
        actual = actual_expectation(validation_result, original_candidates)
        expected = copy.deepcopy(mock["expected_validation"])
        mismatches = compare_expectations(expected, actual)

        actual_statuses[validation_result["status"]] += 1
        for code in actual["expected_rejection_codes"]:
            rejection_counts[code] += 1
        cases.append(
            {
                "mock_id": mock["mock_id"],
                "diary_fixture_id": mock["diary_fixture_id"],
                "case_kind": mock["case_kind"],
                "description": mock["description"],
                "expected_validation": expected,
                "actual_validation": actual,
                "matched": not mismatches,
                "mismatches": mismatches,
                "validation_result": validation_result,
            }
        )

    matched_count = sum(case["matched"] for case in cases)
    total = len(cases)
    inputs = {
        "fixtures": {
            "path": portable_path(args.fixtures),
            "sha256": sha256_file(args.fixtures),
        },
        "mocks": {
            "path": portable_path(args.mocks),
            "sha256": sha256_file(args.mocks),
        },
        "extraction_schema": {
            "path": portable_path(args.extraction_schema),
            "sha256": sha256_file(args.extraction_schema),
        },
        "validation_schema": {
            "path": portable_path(args.validation_schema),
            "sha256": sha256_file(args.validation_schema),
        },
    }
    return {
        "test_suite_version": mocks_data.get("mock_set_version", "0.1"),
        "validated_at": args.validated_at,
        "inputs": inputs,
        "validation_layers": {
            "deterministic": [
                "schema-specific shape and enum checks",
                "character range and exact source slice checks",
                "evidence presence checks",
                "obvious duplicate checks",
                "diary identity checks",
            ],
            "gold_fixture_only": [
                "inclusion basis grounding",
                "unsupported summary or classification claims",
                "split and merge consistency",
                "excluded-span promotion",
            ],
        },
        "known_limitations": [
            "This is not a general JSON Schema Draft 2020-12 implementation.",
            "Gold semantic checks are valid only when synthetic fixture annotations are available.",
            "Production semantic validation requires a separate LLM reviewer, human review, or additional validated rules.",
            "Exact gold summary comparison is a fixture-test oracle, not a general hallucination detector.",
        ],
        "summary": {
            "total_mocks": total,
            "matched_count": matched_count,
            "mismatched_count": total - matched_count,
            "all_matched": matched_count == total,
            "actual_status_counts": {
                status: actual_statuses.get(status, 0)
                for status in ["passed", "partial", "failed"]
            },
            "case_kind_counts": {
                kind: sum(case["case_kind"] == kind for case in cases)
                for kind in ["valid", "invalid", "mixed"]
            },
            "rejection_code_case_counts": {
                code: rejection_counts.get(code, 0) for code in REJECTION_PRIORITY
            },
        },
        "cases": cases,
    }


def render_report(results: dict[str, Any]) -> str:
    summary = results["summary"]
    status_counts = summary["actual_status_counts"]
    kind_counts = summary["case_kind_counts"]
    lines = [
        "# 일기 이벤트 검증기 fixture 테스트 보고서",
        "",
        "## 1. 목적",
        "",
        "가상 일기와 저장된 mock LLM 응답을 사용해 이벤트 후보의 형식, 원문 근거, 문자 위치, 중복 및 gold 의미 판정을 검증했다. 외부 API와 실제 KOTE 추론은 사용하지 않았다.",
        "",
        "## 2. 검증 계층",
        "",
        "- **결정적 검사:** 현재 Event Schema의 필드·자료형·enum, 신뢰도 범위, 원문 존재 여부, `[start_char, end_char)` 슬라이스, 명백한 중복 및 일기 식별 정보를 검사한다.",
        "- **gold fixture 검사:** 포함 근거, 원문에 없는 파생 내용, 제외 구간 승격, 분리·병합은 가상 일기의 정답과 비교한다.",
        "",
        "> 이 스크립트는 범용 JSON Schema Draft 2020-12 엔진이 아니다. 특히 gold 의미 검사는 정답 annotation이 없는 실제 운영 일기에 그대로 적용할 수 없다.",
        "",
        "## 3. 전체 결과",
        "",
        f"- 전체 mock: {summary['total_mocks']}개",
        f"- 기대 결과 일치: {summary['matched_count']}개",
        f"- 불일치: {summary['mismatched_count']}개",
        f"- 전체 통과: {'예' if summary['all_matched'] else '아니요'}",
        f"- 구성: 정상 {kind_counts['valid']}개, 오류 {kind_counts['invalid']}개, 혼합 {kind_counts['mixed']}개",
        f"- 실제 상태: passed {status_counts['passed']}개, partial {status_counts['partial']}개, failed {status_counts['failed']}개",
        "",
        "## 4. mock별 결과",
        "",
        "| mock | 종류 | 실제 상태 | 기대값 일치 | 거부 코드 |",
        "| --- | --- | --- | --- | --- |",
    ]
    for case in results["cases"]:
        codes = case["actual_validation"]["expected_rejection_codes"]
        lines.append(
            "| {mock} | {kind} | {status} | {matched} | {codes} |".format(
                mock=case["mock_id"],
                kind=case["case_kind"],
                status=case["validation_result"]["status"],
                matched="예" if case["matched"] else "아니요",
                codes=", ".join(f"`{code}`" for code in codes) or "-",
            )
        )

    lines.extend(
        [
            "",
            "## 5. 거부 코드별 결과",
            "",
            "| 거부 코드 | 발생 mock 수 |",
            "| --- | ---: |",
        ]
    )
    for code, count in summary["rejection_code_case_counts"].items():
        lines.append(f"| `{code}` | {count} |")

    zero_case = next(
        case for case in results["cases"] if case["mock_id"] == "mock_003_valid_zero_events"
    )
    malformed_case = next(
        case
        for case in results["cases"]
        if case["mock_id"] == "mock_005_schema_invalid_raw_string"
    )
    malformed_raw = malformed_case["validation_result"]["rejected_events"][0][
        "raw_candidate"
    ]
    lines.extend(
        [
            "",
            "## 6. 핵심 기능 확인",
            "",
            f"- 원문 근거와 Python 유니코드 문자 위치 검사는 전체 통과 이벤트에서 일치했다.",
            f"- `events: []` 사례는 `{zero_case['validation_result']['status']}`로 처리됐다.",
            f"- 형식 오류 문자열 후보 `{malformed_raw}`는 `raw_candidate`에 원형 그대로 보존됐다.",
            "- 통과 이벤트의 `checks`는 결정적 검사와 gold fixture 검사를 모두 실제 수행한 경우에만 true로 기록됐다.",
            "",
            "## 7. 재현성",
            "",
            "입력 순서, 출력 키 순서와 `--validated-at`을 고정하며 JSON을 UTF-8과 일정한 들여쓰기로 기록한다. 동일 인자 재실행 후 파일 SHA-256을 외부 실행 단계에서 비교한다.",
            "",
            "## 8. 남은 의미 검증 한계",
            "",
            "- 실제 일기에는 gold 이벤트와 제외 구간이 없으므로 현재의 의미 판정을 그대로 사용할 수 없다.",
            "- summary의 사실 추가 여부는 이번 테스트에서 gold summary와 정확히 비교한다. 이는 일반적인 환각 탐지기가 아니다.",
            "- 실제 운영에서는 별도 LLM 검토, 사용자 확인, 사람 검토 또는 추가로 검증된 규칙이 필요하다.",
            "",
            "## 9. 다음 단계 권장 사항",
            "",
            "1. fixture 테스트가 모두 통과한 뒤 이벤트 정의 v0.1 동결 여부를 별도 검토한다.",
            "2. 결정적 검사를 실제 추출 응답에 적용할 수 있도록 공급자 독립 함수 경계를 유지한다.",
            "3. 의미 검토 방식과 LLM 공급자가 정해진 뒤 어댑터 및 사용자 확인 흐름을 별도 구현한다.",
            "4. 검증된 `evidence_text`만 A0 KOTE 입력으로 전달하는 연결 테스트를 작성한다.",
            "",
        ]
    )
    return "\n".join(lines)


def write_outputs(
    output_path: Path, report_path: Path, results: dict[str, Any]
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    output_text = json.dumps(results, ensure_ascii=False, indent=2) + "\n"
    output_path.write_text(output_text, encoding="utf-8", newline="\n")
    report_path.write_text(render_report(results), encoding="utf-8", newline="\n")


def main() -> int:
    args = parse_args()
    try:
        fixtures_data = load_json(args.fixtures)
        mocks_data = load_json(args.mocks)
        extraction_schema = load_json(args.extraction_schema)
        validation_schema = load_json(args.validation_schema)
        config = build_schema_config(extraction_schema, validation_schema)
        fixture_by_id = validate_suite_inputs(fixtures_data, mocks_data, config)
        results = build_test_results(
            args,
            fixtures_data,
            mocks_data,
            fixture_by_id,
            config,
        )
        write_outputs(args.output, args.report, results)
    except (KeyError, TypeError, ValueError, OSError) as exc:
        print(f"검증기 실행 오류: {exc}", file=sys.stderr)
        return 2

    summary = results["summary"]
    print(
        "검증 완료: "
        f"전체 {summary['total_mocks']}개, "
        f"일치 {summary['matched_count']}개, "
        f"불일치 {summary['mismatched_count']}개"
    )
    return 0 if summary["all_matched"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
