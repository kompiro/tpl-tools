---
id: ADR-17
title: Check the source paths a TPL body names, behind a repeatable --source-prefix
status: accepted
date: 2026-09-12
topic: architecture
depends_on: [ADR-6, ADR-8]
---

# ADR-17: Check the source paths a TPL body names, behind a repeatable --source-prefix

- **Date**: 2026-09-12
- **Status**: Accepted
- **Related**:
  - Issue #17, PR #23 (design), PR #24 (implementation)
  - `src/source-paths.ts`, `src/validate.ts`, `src/cli/validate.ts`
  - Depends on ADR-6 (no new dependencies) and ADR-8 (the opt-in / fallback shape)
  - Downstream: karasu#2648, karasu#2652 (the guard this generalizes)

## Background

`tpl validate` read frontmatter only. `--packages-root` looked at
`scope.packages` and nothing else, so **the body was never read**: a record
whose 関連テスト section cited a deleted spec passed forever.

In karasu this was not hypothetical. Of 129 records, **7 named a path that was
not in the tree**, and two of those (`packages/core/src/style/property-schema.test.ts`,
`packages/app/src/App.test.tsx`) had never existed at all. karasu's
`.coderabbit.yaml` already asked a reviewer to report records naming absent
test paths: the rule was acknowledged, with nothing mechanical behind it.

As a perspective this is the source-path layer of "a record that is re-read
points at addresses that outlive it". The URL layer was covered; the layer
below it was open.

## Decision

Check the paths a TPL body names in inline code spans against the working
tree, behind a repeatable `--source-prefix <dir>` that is off when unset, and
let a record declare a path it means to be absent with an
`absent-path-next-line` marker that carries a reason.

## The declaration

```markdown
<!-- absent-path-next-line: retired spec, named as history (#1585) -->
`packages/core/src/style/property-schema.test.ts` covered this.
```

- The marker is an HTML comment that is **the whole line**, indentation and
  block-quote markers aside. Requiring that keeps a document which *describes*
  the syntax in a sentence from declaring anything.
- Everything after the colon is the reason, free text, and **required**. An
  empty reason is a finding, and it suppresses nothing: the line below is
  checked as usual, so a dead path behind an invalid declaration stays
  reported.
- It reaches **the next line only**. A declaration on the last line of a file,
  on a fence opener, or above another declaration therefore stands for
  nothing, and says so as a finding.
- A declaration whose next line names no absent path is a finding
  (`absent-path-marker-unused`). That is the second binding: the declaration
  cannot outlive what it claims.

## Rationale

- **A flag, not config.** `--source-prefix packages --source-prefix scripts`
  mirrors `--packages-root`: off when unset, so a non-monorepo consumer sees no
  change. Moving the prefixes into `tpl.config.json` (per ADR-8) would mean
  touching the JSON schema and the `tpl init` template to bake in a setting no
  consumer has asked for yet. The flag survives that move if it ever happens.
- **The prefix allowlist is what makes the scan safe.** A span counts only when
  it is a path **end to end** and its first segment is one of the prefixes.
  That single rule drops globs (`at-*.spec.ts`), placeholders (`<spec path>`)
  and shell lines (`cp a b`) with no deny-list of illustrative names. Matching
  is by segment, so `packages-old/foo` does not belong to `packages`.
- **Existence is the contract, file or directory.** karasu's records hold 95
  legitimate directory citations, so requiring `isFile()` would turn every one
  into a false positive.
- **Generated segments are skipped** (`node_modules`, `dist`, `out`,
  `coverage`, `build`): a clean checkout does not have them, so their absence
  is the normal state. The list is fixed rather than configurable because a
  missing entry costs a false negative, never a false positive.
- **The declaration is a claim, bound from both sides.** A reason is required,
  and a declaration standing over paths that all resolve is itself a finding,
  so it cannot outlive what it claims. The spelling matches karasu's guard so a
  record keeps its meaning when it moves between repos.
- **No new dependency** (ADR-6): `existsSync` and regular expressions only.
- Verified on real data before merge: the same 7 of 129 at karasu's
  `5ec649be`, and clean on its current corpus, which its own guard had already
  cleaned.

## How much Markdown the scanner reads

Four rounds of review on PR #24 were all about this boundary, so the line is
recorded here rather than left to the code.

- **Spans close on a backtick run of their own length** (CommonMark), with one
  padding space stripped from each end. Reading only single backticks loses a
  padded span's path and can take a longer run's inner backticks for
  delimiters, which matches a path out of text that names none.
- **Prose is read a paragraph at a time**, because a span closes on a later
  line as readily as on its own. Feeding lines in one at a time makes the
  second half of a wrapped span look like a span of its own. karasu's records
  hold five spans that wrap. A run with no partner stays literal, so a stray
  backtick cannot silence the lines below it.
- **Frontmatter and fenced blocks are not read**, including a fence inside a
  block quote or one a list item opens on its own line. A quoted fence carries
  the quote depth it opened at: a shallower line ends it, and a delimiter one
  quote deeper is content. A list item's fence carries the marker's width, so
  it closes at the item's content column.
- **The declaration reads through a block quote**, because quoted prose is
  scanned for paths and a record must be able to declare one absent.
- **Known limit:** a fence indented four spaces or more with no marker on its
  own line, which is how a deeply nested list holds one, is not recognized.
  The same rule matches closing delimiters, so loosening the indentation would
  let one close a block early and report paths out of a transcript. karasu's
  138 records hold eight fence lines, all at indentation zero. Going past this
  boundary is a decision to adopt a CommonMark parser, not to widen the
  heuristic further.

## Rejected alternatives

- **Leave it downstream.** Every repo adopting TPL would rewrite a ~300-line
  guard whose non-obvious parts (fence nesting, marker lifetime, generated
  output) are exactly where a naive rewrite produces false positives and gets
  switched off within days. Whether a record's body still points at something
  live is a TPL tool's concern.
- **`sourcePathPrefixes` in `tpl.config.json`.** Reasonable once several
  consumers are writing the same prefixes into CI, but baking a setting into
  the shipped schema and `tpl init` before a single consumer exists is the
  wrong order.
- **No prefixes, judge every path-looking span.** Needs a deny-list of
  illustrative names to keep `packages/foo`, `<spec path>` and `cp a b` out,
  which is the maintenance shape karasu retired in ADR-2125.
- **Require paths to be files.** See the 95 directory citations above.

## Consequences

- karasu keeps its own guard: it also reads `docs/acceptance/` and
  `docs/design/`, which are outside a TPL tool's scope. The beneficiaries are
  repos adopting tpl-tools and the TPL directory itself, not the removal of
  karasu's duplicate.
- `parseFlags` gained `optionsAll`, so any future flag can be repeated without
  the last occurrence silently winning.
