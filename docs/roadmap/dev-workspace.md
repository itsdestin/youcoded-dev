# dev-workspace — building the app, not the app
Filing test: it's about building the app, not the app. Could a normal user ever see it? No.
Not here: a failing or flaky test — fix it on sight (CLAUDE.md → Local build & test).
seen-on is always n/a here.

## tests

- [ ] Flaky and load-sensitive tests: 9 that fail on CI or only in full-suite runs.
      (a) Windows CI: two import-file "failed copy rollback" cases sometimes report "skipped" instead
      of failing; one green re-run so far; (b) the specialist background-completion test timed out
      once on Windows (15 s budget); (c) two tests failed only under full-suite load (waiting line
      clears; resume pre-fills last model); (d) the shell-registry "still-running marks" test goes red
      on every run on this machine because it counts real milliseconds; (e) three different
      step-guard-row tests flaked in full runs only, on four unrelated branches; (f) three suites fail
      their own cleanup on macOS/Ubuntu CI ("ENOTEMPTY") after passing, which can block a good PR;
      (g) macOS-only: a finished background command's notice arrives without its output; if real, a
      slow machine shows "finished" with nothing; (h) the desktop CI job exits red with every test
      passing ("Closing rpc" error); (i) subagent-view and mcp-startup-wiring never failed in 27 local
      runs: trigger unknown, or already fixed
      `n/a` `confirmed` `P3` `checked 2026-09-02` `regression`

- [ ] Test-suite cleanup work: 8 things left over from the simplification plans.
      (a) ~330 startup-only or rarely-used blocking calls still sit in the unreviewed bucket of the
      blocking-call test (report: docs/active/investigations/2026-09-24-main-blocking-calls-triage.md);
      (b) finish Plan C, test files grouped by feature: part doable now, part blocked until
      `feat/specialists-plans-ui` merges; 892 → 783 files so far (plan:
      docs/active/plans/2026-09-16-ci-followups-C-test-consolidation.md); (c) 102 fixed sleeps still
      stand in for real signals (report: docs/active/investigations/2026-09-01-fixed-sleeps-and-mcp-wiring-import.md);
      (d) 57 test files are excluded from the test type-check (201 errors); (e) the lint gate leaves 79
      floating promises and 43 exhaustive-deps hits unguarded; (f) 26 more tests read app source as
      text and were never classified, plus two exemption lists that can silently disagree; (g) no
      bundle-size budget, no view of oversized window-to-main messages, no nightly coverage ratchet
      (report: docs/active/investigations/2026-09-16-simplification-audit.md); (h) duplicated chat-line
      listeners, a third history reader and a repeated divider test remain after the one-core work
      `n/a` `confirmed` `P3` `checked 2026-09-01`

- [ ] Test and check gaps: 8 places where nothing guards a behaviour.
      (a) the Office add-on's early editor script is tested only for what it blocks, not for leaving
      ordinary editor features working; (b) the quick local check skips tests that read files outside
      `desktop/` (Android manifest, workspace files), so it says "tests: none" while CI would fail;
      (c) on a Mac, a new file, a theme edit and a session title may miss a change made right after
      watching starts (audited, not reproduced; report: docs/archive/investigations/2026-09-01-sync-engine-debounce-macos-flake.md);
      (d) feature-flow coverage debt: contract table, verdict column, corrupt verdicts file untested;
      (e) review-deck tests print warnings that bury failures and never test a build failure;
      (f) the phone's presence client has no test harness; (g) the voice install's "runs no other
      program" guard misses `execSync`, `fork` and `require('child_process')`; whether to widen it is
      Destin's call; (h) nothing replays Claude Code's launch menus (trust folder, theme, login,
      model safeguard), so a reworded prompt hangs a session instead of failing a test
      `n/a` `confirmed` `P3` `checked 2026-07-22` `regression`

