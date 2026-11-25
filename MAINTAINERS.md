# Maintaining the registry

## One-time setup

The gates after `scope` clone the engine, which is private. Until the items below exist, only `scope` runs; `gates` and `publish` stop at the step "Engine (read-only deploy key)" with "the engine could not be cloned".

1. **Deploy key** (read-only, the engine repository only; never a personal token):

   ```sh
   ssh-keygen -t ed25519 -N "" -C "slot-skill registry (read-only)" -f slot-skill-engine-key
   ```

   - Engine repository → Settings → Deploy keys → Add deploy key: paste the content of `slot-skill-engine-key.pub`; leave "Allow write access" **off**.
   - This repository → Settings → Secrets and variables → Actions → Secrets → New repository secret:
     - `ENGINE_DEPLOY_KEY` = the whole content of `slot-skill-engine-key` (the private half);
     - `ENGINE_REPOSITORY` = `<owner>/<name>` of the engine repository. It is a secret, not a variable, so the name is masked in the public logs.
   - Delete both key files afterwards. To rotate: delete the deploy key on the engine repository, then repeat.
2. **Branch protection** for `main` (Settings → Branches, or a ruleset): require a pull request before merging; require the status check `scope`; require branches to be up to date before merging; no force pushes; no deletions. For `dist`: no force pushes, no deletions.
3. Settings → Actions → General: fork pull request workflows "Require approval for all outside collaborators"; workflow permissions "Read repository contents and packages permissions". Do **not** attach a self-hosted runner to this repository.
4. Create the label `gate:lint`.

The `dist` branch is written by `publish` only, the `measured` branch by `measure` only. Close pull requests that target either.

### Turning the measurement on (optional; it spends money)

`measure` runs a pack's eval task with a real agent, 5 times without the skill and 5 times with it, and its result decides the `verified` label. It does nothing until all of this is done:

1. In the console of the model provider, create a **workspace used for nothing else**, set a monthly **spend limit** on that workspace, and create an API key in it. The spend limit of the workspace is the hard limit: everything below is a softer limit inside it. If the console lets you turn off server-side tools (web search, web fetch, code execution) or MCP connectors for that organization or workspace, turn them off: the proxy refuses them already, this is a second wall.
2. This repository → Settings → **Environments** → New environment `measure`; Deployment branches and tags: **Selected branches**, add `main` only. In that environment, add the secret `MEASURE_API_KEY` = that key. It is an environment secret, not a repository secret: a `measure.yml` edited on another branch cannot reach it, nor run the job that writes to `measured`. Never put the key in a variable, a file or a workflow.
3. Same page → **Variables**: `MEASURE` = `on` (the switch; delete it to turn measuring off). Optional: `MEASURE_RUN_BUDGET_USD` (per run, default 3) and `MEASURE_BUDGET_USD` (per measurement of 10 runs, default 30; it must be at least 10 times the run budget, or the matrix is cut short and nothing is recorded).
4. `dist` rules apply to `measured` too: no force pushes, no deletions; if your plan has rulesets, restrict who can push to `measured` to the GitHub Actions app.

One measurement costs at most `MEASURE_BUDGET_USD`. The schedule (weekly) measures at most one pack per run, taking turns among the packs whose `engine` range holds the current engine and that have no result for it yet (a pack whose measurement never finishes does not block the others). To measure a pack now: Actions → measure → **Run workflow** with the full sha of `main` you read and the pack id.

