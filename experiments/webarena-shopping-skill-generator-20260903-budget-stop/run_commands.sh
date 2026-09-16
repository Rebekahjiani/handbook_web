#!/bin/bash
# Task 2: Targeted online validation - 4 tasks, serial; launch this script
# under a server-side supervisor (tmux/systemd/setsid) for unattended runs.
# Run from: /opt/artifacttrace/local-at/benchmarks
# Requires: ARTIFACTTRACE_CONTRACT_ROOT configured; at serve running on 8080
#
# router is the server-side generated aggregate rebuilt from the handbook commit
# that includes budget-stop SKILL.md
#
# Execute each task sequentially. Output root must not overwrite previous runs.

EXP="webarena-shopping-skill-generator-20260903-budget-stop"
OUTPUT_ROOT="/opt/artifacttrace/local-at/benchmarks/runs/${EXP}"
ROUTER="/opt/artifacttrace/local-at/benchmarks/generated-skills/webarena-router.json"
CONFIG="/opt/artifacttrace/local-at/benchmarks/config.local.json"

# Common flags
COMMON="--group baselineB_skill_routed \
  --skill-router-config ${ROUTER} \
  --config ${CONFIG} \
  --output-root ${OUTPUT_ROOT} \
  --reset-env \
  --run-evaluator \
  --contract-audit-mode enforce \
  --timeout-seconds 0"

# Task 282: verify budget exhaustion causes termination and answer (core validation)
uv run --with playwright --with websockets python3 run_at_webarena_task.py \
  --task-id 282 ${COMMON}

# Task 228: catalog success retention sample
uv run --with playwright --with websockets python3 run_at_webarena_task.py \
  --task-id 228 ${COMMON}

# Task 332: order-aggregation fix retention sample
uv run --with playwright --with websockets python3 run_at_webarena_task.py \
  --task-id 332 ${COMMON}

# Task 141: positive flip retention sample
uv run --with playwright --with websockets python3 run_at_webarena_task.py \
  --task-id 141 ${COMMON}
