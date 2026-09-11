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

### Every error state offers an action

Destin, 2026-09-11: a message with nothing to press is a dead end. Every error state carries at
least one of **Retry**, **Report bug** or **Diagnose** — Retry when retrying can help, Report bug
wherever the cause is not known, both when both are true. `<ErrorState>` refuses an error with
no action by type (`tests/error-state.test.tsx`), and its buttons sit in one fixed order with
Retry last, at the right-hand end.

## The same rule, applied to what the app SAYS IT KNOWS

Errors were the first place this bit, but the rule is not about errors — it is about
never presenting a guess as knowledge. It governs any screen reporting the state of
something: what the assistant was given, what a model can do, what is installed, what
synced.

Destin, 2026-09-10, on the session-context panel: *"reflect what we can reflect
accurately. And then for the stuff that's less certain. We should reflect it as such."*

Three shapes, and the third is the one that gets missed:

1. **Known → state it**, and say how you know. The instruction files on disk and the
   skills the app installed are facts about this machine, not claims about a CLI.
2. **Not knowable here → say whose it is.** "Claude Code chooses its own tools for this
   chat. YouCoded isn't told which, so listing them here would be a guess." Not silence,
   and not a list recited from memory.
3. **Never let "unknown" render as "none".** An unknown tool set sent as an empty list
   reads as *"this assistant has no tools"* — false, and false in the direction that
   makes someone trust it less than they should. Absent and empty are different values;
   keep them different all the way to the screen. Pinned by
   `desktop/tests/claude-code-context.test.ts`.

A number nobody can check is the same failure wearing a friendlier face: the panel shows
"Set by Claude Code" rather than a context window that depends on the user's plan as well
as their model.

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
- ~~Wire the two-action fallback UX (report / diagnose-with-Claude) as a reusable component so general errors get a consistent affordance.~~ **DONE — the component exists.** `components/ui/states.tsx` exports `<ErrorState>` with exactly the two modes this standard describes: `mode="recoverable"` (specific message + Retry) and `mode="general"` (title + explainer + **Report bug** / **Diagnose with Claude**). Built 2026-07-23 as change 33 of the UI-consistency migration.

  **Update 2026-07-28 — it has its first TWO call sites** (Remote Access's Tailscale setup failure, K5 of the menu-internals kit): `recoverable` with the real error when we have one, `general` when the installer reports no reason at all. Both modes were chosen for that one verified failure rather than swept in, which is the bar this audit sets. `desktop/tests/primitive-adoption.test.ts` no longer exempts `ErrorState` — that exemption asserts NON-adoption and would now rot. **The audit itself is still outstanding**; the exemption came off early for a mechanical reason, not because the work landed.

  **It had ZERO call sites, deliberately.** Choosing which mode each site gets IS this audit's core decision — adopting it early would have guessed that call at every site, and each guess would then read as settled. So the audit's job is now: for every error surface, pick the mode, and pass the real detail (subprocess stderr, caught exception, failing path/port) rather than a hardcoded cause. The markup is no longer part of the work.

  ~~`desktop/tests/primitive-adoption.test.ts` exempts `ErrorState` by name with this reasoning; **remove it from `INTENTIONALLY_UNADOPTED` when this audit lands**, or the guard will keep covering for it.~~ **Done 2026-07-28** — see the update above. `FieldError` is still listed and still unadopted.

Tracked in `docs/roadmap/user-interface.md` (the misleading-errors audit, flagged `v1.3.1`) → `docs/active/investigations/2026-09-01-misleading-error-audit.md`.
