---
status: active
date: 2026-10-13
branch: session/ui-consistency-audit
reviewed: app e57a88f97 · workspace 56a8ab9c · wecoded-marketplace 4b95e65
---

# UI consistency audit — final independent review

This was a read-only review: no code was changed. Paths are relative to `youcoded/desktop/src/` unless they start with a repo name. Line numbers marked `~` are approximate.

Findings marked **PLAUSIBLE** were found by reading the code but not reproduced in a run.

## Checks run

- **`bash scripts/verify.sh youcoded`** passed every check: types, test types (0 excluded), the FULL test suite (forced because `package.json` changed), knip, oxlint, design lint ratchet, ast-grep invariants, `shoot --check` and journeys. The machine load was 2 at the start and 22 at the end.
- **Android:** `./gradlew testDebugUnitTest -x bundleWebUi` with JDK 21 and the SDK present. `app/build/test-results` reads 601 tests, 0 failures, 0 errors; `HiddenPresenceTest` ran 6 tests, all passing. The results were already up to date for the current inputs.
- **Worker:** `vitest run test/presence-hidden.test.ts` passed 7 of 7.
- **Docs and roadmap:**
  - `node scripts/audit-anchors.mjs` passed its mechanical checks: 572/572 anchors and 1056/1056 MAP paths. Only warnings remain (see F57).
  - `roadmap-check` found 0 broken claims.
- **Targeted suites, run by the sub-reviewers:** presence-socket, social-handlers-hidden-presence, use-presence, task-state, OpenTasksPopup, useSessionTasks, DevelopmentDesign, folders-service, try-again-wording, use-enter-to-confirm, enter-to-confirm-authority, error-state, callout-authority, close-session-prompt, drawer-resize, ModelPicker, SessionDetails, ResumeBrowser, MarketplaceScreen, look-overrides, 20 channel/parity files, and legal-pages with `gen-legal-pages --check`. All passed.

**Overall:** there is no data-loss path, and nothing deletes user files or GitHub content. The Worker's hidden mode is sound. There is one blocker: existing users' themes change. The main weaknesses are:
- the incognito clients' fallback edges;
- approved decisions that are only partly built (full-screen title bars, control roundness, item cards, 9px text);
- the docs repoint at a guide that is still marked draft.

**Deploy order:** merge and deploy the Worker *before* any app build that carries incognito ships. See F2 for the reason.

## Findings (most severe first)

1. **BLOCKER: existing users who never picked a theme are switched to the new YouCoded theme on upgrade.**
   - **Where:** `renderer/state/theme-context.tsx:95-104,277`, plus the fallbacks at `:439` and `:676`.
   - **What's wrong:**
     - The comment says "Only a NEW install reads this — anyone with a stored theme keeps it". But master only wrote `youcoded-theme` to localStorage and `appearance.json` inside `setTheme`.
     - A user who has always run on the implicit default (`'midnight'`) has no stored key. That user falls through to `defaultThemeSlug()`, which returns `youcoded` or `youcoded-night` depending on the OS light/dark setting.
     - Confirmed: master's `theme-context.tsx:52,226` uses `getStored(STORAGE_KEY, 'midnight')`. No main-process code writes a default theme (grep of `main/`).
   - **Failure scenario:** a long-time Midnight user on a light-mode OS updates and opens to a light lavender theme with a wallpaper. They never asked for that. The default theme cycle also changes, from `['midnight','dark']` to the YouCoded pair. The owner approved this look for *new installs* only.
   - **Fix:** tell an upgrade from a new install, for example by an existing `appearance.json`, an existing `userData`, or a first-run-complete flag. For upgrades, pin `'midnight'` and the old cycle. Or write the old implicit default once, in a release before this one.
   - Not reproduced: confirm with a dev profile that has no `youcoded-theme` key.

2. **SHOULD-FIX (privacy, until the Worker deploys): turning incognito on while already connected opens the hidden connection *before* the server is asked whether it supports hidden.**
   - **Where:** `main/social-handlers.ts:242-251`; `main/presence-socket.ts:215-222`.
   - **What's wrong:**
     - `presenceConnect` calls `presence.setHidden(true)` and only then awaits `probeHiddenPresence()`.
     - `setHidden` ends in `applyDesire()`. If the user was already connected, this opens the `?hidden=1` socket at once.
     - The test "switching to hidden closes the visible connection before opening the hidden one" pins this order.
   - **Failure scenario:**
     - The app ships while the Worker is still the old version, and the user switches incognito on.
     - The old server ignores `?hidden=1`. It announces the user online to friends and writes "last seen: just now".
     - Only then does the client see that no hello came first, and disconnect.
     - Android probes first, so it does not have this problem.
   - **Fix:** `setHidden` should only close the socket and set the flag, not call `applyDesire()`. Let `setDesired(true)` open the socket after the probe succeeds. Also deploy the Worker first.

