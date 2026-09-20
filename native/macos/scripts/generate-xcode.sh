#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"
if command -v xcodegen >/dev/null 2>&1; then
  xcodegen generate
  echo "Generated StopScrollingNative.xcodeproj from project.yml"
  exit 0
fi
echo "xcodegen is not installed; using the checked-in StopScrollingNative.xcodeproj" >&2
exit 0
