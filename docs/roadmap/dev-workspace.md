# dev-workspace — building the app, not the app
Filing test: it's about building the app, not the app. Could a normal user ever see it? No.
seen-on is always n/a here.

## tests
- [ ] A test that only reads files outside `desktop/` never runs in the fast local check:
      `verify.sh` picks affected tests by filtering the diff to `desktop/`, so editing only
      an Android manifest or a workspace file yields "tests: none", and the guard that
      exists to catch exactly that edit stays silent. Found 2026-09-05 reviewing the voice
      prompting manifest guard, which reads `app/src/main/AndroidManifest.xml` from a test in
      `desktop/tests/`. CI's full `npm test` does catch it, so this is about the local loop
      lying, not about shipping broken. Fix: let a test declare the paths it watches, or
      widen the source-scanning-guard fallback to spot cross-repo reads
      `n/a` `confirmed` `checked 2026-09-05`


- [ ] `native-session-host` can fail its own CLEANUP on the macOS CI leg — `ENOTEMPTY` from
      `rmHostRoot()` while deleting the temp dir, thrown out of afterEach into a test that had
      already passed, so the red names the wrong thing. Seen 2026-09-03 on youcoded#399, passed
      on a plain re-run of the same commit. The retrying remove the test-suite-hygiene rule
      prescribes IS in place; its budget (10 x 25ms = 250ms) is just too small for a loaded
      3-core runner while fire-and-forget ledger writes are still landing. Not a product bug —
      but it fails whole runs, which is how a real failure next to it gets ignored
      `n/a` `confirmed` `checked 2026-09-03`

- [ ] On a Mac, three things can miss a change made in the split second after they start
      watching: a new file may not appear in the Files panel, an edited theme may not
      hot-reload, and a session title may not update. Same cause as the watcher bug fixed in
      youcoded#399 (macOS reports the watch as live before it actually is) — those two got the
      fix and a measured proof; these three were audited but not reproduced, so they were left
      out of that PR rather than shipped unproven. Sites: artifacts/project-watcher.ts,
      theme-watcher.ts, the topic watch in ipc-handlers.ts. The other four watcher sites are
      already safe (they re-check on a timer)
      `n/a` `confirmed` `checked 2026-09-03` → docs/archive/investigations/2026-09-01-sync-engine-debounce-macos-flake.md

- [ ] `native-session-host` "a finished run is injected ONCE as a user turn with injected:
      shell-complete" fails on the macOS CI leg only: the finished-notice text arrives without the
      command's own output ("done"), so the exact-match regex misses. Passed on a plain re-run of
      the same commit, and the same suite is green in 27 local runs — but if it is real rather
      than a test race, a user on a slow machine sees a background command report finished with
      no output
      `n/a` `needs-verify` `checked 2026-09-02` `regression`

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

