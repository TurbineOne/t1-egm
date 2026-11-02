#!/bin/sh
# Copyright 2026 TurbineOne. SPDX-License-Identifier: Apache-2.0

# Publish the built Pi package as one GitHub Release asset.
#
# pi-egm/ is the extension source in this repository. pack_plugin.py copies it
# into the generated egm-pi/ directory. This script publishes that directory's
# ZIP. It does not create a second package or a second archive.

set -eu

tag=${1:-}
build_only=0
if [ "${2:-}" = "--build-only" ] || [ "$tag" = "--build-only" ]; then
  build_only=1
  if [ "$tag" = "--build-only" ]; then
    tag=${2:-}
  fi
fi

if ! printf '%s' "$tag" | grep -Eq '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'; then
  echo "Usage: scripts/package-release.sh vMAJOR.MINOR.PATCH [--build-only]" >&2
  exit 2
fi

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
version=${tag#v}
plugin_version=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$root/plugin.json")
if [ "$plugin_version" != "$version" ]; then
  echo "plugin.json version $plugin_version does not match $tag" >&2
  exit 1
fi

if [ -n "$(git -C "$root" status --porcelain)" ]; then
  echo "Refusing to package a dirty worktree" >&2
  exit 1
fi

build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT
python3 "$root/scripts/pack_plugin.py" --target pi --output "$build"

mkdir -p "$root/dist"
cp "$build/egm-pi.zip" "$root/dist/egm-pi.zip"
(
  cd "$root/dist"
  sha256sum egm-pi.zip > egm-pi.zip.sha256
)

echo "Built $root/dist/egm-pi.zip"
if [ "$build_only" -eq 1 ]; then
  exit 0
fi

if git -C "$root" rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  echo "Tag $tag already exists" >&2
  exit 1
fi

git -C "$root" tag -a "$tag" -m "EGM Pi package $tag"
git -C "$root" push origin "$tag"
gh release create "$tag" \
  "$root/dist/egm-pi.zip" \
  "$root/dist/egm-pi.zip.sha256" \
  --repo TurbineOne/t1-egm \
  --title "$tag" \
  --generate-notes
