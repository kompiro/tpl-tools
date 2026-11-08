---
id: ADR-48
title: Check discovered_from root_cause_file citations, and accept nested source prefixes
status: accepted
date: 2026-11-08
topic: architecture
depends_on: [ADR-6]
refines: [ADR-17, ADR-41]
---

# ADR-48: Check discovered_from root_cause_file citations, and accept nested source prefixes

- **Date**: 2026-11-08
- **Status**: Accepted
- **Related**:
  - Issue #48, PR #49 (implementation), PR #50 (release v0.1.0)
  - `src/source-paths.ts`, `src/validate.ts`, `src/config.ts`, `src/cli/source-prefixes.ts`
  - Refines ADR-17 (the source-path check, now also over a frontmatter field) and
    ADR-41 (`sourcePrefixes`, now nested paths); depends on ADR-6 (no new dependencies)
  - Host side: kompiro/karasu#2732 (measurement and adoption), kompiro/karasu#2810
    (the host handed `docs/test-perspectives` validation to this tool)

## Background

`tpl validate` checked that each `discovered_from` key was known, but never resolved
`root_cause_file`. ADR-17's source-path check reads the body only. So a frontmatter
citation could rot with every check green, and since kompiro/karasu#2810 no host-side
guard reads it either.

kompiro/karasu#2732 measured the rot: of 35 `path:N` citations in active TPLs, only 5
were still on the cited line, 21 had moved and the text of 9 was gone from the file.

A second gap: a host deletes a Design Doc when it promotes it to an ADR, so a TPL citing
`docs/design/x.md` is bound to rot. The host could not ask for that check. `sourcePrefixes`
took top-level directory names only, and `docs` as a whole would also have put every ADR
and acceptance-test citation into `tpl related --changed-files`.

## Decision

When source prefixes are set, `tpl validate` checks each `root_cause_file` under a prefix
against the working tree. `sourcePrefixes` and `--source-prefix` accept repo-relative
paths such as `docs/design`, matched by leading segments.

## The check

| citation | finding |
| --- | --- |
| `path` | `root-cause-file-missing` when the path is not in the tree (a file or a directory) |
| `path:symbol`, `path :: symbol` | `root-cause-file-symbol-missing` when the text does not appear in the file |
| `path#anchor` | `root-cause-file-anchor-missing` when no `#` heading of the file gets that anchor |
| `path:42`, `:42-50`, `:12:5`, `:L12`, `#L42`, `#L3C1-L4C2` | `root-cause-file-line-number`, always |

- **Opt-in, like ADR-17.** Without a prefix nothing is read. A citation outside every
  prefix is not read either: the prefixes are what say which directories the repo keeps
  stable.
- **The first separator splits.** A symbol may then hold `::` or `#` (`a.cpp:Foo::bar`,
  `a.ts:Foo#priv`). After `#`, a GitHub line form is a line and anything else is an
  anchor. An anchor holding `/` means the `#` was part of the path, which is not read.
- **Symbols match verbatim**, as a substring. `KrsEdge.to` is reported even though
  `KrsEdge` exists. The README states this limit.
- **Anchors follow GitHub's rule** for punctuation, repeats (`-1`), link text and
  emphasis, and skip fenced code. A setext heading gets no anchor.
- **A `deprecated` TPL is skipped.** Its file may be gone because of why it was
  deprecated, and the citation stays as the record of it.
- **Prefixes by segment.** `docs/design` covers `docs/design/x.md`, and neither
  `docs/designs/x.md` nor `docs/x.md`. A prefix with a backslash, an empty segment, or a
  `.` / `..` segment is rejected (exit 2). `tpl related` and the checklist guard check
  read the same list, so they behave as before for top-level prefixes.

## Rationale

- **The owner of the files checks them.** The host had handed TPL validation to this
  tool, and its source-path guard says in its header not to scan the TPL directory
  again. A frontmatter field of a TPL is this tool's to read.
- **Line numbers are always findings.** Nothing records what a line meant, so no check
  can tell that it still means it. 30 of karasu's 35 had already drifted. A symbol or an
  anchor can be checked and survives edits above it.
- **No switch.** A host that sets prefixes has asked for its citations to be checked, and
  a line number cannot be. A switch would let the rot this ADR is about continue. It is
  breaking for such a host, so the release bumps the minor (0.1.0) and says so.
- **Nested prefixes, not a separate list.** One list keeps `validate` and `related` in
  agreement, as ADR-41 wanted. Matching by segment keeps `docs/design` from widening to
  `docs`.

## Rejected alternatives

- **The host's guard.** kompiro/karasu#2732 first proposed extending the host's
  source-path script. That would split TPL validation across two owners again, which
  kompiro/karasu#2810 had undone.
- **A switch for the line-number finding.** See "No switch" above.
- **`docs` as the prefix.** It would check the citation, but put every ADR and
  acceptance-test path into changed-file recall, the noise ADR-41 avoided.

## Consequences

- `tpl validate` has four new findings, only when prefixes are set. A host with prefixes
  gets one for every existing `path:N` citation. On kompiro/karasu that was 36 (35 line
  numbers and one qualified symbol), converted in the same PR as the version bump.
- The test-perspective skill, its template and the README tell authors to cite a symbol
  or an anchor.
- A config whose `sourcePrefixes` held only top-level names reads the same as before.