3. **SHOULD-FIX (Android, PLAUSIBLE): incognito can disconnect itself on a good server.**
   - **Where:** `app/.../social/PresenceClient.kt:149-157` vs `:161-181`.
   - **What's wrong:** `onOpen` resets `helloSeen = false` through `handler.post` on the main looper. `onMessage` sets it to true on OkHttp's thread. If the posted reset runs after the hello was handled, the next frame (the snapshot) reads as "not confirmed".
   - **Failure scenario:** when the phone is busy, an incognito user intermittently sees no friends and "who's online is hidden". `HiddenPresenceTest` covers only pure helpers, so it cannot catch this.
   - **Fix:** reset `helloSeen` in `connect()` before `newWebSocket`, or keep it per socket.

4. **SHOULD-FIX (copy and recovery): a failed hidden check turns presence off for good, and the words invent a reason.**
   - **Where:** `main/social-handlers.ts:243-247`, `PresenceClient.kt:99-105`, `renderer/components/game/FriendsPanel.tsx:148-149`.
   - **What's wrong:**
     - Any probe failure calls `setDesired(false)` with no retry and no Try again: a 5 s timeout, a flaky network at launch, or a 5xx.
     - The panel then reads "N friends · who's online is hidden", which implies a choice rather than "couldn't check".
   - **Failure scenario:** the user starts the app on bad Wi-Fi in incognito and sees no one online until they restart.
   - **Fix:**
     - Separate a definite "server too old" (404) from "couldn't reach it".
     - Retry the second case with backoff, or show the notice with Try again.
     - Reword to something true, such as "Couldn't check who's online".

5. **SHOULD-FIX (privacy fail-open): if the incognito preference can't be read, the app connects visibly.**
   - **Where:** `renderer/hooks/usePresence.ts:~50-60`. The `.catch` sets `incognitoLoaded=true` with `incognito=false`.
   - **Failure scenario:** a user who chose incognito has a failed preference read, and is announced online.
   - **Fix:** fail closed. Stay disconnected, or connect hidden, until the preference is known.

6. **SHOULD-FIX (PLAUSIBLE): Open tasks keep TodoWrite items after `/clear`.**
   - **Where:** `renderer/state/task-state.ts:150-215`; `chat-reducer.ts` `CLEAR_TIMELINE` (~3337) keeps `toolCalls`.
   - **Failure scenario:** after `/clear`, the chip still says "3 pending" for a list the new context doesn't own. It stays that way until the model writes a new list.
   - **Why it matters now:** this is more visible now, because TodoWrite is the native runtime's only task tool.
   - **Fix:** ignore task calls from before the latest clear marker, or keep a task epoch.

7. **SHOULD-FIX: removing a synced project is left half-done if the marker file can't be written.**
   - **Where:** `main/sync-spaces/service.ts:~620-630`.
   - **What's wrong:** the order is `setProjectStopped` → `markProjectRemoved` → update `removedNames` → push → `engine.removeSpace`.
   - **Failure scenario:**
     - The marker write throws, either from a disk error or because `isSafeName` rejects the name.
     - The stop has already been written and will push to every device, but the space stays attached and listed here.
     - The dialog says it couldn't be removed.
     - No data is lost, and retrying works.
   - **Fix:** validate the name and write the marker first, or always detach after the stop.

8. **SHOULD-FIX: the Remove dialog can get stuck open after a successful remove.**
   - **Where:** `renderer/components/project-view/ProjectView.tsx:~646` (`confirmDelete`).
   - **What's wrong:** after `removeProject` succeeds, the code awaits `folders.remove()` and `listProjectsIndex()` with no try/catch.
   - **Failure scenario:** either call rejects. The dialog stays open with an empty error line, even though the project is already gone.
   - **Fix:** catch around both calls and still close the dialog.

9. **SHOULD-FIX (copy): "leaves your project lists on all your devices" promises more than happens.**
   - **Where:** `RemoveProjectDialog.tsx`; `main/sync-spaces/project-registry.ts`, which documents that older builds see only the stop.
   - **What happens:**
     - A device on an older build keeps listing the project as "Sync stopped".
     - A device with sync turned off never gets the marker.
     - Offline devices catch up later.
   - **Fix:** word it as "…on your other devices once they're up to date and online", or accept the gap and note it.

