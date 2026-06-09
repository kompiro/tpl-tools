#!/usr/bin/env sh
# Pull the released standalone `adr` binary (adr-tools) into ~/.local/bin so
# `adr validate` can check this repo's ADRs. Uses the GitHub CLI, which handles
# auth for the currently-private adr-tools repo — run `gh auth login` first.
set -eu

arch="$(uname -m)"
case "$arch" in
  x86_64 | amd64) part="x64" ;;
  aarch64 | arm64) part="arm64" ;;
  *)
    echo "install-adr: unsupported architecture '$arch'" >&2
    exit 1
    ;;
esac
asset="adr-linux-${part}"

mkdir -p "$HOME/.local/bin"
gh release download --repo kompiro/adr-tools --pattern "$asset" --dir /tmp --clobber
install -m 0755 "/tmp/$asset" "$HOME/.local/bin/adr"
echo "install-adr: installed adr to $HOME/.local/bin/adr"
