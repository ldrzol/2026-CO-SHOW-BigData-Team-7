"""Run offline A0-Paper inference for one or more Korean texts.

This module intentionally keeps the frozen evaluator unchanged.  At runtime it
imports the verified model construction and checkpoint loading functions from
``reproduce_a0_kote.py``.  Input validation and JSON formatting remain
importable without PyTorch so they can be checked on the current local machine.

The only operational prediction rule is ``probability > 0.3``.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import math
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CHECKPOINT = (
    PROJECT_ROOT
    / "models"
    / "raw_public"
    / "kote_for_meticulous_people"
    / "kote_pytorch_lightning.bin"
)
DEFAULT_MODEL_DIR = (
    PROJECT_ROOT / "models" / "runtime_dependencies" / "kcelectra_base_v2021"
)
DEFAULT_LABELS_SOURCE = (
    PROJECT_ROOT
    / "data"
    / "raw_public"
    / "kote"
    / "huggingface_dataset"
    / "kote.py"
)
DEFAULT_OUTPUT = PROJECT_ROOT / "reports" / "a0_inference_output.json"

SCHEMA_VERSION = "1.0"
MODEL_NAME = "A0-Paper"
MODEL_REPOSITORY = "searle-j/kote_for_meticulous_people"
MODEL_SOURCE_COMMIT = "67c96315d45c6346d72459080c44b7e7401f765e"
BACKBONE_REPOSITORY = "beomi/KcELECTRA-base"
BACKBONE_REVISION = "v2021"
BACKBONE_COMMIT = "5b4ca19e087a144c05a307ef109b3295aeae4588"
CHECKPOINT_SHA256 = "AEA50FE96C2DBE3296C56E58A53865E0AFA56A34C45180C057ADBC0443924F88"
LABELS_SOURCE_SHA256 = "961D94BCFF24572B9BB735C8177F3AE182B586531FD292096EAEEE7563AA1CBA"
FROZEN_EVALUATOR_SHA256 = "316D3F30685FCE09402CC9FC27D9CF410F1478DAE1C81E080DFB0675BCA2F5E7"
LABEL_COUNT = 44
MAX_LENGTH = 512
SEED = 42
THRESHOLD = 0.3
THRESHOLD_OPERATOR = ">"

EXPECTED_RUNTIME_HASHES = {
    "config.json": "8EBB21D03AFA6B51BF7A18C614EC60D0E4CE732428CE01F56E7604085EC99FC5",
    "special_tokens_map.json": "B3383B8739AE890383A6ED9AD871E592CC14D5B0C36FFDB9D3BE6E416256640A",
    "tokenizer_config.json": "B770F7717E85783B4DFAA813290901D35ADF9BABCBFE425F9B5FFFF9973DE99F",
    "vocab.txt": "AD0E13353A7B3697D064CFBD3EB42E4A986241F62A321BFD94659C65674AB687",
}


class InputValidationError(ValueError):
    """Raised when inference input does not follow the public JSON contract."""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def verify_file(path: Path, expected_sha256: str, name: str) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(f"Missing {name}: {path}")
    actual = sha256(path)
    if actual != expected_sha256:
        raise ValueError(
            f"SHA-256 mismatch for {name}: expected {expected_sha256}, "
            f"found {actual} ({path})"
        )
    return {
        "name": name,
        "path": str(path.resolve()),
        "size_bytes": path.stat().st_size,
        "sha256": actual,
        "passed": True,
    }


def load_label_names(path: Path = DEFAULT_LABELS_SOURCE) -> list[str]:
    """Read the canonical KOTE label order without importing datasets or torch."""

    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        if any(isinstance(target, ast.Name) and target.id == "_LABELS" for target in node.targets):
            labels = ast.literal_eval(node.value)
            if len(labels) != LABEL_COUNT or not all(isinstance(label, str) for label in labels):
                raise ValueError(f"Expected {LABEL_COUNT} label names in {path}")
            return labels
    raise ValueError(f"Could not locate _LABELS in {path}")


def validate_items(payload: Any) -> list[dict[str, str]]:
    """Normalize single-item or batch JSON input and preserve its order."""

    if not isinstance(payload, dict):
        raise InputValidationError("Input JSON must be an object")

    if "items" in payload:
        raw_items = payload["items"]
        if not isinstance(raw_items, list) or not raw_items:
            raise InputValidationError("items must be a non-empty list")
    elif "id" in payload or "text" in payload:
        raw_items = [payload]
    else:
        raise InputValidationError("Input must contain items or a single id/text pair")

    normalized: list[dict[str, str]] = []
    seen_ids: set[str] = set()
    for index, item in enumerate(raw_items):
        if not isinstance(item, dict):
            raise InputValidationError(f"items[{index}] must be an object")
        item_id = item.get("id")
        text = item.get("text")
        if not isinstance(item_id, str) or not item_id.strip():
            raise InputValidationError(f"items[{index}].id must be a non-empty string")
        if item_id in seen_ids:
            raise InputValidationError(f"Duplicate input id: {item_id}")
        if not isinstance(text, str) or not text.strip():
            raise InputValidationError(f"items[{index}].text must be a non-empty string")
        seen_ids.add(item_id)
        normalized.append({"id": item_id, "text": text})
    return normalized


def predicted_label_ids(probabilities: Sequence[float]) -> list[int]:
    """Apply the official strict threshold.  Exactly 0.3 is not positive."""

    if len(probabilities) != LABEL_COUNT:
        raise ValueError(f"Expected {LABEL_COUNT} probabilities, found {len(probabilities)}")
    values = [float(value) for value in probabilities]
    if any(not math.isfinite(value) or value < 0.0 or value > 1.0 for value in values):
        raise ValueError("Every probability must be finite and inside [0, 1]")
    return [label_id for label_id, value in enumerate(values) if value > THRESHOLD]


def label_order_document(label_names: Sequence[str]) -> list[dict[str, Any]]:
    if len(label_names) != LABEL_COUNT:
        raise ValueError(f"Expected {LABEL_COUNT} labels, found {len(label_names)}")
    return [
        {"label_id": label_id, "label": str(label)}
        for label_id, label in enumerate(label_names)
    ]


def build_output_document(
    items: Sequence[dict[str, str]],
    probability_rows: Sequence[Sequence[float]],
    tokenization_rows: Sequence[dict[str, Any]],
    label_names: Sequence[str],
    model_diagnostics: dict[str, Any],
    execution: dict[str, Any],
    input_integrity: Sequence[dict[str, Any]],
) -> dict[str, Any]:
    """Build and validate the stable inference JSON document."""

    if not (len(items) == len(probability_rows) == len(tokenization_rows)):
        raise ValueError("Items, probabilities, and tokenization rows must have equal length")
    if not items:
        raise ValueError("At least one item is required")
    if len(label_names) != LABEL_COUNT:
        raise ValueError(f"Expected {LABEL_COUNT} labels, found {len(label_names)}")

    result_items: list[dict[str, Any]] = []
    for item, raw_probabilities, tokenization in zip(
        items, probability_rows, tokenization_rows
    ):
        probabilities = [float(value) for value in raw_probabilities]
        positive_ids = predicted_label_ids(probabilities)
        before = tokenization.get("token_count_before_truncation")
        used = tokenization.get("token_count_used")
        truncated = tokenization.get("truncated")
        if not isinstance(before, int) or before < 1:
            raise ValueError("token_count_before_truncation must be a positive integer")
        if not isinstance(used, int) or used < 1 or used > MAX_LENGTH:
            raise ValueError(f"token_count_used must be inside 1..{MAX_LENGTH}")
        if not isinstance(truncated, bool):
            raise ValueError("truncated must be boolean")
        if truncated != (before > MAX_LENGTH):
            raise ValueError("truncated must exactly represent token_count_before_truncation > 512")

        result_items.append(
            {
                "id": item["id"],
                "text": item["text"],
                "tokenization": {
                    "token_count_before_truncation": before,
                    "token_count_used": used,
                    "truncated": truncated,
                },
                "probabilities_44": probabilities,
                "prediction": {
                    "threshold": THRESHOLD,
                    "operator": THRESHOLD_OPERATOR,
                    "rule": "probability > 0.3",
                    "label_ids": positive_ids,
                    "labels": [label_names[label_id] for label_id in positive_ids],
                },
            }
        )

    return {
        "schema_version": SCHEMA_VERSION,
        "scope": "KOTE 44-label inference only; not diary-domain performance or diagnosis",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "model": {
            "name": MODEL_NAME,
            "version": (
                "A0-Paper:meticulous@67c96315;"
                "KcELECTRA-base:v2021@5b4ca19e;checkpoint@AEA50FE9"
            ),
            "repository": MODEL_REPOSITORY,
            "source_commit": MODEL_SOURCE_COMMIT,
            "checkpoint_sha256": CHECKPOINT_SHA256,
            "backbone": BACKBONE_REPOSITORY,
            "backbone_revision": BACKBONE_REVISION,
            "backbone_commit": BACKBONE_COMMIT,
            "max_length": MAX_LENGTH,
            "precision": "float32",
            "model_diagnostics": model_diagnostics,
        },
        "prediction_rule": {
            "threshold": THRESHOLD,
            "operator": THRESHOLD_OPERATOR,
            "expression": "probability > 0.3",
        },
        "label_order": label_order_document(label_names),
        "input_integrity": list(input_integrity),
        "items": result_items,
        "execution": execution,
    }


def _load_verified_evaluator() -> Any:
    """Import the frozen evaluator only when actual inference is requested."""

    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    try:
        import reproduce_a0_kote as evaluator
    except ModuleNotFoundError as error:
        missing = error.name or "required runtime package"
        raise RuntimeError(
            "Actual A0 inference requires the verified PyTorch/Transformers runtime. "
            f"Missing import: {missing}. No package was installed automatically."
        ) from error

    expected = {
        "LABEL_COUNT": LABEL_COUNT,
        "MAX_LENGTH": MAX_LENGTH,
        "ORIGINAL_THRESHOLD": THRESHOLD,
        "THRESHOLD_OPERATOR": THRESHOLD_OPERATOR,
    }
    for name, value in expected.items():
        if getattr(evaluator, name) != value:
            raise RuntimeError(
                f"Frozen evaluator contract changed: {name}="
                f"{getattr(evaluator, name)!r}, expected {value!r}"
            )
    return evaluator


def run_model_inference(
    items: Sequence[dict[str, str]],
    checkpoint: Path,
    model_dir: Path,
    labels_source: Path,
    device_name: str,
    batch_size: int,
) -> dict[str, Any]:
    if batch_size < 1:
        raise ValueError("batch_size must be positive")

    integrity = [
        verify_file(checkpoint, CHECKPOINT_SHA256, "checkpoint"),
        verify_file(labels_source, LABELS_SOURCE_SHA256, "labels_source"),
        verify_file(
            Path(__file__).with_name("reproduce_a0_kote.py"),
            FROZEN_EVALUATOR_SHA256,
            "frozen_evaluator",
        ),
    ]
    for filename, expected_hash in EXPECTED_RUNTIME_HASHES.items():
        integrity.append(
            verify_file(model_dir / filename, expected_hash, filename)
        )

    evaluator = _load_verified_evaluator()
    evaluator.seed_everything(SEED)
    device = evaluator.resolve_device(device_name)
    label_names = evaluator.load_label_names(labels_source)
    local_label_names = load_label_names(labels_source)
    if label_names != local_label_names:
        raise RuntimeError("Evaluator and standalone label loaders disagree")

    model, tokenizer, model_diagnostics = evaluator.build_model(model_dir, checkpoint)
    model = model.float().to(device)
    model.eval()

    token_counts_before: list[int] = []
    for item in items:
        untruncated = tokenizer(
            item["text"],
            add_special_tokens=True,
            padding=False,
            truncation=False,
            return_attention_mask=False,
            return_token_type_ids=False,
            verbose=False,
        )
        token_counts_before.append(len(untruncated["input_ids"]))

    probability_rows: list[list[float]] = []
    tokenization_rows: list[dict[str, Any]] = []
    torch = evaluator.torch
    if device.type == "cuda":
        torch.cuda.synchronize(device)
        torch.cuda.reset_peak_memory_stats(device)
    started = time.perf_counter()

    with torch.inference_mode():
        for start in range(0, len(items), batch_size):
            batch_items = items[start : start + batch_size]
            encoded = tokenizer(
                [item["text"] for item in batch_items],
                max_length=MAX_LENGTH,
                padding="max_length",
                truncation=True,
                return_tensors="pt",
                return_token_type_ids=False,
            )
            used_counts = encoded["attention_mask"].sum(dim=1).tolist()
            input_ids = encoded["input_ids"].to(device)
            attention_mask = encoded["attention_mask"].to(device)
            _loss, batch_probabilities = model(input_ids, attention_mask)
            probability_rows.extend(
                batch_probabilities.float().cpu().numpy().tolist()
            )
            for offset, used in enumerate(used_counts):
                before = token_counts_before[start + offset]
                tokenization_rows.append(
                    {
                        "token_count_before_truncation": before,
                        "token_count_used": int(used),
                        "truncated": before > MAX_LENGTH,
                    }
                )

    if device.type == "cuda":
        torch.cuda.synchronize(device)
    elapsed = time.perf_counter() - started
    environment = evaluator.environment_info(device)
    execution = {
        "seed": SEED,
        "device": str(device),
        "batch_size": batch_size,
        "input_count": len(items),
        "seconds": elapsed,
        "examples_per_second": len(items) / elapsed if elapsed else None,
        "peak_gpu_memory_bytes": (
            int(torch.cuda.max_memory_allocated(device))
            if device.type == "cuda"
            else None
        ),
        "environment": environment,
        "offline_mode": True,
    }
    return build_output_document(
        items=items,
        probability_rows=probability_rows,
        tokenization_rows=tokenization_rows,
        label_names=label_names,
        model_diagnostics=model_diagnostics,
        execution=execution,
        input_integrity=integrity,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--input-json", type=Path)
    source.add_argument("--text")
    parser.add_argument("--id", default="input-001", help="ID used with --text")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument("--model-dir", type=Path, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--labels-source", type=Path, default=DEFAULT_LABELS_SOURCE)
    parser.add_argument("--device", default="auto", help="auto, cpu, cuda, or cuda:N")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.input_json is not None:
        payload = json.loads(args.input_json.read_text(encoding="utf-8"))
    else:
        payload = {"id": args.id, "text": args.text}
    items = validate_items(payload)

    if args.output.exists() and not args.overwrite:
        raise FileExistsError(
            f"Output already exists: {args.output}. Use --overwrite to replace it."
        )
    document = run_model_inference(
        items=items,
        checkpoint=args.checkpoint,
        model_dir=args.model_dir,
        labels_source=args.labels_source,
        device_name=args.device,
        batch_size=args.batch_size,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Saved {len(items)} item(s) to {args.output}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (InputValidationError, ValueError, FileNotFoundError, FileExistsError, RuntimeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(2) from error