10. **SHOULD-FIX (approved decision only partly built): full-screen title bars.**
    - **Decisions:** "Full-screen titles" (decisions.md:14) and "Way back to chat" (:18). Guide:100-103.
    - **What the code does:**
      - Marketplace (`components/marketplace/MarketplaceScreen.tsx:447-491`) and Library (`components/library/LibraryScreen.tsx:182,209-216`) still have a left-aligned `text-xl` h1 and a ghost exit button. Neither uses `ScreenBand`.
      - `ScreenBand.tsx:58-77` reads "Back to chat · Esc", with the key last, in an inset pill rather than a filled button.
      - Projects passes no icon (`ProjectView.tsx:801`).
    - **Effect:** the four full screens show three different title and exit looks.
    - **Possible cause:** row :114 says "Page titles unchanged". That row concerns the rail headings, but it may have been read as cancelling :14. Ask Destin which he meant.
    - **Fix:** move both screens onto `ScreenBand`. Make the exit a filled small "Esc · Back to chat" button, key first. Give Projects its icon.

11. **SHOULD-FIX (approved, not built, and not listed as a deviation): theme-driven control roundness and the medium card shadow.**
    - **Decisions:** "Control shape follows the theme", "Default roundness level", "Card look", "Card shadow". Guide principle 2, "Buttons" and guide:310.
    - **What the code does:**
      - `styles/globals.css:42-49` still sets `--radius-lg: 12px`.
      - `--radius-control` exists only in `dev/workbench/proposals/shape-round.css`.
      - Tabs, filter chips and search boxes hard-code `rounded-full`: `ui/SegmentedTabs.tsx:62`, `ui/FilterChip.tsx:21`, `ui/SearchFilterPill.tsx:91,103`, `ProjectView.tsx:900,913`, `FileFilterPopover.tsx:50`.
      - The card shadow is still `0 8px 32px` (`globals.css:1379`).
    - **Effect:** the guide describes a look the shipped app doesn't have.
    - **Fix:** implement it with tokens set on the built-in themes, or list it under Known deviations and file a roadmap item.

12. **SHOULD-FIX (approved, not built): item-card text order and chip row.**
    - **Decisions:** "Item card text order", "Item card chips", "Card chip row".
    - **What the code does** (`components/marketplace/MarketplaceCard.tsx:158-166,276-300,456,477-486`):
      - The compact card puts the blurb above the chips.
      - The footer numbers are plain dim words, not chips.
      - The chip row is `flex-nowrap`, with no scroll and no end fade, so it clips.
      - The status pill sits in a side column.
    - **Fix:** follow the approved order and chip row, or record the deviation.

13. **SHOULD-FIX: the file viewer's "Unsaved changes" popup has three filled buttons.**
    - **Where:** `components/artifact-views/UnsavedChangesDialog.tsx:46-62`.
    - **What's wrong:**
      - It is a hand-built `OverlayPanel` with no ✕.
      - `Button` without a variant defaults to primary (`ui/Button.tsx:235`), so Cancel, Discard and Save are all filled.
    - **Context:** `UnsavedBeforeQuit.tsx` was rebuilt per the close-session decisions. This second popup, reached from SessionDrawer and FilesTab, was missed.
    - **Fix:** rebuild it on `Dialog` with the same pieces: Keep editing filled, Discard red, Cancel outlined.

14. **SHOULD-FIX: text smaller than the approved 11px minimum survives in about 20 places.**
    - **Decision:** "Smallest text". Guide: "the status bar included".
    - **Where:** `--text-4xs: 9px` (`globals.css:411`) is still used in:
      - `TagChip.tsx:78,84`
      - `SessionStrip.tsx:245,2534,2673`
      - `SyncPanel.tsx:203,210,1522,1525`
      - `SkillCard.tsx:69,83`
      - `ThemeCard.tsx:107`
      - `LookSettings.tsx:166`
      - `NoteEditor.tsx:56`
      - `SessionCardDetails.tsx:74`
      - `StatusBar.tsx:1541`
      - `UserMessage.tsx:110`
      - `AssistantTurnBubble.tsx:515,607`
      - `globals.css:1810`, the minimal status bar at `font-size: 9px`
    - **Fix:** map `4xs` to 11px and re-check the tight spots, or write the exemption into the guide.

15. **SHOULD-FIX: spacing outside the approved scale (8px rows, 16px groups).**
    - 6px rows remain at:
      - `assistant-settings/pages.tsx:261-265`, whose comment still says 6px
      - `SessionNaming.tsx:62,95`
      - `ContextSettings.tsx:18`
      - `LookSettings.tsx:219,272`
    - 20px gaps (`space-y-5`) remain at:
      - `SpecialistsSection.tsx:169`
      - `PermissionsSection.tsx:397`
      - `ThemeScreen.tsx:141`
      - `SessionContextPopup.tsx:383`
      - `AssistantSettings.tsx:361`
    - The comment at `SettingsPanel.tsx:1778` still describes `space-y-6`.
    - **Fix:** move these onto the scale.

