#!/usr/bin/env bash
# Stage a read-only results site for Cloud Run: web/app + screens + config + selected evidence runs. No keys, no inputs/, no agent code.
# usage: deploy/stage.sh g4_rehearsal [more_run_ids...]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; OUT="$ROOT/deploy/stage"
rm -rf "$OUT"; mkdir -p "$OUT/web" "$OUT/runs"
rsync -a --exclude design --exclude __pycache__ --exclude old "$ROOT/web/app" "$OUT/web/"
cp -R "$ROOT/screens" "$ROOT/config" "$OUT/"
for r in "$@"; do case "$r" in STUB_*) echo "refusing STUB run $r"; exit 1;; esac; cp -R "$ROOT/runs/$r" "$OUT/runs/$r"; done
cat > "$OUT/Dockerfile" <<'DOCKER'
FROM python:3.12-slim
WORKDIR /app
COPY . /app
ENV TANGLE_READONLY=1
CMD ["python3", "web/app/server.py"]
DOCKER
echo "staged: $(du -sh "$OUT" | cut -f1) → $OUT"
