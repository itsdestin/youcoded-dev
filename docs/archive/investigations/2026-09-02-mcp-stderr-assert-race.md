---
date: 2026-09-02
status: active
type: investigation
topic: claude-code-link-mcp.test.ts asserts on a spawned server's stderr that may not have arrived yet
---

# The MCP link test races its own subprocess's stderr

**Symptom.** `tests/claude-code-link-mcp.test.ts > never answers a notification, and survives an
unparseable line` fails on CI with `AssertionError: expected '' to contain 'unparseable line'`.
The accumulated stderr is **empty** — not wrong, not partial. First seen ubuntu, youcoded#386 run
`33643620764`, 2026-09-02.

**Mechanism (read, not inferred).** The test writes two lines to a spawned server's stdin and then
awaits a `ping` round-trip on **stdout**:

```
server.stdin.write(<notification>)
server.stdin.write('this is not json\n')
const res = await request('ping');      // resolves on STDOUT
expect(stderrText).toContain('unparseable line');   // asserts on STDERR
```

The `await` synchronises on the stdout channel. Nothing synchronises on stderr, and the two are
separate pipes with independent buffering — so the parse-error write
(`claude-code-mcp.ts:205`, `process.stderr.write(...)`) can still be in flight when the
assertion runs. It passes locally because both pipes drain fast on an idle machine; CI under
parallel load is where they diverge.
<!-- claim: {"path": "youcoded/desktop/src/main/claude-code-mcp.ts", "contains": "ignoring unparseable line"} -->

**Fix shape.** Await the stderr text rather than the stdout round-trip — `vi.waitFor(() =>
expect(stderrText).toContain('unparseable line'))`. Do **not** weaken the assertion or drop it:
the behaviour it pins (an unparseable line is survived AND reported) is real and worth keeping.

**Not the code under test.** The server is correct; only the test's synchronisation is wrong.

**Attribution.** The test arrived with the send-user-link work merged 2026-09-02 (youcoded#381),
so this is a new flake, not a long-standing one. Found on youcoded#386, whose diff is an auth log
line — `claude-code-mcp.ts` imports only `fs`, `path` and one shared constants module, so it
cannot reach that change; verified with `rg -n '^import' src/main/claude-code-mcp.ts`.