- [ ] Cross-platform first-run testing: 5 open pieces.
      (a) the full first-run, setup and sign-in pass is untested on the Ubuntu guest, its deb/rpm/pacman
      installers, and the winget-only flows (Tailscale, rclone, `gh`) on Windows without App Installer;
      (b) Linux AppImage needs libfuse2 (stock Ubuntu 22.04+ lacks it) and taskbars may not tie the
      window to YouCoded's icon; (c) the Linux app catalog page (request #8053) needs a `/retest` and a
      reply in Destin's name after the next release; ask him first; (d) the VM helper's Mac `load`
      answers "nothing matched" for some builds and fails on file names with spaces; (e) the macOS 26 VM
      has no saved "ready" state, so every start is a ~5 minute cold boot
      `n/a` `confirmed` `P3` `checked 2026-10-01`

## rigs

- [ ] Dev instance: 11 faults where it touches the real app or its launcher fails.
      (a) a dev instance writes its pinned-pages list into the real Personal folder under a fake device
      id, which can sync to other devices; (b) removing a provider in a dev window removes it from the
      real app; (c) picking a theme in a dev window (or a connected phone) changes the live app's next
      theme; (d) the cross-device sync state file is shared, so two apps can write it at once; (e) a dev
      window silently rewrote the real app's engine settings (backend flipped to "rocm" overnight);
      Destin decides which files a dev instance shares before any build; (f) wanted: a dev instance that
      starts signed in with the real app's keys and a borrowed ChatGPT sign-in; Destin: "it's sometimes
      annoying to add separate api keys and such for a quick test"; (g) Stop lists the dev instance's own
      `claude` children without marking them; (h) the launcher has no reliable stop and leaves its Vite
      server (even on port 5173) holding a port, so the next launch dies; (i) a bad `--offset` fails late
      with a bare "Port in use" naming nobody; (j) three copies of "which checkout?" each know different
      layouts; the launcher's own copy is the odd one
      `n/a` `confirmed` `P2` `checked 2026-09-05`

- [ ] Screenshot, review-deck and workbench tooling: 10 faults.
      (a) the before/after check shows "nothing moved" for live steps (18 empty pages sent to Destin);
      (b) the headless page check shows Word/Excel/PDF/image viewers stuck on "Loading viewer…" unless
      `--wait` is used; (c) two Office screenshot runs from one checkout share one editor server, so the
      second fails; (d) deck preview silently clips What changed / You'll notice / Risk cards at smaller
      windows; (e) two specs in one feature folder can share a key, caught only hours later; (f) the drag
      sweep crashes writing its frame dump on a 60-drag run; (g) wanted: a before/after diff card, so an
      "approve these edits" question stays in the deck; (h) screenshot drivers lack touch and 1.5× scale
      (real mouse input already exists in `explore`); (i) eleven workbench `?switch=` values were never
      booted by the boot check; (j) terminal text wraps at about two-thirds width, only ever seen in the
      review rig (report: docs/active/investigations/2026-09-01-terminal-pty-column-count.md)
      `n/a` `confirmed` `P3` `checked 2026-09-02`

- [ ] Workspace tooling friction: 6 things.
      (a) wanted: one-off scans with Fallow and React Doctor before anything is added; Destin: "optimize
      tf out of our workspace"; (b) the CI-red-vs-master script lists Windows-only failures as "NEW" on a
      Linux job; (c) a 526-line conversation-triage script sits on `chore/conversation-triage-script`:
      merge it or delete the branch; (d) committing a workspace doc takes six manual steps and leaves
      residue in the shared checkout; (e) the app's log is in Claude Code's folder, nobody finds it, and
      it keeps only 500 lines; (f) the harness evaluator has no CI gate and hand-written eval cases
      `n/a` `confirmed` `P3` `checked 2026-08-26`

- [ ] The feature flow (questions deck, review rounds, contract, graded acceptance) is built but has
      never run end to end on a real feature. The first small UI feature Destin asks for is the trial;
      its handoff records rounds, Destin-seconds, reopens and failed acceptance rows
      `n/a` `in-flight` `P3` `checked 2026-09-02` → docs/active/plans/2026-09-01-feature-flow-plan.md

