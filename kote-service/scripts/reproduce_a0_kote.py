"""Reproduce the public KOTE A0-Paper inference and evaluation pipeline.

The model computation follows the public KOTE notebook: KcELECTRA's last
hidden-state CLS vector -> Linear(768, 44) -> sigmoid.  The published A0
weights are loaded as a complete state dict with strict=True.  This inference
runner intentionally does not depend on PyTorch Lightning or Hugging Face
Datasets because neither is needed to evaluate an already-trained state dict.

Canonical sources:
  * data/raw_public/kote/repository/codes/KOTE_pytorch_lightning.ipynb
    - cells 24-26: max length and dataset tokenization
    - cell 43: model and forward computation
    - cells 63-66: test inference and thresholded classification report
  * data/raw_public/kote/repository/README.md
    - A0 loading example corrected to KcELECTRA revision v2021
"""

from __future__ import annotations

import argparse
import ast
import collections
import csv
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import random
import sys
import time
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import (
    average_precision_score,
    f1_score,
    precision_recall_fscore_support,
    precision_score,
    recall_score,
)
from torch.utils.data import DataLoader, Dataset, Subset
from tqdm.auto import tqdm
from transformers import AutoTokenizer, ElectraConfig, ElectraModel


ORIGINAL_THRESHOLD = 0.3
PUBLIC_MACRO_F1_APPROX = 0.56
LABEL_COUNT = 44
MAX_LENGTH = 512
DEFAULT_SEED = 42
THRESHOLD_OPERATOR = ">"

EXPECTED_HASHES = {
    "checkpoint": "AEA50FE96C2DBE3296C56E58A53865E0AFA56A34C45180C057ADBC0443924F88",
    "labels_source": "961D94BCFF24572B9BB735C8177F3AE182B586531FD292096EAEEE7563AA1CBA",
    "validation_tsv": "6052673EA338C94237DD199553A35BD0F0BCFB21EBF62977C9C410B96EB4E45F",
    "test_tsv": "3AB4EBF8B23475C5EAB16B285E56AE55FA30141466CFF9B7921E3DD3FD4E1980",
    "config.json": "8EBB21D03AFA6B51BF7A18C614EC60D0E4CE732428CE01F56E7604085EC99FC5",
    "special_tokens_map.json": "B3383B8739AE890383A6ED9AD871E592CC14D5B0C36FFDB9D3BE6E416256640A",
    "tokenizer_config.json": "B770F7717E85783B4DFAA813290901D35ADF9BABCBFE425F9B5FFFF9973DE99F",
    "vocab.txt": "AD0E13353A7B3697D064CFBD3EB42E4A986241F62A321BFD94659C65674AB687",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def check_hash(path: Path, expected: str, name: str, allow_unverified: bool) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(f"Missing {name}: {path}")
    actual = sha256(path)
    passed = actual == expected
    if not passed and not allow_unverified:
        raise ValueError(
            f"SHA-256 mismatch for {name}: expected {expected}, found {actual} ({path})"
        )
    return {
        "name": name,
        "path": str(path.resolve()),
        "size_bytes": path.stat().st_size,
        "expected_sha256": expected,
        "actual_sha256": actual,
        "passed": passed,
    }


def load_label_names(path: Path) -> list[str]:
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


def load_tsv(path: Path, label_count: int) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8", newline="") as source:
        reader = csv.reader(source, delimiter="\t")
        for line_number, row in enumerate(reader, start=1):
            if len(row) != 3:
                raise ValueError(f"{path}:{line_number}: expected 3 columns, found {len(row)}")
            record_id, text, raw_labels = row
            try:
                label_ids = [int(value) for value in raw_labels.split(",")]
            except ValueError as error:
                raise ValueError(f"{path}:{line_number}: invalid labels {raw_labels!r}") from error
            if not label_ids or len(set(label_ids)) != len(label_ids):
                raise ValueError(f"{path}:{line_number}: empty or duplicate label IDs")
            if any(label_id < 0 or label_id >= label_count for label_id in label_ids):
                raise ValueError(f"{path}:{line_number}: label outside 0..{label_count - 1}")
            records.append({"id": record_id, "text": text, "label_ids": label_ids})

    if len({record["id"] for record in records}) != len(records):
        raise ValueError(f"Duplicate IDs found in {path}")
    observed = {label_id for record in records for label_id in record["label_ids"]}
    if observed != set(range(label_count)):
        raise ValueError(f"Not all {label_count} labels occur in {path}")
    return records


class KOTEDataset(Dataset):
    """Inference form of the public notebook's KOTEDataset (cells 24-26)."""

    def __init__(
        self,
        records: list[dict[str, Any]],
        tokenizer: Any,
        max_length: int = MAX_LENGTH,
    ) -> None:
        self.records = records
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, index: int) -> dict[str, Any]:
        record = self.records[index]
        encoding = self.tokenizer(
            record["text"],
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
            return_token_type_ids=False,
        )
        labels = torch.zeros(LABEL_COUNT, dtype=torch.float32)
        labels[record["label_ids"]] = 1.0
        return {
            "index": index,
            "record_id": record["id"],
            "input_ids": encoding["input_ids"].flatten(),
            "attention_mask": encoding["attention_mask"].flatten(),
            "labels": labels,
        }


