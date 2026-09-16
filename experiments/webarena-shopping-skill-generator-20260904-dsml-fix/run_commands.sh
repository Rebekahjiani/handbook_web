#!/bin/bash
# run8: DSML fix validation — tasks 282/228/332/141
# stream_impl.rs: double-pipe dialect + self-closing invoke support
set -uo pipefail

export PATH="/root/.local/bin:$PATH"

EXP="webarena-shopping-skill-generator-20260904-dsml-fix"
OUTPUT_ROOT="/opt/artifacttrace/local-at/benchmarks/runs/${EXP}"
ROUTER="/opt/artifacttrace/local-at/benchmarks/generated-skills/webarena-router.json"
CONFIG="/opt/artifacttrace/local-at/benchmarks/config.local.json"
RUNNER="/opt/artifacttrace/local-at/benchmarks/run_at_webarena_task.py"
DATASET="/opt/webarena-verified/assets/dataset/webarena-verified.json"
CHROME="/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome"
UV="/root/.local/bin/uv"

export UV_CACHE_DIR=/opt/uv-cache
export UV_DEFAULT_INDEX=https://pypi.org/simple
export WA_CHROME_ARGS="--headless=new"

COMMON="--group baselineB_skill_routed \
  --skill-router-config ${ROUTER} \
  --config ${CONFIG} \
  --dataset ${DATASET} \
  --output-root ${OUTPUT_ROOT} \
  --env-ctrl-urls shopping=http://localhost:7771,shopping_admin=http://localhost:7781 \
  --run-evaluator \
  --contract-audit-mode enforce \
  --timeout-seconds 0 \
  --chrome-path ${CHROME}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

# Reset the shopping container BEFORE opening a WebSocket connection to AT.
# --reset-env is intentionally omitted from COMMON: the runner would open WS
# first, then reset (taking ~150s), causing the AT server keepalive to time
# out (HEARTBEAT_TIMEOUT_SECS=180s).  Instead we reset here, wait for HTTP
# ready, then call the runner with an already-live site.
reset_shopping() {
  log "Resetting webarena_verified_shopping..."
  docker rm -f webarena_verified_shopping 2>/dev/null || true
  docker run -d --name webarena_verified_shopping \
    -p 7770:80 -p 7771:8877 \
    -e WA_ENV_CTRL_EXTERNAL_SITE_URL=http://localhost:7770 \
    am1n3e/webarena-verified-shopping
  log "Container started, waiting for HTTP + env-ctrl ready..."
  for i in $(seq 1 60); do
    if curl -s --max-time 3 http://localhost:7770/ | grep -q "html\|Market\|DOCTYPE" 2>/dev/null; then
      log "Shopping site HTTP ready after ${i}×3s"
      break
    fi
    sleep 3
  done
  # POST /init to set the base URL inside the container.
  curl -s -X POST http://localhost:7771/init --max-time 30 > /dev/null || true
  log "Shopping reset complete"
}

mkdir -p "${OUTPUT_ROOT}"
log "Run8d start — DSML fix v2 + script-level reset (no --reset-env)"

for TASK_ID in 282 228 332 141; do
  reset_shopping
  log "Starting task ${TASK_ID}"
  pkill -f "chrome-linux64/chrome" 2>/dev/null || true
  sleep 2
  "$UV" run --with playwright --with websockets python3 "$RUNNER" --task-id "$TASK_ID" $COMMON \
    && log "task ${TASK_ID} DONE" \
    || log "task ${TASK_ID} FAILED (exit $?)"
done

log "Run8d complete"
