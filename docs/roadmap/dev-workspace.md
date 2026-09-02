# dev-workspace — building the app, not the app
Filing test: it's about building the app, not the app. Could a normal user ever see it? No.
seen-on is always n/a here.

## tests

- [ ] Coverage debt from the feature-flow build: nothing renders the contract table or its
      verdict column in a browser test, the close-out Contract section runs only locally so no
      unattended check guards it, and an empty verdict, a two-hash source, a corrupt verdicts file
      and a missing git are all unpinned. None is a known failure
      `n/a` `needs-verify` `checked 2026-09-02`

- [ ] 102 fixed sleeps still stand in for real signals across the desktop suite (was 108; the six
      worst in native-session-host — five copies of "guess 20 ms that the child's turn started",
      the bug youcoded#363 already fixed once in that file, plus one whose own comment said "poll"
      while it slept — now wait on the real event). The MCP startup-wiring test did not blow its
      budget in any of 27 local runs on 2026-09-02, including two 8-way concurrent sweeps
      `n/a` `confirmed` `checked 2026-09-02` → docs/active/investigations/2026-09-01-fixed-sleeps-and-mcp-wiring-import.md

- [ ] 57 test files are excluded from the new test typecheck — they hold the 201 type errors it
      found on the day it was switched on, mostly fixtures built as partial objects. Named one per
      line in `desktop/tsconfig.tests.json`; verify.sh prints the remaining count every run
      `n/a` `confirmed` `checked 2026-09-02`

- [ ] The sync-spaces engine test goes red on the macOS CI leg every week or two — on branches
      that touch nothing in sync, and on untouched master — with zero watcher events delivered;
      Ubuntu and Windows pass the same commit, and every fire also skips macOS packaging
      `n/a` `needs-verify` `checked 2026-09-01` → docs/active/investigations/2026-09-01-sync-engine-debounce-macos-flake.md

- [ ] subagent-view, mcp-startup-wiring and project-watcher were filed as the suites that flake
      under parallel load, but 27 full local runs on 2026-09-02 (1 alone, 6 concurrent, 4 pinned to
      4 cores, 2 x 8 concurrent) never failed any of the three — the four that DID fail at 8-way
      concurrency were different files and are fixed. Either these three need a different trigger
      (the project-watcher hit was Ubuntu CI, not local) or they are already fixed
      `n/a` `needs-verify` `checked 2026-09-02`

- [ ] The lint gate only enables rules already at zero; the deferred list at the bottom of the
      ESLint config still fires — 79 renderer floating promises and 43 exhaustive-deps hits (the
      highest-value set: stale-closure bugs) are unguarded
      `n/a` `needs-verify` `checked 2026-09-01`

- [ ] VM first-run testing is provisioned (Windows 11, Ubuntu 24.04, macOS Sonoma on quickemu) but
      the open half is untested: a clean-winget Windows snapshot, the deb/rpm/pacman installers in
      the guests, and the full first-run → setup → sign-in pass itself
      `n/a` `needs-verify` `checked 2026-09-01`

- [ ] Visual-regression harness for the renderer's chrome invariants (single-backdrop chrome-glass,
      framed-shell insets, overlay layers) — they are guarded only by eyeballing; the UI review sweep
      now captures every screen per theme, so the missing piece is a baseline + diff verdict
      `n/a` `parked` `checked 2026-07-15`

- [ ] Review-deck test hygiene: bare `open()` in the Python deck tests prints ResourceWarnings that
      bury real failures; shot-measure sleeps 800 ms for the http server instead of polling and never
      tests the `run: null` branch; nothing drives the deck's build-failure short-circuit
      `n/a` `needs-verify` `checked 2026-08-27`

- [ ] The phone's presence client (ping loop, reconnect state machine) has no test harness at all —
      it is verified only by compiling; desktop's twin is fully tested. Add Robolectric or extract the
      timing logic behind an injectable clock
      `n/a` `needs-verify` `checked 2026-07-22`

## rigs

- [ ] The feature flow — a questions deck before anything is drawn, review rounds, a signed
      contract, then a graded acceptance deck — is built but has never been run end to end on a
      real feature; the first small UI feature Destin asks for is the trial, and its handoff
      records rounds, Destin-seconds, reopens and rows that failed at acceptance
      `n/a` `in-flight` `checked 2026-09-02` → docs/active/plans/2026-09-01-feature-flow-plan.md

- [ ] Opening Settings → Backup & Sync in the workbench takes the whole thing down to "YouCoded
      failed to start"; the boot check cannot see it and the review sweep counts the error state
      as covered
      `n/a` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-workbench-sync-panel-crash.md

