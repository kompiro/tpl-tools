#!/usr/bin/env sh
# Devcontainer setup: install JS deps and (best-effort) the standalone `adr`
# binary used to validate this repo's ADRs.
set -eu

corepack enable
pnpm install --frozen-lockfile || pnpm install

if command -v adr >/dev/null 2>&1; then
  echo "post-create: adr already on PATH"
elif gh auth status >/dev/null 2>&1; then
  .devcontainer/install-adr.sh || echo "post-create: adr install failed; run .devcontainer/install-adr.sh manually"
else
  echo "post-create: 'adr' not installed. Run 'gh auth login' then '.devcontainer/install-adr.sh' to enable 'pnpm run validate:adr'."
fi