- [ ] The desktop CI job fails while every test passes — 7,971 passed, 0 failed, job exits 1 on
      "EnvironmentTeardownError: Closing rpc while onUserConsoleLog was pending". Console output
      still in flight when a worker shuts down, so the red names no test and points at whichever
      file happened to be running. Seen on the Windows leg on master (#405 and #407 merges) and on
      a PR branch the same day. Different from the flake items above: nothing fails, the job just
      exits 1 — so "re-run it" is the only response anyone can give today
      `n/a` `confirmed` `checked 2026-09-03` `regression`

- [ ] subagent-view, mcp-startup-wiring and project-watcher were filed as the suites that flake
      under parallel load, but 27 full local runs on 2026-09-02 (1 alone, 6 concurrent, 4 pinned to
      4 cores, 2 x 8 concurrent) never failed any of the three — the four that DID fail at 8-way
      concurrency were different files and are fixed. Either these three need a different trigger
      (the project-watcher hit was Ubuntu CI, not local) or they are already fixed
      `n/a` `needs-verify` `checked 2026-09-02`

- [ ] A whole session edited files that a path-scoped rule covers and the rule never loaded.
      The session worked entirely through Bash (cat/sed/python heredocs, as bypass-permissions
      mode asks for) rather than Read/Edit, and no rule injected all session — including the one
      whose globs name the exact directory being edited. If that is how it works, every rule in
      the workspace is silently off whenever a session edits through the shell, and the sessions
      that most need the guardrails are the ones that lose them
      `n/a` `needs-verify` `checked 2026-09-03`

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
- [ ] The question deck (`scripts/questions/serve.py`) can only ask multiple-choice questions,
      so a session needing Destin to approve a set of concrete text changes rebuilds its own
      loopback answer page instead of using it — happened 2026-09-05 for a nine-item prompt
      diff review. Wanted: a card type that renders a before/after diff, so one surface
      answers every "approve these specific edits" question
      `desktop` `needs-verify` `checked 2026-09-05`

- [ ] A dev instance still shares one file with Destin's live app: the cross-device sync state
      at ~/.claude/toolkit-state/sync-spaces.json is a hardcoded path, so --profile does not
      separate it and two apps can write it at once. Found 2026-09-05 while handing over the
      ChatGPT sign-in build, right after the setup-wizard state was given the same treatment
      (YOUCODED_TOOLKIT_STATE_DIR); the sync path needs its own override or the same one
      `desktop` `needs-verify` `checked 2026-09-05`

- [ ] A dev instance silently changed the engine settings of Destin's real, installed app. Same
      class as the sync-spaces item above, second file: ~/.youcoded/config.json is one shared
      path, so --profile separates a dev instance's userData but not this. Switching engine
      backends in a dev window overnight 2026-09-05 rewrote the live app's config (stamped 03:01,
      backend now "rocm") while the live app was still running its Vulkan build — it would have
      come up on ROCm at its next restart, with nothing on screen tracing that back to a test
      session. This is the isolation run-dev.sh exists to provide. The file was left alone: what
      his app runs on is his call, not a session's
      `desktop` `confirmed` `checked 2026-09-06`

- [ ] The screenshot drivers behind the review rig and the new UX tester emulate a mouse on a
      1× screen only — no touch, no 1.5× scale — which is how Destin actually uses the app, so a
      context-free tester cannot claim to have covered either. Add pointer and scale switches to
      shot.mjs and ui-probe.mjs (drag-fuzz already has both) and default the tester kit to them
      `n/a` `confirmed` `checked 2026-09-04`

- [ ] Measure the feature flow's two reviewers: after three features have run through the
      2026-09-04 flow, count findings, accepted, rejected and rows failed at acceptance per
      reviewer, and whether the UX tester's first run cut Destin's review-deck rounds; decide
      from those numbers whether each reviewer earns its cost
      `n/a` `parked` `checked 2026-09-04`


- [ ] A 526-line conversation-triage script for the test engine exists only on branch
      `chore/conversation-triage-script` (rescued 2026-09-04 from the deleted assistant-settings
      mockup branch, where it had hitched a ride). Nobody has said whether it is wanted: merge it
      with a README line, or delete the branch
      `n/a` `decision` `checked 2026-09-04`

- [ ] Committing a workspace doc takes six manual steps every time, and the leftovers are what
      the sync healer exists to clean up. The pre-commit hook refuses commits in the shared
      `youcoded-dev` checkout (correctly), so every edit becomes: copy each changed path into a
      linked worktree, stage by explicit path, commit, push — done seven times in the
      2026-09-04 buddy session alone. Nothing removes the original in the shared checkout, and
      that residue is exactly what `workspace-sync.sh`'s classifier had to be built to
      untangle. Copying whole files across also sweeps other sessions' work: doing it during
      this very wrap-up pulled six unrelated index rows into the staging area. Wanted: one
      command that takes the paths, does the copy/stage/commit/push in a worktree, and cleans
      the shared copy — so the drift is never created rather than healed afterwards.
      `n/a` `confirmed` `checked 2026-09-04`