16. **SHOULD-FIX: popups not moved to the shared title and ✕.**
    - Decision "Popup and side-panel titles" names "Add a project".
    - `components/project-view/AddProjectModal.tsx:125-135` is hand-built, with no ✕ and no tapered line, and non-standard cards.
    - Two others have the same problem and use 18px titles (the guide says 16px):
      - `ImportFileDialog.tsx:80-91`
      - `HowContextWorksPopup.tsx:146,305`
    - **Fix:** move all three onto `Dialog`.

17. **SHOULD-FIX: full-width lines inside cards.**
    - **Rule:** "Card levels" and the guide's "No line crosses the full width".
    - **Where:**
      - `StatusBar.tsx:786` puts `divide-y divide-edge-dim` inside a `CARD_LEVEL_1`.
      - `SessionContextPopup.tsx:147,188` and `UsageCard.tsx:273,302` use card-internal `border-t` lines.
    - **Fix:** use spaced rows instead of dividers.

18. **SHOULD-FIX: the floating rename error is now see-through.**
    - **Where:** `components/SessionDrawer.tsx:1078`, using the new `FieldError` (`ui/states.tsx`) with a 10% red tint.
    - **What's wrong:** this caller floats the error with `absolute … z-10` over the file list.
    - **Failure scenario:** a failed rename draws a translucent box, and the file rows show through it.
    - **Fix:** give it a solid backing, or place it under the field in the normal flow.

19. **SHOULD-FIX (error standard): the crash screen shows raw JavaScript text and has no Report bug.**
    - **Where:** `components/ErrorBoundary.tsx:~35` uses `explainer={this.state.error.message}`.
    - **What's wrong:**
      - A render crash has an unknown cause. `docs/error-message-standards.md` asks for general wording plus Report bug and Diagnose.
      - "Try again" just re-renders the same broken screen.
      - This predates the branch, but the branch re-drew it in the new notice box.
    - **Fix:** show a fixed general sentence and put the raw text behind Details. Add `onReportBug` and `onDiagnose`.

20. **SHOULD-FIX (copy accuracy): "Pin to top" promises to keep the session at the top of the active sessions list, but that list never sorts by it.**
    - **Where:** `components/tags/SessionDetails.tsx` (`SessionListsCard` hint). Only `resume-browser-filters.ts:67-68` sorts by `priority`. `SessionStrip.tsx:275` only draws a pin mark.
    - **Failure scenario:** the user pins an open session and nothing moves.
    - **Fix:** the wording was Destin's (CS3-3), so ask him. Either sort pinned live sessions first, or change the hint to "…at the top of Resume".

21. **SHOULD-FIX (docs): the four uncommitted guidance edits point always-loaded instructions at a guide still marked draft.**
    - **Where:**
      - `docs/active/design/2026-10-13-ui-design-guide.md` has `status: draft` and says it replaces the old guide "once Destin approves this guide".
      - The old `2026-08-25-ui-design-guide.md` is still `status: active` and not archived.
      - `docs/active/plans/2026-09-21-ui-ux-consistency-audit.md:6,16` says the old guide "is archived".
      - `docs/roadmap/dev-workspace.md` knowledge item (c) refers to the old guide's G-22 rules.
    - **What's right:** every path the four edits name exists.
    - **Fix:** in one commit, set the new guide to `active`, archive the old one with a pointer, and correct the plan and roadmap lines. Or hold the repointing until Destin approves the guide.

22. **SHOULD-FIX (docs): MAP doesn't cover the branch's new pieces.**
    - **Where:**
      - The `docs/MAP.md` "UI control primitives" row says "(20 primitives)", but `components/ui/` now has 35 files. It names none of Menu, Pill, FoldRow, Slider, ConsentRow, FilterMenuChip, and doesn't point at their tests.
      - `FriendsPanel.tsx` is missing from the games row and the "where is X" table.
      - `RemoveProjectDialog.tsx` and `RemovedProjectsCard.tsx` appear nowhere.
    - **Fix:** update those rows.

23. **SHOULD-FIX (tooling, PLAUSIBLE): two shoot runs started together can still share one Office editor.**
    - **Where:** `scripts/shoot/office-editor.mjs:~62-95`, the same problem commit 56a8ab9c set out to fix.
    - **What's wrong:**
      - Both runs see port 4717 free and both start a server.
      - The loser's child exits.
      - Its wait loop asks `whoServes(port)` *before* checking `exited`, sees the winner's server for the same desktop, and takes it as its own (with `stop(){}`).
    - **Fix:** accept a server only while our child is alive or reports our pid. Otherwise retry on `freePort()`.

24. **SHOULD-FIX (tooling): the Office editor child is left running after Ctrl-C or a killed verify.**
    - **Where:** `scripts/shoot/shoot.mjs:135` (`finally`) and `:72` (`die()` → `process.exit`). There are no signal handlers.
    - **What's wrong:** each run now starts a fresh server on a new port, so orphans pile up. Browsers have `sweepLeftovers`; the editor child has nothing like it.
    - **Fix:** add SIGINT, SIGTERM and exit handlers, or record the pid for the sweep.

