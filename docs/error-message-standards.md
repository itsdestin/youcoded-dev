# Error Message Standards

**Status:** Active workspace convention (adopted 2026-07-14). Applies to ALL future coding sessions and every repo in this workspace (desktop, Android, worker, plugins).

## The rule

**Never write, generate, or ship a generic error message that guesses at a cause you have not verified.** A misleading error is worse than no error — it sends the user (and the next debugging session) down the wrong path.

Every user-facing error must fall into one of two shapes:

### 1. Specific and accurate
Surface the *real* underlying cause. That means capturing and including the actual failure detail:
- subprocess **stderr** / exit code
- the caught exception `message` / `errno` / `code`
- the failing **path**, **port**, **URL**, or **argument**

If a child process, network call, or file op can fail, capture its real error and either display it or route it into the diagnose flow. **Do not `catch` and replace the real error with a hardcoded guess.**

### 2. General but explicitly non-committal
When you genuinely can't surface a specific cause at that layer, use a *general* message that does NOT assert a cause — e.g. **"Error: Unable to run local models."** — paired with two actions:

1. **Report bug / submit PR** — link the user to the issue-report path.
2. **Diagnose with Claude** — hand the real error context to Claude for investigation (the same pattern as **Settings → Development** — `dev:summarize-issue` / `dev:submit-issue`, which shell to `claude -p` with logs).

A general message is acceptable. A general message that *invents a plausible-sounding cause* is not.

## Canonical anti-pattern (why this rule exists)

The local llama.cpp engine (`engine-supervisor.ts`) threw:

> "The local engine exited while starting up — **its build may not run on this machine.**"

Every claim in that sentence was wrong. The build ran fine on the machine. The real cause was that `llama-server` was spawned with `--models-dir ~/.cache/llama.cpp` and **that directory didn't exist yet**, which router-mode treats as fatal. The supervisor spawned the child with `stdio: ['ignore','pipe','pipe']` but **never read the child's stderr**, so the real message (`failed to initialize router models: '…' does not exist or is not a directory`) was discarded and replaced with a confident, false guess about the hardware.

That one message cost a full debugging session to disprove. Multiply that across every user who can't read the code.

**Lesson:** if you're about to write "probably X" into an error string, either prove X and say it precisely, or say nothing about the cause and offer the two actions above.

## Followup — v1.3.1 audit

We will **go back and replace all existing system/app error messages** against this standard as a dedicated pass in **v1.3.1**. Scope:
- Audit every user-facing `throw new Error('…')`, toast, banner, and IPC error string across desktop, Android, and the worker.
- Fix any that assert an unverified cause (specific+accurate) or that are vague without a next step (general + the two actions).
- Where a subprocess/exception detail is available, thread it through instead of swallowing it.
- Wire the two-action fallback UX (report / diagnose-with-Claude) as a reusable component so general errors get a consistent affordance.

Tracked in `docs/knowledge-debt.md`.