- [ ] Session-strip motion review: re-author as live pick-one steps. The four before/after clip steps
      were "just rough to compare"; needs a design session naming the built behaviour as one real
      candidate among alternatives. In progress in another session on branch feat/session-strip-motion
      (Destin, 2026-09-02)
      `n/a` `in-flight` `P3` `checked 2026-09-02`

## knowledge

- [ ] Session work lost or stranded: 6 ways a session's work or worktree goes missing.
      (a) a finished session's manifest is never removed (179 of 198 stale), poisoning its key;
      (b) a worktree vanished mid-session with its branch and manifest, taking the only copy of the work;
      it recurred 2026-09-23 (report: docs/active/investigations/2026-09-20-session-worktree-disappeared-mid-session.md);
      (c) workspace-start will not resume after post-merge cleanup removed a component worktree;
      (d) a fresh worktree came up missing a package its lockfile names (fifth time; cause unknown);
      (e) close-out says "the work landed" and suggests deleting a worktree that holds uncommitted edits
      (recurred 2026-10-06 on voice-custom-vocabulary; no cleanup performed);
      (f) work still lives on one disk only: a complete implementation sat uncommitted 14 hours, and a
      committed but unpushed branch was lost across machines
      `n/a` `confirmed` `P1` `checked 2026-09-13` `regression`

- [ ] Roadmap and docs drift: 9 upkeep items.
      (a) nine roadmap items point at reports whose proof no longer matches the code; re-check each;
      (b) a Worker setting can exist only as a test value; wanted: an anchors check on the Worker's
      optional fields; (c) the design guide has two G-22 rules (renumbered on `session/convo-tab-lag`;
      close when it merges); (d) recheck the old cleanup handoff's remaining unused-code ideas;
      (e) the roadmap checker reads whatever sub-repo copy is on disk, so stale checkouts keep fixed
      bugs "confirmed"; (f) every branch filing a roadmap item conflicts on the ROADMAP.md table;
      (g) two 2026-07-28 guardrails unshipped: spec counts undated, and `run-dev.sh --list` shows
      worktrees not running instances; (h) no "review the attached document" command, longer plans,
      worktrees in five places; (i) the archived youcoded-core status line still references a deleted
      script
      `n/a` `confirmed` `P3` `checked 2026-09-02`

- [ ] Path-scoped rules not reaching sessions: 2 findings.
      (a) a whole session edited files a rule covers and the rule never loaded; the Bash-only
      explanation was wrong or partial; the working directory sitting at the workspace root is the
      untested suspect; (b) sessions editing through Bash get no rules and cannot tell; wanted: a
      non-blocking hook or a `rules-for <path>` command, after measuring the noise
      `n/a` `needs-verify` `P3` `checked 2026-09-03`

- [ ] We can see how many people open the app and nothing else. The daily ping carries a device,
      version, platform and country, so we cannot tell which features get used, where people give up in
      setup, or what they did before they stopped coming back. Destin was shown the gap 2026-09-13 and
      parked it as its own conversation
      `n/a` `confirmed` `P2` `checked 2026-09-13`

- [ ] Parked ideas: 10 dev-workspace ideas.
      (a) run the new-user path (download, install, setup, sign-in, first chat) on real Windows, Mac and
      Linux machines in CI; Destin: "could be interesting to set up"; (b) a baseline-and-diff check for the
      renderer's chrome invariants; (c) measure whether the feature flow's two reviewers earn their cost
      after three features; (d) workbench serves community theme folders so decks show real previews;
      (e) attach your own screenshot to a review-deck step; (f) merge the conflicting planning, design,
      review and wrap-up routes (report: docs/active/investigations/2026-09-05-native-guidance-followups.md);
      (g) check the one-word state on plans, specs and investigations (15 archived ones are off-list);
      (h) measure whether a third adversarial design-review round helps or churns; (i) move the two
      leftover specs out of `youcoded/desktop/docs/` and fix two pointers; (j) the 2026-07-10 review's
      unpicked clean-ups: xterm WebGL detach, folder-list canonicalising, big-file splits (report:
      docs/active/handoffs/2026-07-10-review-followups.md)
      `n/a` `parked` `P3` `checked 2026-07-15`

## release