class KOTETagger(nn.Module):
    """Output-equivalent inference subset of notebook cell 43."""

    def __init__(self, electra: ElectraModel) -> None:
        super().__init__()
        self.electra = electra
        self.classifier = nn.Linear(self.electra.config.hidden_size, LABEL_COUNT)
        self.criterion = nn.BCELoss()

    def forward(
        self,
        input_ids: torch.Tensor,
        attention_mask: torch.Tensor,
        labels: torch.Tensor | None = None,
    ) -> tuple[torch.Tensor | int, torch.Tensor]:
        output = self.electra(input_ids, attention_mask=attention_mask)
        output = output.last_hidden_state[:, 0, :]
        output = self.classifier(output)
        output = torch.sigmoid(output)
        loss: torch.Tensor | int = 0
        if labels is not None:
            loss = self.criterion(output, labels)
        return loss, output


def seed_everything(seed: int) -> None:
    os.environ["PYTHONHASHSEED"] = str(seed)
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    if hasattr(torch.backends, "cudnn"):
        torch.backends.cudnn.benchmark = False
        torch.backends.cudnn.deterministic = True
    try:
        torch.use_deterministic_algorithms(True, warn_only=True)
    except TypeError:
        torch.use_deterministic_algorithms(True)


def load_state_dict(path: Path) -> collections.OrderedDict[str, torch.Tensor]:
    try:
        loaded = torch.load(path, map_location="cpu", weights_only=True)
    except TypeError:
        loaded = torch.load(path, map_location="cpu")
    if not isinstance(loaded, collections.OrderedDict):
        raise TypeError(
            "A0-Paper file must be a plain OrderedDict state dict; "
            f"found {type(loaded).__name__}"
        )
    if len(loaded) != 200:
        raise ValueError(f"Expected 200 state entries, found {len(loaded)}")
    return loaded


def align_transformers_compatibility_buffers(
    model: KOTETagger, checkpoint_keys: set[str]
) -> list[str]:
    """Align buffer persistence changed across Transformers releases.

    Transformers 4.12.3 stored Electra's position_ids in the state dict.  Newer
    releases may expose the same runtime buffer as non-persistent.  Making that
    existing buffer persistent restores the old serialization contract without
    changing its value or the model computation.
    """

    changes: list[str] = []
    embeddings = model.electra.embeddings
    position_key = "electra.embeddings.position_ids"
    token_type_key = "electra.embeddings.token_type_ids"

    if position_key in checkpoint_keys:
        if not hasattr(embeddings, "position_ids"):
            embeddings.register_buffer(
                "position_ids",
                torch.arange(model.electra.config.max_position_embeddings).expand((1, -1)),
                persistent=True,
            )
            changes.append("registered persistent electra.embeddings.position_ids")
        elif "position_ids" in embeddings._non_persistent_buffers_set:
            embeddings._non_persistent_buffers_set.discard("position_ids")
            changes.append("made electra.embeddings.position_ids persistent")

    if token_type_key not in checkpoint_keys and hasattr(embeddings, "token_type_ids"):
        if "token_type_ids" not in embeddings._non_persistent_buffers_set:
            embeddings._non_persistent_buffers_set.add("token_type_ids")
            changes.append("made electra.embeddings.token_type_ids non-persistent")
    return changes


