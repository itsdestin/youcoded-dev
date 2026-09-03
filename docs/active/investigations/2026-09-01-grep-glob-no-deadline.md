---
date: 2026-09-01
status: active
type: investigation
topic: Native Grep/Glob have no deadline and default to the conversation cwd, so a broad search from $HOME can hang a turn for hours
---

# Native Grep/Glob — no deadline, wrong default root

**Symptom.** A single `Grep` from a conversation whose folder was `$HOME` ran 181 s and hung the
session (2026-08-17). On 2026-08-26 (Destin's specialists plan-1c hands-on check 1) a background
Explorer in a `/home/destin` conversation ran a case-insensitive `Grep` across `*`; after **4 h 02 m**
it had 4 min of CPU and 13 threads parked in `__fuse_simple_request`. Only Stop (→ SIGKILL) ended it.

## Mechanism (re-checked against master 2026-09-01, `f2d229e4`)

`youcoded/desktop/src/main/harness/tools/grep.ts` spawns ripgrep with `--no-config --hidden --glob !.git`
rooted at the conversation cwd, and the spawn carries no deadline of any kind — no `timeout`, no
`AbortSignal`, no kill-after (`rg -n 'timeout|deadline|AbortSignal' tools/grep.ts tools/glob.ts` → 0 hits).
`bash.ts` has `DEFAULT_TIMEOUT_MS` 120 s / max 600 s; Grep and Glob have nothing.
<!-- claim: {"path": "youcoded/desktop/src/main/harness/tools/grep.ts", "contains": "child = spawn\\(rgBin, rgArgs, \\{ cwd: ctx\\.cwd, windowsHide: true"} -->

Two consequences compound:
1. **Wrong default root.** The search root is the conversation cwd, not the git top-level, so a
   `$HOME` conversation searches the whole home directory.
2. **Network mounts are walked.** ripgrep descended into `~/GoogleDrive/…`, an rclone FUSE mount where
   every read is a network fetch. Nothing consults `/proc/mounts` to skip `fuse.*` filesystems.

Commits since the spec (`05b4f885` bare-pattern recursion/hidden entries, `ede40d6f` strict params +
Grep flags) touched matching semantics only; neither added a deadline or changed the root.

## Fix plan (exists, unbuilt)

- Spec: `docs/active/specs/2026-08-17-search-scope-and-timeout-design.md` — **Chunk A** (per-tool
  timeout + git-toplevel default root) has a reviewed plan at
  `docs/active/plans/2026-08-17-search-scope-timeout-chunk-a.md` (absorbed review defects D1–D5, one of
  which would have killed the whole turn instead of the search); **Chunk B** (gitignore/hidden
  semantics, Glob rewrite, opt-in) is specified there with no plan.
- Added by the 2026-08-26 incident: (3) skip `fuse.*` mounts from `/proc/mounts` unless the path is
  explicitly inside one; (4) the hire-consent card should warn when the work dir is `$HOME` or `/`.
- **Destin's directive (2026-08-26): before building, check how Pi, OpenCode, Claude Code and Codex
  bound their own Grep/Glob** — timeout value, what happens on timeout (partial results + "narrow your
  search" vs. error), hidden folders by default or not, network/FUSE mounts avoided or not — and fold
  the answers into the spec. Starting points:
  `docs/active/investigations/2026-08-26-native-tools-vs-other-harnesses.md` §6 (records Gemini at
  30 s; its `—` for Claude Code, OpenCode, Pi and Hermes means *not measured*, not *none* — verify
  against source) and `docs/archive/investigations/2026-08-10-harness-search-tools-prior-art.md`.
  Codex is in neither doc.
- No branch exists (`git branch -a | rg -i 'search|scope|timeout'` → only `feat/permission-ask-timeout`).

History: filed 2026-08-26 (backfilled; spec written 2026-08-17). Re-verified 2026-09-01.
