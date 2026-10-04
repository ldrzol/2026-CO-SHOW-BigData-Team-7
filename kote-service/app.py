"""KOTE 44 라벨 추론 서비스.

전달본의 동결 평가기(reproduce_a0_kote.py)를 그대로 import 해서 쓰고, 모델은
프로세스가 뜰 때 한 번만 올립니다. infer_a0_kote.py 의 CLI 는 호출마다 모델을
다시 만들기 때문에 서비스에서는 쓰지 않고, 같은 상수·같은 전처리만 재사용합니다.
"""

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "scripts"))

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import infer_a0_kote as kote  # noqa: E402

MAX_TEXTS = 32
MAX_CHARS = 2000
BATCH_SIZE = 8

state = {}


def load_model():
    """체크포인트·토크나이저·동결 평가기 해시를 먼저 확인하고 모델을 올립니다."""
    kote.verify_file(kote.DEFAULT_CHECKPOINT, kote.CHECKPOINT_SHA256, "checkpoint")
    kote.verify_file(kote.DEFAULT_LABELS_SOURCE, kote.LABELS_SOURCE_SHA256, "labels_source")
    kote.verify_file(
        Path(kote.__file__).with_name("reproduce_a0_kote.py"),
        kote.FROZEN_EVALUATOR_SHA256,
        "frozen_evaluator",
    )
    for filename, expected in kote.EXPECTED_RUNTIME_HASHES.items():
        kote.verify_file(kote.DEFAULT_MODEL_DIR / filename, expected, filename)

    evaluator = kote._load_verified_evaluator()
    evaluator.seed_everything(kote.SEED)
    device = evaluator.resolve_device("cpu")
    label_names = evaluator.load_label_names(kote.DEFAULT_LABELS_SOURCE)
    model, tokenizer, _diagnostics = evaluator.build_model(kote.DEFAULT_MODEL_DIR, kote.DEFAULT_CHECKPOINT)
    model = model.float().to(device)
    model.eval()

    state.update(
        torch=evaluator.torch,
        device=device,
        model=model,
        tokenizer=tokenizer,
        label_names=label_names,
    )


@asynccontextmanager
async def lifespan(_app):
    load_model()
    yield
    state.clear()


app = FastAPI(lifespan=lifespan)


class InferRequest(BaseModel):
    # 사건의 evidence_text 를 그대로 넣습니다. 요약이나 일기 전체로 바꾸지 않아요
    texts: list[str] = Field(min_length=1, max_length=MAX_TEXTS)


@app.get("/healthz")
def healthz():
    return {"ready": "model" in state, "labelCount": kote.LABEL_COUNT}


@app.post("/")
def infer(req: InferRequest):
    texts = [t.strip() for t in req.texts]
    if any(not t for t in texts):
        raise HTTPException(422, "빈 문자열은 넣을 수 없어요")
    if any(len(t) > MAX_CHARS for t in texts):
        raise HTTPException(422, f"한 건은 {MAX_CHARS}자까지예요")

    torch = state["torch"]
    tokenizer = state["tokenizer"]
    model = state["model"]
    device = state["device"]

    rows: list[list[float]] = []
    with torch.inference_mode():
        for start in range(0, len(texts), BATCH_SIZE):
            batch = texts[start : start + BATCH_SIZE]
            encoded = tokenizer(
                batch,
                max_length=kote.MAX_LENGTH,
                padding="max_length",
                truncation=True,
                return_tensors="pt",
                return_token_type_ids=False,
            )
            _loss, probabilities = model(
                encoded["input_ids"].to(device), encoded["attention_mask"].to(device)
            )
            rows.extend(probabilities.float().cpu().numpy().tolist())

    return {
        "probabilities": rows,  # 공식 라벨 순서의 44개 점수. 5감정 변환은 호출한 쪽에서
        "labelOrder": state["label_names"],
        "modelVersion": kote.MODEL_SOURCE_COMMIT,
    }