- [ ] The old review-harness script still lets the model it runs read the OpenRouter key (its
      env scrub does not work); the native evaluator fixed this properly — retire the old script,
      or port the three fixes to it?
      Destin 2026-09-02: retire it — after checking nothing real is lost; reconsider if so
      `n/a` `confirmed` `checked 2026-09-02` `security` → docs/active/investigations/2026-09-01-review-harness-key-leak.md

- [ ] The perf rig cannot see native per-token streaming — its workload streams whole turns
      through the Claude Code transcript path, so the gate under-represents the exact path
      cycle 1's fixes target
      `n/a` `confirmed` `checked 2026-09-01` `performance` → docs/active/investigations/2026-09-01-perf-rig-blind-to-native-streaming.md

- [ ] Perf rig: the native-chat parity screen photographs a real local model's reply, so two
      identical-code baselines differ by up to 6.9% and the 5% gate can reject an unchanged build
      `n/a` `confirmed` `checked 2026-09-01` `performance` → docs/active/investigations/2026-09-01-perf-rig-native-chat-nondeterministic.md

- [ ] Perf rig: the artifacts phase's session-files drawer lists nothing about 1 run in 9 —
      once for 30 s aborting a 26-minute run, once returning undefined numbers that the median
      silently swallowed; cause unknown
      `n/a` `needs-verify` `checked 2026-08-28` `performance`

- [ ] Perf lab: the rig is built and two measurement cycles ran (2026-08-27/28, paged history
      shipped as youcoded#349), but Destin's reframe — a repeatable stress suite that catches the
      daily freezes and app-wide animation slowdowns on every surface — is the open half; the
      2026-08-27 perf-lab handoffs are the current truth, the 2026-08-23 plan is history
      `n/a` `needs-verify` `checked 2026-09-01` `performance`

- [ ] Harness evaluator: no CI gate yet, and the four eval cases were hand-written rather than
      drawn from a failure taxonomy over the stored conversations — waiting on the step-1 triage
      tool, which is now gone from disk (see the decision above)
      `n/a` `blocked` `checked 2026-08-26`

- [ ] Workbench serves community theme folders (`theme-asset://`) so review decks show real
      theme previews
      `n/a` `parked` `checked 2026-08-27`

- [ ] Attach your own screenshot to a review-deck step (the serve endpoint can accept uploads)
      `n/a` `parked` `checked 2026-08-27`

- [ ] Re-author the session-strip motion review as live pick-one steps: the branch is built, the
      four before/after clip steps were "just rough to compare", and the live-pane deck shipped
      2026-09-01 — needs a design session naming the built behaviour as one real candidate among
      real alternatives, not a build step
      In progress in another session on branch feat/session-strip-motion (Destin, 2026-09-02)
      `n/a` `in-flight` `checked 2026-09-02`

- [ ] Review-deck "decide" steps cut off their last option in the side-column layout — the third
      option is sliced and you scroll to reach it (46 px cut on chatsearch-gate step 1 at
      1574x820 after the 2026-09-01 styling pass; pre-existing, not caused by live panes)
      `n/a` `needs-verify` `checked 2026-09-01`

- [ ] Terminal text wraps about two-thirds (only ever seen in the UI-review rig, never the live app —
      Destin 2026-09-02; still a rig bug to fix if it persists) of the way across the pane — Claude Code's screen and
      input line stop near 950 px in a 1440-wide window (dev instance under xvfb, 2026-08-27; Destin
      has not seen it in his own app — check whether a maximized-at-launch window avoids it)
      `terminal` `n/a` `needs-verify` `checked 2026-09-02` → docs/active/investigations/2026-09-01-terminal-pty-column-count.md

## knowledge

- [ ] Nobody knows whether a third round of adversarial design review improves a design or just
      churns it; after three features have run the flow, count accepted findings, reversals and
      defect-vs-taste per round and set the default round count from the numbers — tooling for it
      waits on that data
      `n/a` `parked` `checked 2026-09-02` → docs/active/specs/2026-09-01-feature-flow-design.md

- [ ] Work keeps existing on one disk only: on 2026-09-01 the site-themes worktree holds 40
      uncommitted files on a branch with zero commits and no remote, and landing-demo-clips has
      2 unpushed commits (down from 107 commits across 12 branches on 2026-08-26). Wanted: a
      one-shot sweep that commits what it finds, and a standing check in the /audit slot that names
      any worktree dirty or unpushed for more than N days — before anyone follows the "remove the
      worktree after merging" rule
      `n/a` `needs-verify` `checked 2026-09-01`

- [ ] Two guardrails from the 2026-07-28 retrospective are still unshipped: spec counts are
      neither anchored nor dated (no "specs are snapshots" convention exists), and `run-dev.sh
      --list` lists registered worktrees, not what is actually running (no offset/profile/PID)
      (the unlisted "five PITFALLS papercuts" were dropped 2026-09-02)
      `n/a` `needs-verify` `checked 2026-09-02`

- [ ] Workspace friction from the 2026-08-28 session-opening study still open: "review the attached
      document" is the #1 task shape and has no command (`.claude/commands/` still holds only
      audit.md); plans run 4–6 reads long and are getting longer; worktrees live in four places on
      disk (`beta/`, `flappy-bird/`, `worktrees/`, `youcoded.wt/` — the last not even registered)
      `n/a` `needs-verify` `checked 2026-09-01`

