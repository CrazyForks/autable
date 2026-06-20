#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$repo_root/web"
npm run build

rm -rf "$repo_root/internal/webui/dist"
mkdir -p "$repo_root/internal/webui/dist"
cp -R "$repo_root/web/dist/." "$repo_root/internal/webui/dist/"