def build_model(
    model_dir: Path, checkpoint: Path
) -> tuple[KOTETagger, Any, dict[str, Any]]:
    config = ElectraConfig.from_pretrained(str(model_dir), local_files_only=True)
    if config.hidden_size != 768 or config.num_hidden_layers != 12 or config.vocab_size != 50135:
        raise ValueError(
            "KcELECTRA v2021 config mismatch: expected hidden=768, layers=12, vocab=50135"
        )
    tokenizer = AutoTokenizer.from_pretrained(str(model_dir), local_files_only=True)
    if tokenizer.vocab_size != 50135:
        raise ValueError(f"Expected tokenizer vocab size 50135, found {tokenizer.vocab_size}")

    state_dict = load_state_dict(checkpoint)
    model = KOTETagger(ElectraModel(config))
    compatibility_changes = align_transformers_compatibility_buffers(model, set(state_dict))
    target_keys = set(model.state_dict())
    source_keys = set(state_dict)
    missing_before_load = sorted(target_keys - source_keys)
    unexpected_before_load = sorted(source_keys - target_keys)
    if missing_before_load or unexpected_before_load:
        raise RuntimeError(
            "Strict state key mismatch before load. "
            f"Missing={missing_before_load}; unexpected={unexpected_before_load}"
        )
    incompatible = model.load_state_dict(state_dict, strict=True)
    diagnostics = {
        "strict": True,
        "source_state_entries": len(state_dict),
        "target_state_entries": len(model.state_dict()),
        "missing_keys": list(incompatible.missing_keys),
        "unexpected_keys": list(incompatible.unexpected_keys),
        "compatibility_changes": compatibility_changes,
        "classifier_weight_shape": list(model.classifier.weight.shape),
        "classifier_bias_shape": list(model.classifier.bias.shape),
        "parameter_count": sum(parameter.numel() for parameter in model.parameters()),
        "config": {
            "hidden_size": config.hidden_size,
            "num_hidden_layers": config.num_hidden_layers,
            "vocab_size": config.vocab_size,
            "max_position_embeddings": config.max_position_embeddings,
        },
        "tokenizer": {
            "class": type(tokenizer).__name__,
            "is_fast": bool(getattr(tokenizer, "is_fast", False)),
            "vocab_size": tokenizer.vocab_size,
            "model_max_length": tokenizer.model_max_length,
            "special_token_ids": {
                "pad": tokenizer.pad_token_id,
                "unk": tokenizer.unk_token_id,
                "cls": tokenizer.cls_token_id,
                "sep": tokenizer.sep_token_id,
                "mask": tokenizer.mask_token_id,
            },
        },
    }
    return model, tokenizer, diagnostics


def resolve_device(requested: str) -> torch.device:
    if requested == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    device = torch.device(requested)
    if device.type == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but torch.cuda.is_available() is False")
    return device


def make_loader(
    dataset: Dataset,
    batch_size: int,
    num_workers: int,
    device: torch.device,
) -> DataLoader:
    generator = torch.Generator()
    generator.manual_seed(DEFAULT_SEED)
    return DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=device.type == "cuda",
        generator=generator,
    )


def run_inference(
    model: KOTETagger,
    dataset: Dataset,
    device: torch.device,
    batch_size: int,
    num_workers: int,
    description: str,
    show_progress: bool = True,
) -> tuple[list[str], np.ndarray, np.ndarray, dict[str, Any]]:
    loader = make_loader(dataset, batch_size, num_workers, device)
    record_ids: list[str] = []
    truth_batches: list[np.ndarray] = []
    probability_batches: list[np.ndarray] = []
    model.eval()

    if device.type == "cuda":
        torch.cuda.reset_peak_memory_stats(device)
        torch.cuda.synchronize(device)
    started = time.perf_counter()
    with torch.inference_mode():
        for batch in tqdm(loader, desc=description, disable=not show_progress):
            input_ids = batch["input_ids"].to(device, non_blocking=True)
            attention_mask = batch["attention_mask"].to(device, non_blocking=True)
            _loss, probabilities = model(input_ids, attention_mask)
            record_ids.extend(str(value) for value in batch["record_id"])
            truth_batches.append(batch["labels"].to(torch.uint8).numpy())
            probability_batches.append(probabilities.float().cpu().numpy())
    if device.type == "cuda":
        torch.cuda.synchronize(device)
    elapsed = time.perf_counter() - started
    y_true = np.concatenate(truth_batches, axis=0)
    probabilities = np.concatenate(probability_batches, axis=0)
    if probabilities.shape != (len(dataset), LABEL_COUNT):
        raise ValueError(f"Unexpected probability shape: {probabilities.shape}")
    if y_true.shape != probabilities.shape:
        raise ValueError(f"Truth/probability shape mismatch: {y_true.shape} vs {probabilities.shape}")
    if not np.isfinite(probabilities).all():
        raise ValueError("Probabilities contain NaN or infinity")
    if probabilities.min() < 0.0 or probabilities.max() > 1.0:
        raise ValueError("Sigmoid probabilities fall outside [0, 1]")

    timing = {
        "examples": len(dataset),
        "seconds": elapsed,
        "examples_per_second": len(dataset) / elapsed if elapsed else None,
        "batch_size": batch_size,
        "num_workers": num_workers,
        "peak_gpu_memory_bytes": (
            int(torch.cuda.max_memory_allocated(device)) if device.type == "cuda" else None
        ),
    }
    return record_ids, y_true, probabilities, timing


