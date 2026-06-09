---
# `id` の形式は `adr.config.json` の `idFormat` で決まる:
#   - `date-sequence`  (default) → `ADR-YYYYMMDD-NN`
#   - `issue-number`              → `ADR-<n>`（ゼロ埋めなし）
id: ADR-YYYYMMDD-NN
title: Short human-readable title（body H1 の `:` 以降と一致させる）
status: accepted
date: YYYY-MM-DD
# topic must match one of the values you declared in `adr.config.json` "topics"
topic: <your-topic>
# authors: [your-handle]

# --- Relationships (all optional; leave as empty arrays if unused) ---
# supersedes: [ADR-...]            # this ADR replaces the listed ones (status=superseded on those)
# superseded_by: ADR-...           # only when status=superseded; scalar or null
# depends_on: [ADR-...]            # prerequisites this ADR assumes
# related_to: [ADR-...]            # reference-only; no semantic dependency
# conflicts_with: [ADR-...]        # mutually exclusive alternatives
# refines: [ADR-...]               # this ADR is a concrete specialization of an abstract one

# --- Scope (optional) ---
# `scope.concerns` is a controlled vocabulary of cross-cutting aspects that
# are orthogonal to `topic`. Prefer leaving it empty when `topic` already
# captures the categorization; add a concern only when the ADR touches a
# dimension that a topic-only query would miss.
# Allowed values come from `adr.config.json` "concerns".
# `scope.packages` is a free-form list of package / module / area names the
# ADR touches. The validator does not enforce a vocabulary here.
# scope:
#   packages: [<package-or-area>]
#   concerns: [security, dependencies]

# --- Assumptions (optional; checked by `adr check-assumptions`) ---
# Supported formats:
#   "file: <path>"                    asserts the path exists
#   "symbol: <path> :: <name>"        asserts the identifier appears as a whole
#                                     word (use for function / class / const /
#                                     type names). Prefer this over grep: when
#                                     the target is a named code entity.
#   "grep: <path> :: <regex>"         asserts the regex matches inside the file;
#                                     use for non-identifier patterns.
#   "<anything else>"                 free text, surfaced for manual review only
# assumptions:
#   - "file: src/lib/foo.ts"
#   - "symbol: src/lib/foo.ts :: doFoo"
#   - "grep: src/lib/foo.ts :: case TokenKind\\."
#   - "external IdP remains available"
---

# ADR-YYYYMMDD-NN: Short human-readable title (matches frontmatter title after the `:`)

- **Date**: YYYY-MM-DD
- **Status**: Accepted
- **Related**:
  - Issue #NNN
  - Related ADRs / design docs / source files

## Background

What prompted this decision? What problem or option were we evaluating?

## Decision

One sentence stating what was decided.

## Rationale

- Bullet points explaining why the decision was made.

## Rejected alternatives

Alternatives considered and rejected (only when useful for posterity).

---

## Frontmatter reference

- `status` must be one of: `proposed` | `accepted` | `deprecated` | `superseded` | `not_adopted`.
- `topic` is required and must be one of the values you declared in `adr.config.json` (`topics`).
- `id` must match the filename-derived id per `idFormat`:
  - `date-sequence` (default): id `ADR-YYYYMMDD-NN`, filename `YYYYMMDD-NN-<slug>.md`.
  - `issue-number`: id `ADR-<n>`, filename `<n>-<slug>.md` (no zero padding). `<n>` is typically the originating GitHub Issue or PR number.
- The body H1 heading must match `<id>: <title>` from frontmatter.
- When `status: superseded`, `superseded_by` is required **and** the new ADR must list this id in its `supersedes`. The validator enforces bidirectional consistency.
- The prose header (`- **Date**:`, `- **Status**:`, `- **Related**:`) is for human readers; frontmatter is for tooling. Both coexist.

Run `npx adr validate` to check schema and cross-reference consistency locally.
