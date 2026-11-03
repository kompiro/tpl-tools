---
id: ADR-41
title: Recall TPLs from a change's files, keyed by the paths a TPL body names
status: accepted
date: 2026-11-03
topic: architecture
depends_on: [ADR-6, ADR-8]
refines: [ADR-17]
---

# ADR-41: Recall TPLs from a change's files, keyed by the paths a TPL body names

- **Date**: 2026-11-03
- **Status**: Accepted
- **Related**:
  - Issue #41, PR #42 (implementation), PR #43 (release v0.0.14)
  - `src/related.ts`, `src/cli/related.ts`, `src/glob.ts`, `src/config.ts`,
    `src/source-paths.ts`, `src/validate.ts`, `src/cli/validate.ts`
  - Refines ADR-17 (the body source-path scan, now also a recall key, and its
    prefixes, now held in config); depends on ADR-6 (no new dependencies) and ADR-8
    (`tpl.config.json` holds reference data)
  - Host side: kompiro/karasu#3486 (design and measurement), kompiro/karasu#3591
    (adoption)

## Background

`tpl related <topic>` lists TPLs by topic. That fits design time, but not the moment a
PR is opened: the author has to remember which topic applies, and a broad topic returns
dozens of TPLs. `scope.packages` is too coarse to narrow it (in kompiro/karasu, 119 of
182 TPLs list `core`), and `known_consumers` holds feature names, not paths.

What the author does know is the set of changed files. Many TPL bodies already name the
files they protect, in the code spans that ADR-17 checks for existence. kompiro/karasu
measured that key on 72 code PRs: a median of 3.5 TPLs per PR (p90 14), 61 of the 100
TPLs those PRs cited recalled, and 59 of the 61 kept in the top 10 when ranked by
inverse fan-in.

## Decision

Add `tpl related --changed-files <path>...` and `tpl related --base <ref>`. They list the
active TPLs related to a change, keyed by the paths each TPL body names, the sources of
the test files it names, and an optional `scope.paths` glob list. Results are ranked by
inverse fan-in and cut at `--limit`. Move the source prefixes into `tpl.config.json` as
`sourcePrefixes`, so `validate` and `related` read the same list.

## The key

- **Body paths.** The paths ADR-17's scan reads (whole span, under a prefix, outside
  frontmatter and fences), except those that are directories in the tree. A path that
  no longer exists stays a key. A PR that deletes, renames or restores the file is the
  change the TPL most needs to be seen for, and `tpl validate` reports the dangling
  path on its own. This includes a path under `absent-path-next-line`, which issue #41
  had listed as a near miss.
- **Test-to-source.** A named test file also keys its source. The source is found by
  stripping the first configured infix before the extension: `foo.test.ts` →
  `foo.ts`, and `foo_test.go` → `foo.go` with `_test`. `testFileInfixes` defaults to
  the TS/JS convention `[".test", ".spec"]`, and `[]` turns the mapping off. The source
  need not exist, for the same reason as a missing body path. Matching is exact, so a
  key that names nothing can only match a change to that very path.
- **`scope.paths`.** Optional frontmatter globs for a TPL whose body names no single
  file, such as a rule for every workflow. They add to the body keys and never replace
  them.

## Ranking and output

