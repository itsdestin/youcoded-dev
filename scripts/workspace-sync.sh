#!/usr/bin/env bash
# WHY: startup and maintenance must share one preservation policy.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/workspace-sync.mjs" "${1:?usage: workspace-sync.sh <repo-dir> [branch]}" "${2:-master}"