25. **MINOR: a frame from the old connection can briefly drop a fresh incognito connection (desktop).**
    - **Where:** `main/reconnecting-ws.ts:108` has no supersede guard on `message`, unlike `close`.
    - **What happens:** a late frame from the old visible socket is read as "not confirmed", which tears down the new hidden socket and emits `hidden-unsupported`. It reconnects afterwards, so the user sees a flicker.
    - **Fix:** ignore frames from a superseded socket.

26. **MINOR: two quick incognito toggles can leave the wrong state (desktop).**
    - **Where:** `main/social-handlers.ts` `presenceConnect`.
    - **What happens:** a stale `hidden:true` call whose probe fails runs `setDesired(false)` after a newer visible connect has succeeded.
    - **Fix:** re-check the current mode after the await. Android already does this.

27. **MINOR (PLAUSIBLE): incognito state is per window and read once at mount.**
    - **Where:** `renderer/hooks/usePresence.ts`, `App.tsx:931`.
    - **What happens:** toggling in a window that doesn't own the connection, or from a remote phone, doesn't reach the window that does. This predates the branch, but privacy now rests on it.
    - **Fix:** broadcast changes to the preference.

28. **MINOR (Worker): a hidden opponent counts as gone for the forfeit check.**
    - **Where:** `wecoded-marketplace/worker/src/social/presence-room.ts:511` (`handleGameForfeit` uses `liveSocketsFor`).
    - **What happens:** a hidden player who joined by code can lose to a false forfeit claim. `game-result` and `game-forfeit` from hidden sockets are not in the refused list.
    - **Fix:** count raw live sockets for the forfeit check, or refuse those two from hidden sockets.

29. **MINOR (Android): a failed re-probe while already connected hidden leaves the socket open.**
    - **Where:** `PresenceClient.kt:103`. It sets `desired=false` without `closeCurrent()`.
    - **What happens:** the socket stays open while the UI says disconnected. Desktop closes the socket.
    - **Fix:** call `closeCurrent()`, matching desktop.

30. **MINOR: `presenceSend` reports success for frames it silently drops while hidden.**
    - **Where:** the client's `HIDDEN_BLOCKED` path.
    - **Context:** the renderer already guards these sends. The success reply contradicts the "honest receipt" comment.
    - **Fix:** return a refusal.

31. **MINOR (PLAUSIBLE): a removed project can reappear briefly.**
    - **Where:** `main/sync-spaces/service.ts` `refreshRemoved` (~592).
    - **What happens:** a discovery read that began earlier overwrites `removedNames` with the old set after a remove. The project shows again until the next pass.
    - **Fix:** merge in local additions, or serialize the two.

32. **MINOR: "Open on GitHub" may point at a repo that doesn't exist.**
    - **Where:** `service.ts` `githubPageFor` (~607).
    - **What happens:** with no local remote, the link is the Personal account plus the derived repo name, which can 404.
    - **Fix:** show the link only when the remote is known.

33. **MINOR: backup records can claim a fresh backup that copied nothing.**
    - **Where:** `main/sync-service.ts:~1131`.
    - **What happens:** a push cycle whose only backups are GitHub ones (now skipped on desktop) still returns success and calls `writeBackupMeta()`.
    - **Fix:** check what reads that file, and skip the write when nothing ran.

34. **MINOR (Android, PLAUSIBLE): "Try again" fails if the backup repo was already created.**
    - **Where:** `SyncSetupWizard.tsx:~355-380`.
    - **What happens:** if `createRepo` succeeded but `onComplete` failed, Try again re-creates the same repo. GitHub rejects it and the raw error text is shown.
    - **Fix:** remember the created repo and skip creating it on retry.

35. **MINOR (UX change to confirm): Contribute never shows its explainer again after the first download.**
    - **Where:** `main/dev-tools.ts:833-841`; `components/development/ContributionDesign.tsx:36-60`.
    - **What happens:**
      - Every later open goes straight to "YouCoded's code is ready on this computer".
      - `clearSetupStatus` has no lasting effect, because the next open finds the copy on disk again.
    - **Fix:** confirm with Destin that this is intended.

36. **MINOR: the "finished copy" check is loose.**
    - **Where:** `main/dev-tools.ts:849-857` (`isFinishedWorkspace`).
    - **What happens:** the check needs only `.git`, `setup.sh` and `youcoded/desktop/package.json`. So a folder the user made by hand, or a clone the app was killed in mid-setup, is reused. A session would then work inside it.
    - **Fix:** write a marker after `setup.sh` succeeds, and require it.

