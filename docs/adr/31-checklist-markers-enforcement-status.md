---
id: ADR-31
title: Mark each checklist item as guarded or judgment, and derive a TPL's enforcement status from the marks
status: accepted
date: 2026-11-01
topic: architecture
depends_on: [ADR-8, ADR-17, ADR-27]
---

# ADR-31: Mark each checklist item as guarded or judgment, and derive a TPL's enforcement status from the marks

- **Date**: 2026-11-01
- **Status**: Accepted
- **Related**:
  - Issue #31, PR #32 (implementation), PR #33 (release v0.0.12)
  - `src/checklist.ts`, `src/cli/checklist.ts`, `src/config.ts`, `src/validate.ts`,
    `src/regenerate.ts`, `src/related.ts`, `src/review-body.ts`
  - Depends on ADR-8 (`tpl.config.json` holds reference data), ADR-17 (the body
    source-path check that guard paths reuse) and ADR-27 (the generated index that
    shows the status)
  - Host-side design: kompiro/karasu#3038; adoption: kompiro/karasu#3488

## Background

A TPL checklist mixes items that CI already enforces with items that rely on a
reader remembering the TPL, and nothing in the body tells them apart. kompiro/karasu
classified all 804 checklist items of its 154 TPLs by hand: 117 have a guard that
goes red when a **new** site violates the item, 382 have only a test pinning the
original bug site, 83 are checkable but unchecked, and 222 need human judgment. None
of that was visible in the TPLs, so a reader could not tell which items still depend
on recall.

## Decision

Behind a new opt-in config key, `checklistHeading`, each item of the checklist
section may end with `` [guard: `path`] `` (enforced by the named file) or
`[judgment]` (no program can decide it); an unmarked item is checkable but
unguarded. `tpl validate` checks the section and the markers. Each TPL gets an
enforcement status derived from the markers and never stored: `guarded`, `partial`,
`unguarded` or `judgment`. `tpl regenerate`, `tpl related --status`, the new
`tpl checklist` and `tpl review-body` show it.

## Markers and what validate checks

- `checklistHeading` is the heading's text: a non-empty string on one line, without
  `#` and without surrounding space. `loadReferenceData` rejects anything else, since
  the value is compared with a heading's text as written.
- The section runs from the first heading whose text equals `checklistHeading` to
  the next heading of any level, so a `###` inside it ends it. It must exist and
  hold at least one top-level list item (`- [ ]`, `-` or numbered, at column 0,
  with its continuation lines).
- The marker is the last text of the item, separated by a space, with nothing after
  it. Marker syntax inside a code span is not read. A bracketed `[guard…` or
  `[judgment…` anywhere else must be a well-formed marker at the end; the bare
  words are prose.
- A guard names one or more files, each in its own code span, separated by commas:
  `` [guard: `a.test.ts`] `` or `` [guard: `a.test.ts`, `b.ts`] ``. Every listed
  path is checked on its own.
- Every guard path must be a path the ADR-17 source-path check reads (a whole code
  span under a `--source-prefix`, no `:line`, glob or trailing `/`), must exist as a
  file, and must not sit under `absent-path-next-line`. Running `tpl validate` with
  the key set and no `--source-prefix` is a usage error; the display commands do not
  need one.

An item is *unguarded* when it has no marker or a malformed one.

| status | condition |
| --- | --- |
| `guarded` | no unguarded item, at least one guard |
| `partial` | at least one guard and at least one unguarded item |
| `unguarded` | no guard, at least one unguarded item |
| `judgment` | every item is `[judgment]` |

A malformed marker counts as unguarded because it claims nothing a reader can rely on. The display commands take no
`--source-prefix`, so they read marker syntax only.

## Rationale

- **The mark sits on the item it describes.** A reader of the checklist sees which
  items are enforced without opening another file, and a new item starts unguarded
  until someone marks it. A separate mapping table or a frontmatter list would drift
  from the items whenever one is reworded or reordered.
- **The status is derived, not declared.** A declared value would have to be kept in
  step with the markers on every edit, a second record of a fact the markers already
  hold. Derived, it cannot disagree with them; the generated index (ADR-27) with
  `regenerate --check` in CI keeps the displayed value current.
- **`judgment` is its own status.** With only "every non-judgment item has a guard",
  a TPL whose items are all judgment would read as fully automated.
- **Guard paths reuse the ADR-17 check, and anything it would skip is a finding.**
  That check silently passes spans that are not plain paths. A guard written as
  `file.ts:12` or a glob would then look enforced while nothing checks that it
  exists, which is worse than no marker.
- **A missing guard is reported by the checklist check, and the body check's
  duplicate is dropped.** The body check reads a tight list as one paragraph, so a
  stray backtick in an earlier item can pair with the guard's opening backtick and
  hide the span from it. Leaving missing guards to that check let a dead guard pass.
- **The key is opt-in and karasu-neutral.** The heading text comes from config, so
  no host's language is hard-coded, and without the key every command behaves as
  before (ADR-8's reference data, ADR-27's `indexFile` precedent).

## Parsing follows CommonMark where TPL checklists go

Three review passes on PR #32 found ways the item parser lost a marker or swallowed
later items. The rules that came out of them:

- CRLF documents are read as LF; only CRLF is a break, so line numbers agree with
  the body check.
- A fence belongs to the item when it opens on the item's line or on an indented
  line inside it, nested items included. Indentation is removed only up to the
  holding item's content column, so a fence indented four or more past it is
  indented code. A column-0 line ends the item and its open fence, so one missing
  closer cannot hide the rest of the document. After an item's fence closes, only an
  indented line continues the item.
- An indented HTML comment (an absent-path declaration before a wrapped line) and
  an indented thematic break stay inside the item; at column 0 they end it.
- Not modelled, as absent from the karasu corpus: tab-indented fences, fences on
  continuation lines of items nested two or more levels deep, a column-0 block quote
  after an item, a setext heading ending the section, and an ordered marker other
  than `1.` interrupting a paragraph.

## Rejected alternatives

- **An `enforcement` field in frontmatter, checked against the markers.** Proposed in
  karasu#3038; rejected as double bookkeeping (see Rationale).
- **Markers as HTML comments.** Invisible in rendered Markdown, so the reader the
  marker is for would not see it.
- **A config key that names all body sections** (`sections`) instead of
  `checklistHeading`. Would leave room for checking the whole body layout, but only
  the checklist section is needed now; a broader key can subsume this one later.
- **Adding `checklistHeading` to the `tpl init` template.** With it set,
  `tpl validate` needs `--source-prefix`, so a fresh repository's plain
  `tpl validate` would exit 2. `indexFile`, the other opt-in key, is not in the
  template either.
- **Showing the status in `tpl related` by default.** Its plain output is pasted
  into design documents, where a status would go stale; `--status` asks for it.

## Consequences

- Without `checklistHeading`, output is unchanged, except that `tpl review-body` now
  reads `tpl.config.json` from the working directory like `related` and
  `regenerate`, so an invalid file there makes it exit 2.
- A program can check that a guard exists, not that it is general (that it goes red
  on a new site, not only on the original bug). Whether a file deserves
  `[guard: …]` is a review question for the host.
- Adopting is a config change plus marking the corpus; until marks are added, every
  item reads as unguarded.