How the key is kept: the job that runs the agent has no token and no network. The agent reaches the model through a unix socket to `scripts/model-proxy.mjs`, a process on the runner that holds the key, forwards the Messages API only, refuses a request that asks the provider to reach anything itself (an MCP connector, a server tool, a container, an image or document fetched from a URL or a file), drops any credential the caller sends, and ends the upstream call when the caller goes away; the key never enters the container. Of what the run prints, four values leave the job (runs, passes without, passes with, signature stable); the second job writes them to `measured`. What this does **not** close: whatever the agent reads (the pack, the engine's source) can be sent to the model under your key, and a pack can make the agent spend up to the budget. Measure only packs that were reviewed and merged.

`measure` has not run for real yet. Its first run is the test of three things nobody could check without a key: the eval harness inside a container without network, the agent CLI talking to `http://127.0.0.1` through the relay, and a clone of the engine with its large files.

## What the gates can and cannot promise

- `scope` on a pull request runs the pull request's own copy of the workflow: it is early feedback. The scope check that counts is step 2 of every `gates` job, which runs the script of `main`.
- GitHub cannot require a `gates` run before a merge (runs started by a label or by hand are not attached to the pull request's commit). **You** are the enforcement: merge only when the runs named `gates … · PR <n> · <sha>` are green for the head sha you are merging.
- Tier 3 runs the contributor's code next to the engine's source, in a container without network. It cannot open a connection, but two things it writes are public: the job log (at most 50 findings, each a rule name, a path and a line number) and, for `reference`, the artifact (three files, under 256 KB, downloadable by any signed-in user as soon as it is uploaded). Both are small, not closed: code you did not read can use them to carry text out, and can also change what the job reports. A green `eval` means as much as your reading of `eval/`.
- Tier 3 clones the engine with its large files (the eval harness needs them); that path has not run with a deploy key yet.
- The public log of a gate shows the rule, file and line of each finding. The full report and the tool's stderr are not uploaded anywhere (an artifact of a public repository is readable by everyone); to see a message, run the same `slot` command on your machine.

## Reviewing a pack

1. `scope` is green and the branch is on top of `main` (the gates refuse a commit that is not). If the diff touches anything but `packs/<one id>/` and one new `CODEOWNERS` line, stop: do not label it.
2. Add the label `gate:lint`. It checks the head at that moment; after a new push, remove and add it again.
3. Read the whole diff. The safety lint is a coarse filter; you are the gate against instructions that tell an agent to skip checks, read secrets or send data anywhere.
4. Read `eval/` at one commit, copy that commit's full sha, then Actions → gates → **Run workflow** with the pull request number, that sha and gate `eval`. Tier 3 has no label on purpose: a label names whatever the head is when it lands, and that may not be the commit you read.
5. No `eval/reference/` yet: Run workflow with gate `reference` (it needs `eval/solution.patch`), download the artifact `reference-<id>`, read `reference.patch`, commit the three files to the pull request with your own account, then run `lint` and `eval` on the new sha. A task whose acceptance needs a real log of MCP calls cannot be recorded by this job: record it by hand on an isolated machine, never on one that holds credentials.
6. Merge only when `lint` and `eval` are green for the head sha. `publish` lints every pack again, then generates the index and the bundle on `dist`.

An update by a pack's code owner (as listed on `main`) that does not touch `eval/` and does not raise the level still needs both gates, but not a second reading of `eval/`.

## Withdrawing a version

Add it to `yanked.json` (`reason`, `at`, optionally `replacedBy`) in a pull request of your own. The bundle stays downloadable so that projects that installed it can rebuild; `slot skill add` refuses it unless the version is named.

## Self-reported results

A pull request may add `evals/<id>/<version>/<agent>.self.<reporter>.json`. Nothing ties `<reporter>` to the author of the pull request: check it when you review.

## Known gaps

- The agent CLI of `measure` is installed at `latest` from the public npm registry on every run; the measured version is not recorded in the result. Pin it (`AGENT_CLI` in measure.yml) once a first run has shown which version works.
- Actions are pinned by tag (`@v4`), not by commit sha. Pin them to shas (Dependabot can keep them current) before the registry takes outside contributions.
- The container image of tier 3 (`node:22-bookworm`) is pulled by tag.

## Where these files come from

`.github/`, `scripts/` and these documents are copies of the engine repository's registry template, where tests pin every safety rule of the workflows. Change them there first, then copy.