- Each matched file contributes `1 / fan-in`, where fan-in is the number of listed TPLs
  that match it (active ones by default; the library's `includeStatus` widens that). A file that every renderer TPL names counts for less than one that only
  this TPL names. With the default filter, deprecated TPLs count in neither the list
  nor the fan-in; if `includeStatus` adds them, they count in both.
- Weights within 1e-9 are a tie and go by numeric id (`TPL-219` before `TPL-1032`), so
  float rounding cannot reorder equal TPLs.
- `--limit` defaults to 10, and `0` lists all. A cut list ends with how many were left
  out. Each line ends with the files it matched (`· via …`), so a reader sees why the TPL
  is there.
- It is a reminder, not a gate. No match, or no changed files, exits 0.

## The glob dialect

- Only `*` and `?` (within a segment) and a whole-segment `**` (any depth; one or more
  segments when it ends the glob) are read.
- `tpl validate` rejects any other syntax (`{}`, `[]`, `!`, `\`, `.`/`..`, a partial
  `**`) rather than reading it literally. A glob that silently matches nothing is a key
  that never fires.
- `tpl validate` reports a glob that matches no file in the tree. This is ADR-17's rot
  check, applied to the new key.
- The walk skips `.git` and the build-output segments (`build`, `coverage`, `dist`,
  `node_modules`, `out`), as `candidatePath` does. Symlinked
  files count as files, and symlinked directories are not entered. To keep `validate`
  and `related` in agreement:
  - a glob that names such a segment is rejected;
  - `related` never lets a glob match a changed file under one.

## Rationale

- **The body is already the key.** No field has to be backfilled for existing TPLs.
  A new TPL gets keys as soon as its body names a file. ADR-17 already checks those keys
  for existence, so a move or deletion cannot leave a dead key unnoticed.
- **Config-held prefixes.** ADR-17 rejected `sourcePathPrefixes` in config as "the wrong
  order before a single consumer exists". kompiro/karasu is that consumer now, and
  the same list is needed by both `validate` and `related`. The flag stays and replaces
  the config's list. Neither source of prefixes has a default: without a prefix the body is not read, and
  `related` in changed-file mode treats that as a usage error, because every body-keyed
  TPL would silently drop out.
- **An in-repo matcher.** `engines.node >=20` rules out `path.matchesGlob`, and ADR-6
  keeps the package free of new dependencies. Three operators cover the
  `.claude/rules`-style paths hosts write.
- **`git diff <ref>...HEAD` with `--no-renames --relative -z`.** The three-dot form
  leaves out what changed on the base since the branch point, so a stacked PR passes its
  own base. `--no-renames` keeps a renamed file's old path, which TPLs still name.
  `--relative` makes paths relative to the working directory, where body paths resolve.
  A `--base` that starts with `-` is rejected so git cannot read it as an option.
- **Inverse fan-in.** It is the simplest weight that demotes a file every TPL names, and
  it ranked 59 of 61 recalled citations into the top 10 in kompiro/karasu's measurement.

## Rejected alternatives

- **Path globs on every TPL as the primary key.** Every existing TPL would need one.
  Authors would write them at different breadths, and the list would drift from the body
  it duplicates. Kept only as the optional `scope.paths`.
- **Prefix match on directory spans.** A span such as `packages/core` would match almost
  every PR and bring back the topic-level noise. A TPL that is about a directory writes
  a `scope.paths` glob instead.
- **Only existing files as keys.** This was the first implementation. It drops the TPLs
  for a file the PR deletes or renames, which is when they matter most.
- **A glob library** (minimatch, picomatch). It would be a runtime dependency against
  ADR-6. Richer syntax would need either that or a higher Node floor, decided in an ADR.
- **A gate.** Whether a listed TPL applies is a judgment call. Failing a PR that does not
  cite one would only teach authors to write boilerplate.

## Consequences

- `tpl validate` has three new findings: `scope-paths-invalid`, `scope-path-invalid` and
  `scope-path-unmatched`. They only appear when a TPL writes `scope.paths`.
- A config with a malformed `sourcePrefixes` or `testFileInfixes` is rejected (exit 2).
  `--source-prefix .` and `..` are now rejected too, the same rule as the config.
- ADR-17's "a flag, not config" no longer holds: the prefixes may live in the config.
  Its scan rules are unchanged, and `namedSourcePaths` exposes what the scan reads.
- Neither new key is in the `tpl init` template: a prefix would assume a repo layout, and
  the other opt-in keys are not there either.
- How the list reaches an author (a hook, a PR comment, a script) is the host's choice;
  kompiro/karasu runs it after creating a draft PR.
