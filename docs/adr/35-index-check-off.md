---
id: ADR-35
title: Let a config turn off tpl validate's index check, for an index written outside PRs
status: accepted
date: 2026-11-02
topic: architecture
depends_on: [ADR-8]
refines: [ADR-27]
---

# ADR-35: Let a config turn off tpl validate's index check, for an index written outside PRs

- **Date**: 2026-11-02
- **Status**: Accepted
- **Related**:
  - Issue #35, PR #36 (implementation), PR #37 (release v0.0.13)
  - `src/config.ts`, `src/config.schema.json`, `src/cli/validate.ts`
  - Refines ADR-27 (the generated index and the `indexFile` key); depends on ADR-8
    (`tpl.config.json` holds reference data)
  - Host side: kompiro/karasu#3289 (design and adoption)

## Background

ADR-27 assumes that each PR that adds a TPL also commits the regenerated index, and
that `tpl validate` checks that index (`index-missing`, a missing row, a dangling
link). kompiro/karasu adopted the generated index differently: it already keeps its
generated ADR index out of PRs, and a daily job opens one regeneration PR that writes
only generated files (karasu ADR-3416). Putting the TPL index under the same rule means
no feature PR touches `index.md`.

Under that rule the index lags the TPLs until the next regeneration, and does not exist
at all before the first one. With `indexFile` set, every PR that adds a TPL then failed
`tpl validate`. Leaving `indexFile` unset did not help: `validate` falls back to checking
the README table, which the host removes once the index is generated, and
`tpl regenerate` refuses to run without `indexFile`.

The index stays correct without the per-PR check. The regeneration PR runs
`tpl regenerate --check` (or compares its committed index with a fresh run), and the
generator only links files that exist in that commit.

## Decision

Add an optional boolean config key `indexCheck`. With `"indexCheck": false`,
`tpl validate` reads neither the `indexFile` nor `README.md` for rows or links, and does
not fall back to the README table. Every other check, and `tpl regenerate` / `--check`,
ignore the key. Unset or `true` behaves as before.

## Rationale

- **The check belongs where the writer is.** In a repo whose index is written outside
  PRs, a per-PR index check fails for a state that is expected. The regeneration PR is
  the one place the index changes, and `--check` there catches a stale or hand-edited
  file.
- **One switch turns off the whole check, including `index-missing`.** Silencing only
  missing rows would still fail every PR between the host's migration and its first
  regeneration, when the file does not exist yet.
- **No fallback to the README.** Without `indexPath`, `validateAll` checks the README
  table. Turning the index check off by dropping only `indexPath` would bring that check
  back on a README whose table was removed. The CLI therefore passes neither path; a
  library caller does the same.
- **A separate boolean, not a wider `indexFile`.** Existing configs keep working, the
  schema and the parser take one shape per key, and `tpl regenerate` keeps reading
  `indexFile` as a plain path.
- **The tool owns the switch.** The host only sets a key. Writing a host-side wrapper
  that calls the library without the index would split the TPL checks between two
  places.

## Rejected alternatives

- **Widen `indexFile` to `{ "path": "index.md", "check": false }`.** Groups the two
  settings, but every consumer of `indexFile` would accept two shapes, and the schema
  would need a `oneOf`.
- **Separate configs for `validate` and `regenerate`** (the first without `indexFile`).
  `validate` would fall back to the README table, and the host would keep two copies of
  `topics` and `idFormat` in step.
- **Silence only `index-missing`.** Still fails on rows for TPLs added since the last
  regeneration, which is the normal state between runs.
- **Make the check opt-in for everyone** (default off). Changes behavior for repos that
  commit the index in each PR, as ADR-27 describes; they rely on the check.

## Consequences

- With the key off, `tpl validate` no longer notices a TPL missing from the index or a
  dangling link in it. The host must run `tpl regenerate --check`, or an equivalent
  comparison, on whatever writes the index; README documents this next to the key.
- ADR-27's "`tpl validate` checks `indexFile` once the key is set" now holds unless
  `indexCheck` is `false`.
- A config whose `indexCheck` is not a boolean is rejected (exit 2), as other malformed
  keys are.
- The key is not in the `tpl init` template, like the other opt-in keys.
