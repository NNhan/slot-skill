#!/usr/bin/env bash
# Runs INSIDE the measure container (no network, not root), from the engine folder: the eval task of one pack, RUNS times
# without the skill and RUNS times with it. stdout: the one report line of the run; everything else goes to /tmp.
# The model is reached through /model/api.sock only (scripts/model-proxy.mjs on the runner holds the API key); the value of
# ANTHROPIC_API_KEY below is a placeholder the proxy replaces.
#
# usage: bash measure-in-container.sh <absolute pack folder>      (env: RUNS, MODEL, RUN_BUDGET_USD, BUDGET_USD)
set -euo pipefail
pack="$1"
mkdir -p /tmp/home
node /gate/model-proxy.mjs relay /model/api.sock 8787 > /tmp/relay.log 2>&1 &
for _ in $(seq 50); do if (exec 3<> /dev/tcp/127.0.0.1/8787) 2> /dev/null; then break; fi; sleep 0.1; done
export ANTHROPIC_BASE_URL=http://127.0.0.1:8787 ANTHROPIC_API_KEY=held-by-the-model-proxy
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 DISABLE_UPDATES=1
pnpm -s slot skill eval "$pack" --runs "$RUNS" --model "$MODEL" --run-budget-usd "$RUN_BUDGET_USD" --budget-usd "$BUDGET_USD" --json 2> /tmp/eval.stderr