def binary_predictions(probabilities: np.ndarray, threshold: float) -> np.ndarray:
    # The public test classification cell uses np.where(y_pred > THRESHOLD, 1, 0).
    return (probabilities > threshold).astype(np.uint8)


def compute_metrics(
    y_true: np.ndarray,
    probabilities: np.ndarray,
    threshold: float,
    label_names: list[str],
) -> dict[str, Any]:
    y_pred = binary_predictions(probabilities, threshold)
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true,
        y_pred,
        average=None,
        zero_division=0,
    )
    per_label_auprc = average_precision_score(y_true, probabilities, average=None)
    per_label = []
    for label_id, label in enumerate(label_names):
        per_label.append(
            {
                "label_id": label_id,
                "label": label,
                "precision": float(precision[label_id]),
                "recall": float(recall[label_id]),
                "f1": float(f1[label_id]),
                "auprc": float(per_label_auprc[label_id]),
                "actual_positive_count": int(support[label_id]),
                "predicted_positive_count": int(y_pred[:, label_id].sum()),
            }
        )
    return {
        "threshold": float(threshold),
        "threshold_operator": THRESHOLD_OPERATOR,
        "examples": int(y_true.shape[0]),
        "label_count": int(y_true.shape[1]),
        "macro_precision": float(
            precision_score(y_true, y_pred, average="macro", zero_division=0)
        ),
        "macro_recall": float(recall_score(y_true, y_pred, average="macro", zero_division=0)),
        "macro_f1": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        "micro_precision": float(
            precision_score(y_true, y_pred, average="micro", zero_division=0)
        ),
        "micro_recall": float(recall_score(y_true, y_pred, average="micro", zero_division=0)),
        "micro_f1": float(f1_score(y_true, y_pred, average="micro", zero_division=0)),
        "macro_auprc": float(np.mean(per_label_auprc)),
        "actual_positive_count": int(y_true.sum()),
        "predicted_positive_count": int(y_pred.sum()),
        "per_label": per_label,
    }


def threshold_values(minimum: float, maximum: float, step: float) -> list[float]:
    if not (0.0 <= minimum <= maximum <= 1.0) or step <= 0:
        raise ValueError("Threshold range must satisfy 0 <= min <= max <= 1 and step > 0")
    count = int(math.floor((maximum - minimum) / step + 1e-9)) + 1
    return [round(minimum + index * step, 10) for index in range(count)]


