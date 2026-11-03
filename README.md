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
  validate       validate TPL frontmatter, filenames, cross-refs, the index
  regenerate     write the topic-grouped TPL index named by "indexFile"
  related        list active TPLs matching a topic, or a change's files
  checklist      list checklist items with their markers (guard, judgment, ...)
  review-body    print the body for a periodic TPL deprecation-review issue
```

### Configuration (`tpl.config.json`)

`tpl` reads reference data (the controlled `topics` vocabulary, the
`idFormat`, and the optional `indexFile`, `indexCheck`, `checklistHeading`,
`sourcePrefixes` and `testFileInfixes`) from a JSON file. Resolution order:

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
- `--config` — JSON file holding `topics` (controlled vocabulary, optional),
  `idFormat` (optional, see below), `indexFile` and `indexCheck` (optional, see
  [`tpl regenerate`](#tpl-regenerate)) and `checklistHeading` (optional, see
  [Checklist markers](#checklist-markers-and-enforcement-status)) and
  `sourcePrefixes` (optional, see below). Defaults to `tpl.config.json` in CWD
  when present; **omit and provide no `tpl.config.json` to skip topic
  validation and use the default id format.**
- `--packages-root` — directory whose immediate subdirectories are the allowed
  values for `scope.packages`. Omit to skip that check (non-monorepo repos).
- `--source-prefix` — top-level directory holding source; repeat for several.
  Replaces the config's `sourcePrefixes`. With neither, the body source-path
  check is skipped. See below.

`validate` also checks that each `scope.paths` glob matches at least one file
(see [`tpl related`](#tpl-related)).

Exit code `0` = clean, `1` = findings, `2` = usage / I/O error.

#### Source paths named in a TPL body

A TPL can cite a test or source file that has since been deleted, and nothing
notices. Source prefixes turn that into a finding, set in the config or on the
command line (the flag replaces the config's list):

```json
{ "sourcePrefixes": ["packages", "scripts"] }
```

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
blocks are not read, one inside a block quote or a list item included; the rest
of the body
is. A span is read the way CommonMark reads one: `` ` `` inside a longer run of
backticks is content rather than a delimiter, and a span that wraps onto the
next line is still one span. Build output (`node_modules`,
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

#### Checklist markers and enforcement status

A checklist mixes items that CI already enforces with items that rely on a
reader remembering the TPL, and the body does not tell them apart. Set
`checklistHeading` to the heading text of the checklist section, and each item
may end with one marker:

```markdown
## Checklist

- [ ] Every new kind extends the shared base [guard: `packages/core/src/base.test.ts`]
- [ ] The fallback was chosen against the alternatives in the ADR [judgment]
- [ ] A new consumer reads the derived value, not the raw field
```

- `` [guard: `path`] ``: the item is enforced by the named file: a test or
  script that goes red in CI when a **new** site violates the item, not only
  the original bug site. Several files are separated by commas.
- `[judgment]`: no program can decide the item.
- no marker: the item is checkable but nothing checks it yet.

```json
{ "checklistHeading": "Checklist" }
```

With the key set, `tpl validate` requires the section in every TPL (from the
heading to the next heading of any level, so a `###` inside it ends it), at
least one top-level list item in it, and well-formed markers:

- the marker is the last text of the item, separated by a space, with nothing
  after it (not even a period);
- marker syntax that an item *describes* goes in a code span, where it is not
  read; a bracketed `[guard…` or `[judgment…` outside one must be a well-formed
  marker at the end (the bare words "guard" and "judgment" are just prose);
- every guard path is a file path the source-path check reads (a whole span,
  under a source prefix, no `:line`, glob or trailing `/`), names a file
  rather than a directory, exists, and is not under `absent-path-next-line`.

An item's nested lines belong to it, so for an item with sub-items the marker
goes after the last nested line.

Since a guard that no prefix covers would pass unchecked, `tpl validate` with
`checklistHeading` set and no source prefix is a usage error.

The markers give each TPL an **enforcement status**, derived and never stored,
so it cannot drift from the checklist:

| status | meaning |
| --- | --- |
| `guarded` | every checkable item has a guard (and at least one does) |
| `partial` | some checkable items have a guard |
| `unguarded` | no item has a guard, and at least one is checkable |
| `judgment` | every item is `[judgment]` |

A malformed marker counts as unguarded. The status is shown as
`partial 1/3, judgment 2` (guarded over checkable items, then judgment items) by
[`tpl regenerate`](#tpl-regenerate), `tpl related --status`,
[`tpl checklist`](#tpl-checklist) and [`tpl review-body`](#tpl-review-body).
Those commands take no `--source-prefix`, so they read marker syntax only.

Checks are per-file (frontmatter shape, filename ↔ id, controlled
vocabularies) and cross-file (id uniqueness, `related_to` resolution, and the
index: the file named by `indexFile`, or `README.md` without it, must link
every TPL to an existing file; `"indexCheck": false` skips this one). The id-uniqueness check exists because ids minted on
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

### `tpl regenerate`

```
tpl regenerate [--check] [--tpl-dir <path>] [--config <path>]
```

Writes the TPL index to the file named by `indexFile` in the config (relative
to the TPL directory, and inside it: `/` separators only, no absolute path, no
`..`, no symlink leading out; not named `TPL-*.md` directly in it, since that
would be read as a TPL). Active TPLs go under `## Active`, one `### <topic>`
heading per topic, in the order of the `topics` vocabulary (topics outside it
follow alphabetically), sorted by id within a topic; deprecated TPLs follow
under `## Deprecated`. The two heading levels keep a topic that happens to be
named `Deprecated` apart from the deprecated section. Each entry links the TPL and lists its `discovered_from`
issues. With `checklistHeading` set, each active entry ends with its
enforcement status, e.g. `- [TPL-12](TPL-12-x.md) — <title> (#12) · guarded 2/2, judgment 1`.

```json
{
  "idFormat": "issue-number",
  "topics": ["frontend", "api", "data"],
  "indexFile": "index.md"
}
```

With `--check` it writes nothing and exits `1` when the index is missing or
stale; run it in CI next to `tpl validate`. Without `indexFile` the command
exits `2`: `tpl validate` checks whichever file `indexFile` names, so a
default here would let the two commands look at different files.

Why generate it, and why by topic: a hand-maintained index gets one new row per
TPL, and since ids grow (issue numbers, dates) every new row lands at the same
tail, so any two branches that each add a TPL conflict. Under topic headings,
two branches conflict only when they add to the same topic, and resolving that
conflict is re-running `tpl regenerate`.

Once `indexFile` is set, `tpl validate` checks that file instead of
`README.md` (every TPL listed, every link resolving) and reports a missing
index file; the README no longer needs a row per TPL.

If the index is written outside your PRs, for example by a scheduled job that
opens a regeneration PR, it lags the TPLs between runs and does not exist
before the first one, so a PR that adds a TPL would fail `tpl validate`. Set
`"indexCheck": false` to turn the index check off: `tpl validate` then reads
neither the `indexFile` nor `README.md` for rows or links, and does not fall
back to the README table. `tpl regenerate` and `--check` ignore the key; check
the regeneration PR with `--check` instead.

```json
{
  "idFormat": "issue-number",
  "topics": ["frontend", "api", "data"],
  "indexFile": "index.md",
  "indexCheck": false
}
```

### `tpl related`

```
tpl related <topic> [--package <pkg>] [--tpl-dir <path>] [--config <path>] [--path-prefix <p>]
            [--status]
tpl related --changed-files <path>... | --base <ref>
            [--limit <n>] [--source-prefix <dir>]... [--tpl-dir <path>] [--config <path>]
            [--path-prefix <p>] [--status]
```

With `<topic>`, prints a markdown bullet list of active TPLs of that topic,
ready to paste into a Design Doc's "Related TPLs" section. `--status` ends each
line with the TPL's enforcement status (needs `checklistHeading`); it is off by
default because the plain list is what gets pasted.

With `--changed-files` (the positional arguments are the files) or `--base`
(the files `git diff --name-only <ref>...HEAD` lists), prints the active TPLs
related to that change, for a PR author to check before review:

```sh
tpl related --base origin/main
```

A TPL is related to a changed file when

- a code span in its body names that file: the same paths the
  [source-path check](#source-paths-named-in-a-tpl-body) reads, so it needs
  source prefixes, except those that are directories. A path that no longer
  exists still counts, so a change deleting the file recalls the TPL;
- its body names a test file and the changed file is the source it covers
  (`foo.test.ts` → `foo.ts`, by `testFileInfixes`, default `[".test", ".spec"]`;
  `[]` turns this off); or
- a glob in its `scope.paths` matches the changed file.

Most specific first: each matched file adds `1 / (how many active TPLs match
it)`, so a file every renderer TPL names counts for less than one only this TPL
names, and ties go by id. Each line ends with the files it matched. `--limit`
(default 10, `0` for all) cuts the list and says how many were left out. With
no match it says so and exits `0`; it is a reminder, not a gate.

`scope.paths` is an optional list of globs for a TPL whose body names no single
file it is about, such as a rule for every workflow:

```yaml
scope:
  packages: []
  paths: [".github/workflows/*.yml"]
```

Only `*` (within a segment), `**` (a whole segment, any depth) and `?` are
read, and a glob may not go through `.git` or build output (`node_modules`,
`dist`, ...), which is not searched; `tpl validate` rejects anything else and reports a glob that matches
no file, since a key that never fires is the rot the source-path check exists
for. Keep them narrow: a broad glob puts the TPL in nearly every list.

### `tpl checklist`

```
tpl checklist [--marker guard|judgment|unguarded]... [--topic <topic>] [--tpl-dir <path>]
              [--config <path>]
```

Lists the checklist items of every active TPL, one tab-separated line each:
id, item number, marker (`guard`, `judgment`, `unguarded`, or `malformed`),
guard paths (comma-separated, or `-`), and the item text. `--marker` keeps only
the items with that marker (`unguarded` includes `malformed`); repeat it for
several. Needs `checklistHeading`. Use it to see which items still depend on a
reader, e.g. to file guard work:

```sh
tpl checklist --marker unguarded --topic parser
```

### `tpl review-body`

```
tpl review-body [--tpl-dir <path>] [--repo <owner/repo>] [--tpl-dir-relative <p>]
                [--period-label <label>] [--config <path>]
```

Prints the markdown body for a periodic TPL deprecation-review issue to stdout
(`--repo` defaults to `$GITHUB_REPOSITORY`). Typically piped into
`gh issue create --body-file -`.

With `checklistHeading` in the config (`--config`, or `tpl.config.json` in the
working directory), the active TPLs are grouped by enforcement status, each
group under the question that status raises: for `unguarded` and `partial`,
whether an unmarked item can become a guard; for `guarded`, whether the
checklist can be thinned to what the guards do not already enforce; for
`judgment`, whether an item has become decidable by a program.

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
  findRelatedByChangedFiles,
  formatRelatedAsMarkdown,
  renderIndex,
  renderReviewBody,
  extractChecklist,
  checkChecklist,
  deriveStatus,
  formatStatus,
  checklistRows,
} from "@kompiro/tpl-tools";
```

## License

MIT
