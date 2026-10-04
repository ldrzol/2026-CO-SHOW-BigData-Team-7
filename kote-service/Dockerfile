FROM python:3.12-slim

WORKDIR /app

# 전달본 자산 다운로드에 필요해요
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
COPY scripts/requirements-a0-cpu.txt ./scripts/
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 고정 URL·SHA-256 으로 체크포인트와 토크나이저를 받아 이미지에 구워요 (약 500MB)
RUN python scripts/prepare_a0_runtime.py --download \
 && python scripts/prepare_a0_runtime.py --check

ENV PORT=8080
CMD exec uvicorn app:app --host 0.0.0.0 --port $PORT