37. **MINOR: "Marked inactive" flags for TodoWrite tasks pile up in localStorage.**
    - **Where:** `useSessionTasks.ts`; `task-state.ts` `applyTodoWrite`.
    - **What happens:**
      - Ids are built from the item text (`todo:<content>`).
      - When the model rewords an item, the old item's flag stays in localStorage forever.
      - When two items share the same text, removing the first renumbers the second, which then loses its flag.
    - **Fix:** clear flags for ids that leave the list.

38. **MINOR: a "Try again" button that does nothing.**
    - **Where:** `components/artifact-views/ActiveArtifactView.tsx:869` (`onRetry={onRetryRead ?? (() => {})}`). This predates the branch, but it is more visible now.
    - **Fix:** when there is no handler, show the error without the button.

39. **MINOR (PLAUSIBLE): Enter can submit mid-IME composition.**
    - **Where:** these new Enter handlers don't check `isComposing`:
      - `SessionDetails.tsx` and `TagCloud.tsx` (create tag)
      - `SettingsPanel.tsx` (password)
      - `marketplace/FeedbackSection.tsx` (comment)
    - **Context:** the shared hook already checks `isComposing`.
    - **Fix:** add the same check to each.

40. **MINOR (PLAUSIBLE): the guided tour counts as an open popup.**
    - **Where:** `components/guide/GuideTour.tsx` (`useEscClose(true)`).
    - **What happens:** while the tour bubble is up, Enter on the message box and on chat cards stands down. A "do it now" step that asks the user to send a message with Enter won't work.
    - **Fix:** exclude the tour from the popup check.

41. **MINOR (copy): retry-like labels that aren't "Try again".**
    - `VoiceButton.tsx:275` reads "Check again" and is effectively a retry. Ask Destin.
    - The workbench fixture `home-assistant-page-camera.ts:570` reads "Retry". It is practice data only.

42. **MINOR: dropping a quick chip onto itself moves it to the end.**
    - **Where:** `QuickChips.tsx` `useChipDrag.up` (~296-306).
    - **What happens:** a press, a move past 5px, then a release on the same chip jumps it to the end of its shelf, and the change is saved at once.
    - **Fix:** do nothing when the target is the chip's own position.

43. **MINOR (PLAUSIBLE): skills drawer drag edge cases.**
    - **Where:** `hooks/useDrawerResize.ts`.
    - **What happens:**
      - `onPointerCancel` runs the drop logic, so on Android a stolen touch can close the drawer.
      - The height is reset only after the drawer reopens, so a stale tiny height can show for one frame.
      - The height is never re-clamped when the window shrinks.
    - **Fix:** a separate cancel handler that only clears the drag. Reset the height on close.

44. **MINOR: the model picker is positioned by a page lookup on every render.**
    - **Where:** `ModelPickerPopup.tsx:~457`.
    - **What happens:**
      - The comment says it measures once per open, but it reads `document.querySelector('[data-model-chip]')` on every render.
      - A zero-size or hidden chip puts the menu off screen.
      - It doesn't follow a window resize.
    - **Fix:** measure in a layout effect on open, ignore zero-size rects, and re-measure on resize.

45. **MINOR: widget menu hints lose their caveats.**
    - **Where:** `StatusBar.tsx`, `firstSentence`.
    - **What happens:**
      - It drops Session cost's "informational only on Pro/Max" and the rolling-window note.
      - It would also cut at "e.g.".
    - **Fix:** write a short hint for each widget instead of cutting.

46. **MINOR (as designed; check): a failed install started from a grid card stays in the footer strip until Dismiss.**
    - **Where:** `marketplace-context.tsx`.
    - **Why:** the 6 s auto-clear was removed.

47. **MINOR (startup cost): the new built-in theme assets load on every launch.**
    - **Where:** `theme-context.tsx`.
    - **What happens:**
      - Ten mascot SVGs (about 250 KB) are URL-encoded at import in every window, including the buddy window.
      - Two wallpapers sit in the main bundle.
      - Outfit is bundled at weights 400-600 only, so bold text is faked.
    - **Fix:** build the images lazily when the theme is active.

48. **MINOR: custom hex tag colours can be lost through an older app.**
    - **Where:** `tag-registry-core.ts:50`.
    - **What happens:** an older version that reads a synced registry clamps a hex colour to gray. If it then edits that tag, it can write gray back to other devices. This is unlikely.

