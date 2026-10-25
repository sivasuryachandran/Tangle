#!/usr/bin/env bash
# Stage a read-only results site for Cloud Run: web/app + the landing hero's modules (web/render, web/hero incl. vendored three)
# + schemas/screens/config + selected evidence runs. No keys, no inputs/, no agent code.
# usage: deploy/stage.sh <featured_run> [more_run_ids...]     (runs are looked up in $ROOT/runs, then in $RUNS_FALLBACK)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; OUT="$ROOT/deploy/stage"; FALLBACK="${RUNS_FALLBACK:-}"
FEATURED="${1:?usage: deploy/stage.sh <featured_run> [more_run_ids...]}"
rm -rf "$OUT"; mkdir -p "$OUT/web" "$OUT/runs"
rsync -a --exclude design --exclude __pycache__ --exclude old "$ROOT/web/app" "$ROOT/web/render" "$ROOT/web/hero" "$OUT/web/"
cp -R "$ROOT/schemas" "$ROOT/screens" "$ROOT/config" "$OUT/"
# the landing page imports three from /node_modules in dev; the cloud image uses the vendored copy
sed -i.bak -e 's#/node_modules/three/build/three.module.js#/web/hero/vendor/three/build/three.module.js#' -e 's#/node_modules/three/examples/jsm/#/web/hero/vendor/three/examples/jsm/#' "$OUT/web/app/index.html" && rm -f "$OUT/web/app/index.html.bak"
for r in "$@"; do
  case "$r" in STUB_*) echo "refusing STUB run $r"; exit 1;; esac
  if [ -d "$ROOT/runs/$r" ]; then cp -R "$ROOT/runs/$r" "$OUT/runs/$r"; elif [ -n "$FALLBACK" ] && [ -d "$FALLBACK/$r" ]; then cp -R "$FALLBACK/$r" "$OUT/runs/$r"; else echo "run $r not found"; exit 1; fi
done
find "$OUT" -name .DS_Store -delete
cat > "$OUT/Dockerfile" <<DOCKER
FROM python:3.12-slim
WORKDIR /app
COPY . /app
ENV TANGLE_READONLY=1 TANGLE_FEATURED_RUN=$FEATURED
CMD ["python3", "web/app/server.py"]
DOCKER
echo "staged: $(du -sh "$OUT" | cut -f1) → $OUT (featured run: $FEATURED)"
