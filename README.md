# @kompiro/tpl-tools

Frontmatter-driven **Test Perspective Library (TPL)** validator and query tool.
Extracted from [kompiro/karasu](https://github.com/kompiro/karasu).

A TPL is a markdown file with YAML frontmatter recording a recurring
test-perspective (typically distilled from a past bug) so the same class of
defect is caught earlier next time. This package validates a directory of such
files, lets you query them by topic/package, and renders the body for a periodic
deprecation-review issue.

## Install

Published to the **public npm registry**:

```sh
pnpm add -D @kompiro/tpl-tools
```

### Standalone binary (no Node required)

For environments without a Node toolchain (other projects, Go/other-language
devcontainers, etc.), install the self-contained executable published to
[GitHub Releases](https://github.com/kompiro/tpl-tools/releases):

```sh
curl -fsSL https://raw.githubusercontent.com/kompiro/tpl-tools/main/install.sh | sh
```

The script detects your OS/arch, downloads the matching binary, verifies its
SHA256, and installs it to `~/.local/bin/tpl`. Override with `TPL_VERSION`
(release tag) or `INSTALL_DIR`. In a devcontainer, add the one-liner above as a
`RUN` step in your `Dockerfile` — alongside the
[adr-tools](https://github.com/kompiro/adr-tools) installer if you use both.

## CLI

```
tpl <subcommand> [options]

  init           generate a starter tpl.config.json in the target dir (or CWD)
  validate       validate TPL frontmatter, filenames, cross-refs, README index
  related        list active TPLs matching a topic (markdown for Design Docs)
  review-body    print the body for a periodic TPL deprecation-review issue
```

### Configuration (`tpl.config.json`)

`tpl` reads reference data — the controlled `topics` vocabulary and the
`idFormat` — from a JSON file. Resolution order:

1. an explicit `--config <path>` (highest priority)
2. `tpl.config.json` in the working directory, when present
3. none — topic validation is skipped and the default id format is used

This lets `tpl` run standalone (its own `tpl.config.json`) **or** reuse a
shared file in a repo that also uses [adr-tools](https://github.com/kompiro/adr-tools)
by pointing `--config` at `adr.config.json` (extra keys are ignored). Run
`tpl init` to scaffold one. The generated file's `$schema` points at the npm
package path, so editor autocompletion resolves when the package is installed.

### `tpl init`

```
tpl init [dir]
```

Writes a starter `tpl.config.json` (defining `topics` and `idFormat`) to `dir`
(default: CWD). Refuses to overwrite an existing file.

### `tpl validate`

```
tpl validate [--tpl-dir <path>] [--config <path>] [--packages-root <path>]
             [--source-prefix <dir>]...
```

- `--tpl-dir` — directory of TPL files (default `docs/test-perspectives`)
- `--config` — JSON file holding `topics` (controlled vocabulary, optional)
  and `idFormat` (optional, see below). Defaults to `tpl.config.json` in CWD
  when present; **omit and provide no `tpl.config.json` to skip topic
  validation and use the default id format.**
- `--packages-root` — directory whose immediate subdirectories are the allowed
  values for `scope.packages`. Omit to skip that check (non-monorepo repos).
- `--source-prefix` — top-level directory holding source; repeat for several.
  Omit to skip the body source-path check. See below.

Exit code `0` = clean, `1` = findings, `2` = usage / I/O error.

#### Source paths named in a TPL body

A TPL can cite a test or source file that has since been deleted, and nothing
notices. `--source-prefix` turns that into a finding:

```sh
tpl validate --source-prefix packages --source-prefix scripts
```

An inline code span is checked when it is a path **end to end** and its first
segment is one of the prefixes. That single rule keeps globs (`at-*.spec.ts`),
placeholders (`<spec path>`) and shell lines (`cp a b`) out with no deny-list of
illustrative names. Matching is by segment, so `packages-old/foo` does not
belong to the prefix `packages`. Paths resolve relative to the working
directory, and a path resolves when it exists as **either a file or a
directory** — records legitimately name directories. Frontmatter and fenced
blocks are not read, a fence inside a block quote included; the rest of the body
is. A span is read the way CommonMark reads one, so `` ` `` inside a longer
run of backticks is content rather than a delimiter. Build output (`node_modules`,
`dist`, `out`, `coverage`, `build`) is skipped by segment, since a clean
checkout does not have it.

A record is sometimes right to name a path that is absent — a retired test
named as history, or a file a design intends to create. Declare it on the line
above, with a reason:

```markdown
<!-- absent-path-next-line: retired spec, named as history (#1585) -->
`packages/core/src/style/property-schema.test.ts` covered this.
```

The declaration is a claim, not a switch, so it is held to it both ways: an
empty reason is rejected **and** suppresses nothing, and a declaration whose
next line fully resolves is itself a finding, so it cannot outlive the claim it
stands for. It reaches the next line only, never across a blank line or into a
fenced block.

Checks are per-file (frontmatter shape, filename ↔ id, controlled
vocabularies) and cross-file (id uniqueness, `related_to` resolution, README
index consistency). The id-uniqueness check exists because ids minted on
concurrent branches can collide — e.g. two branches created the same day both
see `TPL-YYYYMMDD-01` as free — and each file is internally consistent, so
only a cross-file view detects it once both files land in one tree.

#### `idFormat`

The config JSON may include an `idFormat` field that selects the TPL id and
filename convention:

| Value | Filename | Frontmatter `id` |
|---|---|---|
| `date-sequence` (default) | `TPL-YYYYMMDD-NN-<slug>.md` | `TPL-YYYYMMDD-NN` |
| `issue-number` | `TPL-<n>-<slug>.md` (no zero padding) | `TPL-<n>` |

Under `issue-number`, `<n>` is typically the originating GitHub Issue or PR
number; common numbering policy is **Issue number → PR number → local
sequence (existing max + 1)**. Pick one format per project; mixing in one
corpus is not supported.

```json
{
  "idFormat": "issue-number",
  "topics": ["frontend", "api", "data"]
}
```

### `tpl related`

```
tpl related <topic> [--package <pkg>] [--tpl-dir <path>] [--config <path>] [--path-prefix <p>]
```

Prints a markdown bullet list of active TPLs matching `<topic>`, ready to paste
into a Design Doc's "Related TPLs" section.

### `tpl review-body`

```
tpl review-body [--tpl-dir <path>] [--repo <owner/repo>] [--tpl-dir-relative <p>]
                [--period-label <label>]
```

Prints the markdown body for a periodic TPL deprecation-review issue to stdout
(`--repo` defaults to `$GITHUB_REPOSITORY`). Typically piped into
`gh issue create --body-file -`.

The heading names the review period. It defaults to the current ISO week
(`YYYY-Www`), which suits a weekly cadence; on any other cadence pass
`--period-label` so the body and the Issue title agree:

```sh
label=$(date -u +%Y-%m)
tpl review-body --period-label "$label" > body.md
gh issue create --title "TPL deprecation review — $label" --body-file body.md
```

## Reference templates

This repo ships starter templates you can copy into your project:

- [`docs/test-perspectives/TEMPLATE.md`](./docs/test-perspectives/TEMPLATE.md) —
  frontmatter + body skeleton for a new TPL
- [`docs/test-perspectives/README.md`](./docs/test-perspectives/README.md) —
  index, ADR との違い、proactive / retrospective、3-Yes ルール、ライフサイクル、運用ノート

For a fully populated example corpus, see
[karasu's `docs/test-perspectives/`](https://github.com/kompiro/karasu/tree/main/docs/test-perspectives).

## Library

```ts
import {
  validateAll,
  loadReferenceData,
  findRelated,
  formatRelatedAsMarkdown,
  renderReviewBody,
} from "@kompiro/tpl-tools";
```

## License

MIT
