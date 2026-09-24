# Code review — session/plugin-project-controls

Fresh reviewer, no implementing-session context. Diffed against `origin/master`
(10 files, desktop renderer only — `git diff --stat origin/master...session/plugin-project-controls`).
No contract exists yet for this branch; findings are against the branch's own
one-paragraph claim (workbench-only prototype, CRITICAL promise that nothing
outside workbench mode changes shipped behaviour/appearance) and the rules in
`.claude/rules/{react-renderer,performance,renderer-lists,narrow-viewport}.md`
and `docs/PITFALLS.md`.

## `bash scripts/verify.sh` summary

```
verify: youcoded (base origin/master)
  tests: related to 10 changed file(s) + 56 source-scanning guards

PASS  types (tsgo --noEmit)
PASS  types in tests/ (tsgo --noEmit, 47 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (oxlint)
PASS  design lint (oxlint --max-warnings ratchet)
PASS  invariants (ast-grep)

OK — all checks passed.
   Not covered: Android (./gradlew test), marketplace worker.
```

## Findings

- F1 — `desktop/src/renderer/components/marketplace/MarketplaceDetailOverlay.tsx:57,144` — `setupPreview` is set `true` on a successful fake install and is never reset to `false` on navigation, so re-visiting the same target inside one overlay session replays the stale "Set up Inbox" screen with no new install. Confirmed: `MarketplaceScreen.tsx:660` renders `<MarketplaceDetailOverlay target={detail} onNavigate={setDetail} .../>` with **no `key`**, so `onNavigate` (wired at `MarketplaceDetailOverlay.tsx:294` and `:432`, e.g. a "part of X" badge click) swaps `target` on the *same* mounted instance. `showSetupPreview` (line 144) is `isWorkbenchMode() && setupPreview && target.kind === 'skill' && target.id === 'youcoded-inbox'` — it only re-checks the target id, not "was this install just performed." Repro path: install the Inbox sample → see the setup panel → click any related-plugin badge → click a badge/link back to `youcoded-inbox` → the setup panel reappears instead of the normal Details page, with the header still reading "Set up Inbox."
- F2 — `desktop/src/renderer/components/SkillCard.tsx:183` — the badge wrapper's class changed **unconditionally** from `mt-2 self-start` to `mt-2 flex w-full flex-wrap items-center gap-1.5` for every SkillCard rendered anywhere (production desktop + Android, not just the workbench); only the new `availabilityPreview` chip inside it is gated by `isWorkbenchMode()`. Confirmed by reading the diff and the surrounding card markup (`SkillCard.tsx:156-186`, outer container is `flex flex-col`, this div's only child in production is the pre-existing `badge`). By my read of that layout (`flex`'s default `justify-content: flex-start` on a lone child renders identically whether the container is `w-full` or shrink-to-content) this is currently visually inert in production — but I did not screenshot-verify it, and the branch's own CRITICAL promise is that files outside workbench mode change **nothing**, not "nothing visible." The safer fix is `availabilityPreview ? 'flex w-full flex-wrap items-center gap-1.5' : 'self-start'` so the shipped-app markup is byte-identical to `origin/master`.
- F3 — `desktop/src/renderer/components/project-view/ProjectView.tsx:190-191,196` — the WHY comment ("a missing skill cannot be invoked, but clicking its greyed card can lead to **the right project's** setup page") overstates what `openPreview` does: it only dispatches `PROJECT_VIEW_OPENED` and switches to the Skills tab, never selects a specific project. Per `docs/PITFALLS.md`/`.claude/rules/artifacts.md` ("Project View re-homes to the FOCUSED conversation's project on every open"), the project you land on is whichever the currently-focused conversation belongs to, and the "Needs setup on this device" section it scrolls to (`ProjectPluginControls.tsx:205-215`) is hardcoded fixture content identical for every project — there is no "right project" concept implemented. Not a functional break (the scroll-to still works via the `requestAnimationFrame` effect at `ProjectView.tsx:199-210`), but the comment claims routing logic that doesn't exist. PLAUSIBLE that this is deliberate simplification the implementer already knows about, but the comment should say so.
- F4 — `desktop/src/renderer/dev/workbench/mockups/ProjectPluginControls.tsx:146-156` (`NeedsSetupRow`) — the "Ask assistant to add it" / "Choose skill file" / "Ask assistant to set it up" buttons render as ordinary primary/secondary `<Button>`s with no `onClick` at all (`actions.map((label, index) => <Button key={label} ...>{label}</Button>)`), so they look actionable but silently do nothing when clicked. Workbench-only, and the file's own WHY comment (line 143-145) says the destination is intentionally undecided, but a reviewer or Destin clicking these during a walkthrough gets no feedback that they're non-functional placeholders (not even `disabled`).

## Not covered

- Did not run the DOM-size / stress sweep (`renderer-lists.md`'s "1,000+ items in, one chunk drawn" pin) against `ProjectSkillsTabDemo`'s lists — those need a served workbench browser (`dom-size-sweep.mjs`, part of `run-review.sh`, not `verify.sh`), out of scope for a static code review and the lists here are small, fixed-size fixture arrays (not a list of the user's own things), so the rule likely doesn't apply, but I didn't verify with the tool.
- Did not check Android Kotlin parity — brief states this branch touches desktop renderer files only, and `verify.sh` doesn't cover Android; not independently confirmed against `app/src/main/`.
- Did not trace whether any real, non-fixture marketplace plugin actually has id `youcoded-inbox` outside the workbench mock, since that's covered by `mock-shim.ts` fixture data and gated behind `isWorkbenchMode()`/`entry.id === 'youcoded-inbox'` either way.
- Budget spent on the 4 findings above plus rules/verify.sh; did not do a second full pass for additional "weird" or dead-code findings beyond `npm run knip` (part of `verify.sh`, passed).

## Triage (implementing session)

- F1 accepted — the overlay now resets the setup preview whenever its target changes (`targetKey` effect in `MarketplaceDetailOverlay.tsx`).
- F2 accepted — `SkillCard` renders master's exact badge wrapper unless the workbench passes `availabilityPreview`.
- F3 accepted — the CommandDrawer comment now says the card opens the current project's setup rows, with sample data.
- F4 already handled — the buttons inside the setup box are sample-only by design, and review slide S-2 tells Destin they do nothing yet; which buttons ship is question Q-3 on the same deck.
