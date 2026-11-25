# slot-skill

The skill registry of slot-engine: skill packs written by people who use the engine, for the people and the coding agents who build games with it.

A **skill pack** is a folder of text: instructions for an agent (`SKILL.md`, `recipe.md`) and, at level 1, data that is copied into a game project (reel presets, prefabs, sequences). A project installs one with the engine's CLI:

```sh
slot skill search reel          # what is here
slot skill add <id> --game .    # install the latest version of a pack
slot skill status --game . --online
```

This repository is public and needs no account or token to read. The engine itself is distributed separately.

## Layout

| Path | What | Who writes it |
|---|---|---|
| `packs/<id>/` | one pack per folder; the folder name is the pack id | the pack's author, by pull request |
| `CODEOWNERS` | one line per pack | the author's first pull request adds theirs |
| `evals/<id>/<version>/<agent>.self.<you>.json` | a measurement you ran yourself ("self-reported") | anyone, by pull request |
| `evals/<id>/<version>/<agent>.registry.json` on the `measured` branch | a measurement the registry ran | the registry's CI only; never part of a pull request |
| `reserved.json`, `yanked.json` | reserved ids; withdrawn versions | maintainers |
| `.github/`, `scripts/` | the gates below | maintainers |

The index (`index.v1.json`) and one immutable bundle per version (`bundles/<id>/<version>.pack.json`) are **generated** after each merge, on the `dist` branch. They are never part of a pull request.

## Levels

The level of a pack is derived from what it contains; it is not declared.

| Level | Contains | Accepted here |
|---|---|---|
| L0 | instructions only | yes |
| L1 | data installed into a project (`data/`, `install`) | yes |
| L2 | scripts, MCP server configuration | not yet |
| L3 | code (features, controllers) | not yet |

## Contributing a pack

1. Scaffold it: `slot new skill <id>`. The id is lower-case words joined by `-`, and must not be in `reserved.json`.
2. Write `SKILL.md` (no front matter; it needs a prerequisites section with a command that checks each one) and `recipe.md`. Write commands, the game folder and project paths with the placeholders the scaffold shows, not literally.
3. For data: put files under `data/` and list each one in `install` of `skill.json`. A destination must be a **new** prefab, sequence or reel preset, saved by the editor so its bytes are canonical.
4. Write the eval task in `eval/`: `task.md` (what to do), `task.json` and `accept.test.ts` (what "done" means). See "Writing the eval task" below: the task must be doable **without** your pack.
5. Run `slot skill lint <dir>` until it exits 0. One warning may remain: `eval-reference-missing` (see below).
6. Open a pull request that changes **only** `packs/<your id>/` and, the first time, adds **one** line to `CODEOWNERS`:

   ```
   /packs/<your id>/ @<your GitHub login>
   ```

7. Fill in the pull request template: paste the one line `slot skill lint <dir> --json` prints.

### Writing the eval task

The registry measures your pack by giving the same task to an agent twice: in a project **without** your pack and in one **with** it. The measurement only means something if the task can be done both ways.

- `task.md` describes an **outcome** a game developer would ask for, with the numbers or behaviour that define it. It must not name your pack, a path under `skills/<your id>/`, or any file your pack installs (`install[].to`): `slot skill lint` refuses that.
- `accept.test.ts` judges that outcome on the project (the manifest, a scene, `slot check`, a test run). It must not require a file your pack installs to exist, or compare against one: the lint refuses those paths there too.
- For a data pack (L1): the data is one way to reach the outcome, not the outcome. Say in the task what the result must be (for a reel preset: the speeds, the stop stagger, the landing), so that an agent without your file can still produce it, more slowly or less reliably. If only your file can satisfy the accept test, the run without the skill fails by construction and the numbers say nothing.
- A task that an agent already does every time without your pack cannot show a difference either. Pick the task your pack exists for.

### The eval reference

A pack is merged with `eval/reference/` (a recorded solution of its own task). The tool that records it is not part of an engine install, so you are not expected to produce it. Instead, add your solution as `eval/solution.patch`: a `git diff` of a project made by `slot new game`, with your pack installed, before and after you solved the task. A maintainer runs a job that applies it, records `eval/reference/` and commits the result to your pull request. Allow maintainers to edit the pull request.

A task whose solution cannot be expressed as a patch (for instance one whose acceptance test requires the log of MCP calls) is recorded by a maintainer by hand; say so in the pull request.

### What happens to your pull request

| Gate | When | What it does |
|---|---|---|
| scope | automatically, on every push | the diff stays inside `packs/<one id>/` (plus your one `CODEOWNERS` line), holds no symlink or submodule, and its JSON parses |
| lint, index, data | after a maintainer labels the pull request `gate:lint` | schema, documentation and safety lint; id and version rules; installs the pack into a fresh project |
| reference | started by a maintainer for one commit, when `eval/reference/` is missing | applies your `eval/solution.patch` and records `eval/reference/`, which the maintainer commits |
| eval | started by a maintainer for the commit whose `eval/` they read | runs your `accept.test.ts` against the reference, in a container without network |

The gates after `scope` need the engine and so do not run by themselves; every new push needs them again, and they refuse a branch that is not on top of `main` (rebase first). A file or folder whose name starts with a dot is not part of a pack. The public log of a gate shows the rule, file and line of each finding, not its message: run `slot skill lint` yourself to read the messages.

A version is immutable. Any change to a published pack is a new `version` in `skill.json`, with a line in `CHANGELOG.md`.

## Reporting a measurement

If you measured a pack with your own agent, add `evals/<id>/<version>/<agent>.self.<your login>.json` (schema: `slot schema skillEval`), with `"source": "self-reported"` and `"reportedBy"` equal to the last part of the file name. `runs` is the number of runs **per branch**, `without.passed` and `with.passed` how many of them passed the pack's accept test, `signatureStable` whether every run with the pack changed the same set of files and made the same kind of MCP calls. With an engine checkout, `slot skill eval <dir> --runs <n> --json` prints these four under `measure`. Such a file is listed in the index next to the registry's own numbers and never changes a pack's trust label.

## Trust

`community`: merged, every gate green. `verified`: the registry ran the pack's own task with its default agent, several times without the pack and several times with it, on the current engine, and the runs with the pack passed clearly more often (the exact numbers are next to the label in the index: runs, passes without, passes with). The label says nothing more than that, and a version loses it when a new engine minor has no such result yet. Numbers you report yourself never change it.

## Using a clone instead of the network

```sh
git clone --branch dist https://github.com/NNhan/slot-skill.git
slot skill add <id> --game . --registry ./slot-skill
```

`SLOT_SKILL_REGISTRY` sets the same thing for every command.

## License

Each pack carries its own license in `skill.json` (`license`, an SPDX identifier). Everything outside `packs/` is MIT.
