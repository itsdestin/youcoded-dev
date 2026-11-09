#!/usr/bin/env bash
# parts-check.test.sh — fails (non-zero) when any desktop source file matches no parts rule.
# WHY: keeps the command-center map complete; not wired into verify.sh yet on purpose.
set -u
cd "$(dirname "$0")/../.." || exit 2
node scripts/command-center/parts-check.mjs >/dev/null 2>/tmp/parts-check.err.$$
code=$?
if [ "$code" -ne 0 ]; then echo "parts-check FAILED (exit $code)"; grep -A50 'UNMATCHED' /tmp/parts-check.err.$$ | head -60; rm -f /tmp/parts-check.err.$$; exit 1; fi
rm -f /tmp/parts-check.err.$$
echo "parts-check ok"
