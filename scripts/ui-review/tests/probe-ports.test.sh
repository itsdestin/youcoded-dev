#!/bin/bash
# scripts/ui-review/tests/probe-ports.test.sh — probe-ports.sh must name a busy port and exit 1; exit 0 when all are free.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('127.0.0.1',0)); print(s.getsockname()[1]); s.close()")
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 & PID=$!
sleep 0.5
out=$(bash "$HERE/../probe-ports.sh" "$PORT" 1 2>&1); code=$?
kill $PID 2>/dev/null
[[ $code -eq 1 && "$out" == *"$PORT"* ]] || { echo "FAIL: expected exit 1 naming $PORT, got $code: $out"; exit 1; }
bash "$HERE/../probe-ports.sh" 1 2 >/dev/null 2>&1 && echo "ok" || { echo "FAIL: free ports should exit 0"; exit 1; }