- [ ] When the app dies or freezes it leaves nothing behind — no crash record on any platform, and
      nothing anywhere saying the app had stopped responding, so a tester's force-quit on
      2026-09-03 could not be explained at all. FIXED on a branch 2026-09-03
      (`youcoded feat/crash-diagnostics`): crashes, dead helper processes and freezes now all write
      a line into the log the Report-a-bug flow already sends, and crash files stay on the user's
      machine. Open until that branch merges
      `n/a` `confirmed` `checked 2026-09-03` → docs/active/investigations/2026-09-03-macos-beta72-unopenable-postmortem.md

- [ ] The app's log is in a folder nobody would guess — Claude Code's, not the app's — so anyone
      poking around for it concludes there is no log at all, as a tester with full access to the
      machine did on 2026-09-03. Less bad than it first looked: Report a bug already attaches the
      log for the user, so nothing is lost when they use that path. What is left is that the log
      keeps only its last 500 lines, which can be shorter than one session, and that there is no
      way to just go and look at it
      `n/a` `confirmed` `checked 2026-09-03` → docs/active/investigations/2026-09-03-macos-beta72-unopenable-postmortem.md

- [ ] The feature flow — a questions deck before anything is drawn, review rounds, a signed
      contract, then a graded acceptance deck — is built but has never been run end to end on a
      real feature; the first small UI feature Destin asks for is the trial, and its handoff
      records rounds, Destin-seconds, reopens and rows that failed at acceptance
      `n/a` `in-flight` `checked 2026-09-02` → docs/active/plans/2026-09-01-feature-flow-plan.md

- [ ] Opening Settings → Backup & Sync in the workbench takes the whole thing down to "YouCoded
      failed to start"; the boot check cannot see it and the review sweep counts the error state
      as covered
      `n/a` `needs-verify` `checked 2026-09-01` → docs/active/investigations/2026-09-01-workbench-sync-panel-crash.md

- [ ] `chatgpt-auth.test.ts` ("after the callback the poll starts…") fails on the Windows CI
      runner and passes on a re-run of the same commit, with no code change — seen 2026-09-05 on
      youcoded PR #430. A suite that fails for reasons that are not yours trains sessions to wave
      real failures away, which is the exact thing the 2026-08-28 flake sweep set out to end
      `n/a` `confirmed` `checked 2026-09-05` `regression`

- [ ] Reading and editing files through shell `cat`/`sed`/heredocs loads NO path-scoped rule —
      rules fire on the file tools only — so a session told to prefer Bash silently works with
      none of them. Measured 2026-09-05: a session that shipped a renderer feature, a new test
      and a review deck got 0 of the 6 rules its own edits matched (`~/.claude/instructions-loaded.log`
      records the misses). A PostToolUse hook on edit-shaped Bash could name the rule that did
      not load; the observation instrument for it already exists
      `n/a` `confirmed` `checked 2026-09-05`

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
      identical-code baselines differ — re-measured 2026-09-03 at **14.79%**, well above the 6.9%
      first recorded and larger than the 6.38% a real candidate change produced against the same
      baseline, so the gate can reject an unchanged build. Now NAMED in code
      (`screenshots.mjs` → `NONDETERMINISTIC_SCREENS`) with the rule in the perf-lab README:
      compare baseline-against-itself before believing a diff on this screen, then read the
      image — cycle 2's real duplicate-bubble bug showed here at 14.04%, which no percentage
      rule separates from this noise. Remaining work is the gate itself, which still scores it
      `n/a` `confirmed` `checked 2026-09-03` `performance` → docs/active/investigations/2026-09-01-perf-rig-native-chat-nondeterministic.md

- [ ] Perf rig: the artifacts phase's session-files drawer lists nothing about 1 run in 9 —
      once for 30 s aborting a 26-minute run, once returning undefined numbers that the median
      silently swallowed; cause unknown
      `n/a` `needs-verify` `checked 2026-08-28` `performance`

