---
status: active
date: 2026-11-14
topic: Mesh sync Phase 0 — shared brief for every investigating agent
---

# Phase 0 shared brief (read fully before doing anything)

You are one of several agents running the Phase 0 investigations of the YouCoded Mesh design.
The lead session coordinates; you own exactly one investigation, named in your prompt.

## Where things are

- Workspace root (use absolute paths): `/home/destin/youcoded-dev/worktrees/sessions/64-mesh-sync-build`
- The design: `docs/active/design/2026-11-07-mesh-sync/design.md` under that root. Read sections
  0, 1, 4.2 and the sections your prompt names. Section 9 holds your test's row (question, how, pass).
- App code (current master, read here, never in a shared checkout):
  `<root>/youcoded/desktop/src/` ; Worker: `<root>/wecoded-marketplace/worker/`.
- Your report: `<root>/docs/active/investigations/2026-11-14-mesh-phase0/<your file name>.md`
- Your throwaway code: `<root>/docs/active/prototypes/2026-11-14-mesh-phase0/<T id>/`
  (plain Node ESM `.mjs` or TypeScript run with the app's own toolchain; no new dependencies
  installed into the app; if you need a package, `npm init` inside your prototype folder and add
  a `.gitignore` for `node_modules`).

## Hard safety rules (breaking one ends the investigation)

1. **Never touch Destin's running YouCoded app**: no signals to its processes, no DevTools, no
   IPC, no writes to files it holds, no plugin/hook/setting changes. Do not launch `run-dev.sh`.
2. **Real user data is read-only.** `~/.claude`, `~/.youcoded`, `~/YouCoded`, `~/.config` are
   never written, moved, renamed or deleted. If you must experiment on a chat file, copy it into
   your prototype folder or the scratch folder first and work on the copy. Exception only where
   your prompt explicitly allows creating NEW throwaway items.
3. **Never copy, print, log or commit credentials or keys** (`.credentials.json`, tokens,
   `safeStorage` blobs, `.env`). Never put chat contents into your report: counts, sizes,
   hashes and ids only (ids truncated to 8 characters).
4. No `git commit`, `git push`, `git stash`, branch changes, or edits outside your two folders.
   The lead commits. No app source edits (Phase 0 is investigation on throwaway code).
5. No system changes: no package installs with the system package manager, no suspend/sleep,
   no service changes, no network listeners except on 127.0.0.1 with a random high port, closed
   when you finish. Kill only processes you started, by pid.
6. Nothing paid. No Cloudflare deploys. No external accounts.
7. Heavy scans (17 GB of chats exist) must stream, not load whole files, and must not peg every
   core: at most 4 workers.

## Report format

Markdown with YAML frontmatter (`status: active`, `date: 2026-11-14`, `topic:`). Then:

1. **Verdict** — one line: PASS / FAIL / PARTIAL against the pass line in design section 9.
2. **What was done** — commands and prototype files, enough to re-run.
3. **Findings** — numbered facts, each with its evidence (file:line, command output, counts).
   Mark anything not verified as UNVERIFIED and say why.
4. **What this changes in the design** — exact section numbers and the proposed new wording, or
   "nothing".
5. **Needs Destin** — only user-visible decisions, phrased in plain words; or "nothing".
6. **Could not test here** — hardware/OS/accounts missing (this machine is Linux only; no
   phone, Windows or Mac is attached).

Honesty rules: a count needs its command; a negative needs the search that found nothing; never
round a failure into a pass. Your final message to the lead is a 10-line summary plus the report
path — the report holds the detail.
