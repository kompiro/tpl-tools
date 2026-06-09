---
id: ADR-8
title: Give tpl its own tpl.config.json with a fallback to an explicit --config
status: accepted
date: 2026-06-09
topic: architecture
depends_on: [ADR-6]
---

# ADR-8: Give tpl its own tpl.config.json with a fallback to an explicit --config

- **Date**: 2026-06-09
- **Status**: Accepted
- **Related**:
  - PR #8 (implementation), released as v0.0.4
  - Depends on ADR-6 (standalone distribution made independence worthwhile)
  - `src/config.ts` (`resolveConfigPath`), `src/init.ts`, `src/config.schema.json`

## Background

`tpl` read its reference data (the `topics` vocabulary and `idFormat`) only from
a path passed explicitly via `--config`, with deliberately no default filename —
in practice pointing at a shared `adr.config.json`. Once `tpl` shipped as a
standalone binary (ADR-6), depending on adr-tools' config for any real use
undercut that independence: there was no first-class `tpl` config and no schema
for one.

## Decision

Introduce a first-class `tpl.config.json` plus a JSON Schema, resolved with a
**fallback** order: an explicit `--config` wins; otherwise `tpl.config.json` in
the working directory is used if present; otherwise no file (topic validation
off, default id format). Add `tpl init` to scaffold the file. Keep the schema
shipped as a release asset and in the npm `dist/`.

## Rationale

- Fallback keeps both worlds: `tpl` is usable standalone with its own config,
  while a combined repo (adr + tpl) can still pass `--config adr.config.json`
  to keep a single source of `topics` and avoid duplicating the vocabulary.
- Explicit `--config` winning preserves backward compatibility for existing
  callers (e.g. CI invoking `tpl validate --config adr.config.json`).
- `tpl init` embeds its template (`src/init.template.ts`), so the standalone
  binary can scaffold a config with no companion file on disk.

## Rejected alternatives

- **Always independent (`tpl.config.json` only)** — clearer, but forces repos
  using both tools to duplicate the `topics` vocabulary across two files.
- **Keep sharing only (no default file)** — simplest, but leaves `tpl` unable
  to stand on its own, contradicting the standalone-binary goal.