def search_thresholds(
    y_true: np.ndarray,
    probabilities: np.ndarray,
    values: Iterable[float],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for threshold in values:
        y_pred = binary_predictions(probabilities, threshold)
        rows.append(
            {
                "threshold": float(threshold),
                "macro_f1": float(
                    f1_score(y_true, y_pred, average="macro", zero_division=0)
                ),
                "micro_f1": float(
                    f1_score(y_true, y_pred, average="micro", zero_division=0)
                ),
                "predicted_positive_count": int(y_pred.sum()),
            }
        )
    best_score = max(row["macro_f1"] for row in rows)
    tied = [row for row in rows if math.isclose(row["macro_f1"], best_score, abs_tol=1e-15)]
    selected = min(tied, key=lambda row: (abs(row["threshold"] - ORIGINAL_THRESHOLD), row["threshold"]))
    selection = {
        "objective": "maximize validation Macro F1",
        "tie_break": "closest to 0.3, then lower threshold",
        "selected_threshold": selected["threshold"],
        "selected_validation_macro_f1": selected["macro_f1"],
        "selected_validation_micro_f1": selected["micro_f1"],
        "candidate_count": len(rows),
        "minimum": rows[0]["threshold"],
        "maximum": rows[-1]["threshold"],
        "step": rows[1]["threshold"] - rows[0]["threshold"] if len(rows) > 1 else None,
    }
    return rows, selection


def save_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def save_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        raise ValueError(f"Cannot save empty CSV: {path}")
    with path.open("w", encoding="utf-8-sig", newline="") as destination:
        writer = csv.DictWriter(destination, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def save_probabilities(
    path: Path,
    record_ids: list[str],
    y_true: np.ndarray,
    probabilities: np.ndarray,
    label_names: list[str],
) -> None:
    np.savez_compressed(
        path,
        record_ids=np.asarray(record_ids, dtype=str),
        y_true=y_true.astype(np.uint8, copy=False),
        probabilities=probabilities.astype(np.float32, copy=False),
        label_names=np.asarray(label_names, dtype=str),
    )


def maximum_numeric_difference(first: Any, second: Any) -> float:
    differences: list[float] = []

    def visit(left: Any, right: Any) -> None:
        if isinstance(left, dict) and isinstance(right, dict):
            if set(left) != set(right):
                raise ValueError("Metric dictionaries have different keys")
            for key in left:
                visit(left[key], right[key])
        elif isinstance(left, list) and isinstance(right, list):
            if len(left) != len(right):
                raise ValueError("Metric lists have different lengths")
            for left_item, right_item in zip(left, right):
                visit(left_item, right_item)
        elif isinstance(left, (int, float)) and isinstance(right, (int, float)):
            differences.append(abs(float(left) - float(right)))
        elif left != right:
            raise ValueError(f"Metric values differ: {left!r} != {right!r}")

    visit(first, second)
    return max(differences, default=0.0)


def verify_saved_probabilities(
    path: Path,
    original_metrics: dict[str, Any],
    threshold: float,
    label_names: list[str],
) -> dict[str, Any]:
    with np.load(path, allow_pickle=False) as saved:
        y_true = saved["y_true"]
        probabilities = saved["probabilities"]
        saved_labels = saved["label_names"].tolist()
    if saved_labels != label_names:
        raise ValueError(f"Saved label order mismatch in {path}")
    recomputed = compute_metrics(y_true, probabilities, threshold, label_names)
    difference = maximum_numeric_difference(original_metrics, recomputed)
    return {
        "probability_file": str(path),
        "file_sha256": sha256(path),
        "metric_recalculation_max_absolute_difference": difference,
        "metrics_identical": difference == 0.0,
    }


def verify_subset_reinference(
    model: KOTETagger,
    dataset: Dataset,
    original_probabilities: np.ndarray,
    device: torch.device,
    batch_size: int,
    num_workers: int,
    sample_count: int,
    selected_threshold: float,
    tolerance: float,
) -> dict[str, Any]:
    count = min(sample_count, len(dataset))
    subset = Subset(dataset, list(range(count)))
    _ids, _truth, repeated, timing = run_inference(
        model,
        subset,
        device,
        batch_size,
        num_workers,
        description="recheck",
        show_progress=False,
    )
    difference = np.abs(original_probabilities[:count].astype(np.float64) - repeated.astype(np.float64))
    original_binary = binary_predictions(original_probabilities[:count], ORIGINAL_THRESHOLD)
    repeated_binary = binary_predictions(repeated, ORIGINAL_THRESHOLD)
    original_selected = binary_predictions(original_probabilities[:count], selected_threshold)
    repeated_selected = binary_predictions(repeated, selected_threshold)
    return {
        "selection": "first N records in unchanged split order",
        "sample_count": count,
        "probability_tolerance": tolerance,
        "max_absolute_difference": float(difference.max()) if difference.size else 0.0,
        "mean_absolute_difference": float(difference.mean()) if difference.size else 0.0,
        "within_tolerance": bool(np.all(difference <= tolerance)),
        "binary_predictions_match_at_0.3": bool(np.array_equal(original_binary, repeated_binary)),
        "binary_predictions_match_at_selected_threshold": bool(
            np.array_equal(original_selected, repeated_selected)
        ),
        "timing": timing,
    }


def package_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def environment_info(device: torch.device) -> dict[str, Any]:
    return {
        "python": sys.version,
        "platform": platform.platform(),
        "packages": {
            name: package_version(name)
            for name in (
                "torch",
                "transformers",
                "scikit-learn",
                "numpy",
                "tqdm",
                "tokenizers",
            )
        },
        "device": str(device),
        "cuda_available": torch.cuda.is_available(),
        "torch_cuda_version": torch.version.cuda,
        "cudnn_version": torch.backends.cudnn.version() if torch.cuda.is_available() else None,
        "gpu_name": torch.cuda.get_device_name(device) if device.type == "cuda" else None,
        "deterministic_algorithms_enabled": torch.are_deterministic_algorithms_enabled(),
        "fp32_official_run": True,
    }


def build_report(summary: dict[str, Any]) -> str:
    validation = summary["validation"]
    test = summary["test"]
    selected = summary["threshold_selection"]["selected_threshold"]
    test_original = test["metrics_threshold_0.3"]
    test_selected = test["metrics_selected_threshold"]
    return f"""# KOTE A0-Paper 재현 평가 보고서

## 평가 범위

- 공개 KOTE validation 5,000개와 test 5,000개만 사용했다.
- 실제 일기 데이터는 사용하지 않았다.
- A0-Paper의 44개 sigmoid 확률을 그대로 보존했다.
- 44개 감정을 앱의 대표 감정으로 변환하지 않았다.

## 모델 및 입력 검증

- 체크포인트 strict 로드: 성공
- state dict 항목: {summary['model']['source_state_entries']}개
- 누락 키: {len(summary['model']['missing_keys'])}개
- 예상하지 않은 키: {len(summary['model']['unexpected_keys'])}개
- encoder: {summary['model']['config']['num_hidden_layers']}층
- hidden size: {summary['model']['config']['hidden_size']}
- vocabulary: {summary['model']['config']['vocab_size']}
- 최대 입력 길이: {MAX_LENGTH}
- 정밀도: FP32

## Validation 임계값

- 원본 임계값: `{THRESHOLD_OPERATOR} {ORIGINAL_THRESHOLD}`
- 원본 임계값 Macro F1: {validation['metrics_threshold_0.3']['macro_f1']:.8f}
- 선택된 전역 임계값: `{THRESHOLD_OPERATOR} {selected}`
- 선택 기준: validation Macro F1 최대화
- 선택 임계값 Macro F1: {validation['metrics_selected_threshold']['macro_f1']:.8f}

## Test 결과

| 조건 | Macro F1 | Micro F1 | Macro AUPRC |
| --- | ---: | ---: | ---: |
| 원본 임계값 0.3 | {test_original['macro_f1']:.8f} | {test_original['micro_f1']:.8f} | {test_original['macro_auprc']:.8f} |
| validation 선택 임계값 {selected} | {test_selected['macro_f1']:.8f} | {test_selected['micro_f1']:.8f} | {test_selected['macro_auprc']:.8f} |

- 공개 Macro F1 약 {PUBLIC_MACRO_F1_APPROX:.2f}와의 절대 차이: {summary['public_score_comparison']['absolute_difference']:.8f}
- test 결과는 임계값 선택에 사용하지 않았다.

## 재현성 확인

- 저장 확률에서 지표 재계산 일치: {test['saved_probability_verification']['metrics_identical']}
- 일부 샘플 재추론 확률 최대 절대 차이: {test['subset_reinference']['max_absolute_difference']:.10g}
- 허용오차 이내: {test['subset_reinference']['within_tolerance']}
- 임계값 0.3 이진 예측 일치: {test['subset_reinference']['binary_predictions_match_at_0.3']}

## 해석 제한

이 결과는 한국어 온라인 댓글로 구성된 KOTE test 성능이다. 실제 일기 영역의 정확도를 의미하지 않으며 질병 진단 결과로 해석해서는 안 된다.
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--labels-source", type=Path, required=True)
    parser.add_argument("--validation-tsv", type=Path, required=True)
    parser.add_argument("--test-tsv", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--device", default="auto", help="auto, cpu, cuda, or cuda:N")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--num-workers", type=int, default=0)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--threshold-min", type=float, default=0.05)
    parser.add_argument("--threshold-max", type=float, default=0.95)
    parser.add_argument("--threshold-step", type=float, default=0.01)
    parser.add_argument("--recheck-samples", type=int, default=32)
    parser.add_argument("--probability-tolerance", type=float, default=1e-5)
    parser.add_argument("--mode", choices=("smoke", "full"), default="full")
    parser.add_argument("--smoke-samples", type=int, default=16)
    parser.add_argument(
        "--allow-unverified-inputs",
        action="store_true",
        help="Allow hash mismatches. Never use for the official reproduction result.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.batch_size < 1 or args.num_workers < 0 or args.recheck_samples < 1:
        raise ValueError("Batch size and recheck samples must be positive; workers cannot be negative")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    seed_everything(args.seed)
    device = resolve_device(args.device)

    hash_checks = [
        check_hash(args.checkpoint, EXPECTED_HASHES["checkpoint"], "checkpoint", args.allow_unverified_inputs),
        check_hash(
            args.labels_source,
            EXPECTED_HASHES["labels_source"],
            "labels_source",
            args.allow_unverified_inputs,
        ),
        check_hash(
            args.validation_tsv,
            EXPECTED_HASHES["validation_tsv"],
            "validation_tsv",
            args.allow_unverified_inputs,
        ),
        check_hash(args.test_tsv, EXPECTED_HASHES["test_tsv"], "test_tsv", args.allow_unverified_inputs),
    ]
    for filename in ("config.json", "special_tokens_map.json", "tokenizer_config.json", "vocab.txt"):
        hash_checks.append(
            check_hash(
                args.model_dir / filename,
                EXPECTED_HASHES[filename],
                filename,
                args.allow_unverified_inputs,
            )
        )

    label_names = load_label_names(args.labels_source)
    model, tokenizer, model_diagnostics = build_model(args.model_dir, args.checkpoint)
    model = model.float().to(device)
    model.eval()

    validation_records = load_tsv(args.validation_tsv, len(label_names))
    if args.mode == "smoke":
        smoke_count = min(args.smoke_samples, len(validation_records))
        smoke_dataset = KOTEDataset(validation_records[:smoke_count], tokenizer)
        record_ids, y_true, probabilities, timing = run_inference(
            model,
            smoke_dataset,
            device,
            args.batch_size,
            args.num_workers,
            description="smoke",
        )
        smoke = {
            "status": "passed",
            "mode": "smoke",
            "hash_checks": hash_checks,
            "model": model_diagnostics,
            "environment": environment_info(device),
            "seed": args.seed,
            "max_length": MAX_LENGTH,
            "record_ids": record_ids,
            "truth_shape": list(y_true.shape),
            "probability_shape": list(probabilities.shape),
            "probability_min": float(probabilities.min()),
            "probability_max": float(probabilities.max()),
            "all_probabilities_finite": bool(np.isfinite(probabilities).all()),
            "timing": timing,
        }
        save_json(args.output_dir / "smoke_summary.json", smoke)
        print(json.dumps(smoke, ensure_ascii=False, indent=2))
        return 0

    if len(validation_records) != 5000:
        raise ValueError(f"Official validation requires 5000 rows, found {len(validation_records)}")
    validation_dataset = KOTEDataset(validation_records, tokenizer)
    val_ids, val_true, val_probabilities, val_timing = run_inference(
        model,
        validation_dataset,
        device,
        args.batch_size,
        args.num_workers,
        description="validation",
    )
    validation_probability_path = args.output_dir / "validation_probabilities.npz"
    save_probabilities(
        validation_probability_path,
        val_ids,
        val_true,
        val_probabilities,
        label_names,
    )
    validation_original = compute_metrics(
        val_true, val_probabilities, ORIGINAL_THRESHOLD, label_names
    )
    rows, threshold_selection = search_thresholds(
        val_true,
        val_probabilities,
        threshold_values(args.threshold_min, args.threshold_max, args.threshold_step),
    )
    selected_threshold = float(threshold_selection["selected_threshold"])
    validation_selected = compute_metrics(
        val_true, val_probabilities, selected_threshold, label_names
    )
    save_json(args.output_dir / "validation_metrics_threshold_0p3.json", validation_original)
    save_csv(
        args.output_dir / "validation_per_label_threshold_0p3.csv",
        validation_original["per_label"],
    )
    save_csv(args.output_dir / "validation_threshold_search.csv", rows)
    save_json(args.output_dir / "validation_threshold_selection.json", threshold_selection)
    save_json(
        args.output_dir / "validation_metrics_selected_threshold.json", validation_selected
    )
    save_csv(
        args.output_dir / "validation_per_label_selected_threshold.csv",
        validation_selected["per_label"],
    )
    validation_saved_check = verify_saved_probabilities(
        validation_probability_path,
        validation_original,
        ORIGINAL_THRESHOLD,
        label_names,
    )
    validation_recheck = verify_subset_reinference(
        model,
        validation_dataset,
        val_probabilities,
        device,
        args.batch_size,
        args.num_workers,
        args.recheck_samples,
        selected_threshold,
        args.probability_tolerance,
    )

    test_records = load_tsv(args.test_tsv, len(label_names))
    if len(test_records) != 5000:
        raise ValueError(f"Official test requires 5000 rows, found {len(test_records)}")
    test_dataset = KOTEDataset(test_records, tokenizer)
    test_ids, test_true, test_probabilities, test_timing = run_inference(
        model,
        test_dataset,
        device,
        args.batch_size,
        args.num_workers,
        description="test",
    )
    test_probability_path = args.output_dir / "test_probabilities.npz"
    save_probabilities(
        test_probability_path,
        test_ids,
        test_true,
        test_probabilities,
        label_names,
    )
    test_original = compute_metrics(test_true, test_probabilities, ORIGINAL_THRESHOLD, label_names)
    test_selected = compute_metrics(
        test_true, test_probabilities, selected_threshold, label_names
    )
    save_json(args.output_dir / "test_metrics_threshold_0p3.json", test_original)
    save_csv(
        args.output_dir / "test_per_label_threshold_0p3.csv", test_original["per_label"]
    )
    save_json(args.output_dir / "test_metrics_selected_threshold.json", test_selected)
    save_csv(
        args.output_dir / "test_per_label_selected_threshold.csv",
        test_selected["per_label"],
    )
    test_saved_check = verify_saved_probabilities(
        test_probability_path, test_original, ORIGINAL_THRESHOLD, label_names
    )
    test_recheck = verify_subset_reinference(
        model,
        test_dataset,
        test_probabilities,
        device,
        args.batch_size,
        args.num_workers,
        args.recheck_samples,
        selected_threshold,
        args.probability_tolerance,
    )

    summary = {
        "status": "completed",
        "scope": "public KOTE only; no diary-domain data",
        "hash_checks": hash_checks,
        "model": model_diagnostics,
        "environment": environment_info(device),
        "settings": {
            "seed": args.seed,
            "max_length": MAX_LENGTH,
            "padding": "max_length",
            "truncation": True,
            "precision": "float32",
            "original_threshold": ORIGINAL_THRESHOLD,
            "threshold_operator": THRESHOLD_OPERATOR,
            "batch_size": args.batch_size,
            "num_workers": args.num_workers,
            "probability_tolerance": args.probability_tolerance,
        },
        "label_names": label_names,
        "threshold_selection": threshold_selection,
        "validation": {
            "metrics_threshold_0.3": validation_original,
            "metrics_selected_threshold": validation_selected,
            "probability_file": str(validation_probability_path),
            "timing": val_timing,
            "saved_probability_verification": validation_saved_check,
            "subset_reinference": validation_recheck,
        },
        "test": {
            "metrics_threshold_0.3": test_original,
            "metrics_selected_threshold": test_selected,
            "probability_file": str(test_probability_path),
            "timing": test_timing,
            "saved_probability_verification": test_saved_check,
            "subset_reinference": test_recheck,
        },
        "public_score_comparison": {
            "published_macro_f1_approx": PUBLIC_MACRO_F1_APPROX,
            "reproduced_test_macro_f1_threshold_0.3": test_original["macro_f1"],
            "absolute_difference": abs(test_original["macro_f1"] - PUBLIC_MACRO_F1_APPROX),
            "note": "The public notebook displays Macro F1 rounded to two decimals.",
        },
    }
    save_json(args.output_dir / "a0_reproduction_summary.json", summary)
    (args.output_dir / "A0_REPRODUCTION_REPORT.md").write_text(
        build_report(summary), encoding="utf-8"
    )
    print(json.dumps(summary["public_score_comparison"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
