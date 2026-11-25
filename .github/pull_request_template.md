<!-- One pull request, one pack: only files under packs/<your id>/, plus one new CODEOWNERS line the first time. -->

## Pack

- id and version:
- level (L0 instructions / L1 data):
- what an agent can do with it that it could not do before:

## Lint

Paste the single line printed by `slot skill lint packs/<id> --json`:

```json

```

## Eval task

- [ ] `eval/task.md` and `eval/accept.test.ts` describe and judge an outcome that can be reached without the pack: neither names the pack or a file it installs
- [ ] `eval/reference/` is included, **or** my solution is in `eval/solution.patch` (a `git diff` of a project from `slot new game` with the pack installed), **or** the solution cannot be a patch and is described here:

## Checklist

- [ ] The pack has a `license` (SPDX) and I have the right to publish its content under it
- [ ] No secret, no absolute path of my machine, no command that reaches the network
- [ ] Updating a published pack: `version` is raised and `CHANGELOG.md` has a line for it
- [ ] "Allow edits by maintainers" is on