- [ ] Census pass over `youcoded/desktop/docs/` — the last unsorted lifecycle-doc dump (13 entries
      incl. a superpowers/ subtree) still sits there because desktop/CLAUDE.md and a preload code
      comment point into it; sorting it means rewriting those pointers first
      `n/a` `parked` `checked 2026-09-01`

- [ ] Two UI-audit docs and `docs/MAP.md` still cite a coverage file that was deleted
      (`coverage-second-pass.md`; MAP line 19 still says 103/104)
      `n/a` `needs-verify` `checked 2026-09-01`

- [ ] Deferred clean-ups from the 2026-07-10 master review that nobody has picked up (xterm WebGL
      detach, sync idle-poll backoff, status-data dedup, folder-list canonicalising, big-file
      decompositions). Catalog: `docs/active/handoffs/2026-07-10-review-followups.md`
      `n/a` `parked` `checked 2026-08-12`

## release

- [ ] Landing-page live embed goes fully blurred under framed wallpaper themes — pick Meadow Mist
      from the embed's theme button and the whole app window becomes one blur; the redesign makes
      theme switching a primary interaction so this must ship with it
      `n/a` `confirmed` `checked 2026-09-01` `v1.3.1` → docs/active/investigations/2026-09-01-landing-embed-blur-rounded-clip.md

- [ ] Every compiled file ships inside the installer, tests included — 47 test files and 19
      workbench files in the 1.2.4 asar, none reachable; installer weight, not a blocker
      `n/a` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-asar-ships-tests.md

- [ ] PDF reading needs one smoke test in a packaged build before the next release — the pdf.js
      worker import is verified under Node but unverified inside app.asar (youcoded#354 added the
      unpack rules); no release has been cut since
      `n/a` `needs-verify` `checked 2026-08-28`

- [ ] Dependency majors that are real work, not bumps — still open on 2026-09-01: TypeScript
      5.9 → 7.0 (#242), okhttp/mockwebserver 5.4 which forces compileSdk 36 (#235), and the Android
      toolchain chain below; knip 6, jsdom 30 and vitest 4 landed outside dependabot and their PRs
      are closed
      `n/a` `needs-verify` `checked 2026-09-01`

- [ ] Android toolchain migration: Kotlin 2.4.10 + Gradle 9.7.1 landed 2026-09-01, but AGP 9.3.1
      (#237) and compose-bom 2026.06 (#236) are still open and red; they were diagnosed as one
      coupled chain, so re-run them together now that the Kotlin half is in
      `n/a` `needs-verify` `checked 2026-09-01`

- [ ] Landing copy note, recorded so it is not re-derived: conversation tags, private notes and
      one-tap prompt chips are unique (0 of 8 competitors on 2026-08-31) but must not lead the
      landing page — uniqueness is not the argument
      `n/a` `parked` `checked 2026-08-31`

- [ ] Ship v1.3 — the release mechanics: an `/audit` run, version bumps on both platforms (still
      1.2.4), a CHANGELOG 1.3.0 entry, the tag. The one product gate left is the Connected-accounts
      question filed under sync
      `n/a` `blocked` `checked 2026-09-01` `v1.3`

- [ ] The Android build labels the vendored terminal emulator GPLv3 while its own VENDORED.md says
      Apache 2.0 — one of the two is wrong, and it is the licence notice users see
      `n/a` `needs-verify` `checked 2026-09-01`

- [ ] The "formalization" push after 1.3: the youcoded.ai domain, app store and Play Store
      listings, the macOS/Windows security-warning signing, an LLC — Destin, 2026-09-02, "soon-ish,
      probably right after the 1.3 release"
      `n/a` `parked` `checked 2026-09-02`
