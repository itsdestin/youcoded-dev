---
date: 2026-09-03
status: active
type: investigation
topic: The In:/Out: status-bar chips present one request's numbers as session totals on Claude Code sessions
---

# `context_window.*` is the current request, not the session

**Symptom.** On a Claude Code session the status bar's `Out:` chip reads 713 for a
42-hour, $183 session and 380 for a 42-minute one — numbers far too small to be a
session's output. `In:` has the same problem in the other direction: it is one
prompt's size, presented as everything the session ever sent.

**What the fields actually are.** `statusline.sh` fills `SessionStats` from Claude
Code's status-line JSON. The `cost.*` half really does accumulate across a session.
The `context_window.*` half does not — the shipped CLI (v2.1.259) builds that whole
object from **one request's** usage:

```js
function k8t(x, D) {           // x = the CURRENT request's usage, D = window size
  return {
    total_input_tokens:  x ? x.input_tokens
                           + x.cache_creation_input_tokens
                           + x.cache_read_input_tokens : 0,
    total_output_tokens: x?.output_tokens ?? 0,
    context_window_size: D,
    current_usage: x,
    used_percentage: …, remaining_percentage: …
  }
}
```

Read out of `/home/destin/.local/share/claude/versions/2.1.259` with
`rg -o -a 'total_input_tokens:x\?x\.input_tokens…'` on 2026-09-03. The word "total"
in those two names means "summed across the three token kinds", not "summed across
the session".

**Consequence in the UI.** `StatusBar.tsx` derives `inTokens`/`outTokens` as
`ss?.inputTokens ?? nativeTotals…`, and its own comment says the pair reads "SESSION
TOTALS" — which is true for native sessions (`SessionTotals` really does accumulate)
and false for Claude Code ones. That is exactly the defect the comment was written to
remove: one label meaning two different measurements depending on the runtime.
<!-- claim: {"path": "youcoded/desktop/hook-scripts/statusline.sh", "contains": "Nothing under .context_window. accumulates across a session"} -->

**Already fixed, separately.** The same misreading of `total_input_tokens` — treating
it as Anthropic's raw uncached remainder rather than the whole prompt — is what pinned
the Reuse chip under 50% on every Claude Code session. Fixed in youcoded PR #405
(`renderer/state/cache-reuse.ts`); both copies of `statusline.sh` now carry a comment
recording what each field is, so this does not have to be re-derived.

**What is not decided.** Whether `In:`/`Out:` should (a) be relabelled to say they
describe the current request, (b) be sourced from the transcript watcher, which sees
every turn's usage and could sum a real session total, or (c) be hidden on Claude Code
sessions. Claude Code's status line offers no session-total token counts at all, so
option (a) is the only one that costs nothing. This is a design call for Destin, not a
mechanical fix — which is why PR #405 deliberately left the two chips alone.