49. **MINOR (Destin's call): first-run sign-in no longer warns that the assistant may create, change or delete files.**
    - **Where:** `FirstRunView.tsx`. It was removed on request.
    - **Context:** the backup warning now lives in the tour and in Permissions. Confirm that is enough.

50. **MINOR: sentence-case and capitals stragglers.**
    - `comments/CommentsPaneFrame.tsx:62-63` has "Show Resolved" in spaced capitals and Title Case.
    - The `Eyebrow` in `office/OfficeView.tsx:307` uses uppercase tracking.

51. **MINOR: "Try again" outlined instead of filled inside notices.**
    - **Rule:** the guide says Try again inside a notice is filled.
    - **Where:** `game/FriendsPanel.tsx:76` (`variant="secondary"`) and `ResumeBrowser.tsx:1852`.

52. **MINOR: hand-made pieces next to the shared ones.**
    - `SpecialistsChip.tsx:125-141,185` uses `rounded-full` spans instead of `Pill`, and a non-standard helper card.
    - `VoiceVocabulary.tsx:13` uses a "×" letter as its remove button.
    - `VoiceButton.tsx:286` has an "OK" button.

53. **MINOR (budgets): line budgets raised to the exact merged size, with an inaccurate reason.**
    - **Where:** commit e57a88f97, `desktop/line-budgets.json`.
    - **What's wrong:**
      - All nine are set to the current size.
      - SyncPanel (2060 → 2149) and globals.css (+67) grew only on this branch, as did SessionDrawer. The message's "both sides grew" is not true for those.
      - The message also says lint went "527 → 504"; master was 537.
    - **Fix:** say so in the PR. Consider splitting SyncPanel.

54. **MINOR (approval): a pinned test fixture was edited.**
    - **Where:** `desktop/tests/fixtures/phone-open-channels.json` (274 → 275). Its own note says to edit it only with Destin's approval.
    - **Context:** commit 71ca3a8c5 says phones "already had it". In fact Android rejects the channel as desktop-only, the same as stop-project. That is harmless, but tell Destin.

55. **MINOR (guard gaps): the fixed-sleep guard misses several shapes.**
    - **Where:** `tests/test-waits.test.ts`.
    - **What it misses:**
      - a delay passed as a named constant
      - `await expect(` after the sleep
      - a statement between the sleep and the assertion
    - **What's loose:** the word "settle" anywhere in the 3 lines above exempts a site without checking the assertion is negative, and `toBe(false)` counts as negative.
    - **Fix:** extend the patterns.

56. **MINOR (guard gaps): the test type-check scope pin checks only `exclude`.**
    - **Where:** `tests/tsconfig-tests-scope.test.ts`.
    - **What it misses:** a shrunken `include`.
    - **Fix:** pin `include: ["tests/**/*"]` too.

57. **MINOR (docs and tooling hygiene):**
    - `scripts/verify.sh` now keeps a full log folder per run, including passing runs, under `scratch/verify-*`, and never prunes them.
    - audit-anchors warns that `scripts/ui-review/README.md` doesn't name the `?pagesHome=` and `?vocabulary=` switches.
    - `.claude/rules/feature-flow.md` is 601 words, against a 600 budget.

58. **MINOR (guide accuracy): the guide's own numbers and references are inconsistent.**
    - It says hints are 12px, but `SettingRow` hints are 11px (`ui/SettingRow.tsx:64-65`).
    - "16px between first-level cards" and "8px between neighbouring boxes" don't say which wins for neighbouring cards.
    - It cites `submit-ticket-2#ST2-1` where decisions has `ST2-Q1`.
    - The decisions say "MetaChip", while the code says `Chip`.

59. **MINOR: the OpenRouter callback page shows the token-exchange error text.**
    - **Where:** `main/providers/openrouter-oauth.ts:~197` passes `outcome.error` into the page.
    - **Context:** it is HTML-escaped, so this is not a security issue. The wording is just not fixed.
    - **Fix:** show a fixed sentence.

## Checked and fine

- **Worker hidden mode:**
  - Join broadcast, friend snapshots, the online count, last-seen, close and alarm sweeps all skip hidden sockets, because everything goes through `liveSocketsFor()`.
  - Status, challenge and challenge-response from a hidden socket are refused.
  - No challenge is delivered to a hidden-only user.
  - Hello comes first.
  - The `X-Presence-Hidden` header is set or cleared by the route, so a client can't inject it.
  - The hidden flag survives hibernation in the attachment.
  - The capabilities endpoint reveals nothing, and an old server answers 404, which both clients treat as "no".
  - Mixed visible and hidden devices on one account behave correctly.
- **Client fallback:**
  - Both clients require `{type:"hello",hidden:true}` as the first frame, or they disconnect.
  - Android probes before connecting.
  - The renderer, main process and server all block status and challenge sends while incognito.
- **Parity:**
  - `social:presence-connect {hidden?}` and `syncspaces:remove-project` are present across the backend contract, preload, remote-shim, channel types, the mock, the Android SessionService (remove-project is rejected there as desktop-only) and the parity tests.
- **Data safety:**
  - Removing a project deletes no files, locally or remotely, and makes no GitHub API call.
  - The markers are written atomically, never shrink, and converge when two devices remove at once. Older builds can't see them and can't restart syncing.
  - Re-adding works per computer.
  - Existing GitHub backups on desktop keep their settings and show "No longer supported" with Remove. Android still offers GitHub backup.
  - Nothing is dropped from config.
- **Merge c406846fb:**
  - All 45 conflicted files were compared line by line against master's side. Master's behaviour survives, including `canOpenInOs`, ReportDesign's `memoWhileClosed`, and the see-through-pages switch.
  - Master never edited the files the branch deleted after the last merge base, so there were no lost modify/delete changes.
  - The follow-up test edits didn't weaken anything.
  - knip (129) and design lint (504) sit exactly at their lowered ceilings.
- **Workspace merge 6c23e09f:** ast-grep 413/413 rules fire, and roadmap items were carried into master's format.
- **ErrorState, Callout, FieldError:**
  - All props map through.
  - The type forbids empty text and forbids having no actions.
  - `role="alert"` is kept.
- **Enter rules:**
  - The shared hook stands down for typing targets, buttons and links, IME composition, key repeats, modifier keys, and anything that isn't the top popup.
  - There is no double-fire with a button's own click.
  - The only `onEnter` caller is the close prompt, which is not destructive. Destructive popups need a click.
  - Popups leave the popup check on close.
  - The chat cards and the message box stand down.
- **"Try again":**
  - The guard test passes.
  - Kotlin strings are updated.
  - The remaining "Refresh", "Reload app" and "Reconnect Google Drive" labels are different actions.
- **Coloured-text sweep:** every state is still readable from its words plus a tint or dot. Nothing is shown by colour alone that wasn't before.
- **Open tasks:**
  - TodoWrite replaces the whole list, and its `todo:` ids never collide with TaskCreate ids.
  - Mixed tools and malformed items are handled.
  - TaskStop and TaskGet no longer create phantom tasks.
  - The work is memoized on the `toolCalls` ref, as `performance.md` asks.
  - It is shared renderer code, so Android needs nothing native.
- **Contribute's code download:**
  - It reuses an existing copy only by reading it, so nothing is clobbered or deleted.
  - The in-flight join prevents two setups racing.
  - The failure cleanup removes only a folder that run created.
- **Workbench and practice code:**
  - It is gated to dev or shoot builds.
  - The mock `openExternal` records the URL and opens nothing.
  - No new network calls.
- **OAuth callback page:**
  - All text is escaped, and only fixed titles are used.
  - The font is inlined, and responses are `no-store`.
- **Secrets scan:** the only hits were UI strings and a CSS class (`sk-user-question-card-other`).
- **Website legal pages [other session, 2d01f74f3]:**
  - The generator `--check` matches PRIVACY.md and TERMS.md, and 10 of 10 tests pass.
  - Links resolve against `docs/CNAME` `youcoded.ai`.
  - The only personal data is the support address.
  - The font licence is included.
- **"Submitted via YouCoded Assistant" [other session]:** this is only a commit-message trailer on 2d01f74f3. The app's git doctrine is unchanged and the string isn't in the app diff.
- **Priority → "Pin to top":** the stored data is still `flags.priority`, so no migration is needed and existing pins survive.
- **Deleted components (SkillEditor, per-theme editor, TagManagerPopup, TagPicker, TagNoteEditor, DevelopmentPopup):**
  - Their callers are gone and `tsc` is clean.
  - Their behaviours are re-tested in `tag-cloud-honest`, `ResumeBrowser.test`, `SessionDetails.test` and `development-popup.test`.
  - The particle options moved to `look-overrides.test`; this was not opened to confirm.
- **Shoot tooling:**
  - No `pkill` or `killall`. Kills are by pid only, after a `/proc` cmdline check.
  - Temp folders are private and cleaned up.
  - Nothing references `/opt/YouCoded` or the live app's profile.
- **Tests:** no `.skip`, `.only` or `.todo` added, and no test timeouts raised.
- **Decisions spot-check:** 50 decisions.md rows were checked against the code. 36 are implemented as approved, 4 were superseded by later rows, and the rest are F10-F17. Every one of the 36 shared pieces the guide names exists.

## Not covered

- Files that git merged without conflicts were not reviewed hunk by hunk.
- Kotlin for incognito was read, not exercised on a device.
- Android parity of the visual decisions was not checked.
- The listed components (CommandDrawer, SessionStrip, AccountSection, ConnectedAccounts, PermissionsSection, SpecialistsSection, LocalModelsSection, UpdatePanel, buddy, artifact-views, LookSettings) had only their removed lines scanned for dropped handlers. None were found. They were not read in full.
- Nothing was checked on screen. Visual findings (F13-F18) come from reading the code.

One-line design note: F11 and F12 are approved looks that were never built. Whether to build them now or list them as known deviations is Destin's call, not a code question.
