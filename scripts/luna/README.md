# Luna live cache-measurement rig (dev-only)

Measures how much earlier input each client gets back from the provider's prompt cache, on
**real ChatGPT-plan requests** (`gpt-5.6-luna`), YouCoded against an isolated OpenCode 1.18.31.
It answered the 2026-09-23 questions: why YouCoded missed more than OpenCode (no `session-id`
header), whether tool loops, a full restart + resume, and compaction keep the cache.
Findings: `docs/active/investigations/2026-09-23-chatgpt-cache-affinity.md`.

## Runners (each spends ChatGPT-plan quota — ask Destin first, state the cap)

| Runner | What one round is | Default | Cap |
|---|---|---|---|
| `live-repeat-comparison.mjs [rounds] [gapS]` | 3 plain messages per client, alternating order | 10 rounds | 7 requests/round |
| `live-tool-comparison.mjs [rounds] [gapS]` | 2 read-only replies that open several files | 5 rounds | 26 requests/round |
| `live-lifecycle-comparison.mjs [rounds] [gapS]` | tools → full process restart + resume → forced compaction → 2 more replies | 3 rounds | 80 requests/round |

Output is JSONL on stdout, one row per provider request (`cached` / `input` tokens, phase,
step). Redirect it to the scratchpad and summarize; commit results next to the investigation.

## Safety model — why it is built this way

- **Every provider request reserves a slot first** from `request-gate.mjs`, a bodyless loopback
  server with per-turn, per-round and total ceilings. An over-budget or out-of-phase attempt is
  refused before it reaches the network and halts the run. Never raise a cap silently.
- **Private HOME, not just `--profile`.** `run-dev.sh` instances otherwise share the real
  `~/.claude/` and `~/YouCoded/` (docs/PITFALLS.md → Shared state). Everything runs under
  `~/.cache/youcoded-luna-experiment/`: its own sign-ins (one ChatGPT OAuth for the app, one for
  OpenCode), transcripts and diagnostics. The live app and the installed OpenCode are never touched.
- **The app side needs experiment-only instrumentation** gated on `YOUCODED_LUNA_EXPERIMENT=1`
  plus the `luna-eval` dev profile: the request gate hook in `chatgpt-auth.ts`, a fixture jail on
  the file tools (`lunaPathRefused`), and the KWin helper switched off. As of 2026-09-23 it lives
  only on youcoded branch `session/prompt-reuse-luna-recovery`; launch the rig from a worktree
  that has it (`live-native-cdp.mjs` pins the worktree path).
- **Results come from the app's own content-free diagnostics**
  (`private-diagnostics/chatgpt-cache/requests.jsonl` in the private profile). Conversation IDs
  there are HMAC'd per process, so runners take rows by position — the isolated app runs nothing
  else, one phase at a time.
- **OpenCode is driven over its HTTP API**, not `opencode run` (the CLI made an extra background
  request per message). Each step of a reply is its own assistant message there, so usage is
  read from the session's message list, not the prompt response.

## Offline tests

`node --test $(ls scripts/luna/*.test.mjs)` — no network, no quota; CI runs them. The shared-counter
test in `request-gate.test.mjs` skips itself unless the private OpenCode source checkout exists.

## Known limits

- Conversations stay ~7k tokens; a real threshold compaction on a long history is not exercised
  (the lifecycle runner forces `/compact`).
- One account, one machine, one time of day per run: alternate client order and repeat rounds
  rather than trusting a single run. 13/20 vs 18/20 is roughly a 1-in-8 chance of luck.
