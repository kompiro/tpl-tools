#!/usr/bin/env sh
# Install the `tpl` standalone binary (no Node required).
#
#   curl -fsSL https://raw.githubusercontent.com/kompiro/tpl-tools/main/install.sh | sh
#
# Environment variables:
#   TPL_VERSION   release tag to install (e.g. v0.1.0). Default: latest release.
#   INSTALL_DIR   target directory.                      Default: $HOME/.local/bin
#   GITHUB_TOKEN  token used when downloading without the `gh` CLI (required
#                 while this repository is private).
#
# Download path: prefers the GitHub CLI (`gh`) when available — it handles
# authentication for private repositories transparently — and otherwise falls
# back to the REST API with GITHUB_TOKEN.
set -eu

REPO="kompiro/tpl-tools"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
VERSION="${TPL_VERSION:-latest}"

die() {
  echo "install.sh: $1" >&2
  exit 1
}

# --- detect platform -> release asset name ---------------------------------
os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
  Linux) os_part="linux" ;;
  Darwin) os_part="darwin" ;;
  *) die "unsupported OS '$os'. Download a binary manually from https://github.com/$REPO/releases" ;;
esac
case "$arch" in
  x86_64 | amd64) arch_part="x64" ;;
  aarch64 | arm64) arch_part="arm64" ;;
  *) die "unsupported architecture '$arch'. Download a binary manually from https://github.com/$REPO/releases" ;;
esac
asset="tpl-${os_part}-${arch_part}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# --- download the asset (and checksums) ------------------------------------
if command -v gh >/dev/null 2>&1; then
  if [ "$VERSION" = "latest" ]; then
    gh release download --repo "$REPO" --dir "$tmp" --pattern "$asset" --pattern "SHA256SUMS" \
      || die "gh release download failed (is gh authenticated? run 'gh auth login')"
  else
    gh release download "$VERSION" --repo "$REPO" --dir "$tmp" --pattern "$asset" --pattern "SHA256SUMS" \
      || die "gh release download failed for $VERSION"
  fi
else
  command -v curl >/dev/null 2>&1 || die "need either 'gh' or 'curl' installed"
  command -v jq >/dev/null 2>&1 || die "the curl fallback needs 'jq'; install 'gh' or 'jq'"
  [ -n "${GITHUB_TOKEN:-}" ] || die "GITHUB_TOKEN is required to download from the private repo without the gh CLI"
  api="https://api.github.com/repos/$REPO/releases"
  if [ "$VERSION" = "latest" ]; then
    rel_url="$api/latest"
  else
    rel_url="$api/tags/$VERSION"
  fi
  release_json="$(curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" "$rel_url")" \
    || die "failed to fetch release metadata for $VERSION"
  download_asset() {
    # $1 = asset name, $2 = output path
    asset_id="$(printf '%s' "$release_json" | jq -r --arg n "$1" '.assets[] | select(.name == $n) | .id' | head -n1)"
    [ -n "$asset_id" ] && [ "$asset_id" != "null" ] || die "asset '$1' not found in release $VERSION"
    curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/octet-stream" \
      "$api/assets/$asset_id" -o "$2" || die "failed to download '$1'"
  }
  download_asset "$asset" "$tmp/$asset"
  download_asset "SHA256SUMS" "$tmp/SHA256SUMS"
fi

[ -f "$tmp/$asset" ] || die "asset '$asset' was not downloaded"

# --- verify checksum -------------------------------------------------------
if [ -f "$tmp/SHA256SUMS" ]; then
  expected="$(grep " $asset\$" "$tmp/SHA256SUMS" | awk '{print $1}')"
  if [ -n "$expected" ]; then
    if command -v sha256sum >/dev/null 2>&1; then
      actual="$(sha256sum "$tmp/$asset" | awk '{print $1}')"
    else
      actual="$(shasum -a 256 "$tmp/$asset" | awk '{print $1}')"
    fi
    [ "$expected" = "$actual" ] || die "checksum mismatch for $asset (expected $expected, got $actual)"
    echo "install.sh: checksum verified"
  fi
else
  echo "install.sh: warning: SHA256SUMS not found, skipping checksum verification" >&2
fi

# --- install ---------------------------------------------------------------
mkdir -p "$INSTALL_DIR"
install -m 0755 "$tmp/$asset" "$INSTALL_DIR/tpl"
echo "install.sh: installed tpl to $INSTALL_DIR/tpl"

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *) echo "install.sh: note: $INSTALL_DIR is not on your PATH. Add it, e.g.: export PATH=\"$INSTALL_DIR:\$PATH\"" >&2 ;;
esac
