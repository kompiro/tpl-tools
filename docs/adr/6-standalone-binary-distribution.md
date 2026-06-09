---
id: ADR-6
title: Distribute the tpl CLI as a Node-free standalone binary
status: accepted
date: 2026-06-09
topic: infrastructure
---

# ADR-6: Distribute the tpl CLI as a Node-free standalone binary

- **Date**: 2026-06-09
- **Status**: Accepted
- **Related**:
  - PR #5 (design doc), PR #6 (implementation), released as v0.0.3
  - `scripts/build-binaries.sh`, `.github/workflows/release.yml`, `install.sh`
  - Mirrors adr-tools ADR-7 (same distribution pattern)

## Background

`@kompiro/tpl-tools` was distributed only as a GitHub Packages npm package, and
the `tpl` bin used a `#!/usr/bin/env node` shebang — so it could not run where
no Node toolchain exists (other projects, Go/other-language devcontainers). As
`tpl` is used alongside adr-tools, both tools should share one distribution
pattern.

The CLI is small and dependency-light: file I/O (`node:fs`/`path`) plus
`js-yaml`, reading only user-provided paths at runtime. That makes a
self-contained binary cheap to produce and required no source changes.

## Decision

Compile the `tpl` CLI to self-contained executables with `bun build --compile`
for five targets (linux/macOS/windows × x64/arm64), publish them to GitHub
Releases with a `SHA256SUMS`, and install them via `install.sh` into
`~/.local/bin`. This is **additive**: the existing npm distribution is kept
unchanged.

## Rationale

- Bun natively supports the `node:` APIs this CLI uses and bundles `js-yaml`
  automatically; one command cross-compiles all targets. Verified end-to-end —
  the compiled binary runs `tpl validate` with no Node present.
- `dist/bin` is excluded from the npm tarball so the ~90MB artifacts never
  bloat the package.
- GitHub Releases distribution costs nothing; per-platform binaries plus
  checksums give a simple, verifiable install path. `install.sh` prefers the
  `gh` CLI (handles the currently-private repo's auth) with a
  `curl`+`GITHUB_TOKEN`+`jq` fallback.

## Rejected alternatives

- **Deno compile** — comparable, but no advantage over Bun for this CLI and an
  extra permissions model to wire up.
- **Node SEA** — multi-step, needs a per-OS node binary, awkward
  cross-compilation; still experimental.
- **Rewrite in Go/Rust** — a full rewrite for marginal benefit, and it would
  break parity with adr-tools.

## Known trade-offs

- Binaries are ~90MB (the Bun runtime floor); minification does not help since
  the app code is tiny.
