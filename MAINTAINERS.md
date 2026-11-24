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

The `dist` branch is written by `publish` only. Close pull requests that target it.

## What the gates can and cannot promise

- `scope` on a pull request runs the pull request's own copy of the workflow: it is early feedback. The scope check that counts is step 2 of every `gates` job, which runs the script of `main`.
- GitHub cannot require a `gates` run before a merge (runs started by a label or by hand are not attached to the pull request's commit). **You** are the enforcement: merge only when the runs named `gates … · PR <n> · <sha>` are green for the head sha you are merging.
- Tier 3 runs the contributor's code next to the engine's source, in a container without network. It cannot send anything out, but it can change what the job reports: a green `eval` means as much as your reading of `eval/`.
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

- Actions are pinned by tag (`@v4`), not by commit sha. Pin them to shas (Dependabot can keep them current) before the registry takes outside contributions.
- The container image of tier 3 (`node:22-bookworm`) is pulled by tag.

## Where these files come from

`.github/`, `scripts/` and these documents are copies of the engine repository's registry template, where tests pin every safety rule of the workflows. Change them there first, then copy.