- [ ] Perf lab: the rig is built and THREE measurement cycles have SHIPPED (2026-08-27/28 paged
      history youcoded#349; 2026-09-03 folding youcoded#398), but
      Destin's reframe — a repeatable stress suite that catches the daily freezes and app-wide
      animation slowdowns on every surface — is the open half; the 2026-08-27 perf-lab handoffs
      are the current truth, the 2026-08-23 plan is history. Cycle 3 added a `scrollback` phase
      (the CEILING a conversation reaches once read back, not the paged floor) with three PRIMARY
      metrics, a per-pane count proving the mechanism engaged, and a settle window before every
      reading — the last two exist because three different bugs all presented as the same 6%.
      What remains, ranked: docs/active/handoffs/2026-09-03-perf-next-steps-handoff.md
      `n/a` `needs-verify` `checked 2026-09-03` `performance`

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

- [ ] The landing redesign's five clips exist only in the mockup folder; the site-assets script that
      regenerates every loop does not know their names, so the next regeneration drops them
      `n/a` `confirmed` `checked 2026-09-03`

- [ ] The landing mockup's generator still carries the two phrases removed from the live page on
      2026-09-03 ("self-improving", "does real work"); the next rebuild-and-port reintroduces them
      `n/a` `confirmed` `checked 2026-09-03`

## knowledge
- [ ] The UI design guide has TWO rules numbered G-22 — "Find bar" and "Expandable rows" — and its
      own index at the bottom resolves G-22 to the find bar. Anything that cites "G-22" is therefore
      ambiguous, and a review deck or roadmap item naming it can point a reader at the wrong rule.
      Do not renumber a guide Destin has signed off; the fix is his call (rename one, or add a
      suffix). Found 2026-09-06 while shrinking the expandable-rows item.
      `n/a` `confirmed` `checked 2026-09-06`

- [ ] Close-out can say "the work landed" for a new branch whose edits are still uncommitted,
      then recommend deleting its worktree; it should notice unfinished edits before declaring success
      `n/a` `needs-verify` `checked 2026-09-05`

- [ ] Recheck the old cleanup handoff's remaining unused-code and bug-hunt ideas before
      treating them as completed; its retired tooling instructions are no longer a safe starting point
      `n/a` `needs-verify` `checked 2026-09-05` → docs/archive/handoffs/2026-08-05-code-cleanup-with-serena.md

- [ ] Planning, design, review and wrap-up instructions can send an assistant down conflicting
      routes or to a skill it cannot invoke; consolidate the routes and check availability
      without turning a read-only review into permission to edit or ship
      `n/a` `parked` `checked 2026-09-05` → docs/active/investigations/2026-09-05-native-guidance-followups.md

- [ ] roadmap-check verifies a report's claim against whatever copy of the sub-repo happens to
      be on disk beside it, so a stale main checkout can keep a fixed bug "confirmed" for days
      (two specialist bugs fixed 2026-09-02 were re-listed as open on 2026-09-04), and from a
      scratchpad worktree every claim is skipped as "repo not on disk". Read claims from
      origin/<default> with git show, and fall back to $YOUCODED_WORKSPACE for the sub-repos
      `n/a` `confirmed` `checked 2026-09-05`

- [ ] Every branch that files a roadmap item conflicts on the generated area table in ROADMAP.md
      at merge time (three times on 2026-09-04/05). `roadmap-check --fix` could resolve a conflict
      it recognises as only the table (strip the markers inside the table block and regenerate),
      leaving any other conflict alone
      `n/a` `confirmed` `checked 2026-09-05`


- [ ] Path-scoped rules never reach a session that edits through the Bash tool, which is what
      bypass-permissions mode tells sessions to do. Measured on 2026-09-03 (session
      43f47281): ~200 lines were changed under `desktop/src/renderer/components/project-view/`,
      and `artifacts.md`, `react-renderer.md` and `narrow-viewport.md` — all three of whose
      `paths:` globs match that directory — never loaded. The only two `path_glob_match` events
      in that session were triggered by a SUBAGENT's `Read` of a file it was handed; across the
      whole of `~/.claude/instructions-loaded.log` there have only ever been three such events.
      Injection is keyed to Read/Edit/Write, so `sed`/`python3` edits deliver no rules and the
      loss is silent — the session cannot tell it is missing anything. Wanted: something that
      names the covering rules when a Bash command writes a matching path (a non-blocking
      PreToolUse companion to `glob-guard.py`), or a `rules-for <path>` command cheap enough to
      run before an edit. The evidence is `~/.claude/instructions-loaded.log`; measure the
      noise before shipping a per-Bash-call hook
      `n/a` `needs-verify` `checked 2026-09-03`

- [ ] Every plan, spec and investigation is stamped with a one-word state, but nothing checks
      the word: 15 of them say `settled`, `review`, `applied`, `superseded-in-part` or a whole
      sentence instead of one of the four allowed states. All 15 are already archived, so
      nothing in flight is mislabelled today — but the same closed list is unenforced, so the
      next one lands wherever someone types it and "what is still open?" stops being answerable
      by looking
      `n/a` `parked` `checked 2026-09-03`

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

- [ ] youcoded-core's status line and write-guard still reference the deleted usage-fetch script (the
      file itself is gone there, so nothing runs) — clean up, or let the scheduled archive take it
      `n/a` `confirmed` `checked 2026-09-03`