- [ ] The public Office add-on repo (youcoded-office) once held a personal budget memo of Destin's as a
      test file. History was rewritten and current files and the v0.1.0 tag are neutral, but GitHub can
      keep serving the old commit by address, and early clones still have it, until GitHub support
      purges it. No support request is recorded and whether the old address still loads was not tested
      `n/a` `needs-verify` `P2` `checked 2026-10-02` `security`

- [ ] Mac installers: nothing is signed or notarized, and a Mac download may open as "broken".
      Since 2026-07-23 a dependency update stopped the Mac build being stamped, so macOS rejects it and
      the "Open Anyway" button vanished (terminal command only; in-app updates hit it too). Fix merged
      2026-09-04 (build checks its own seal, fails if it cannot sign); still open: a Mac confirming
      "Open Anyway" is back on a build cut after it (test run 33921417200). Signing is blocked: Apple
      refused the LLC's account on 2026-10-01; retry from an Apple device or via Apple Support, then it is
      CI wiring. Windows is done (signed "Destin Moss"). (report:
      docs/active/investigations/2026-09-03-macos-beta72-unopenable-postmortem.md)
      `n/a` `blocked` `P1` `checked 2026-09-04` `regression` `v1.3.1` → docs/active/investigations/2026-09-03-formalization-costs-and-risks.md

- [ ] Waiting on CI runs eats whole sessions. Destin, 2026-09-20: "just fixing a few minor test
      issues and such has seemingly eaten over an hour of our time today just waiting around on
      runs. is there any way we could improve this in the future for better/faster iteration and
      fixes?" Two answers he liked, neither built: (1) a NIGHTLY rehearsal build from master that
      publishes nothing and notifies on failure (the launch check runs in no other workflow and sat
      broken from 2026-09-16); (2) a way to run ONE test file on ONE OS instead of a ~15-minute
      three-OS matrix
      `n/a` `confirmed` `P1` `checked 2026-09-20` `v1.3.1`

- [ ] Re-work the release method: releases tag master directly, so each ships all ~3,200 commits since
      v1.2.4 and bug-fix minors cannot go out alone. Goal: cut `release/vX.Y.x` branches off the last tag
      and cherry-pick fixes, so a minor ships while the next major is blocked. Caveats: a "goes in the
      minor?" decision per fix, and one-tag-both-platforms means an Android versionCode bump and paired
      Android build. A 1.3 blocker since 2026-09-03; off 1.3.1 in Destin's triage 2026-09-23
      `n/a` `confirmed` `P2` `checked 2026-09-03`

- [ ] No Google Play listing — Android installs only from a GitHub APK, and from 2027 Google requires
      a verified developer even for sideloads. The LLC's D-U-N-S number arrived 2026-09-10, so this is
      unblocked: next the Play developer account in the LLC's name, then the bundle upload,
      data-safety form, content rating and account-deletion link. Destin 2026-10-01: "google play
      isnt priority" — Apple and Windows signing first (reverses 2026-09-10's deck Q-3)
      Destin 2026-10-05 triage (roadmap-triage-2026-10-05#2): "1.3.2+. not a current priority just yet"
      `android` `parked` `P2` `checked 2026-10-01` `v1.3.2` → docs/active/investigations/2026-09-03-formalization-costs-and-risks.md

- [ ] Release and build upkeep: 6 loose ends.
      (a) wanted: a scheduled check that every id in the model switcher's recommended list is still
      current, reporting renames and new "latest" aliases (Destin 2026-09-20: roadmapped, not built);
      (b) a one-line `announcements.txt` change runs the full ~20-minute Linux build; widen the skip gate
      to files no build step reads; (c) installers ship test and workbench files (47 + 19 in 1.2.4;
      weight only; report: docs/active/investigations/2026-09-01-asar-ships-tests.md); (d) PDF reading
      needs one smoke test in a packaged build; (e) dependency majors that are real work: TypeScript 7,
      okhttp 5.5, org.json; (f) Android toolchain: AGP 9.4 and compose-bom 2026.08 are open and red;
      re-run them together now that Kotlin is in
      `n/a` `confirmed` `P3` `checked 2026-09-01`
