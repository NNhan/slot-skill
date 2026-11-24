#!/usr/bin/env bash
# Runs INSIDE the tier-3 container (no network, not root), from the engine folder: records <pack>/eval/reference/ from the
# contributor's eval/solution.patch, then checks it. stdout: the one report line of the check; everything else goes to /tmp.
#
# usage: bash record-reference.sh <absolute pack folder>
set -euo pipefail
pack="$1"
mkdir -p /tmp/home
test -f "$pack/eval/solution.patch"
pnpm -s eval:ref --pack "$pack" --prepare > /tmp/prepare.json 2> /tmp/prepare.stderr
mapfile -t f < <(node -e 'const r = JSON.parse(require("fs").readFileSync("/tmp/prepare.json", "utf8").trim().split("\n").at(-1)); for (const k of ["run", "project", "baseline", "shim"]) console.log(String(r[k]));')
run="${f[0]}" project="${f[1]}" baseline="${f[2]}" shim="${f[3]}"
[[ "$run" == /* && "$project" == /* && "$shim" == /* && "$baseline" =~ ^[0-9a-f]{7,40}$ ]]
git -C "$project" apply --whitespace=nowarn "$pack/eval/solution.patch" 2> /tmp/apply.stderr
pnpm -s eval:ref --pack "$pack" --run "$run" --baseline "$baseline" --shim "$shim" > /tmp/ref.out 2> /tmp/ref.stderr
pnpm -s slot skill eval "$pack" --check --json 2> /tmp/eval.stderr