## release

- [ ] Every macOS download since 2026-07-23 is unopenable, and the download page sends people to
      a button that no longer appears — a routine dependency update quietly stopped the Mac build
      from being stamped at all, so macOS now rejects it as a broken app rather than an unverified
      one, and the approval step our site walks users through vanished with it. Only a terminal
      command gets past it. v1.2.4 was stamped correctly and 1.3.0-beta.72 is not; both dmgs read
      off directly. Affects releases, not just betas. It is not a one-time install hurdle either —
      the in-app update button downloads the same kind of build, so a Mac user who is happily
      using the app is walked back into the same dead end on every update. MERGED 2026-09-04
      (`youcoded` 2c369762, after a review that hardened the guard: CI now asks macOS itself
      whether the seal is valid, the packager fails the build on its own if it cannot sign, and
      the packager's minor updates are bumped by hand from now on). Open only until a Mac
      confirms the "Open Anyway" button is back on a build cut after the merge — test build run
      33921417200 was dispatched for that on 2026-09-04
      `n/a` `needs-verify` `checked 2026-09-04` `regression` → docs/active/investigations/2026-09-03-macos-beta72-unopenable-postmortem.md

- [ ] No download we publish can be checked for corruption or tampering — the release carries the
      installers and nothing else, no checksum file of any kind, so neither a user nor the app's
      own updater can tell a good download from a bad one. Verified against the 1.3.0-beta.72
      release listing
      `n/a` `confirmed` `checked 2026-09-03` → docs/active/investigations/2026-09-03-macos-beta72-unopenable-postmortem.md

- [ ] Android beta builds all claim to be version 1.2.4. The desktop test build stamps its own
      version number into every beta; the Android one never got that, so its About screen shows
      the last released number no matter how new the code is — a tester reporting a bug names a
      version that says nothing about what they were running
      `n/a` `confirmed` `checked 2026-09-03`

- [ ] REVERT WHEN 1.3.0 SHIPS: youcoded.ai's download buttons now hand out the newest release
      INCLUDING pre-releases, so visitors get the 1.3.0-beta build instead of v1.2.4 from May.
      Deliberate and temporary (Destin, 2026-09-03). On 1.3.0: put the buttons back on
      stable-only, and delete the 1.3.0-beta pre-release so it stops being what the site serves
      `n/a` `confirmed` `checked 2026-09-03` `v1.3.0`

- [ ] Re-work the release method: releases tag master directly, so every release ships the
      undifferentiated 2,370 commits accumulated since v1.2.4 (May 2026), and bug-fix minors can't
      be cut without dragging in hordes of unreleased features. Goal: keep master as the trunk,
      cut `release/vX.Y.x` branches off the last tag, and ship bug-fix minors by cherry-picking
      fixes onto them — so a minor can go out while the next major is still blocked. Caveats to
      fold in when building: every fix needs a "goes in the minor?" cherry-pick decision, and the
      one-tag-both-platforms rule (ADR 005) means even a fix-only minor must coordinate an Android
      versionCode bump and ships a paired Android build (no bare desktop-only hotfixes). Promoted to a
      1.3 blocker 2026-09-03: store listings make bug-fix releases routine, so this must exist first
      `n/a` `confirmed` `checked 2026-09-03` `v1.3`

- [ ] Landing-page live embed goes fully blurred under framed wallpaper themes — pick Meadow Mist
      from the embed's theme button and the whole app window becomes one blur; the redesign makes
      theme switching a primary interaction so this must ship with it
      `n/a` `needs-verify` `checked 2026-09-01` `v1.3.1` → docs/active/investigations/2026-09-01-landing-embed-blur-rounded-clip.md

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

- [ ] `roadmap-check.mjs --fix` edits the SHARED checkout no matter where you run it, because
      its root defaults to the script's own location rather than the current directory. Run from
      a worktree on 2026-09-04 it silently rewrote ROADMAP.md in `/home/destin/youcoded-dev`,
      where other sessions keep uncommitted work, and left the worktree it was invoked in
      untouched — the caller cannot tell, because it prints a success line either way. `--root`
      exists and is the workaround, but nothing makes you pass it. Wanted: default the root to
      the git toplevel of the working directory, or refuse `--fix` when the resolved root is a
      different checkout from the one you are standing in
      `n/a` `confirmed` `checked 2026-09-04`

- [ ] The new site header does not match the two logos nearest it, and both were consciously
      deferred on 2026-09-04 rather than decided. The header is now a glass tile with the robot
      in the theme colour and a wide-caps wordmark; the FOOTER logo a few screens down still
      wears the old solid tile and mixed-case name, and the four theme mascots directly beneath
      the header are master's newer full-bodied art while the header's robot is still the app's
      flat icon. Destin saw both and said leave them for now, so this is a decision waiting to
      be made, not a defect
      `n/a` `decision` `checked 2026-09-04`

- [ ] Landing copy note, recorded so it is not re-derived: conversation tags, private notes and
      one-tap prompt chips are unique (0 of 8 competitors on 2026-08-31) but must not lead the
      landing page — uniqueness is not the argument
      `n/a` `parked` `checked 2026-08-31`

- [ ] The demo videos on the landing page are recordings of the desktop app shrunk to phone
      width, so on a phone the app's own writing inside them is a few pixels tall — you can see
      there is an app, not what it is doing. Re-filming them framed for a phone is the fix
      `n/a` `confirmed` `checked 2026-09-03`

- [ ] On a phone the landing page's "More than a chatbot" and "How we got here" run about three
      and two full screens of unbroken text each; a first-time reader also flagged the third
      About paragraph ("outpace development of competing closed agents") as strategy talk with
      no reason to be on the page
      `n/a` `confirmed` `checked 2026-09-03`

- [ ] The asterisk on the landing page's iOS download button has no footnote anywhere near it —
      the explanation sits about ten screens further down, so someone taps it expecting an App
      Store link
      `n/a` `confirmed` `checked 2026-09-03`

- [ ] Ship v1.3 — the release mechanics: an `/audit` run, version bumps on both platforms (still
      1.2.4), a CHANGELOG 1.3.0 entry, the tag. The one product gate left is the Connected-accounts
      question filed under sync
      `n/a` `blocked` `checked 2026-09-01` `v1.3`

- [ ] Public-launch formalization is the 1.3 gate: signed macOS/Windows installers, a Play listing,
      the LLC behind every account, a trademark filing. Done 2026-09-03: youcoded.ai (site, API,
      email), the Anthropic-token fix, Android → MIT, the LLC itself (Destin's Adventures, LLC),
      EIN, DMCA agent, legal pages naming the company (youcoded#416). In the mail: trade name,
      D-U-N-S. The report's "Status" block is the current state; Destin's values are in the brain
      `n/a` `in-flight` `checked 2026-09-03` `v1.3` → docs/active/investigations/2026-09-03-formalization-costs-and-risks.md

- [ ] Windows and macOS installers still hit the security wall — nothing is signed or notarized.
      The LLC exists (2026-09-03); blocked until the Apple / Azure signing accounts are opened in its name;
      after that it is CI wiring. Mac's wall disappears at once, Windows' fades with downloads
      `n/a` `blocked` `checked 2026-09-03` `v1.3` → docs/active/investigations/2026-09-03-formalization-costs-and-risks.md

- [ ] No Google Play listing — Android installs only from a GitHub APK, and from 2027 Google requires
      a verified developer even for sideloads. Blocked on the LLC's D-U-N-S number; then the bundle
      upload, data-safety form, content rating and account-deletion link
      `android` `blocked` `checked 2026-09-03` `v1.3` → docs/active/investigations/2026-09-03-formalization-costs-and-risks.md

- [ ] Nothing tests the menus Claude Code shows AT SESSION LAUNCH, so a stuck launch only ever
      turns up when Destin opens a dev window by hand — it did again 2026-09-03, chat view
      pinned on "Initializing session..." behind CC's trust-folder prompt while terminal view
      showed it fine. These are Ink TUI menus parsed by screen-scrape
      (`renderer/parser/ink-select-parser.ts` → `PromptCard` / `TrustGate`), so they break
      whenever CC rewords one, and the app has no fixture for any of them. The perf rig resumes
      sessions by a path that skips the gate entirely, and the UI workbench has no session
      launch at all. Wants a launch-prompt fixture set — trust folder, theme picker, login
      method, model-switch safeguard — replayed through the parser and rendered, so a reworded
      CC prompt fails a test instead of hanging a session. Prior art for the failure mode:
      the 2026-07-16 "trust" substring collision in `docs/roadmap/shipped.md`
      `desktop` `needs-verify` `checked 2026-09-03` `regression`

- [ ] Perf rig records nothing about which RENDERER it got, so "the rig is blind to GPU" — repeated
      in five scenarios' `blindTo` lists and used to dismiss whole classes of finding — has never
      been verified. The app already resolves it (`main.ts` `app.getGPUInfo('complete')` →
      `auxAttributes.glRenderer`) and the rig throws it away; `/dev/dri/renderD128` is
      world-readable on this machine, so the runs may already have hardware acceleration. Record
      it in `report.machine` and the claim becomes checkable instead of assumed
      `n/a` `needs-verify` `checked 2026-09-03` `performance`

- [ ] Perf rig cannot see per-TOKEN streaming cost, so perf cycle 1 can never be re-gated and the
      known buddy-window twin has no detector. Measuring TIME needs a native stream and is hostage
      to local-model speed; measuring WORK does not — cycle 1's defect was one forced layout per
      token, and the CDP `Performance` domain the rig already calls exposes layout and
      style-recalc counters. Count layouts per streamed delta and the defect class becomes an
      exact integer, not a noisy duration (confirm the counter names on first use)
      `n/a` `needs-verify` `checked 2026-09-03` `performance`

- [ ] Perf rig cannot see CONTENT ARRIVING LATE, which is the class that hid perf cycle 3's
      pop-in through three clean measurement runs until Destin scrolled slowly and saw it
      (2026-09-03). It is countable rather than visual: while scrolling, count entries that are
      inside the viewport but still rendering as a spacer — that number must always be zero.
      Generalises past folding to any lazy render: is anything late to the screen?
      `n/a` `needs-verify` `checked 2026-09-03` `performance`

- [ ] The close-out check reports a fully merged, fully pushed branch as "never pushed" when the
      merge commit's message was written by hand instead of left as git's default, because it looks
      for the branch's name in that message. Happened on the voice merge 2026-09-05, where the
      message was rewritten to describe the feature for Destin. Matching the commit rather than the
      words would fix it; so would always keeping the branch name in the message
      `n/a` `confirmed` `checked 2026-09-05`
