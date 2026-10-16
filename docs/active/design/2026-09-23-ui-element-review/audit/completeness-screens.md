# Completeness audit — did the design-guide effort miss any screen?

Read-only census. Compares the element-review docs (`inventory/`, `audit/`, `decisions.md`,
`guide-draft.md`, the `*.review.json` decks) against three independent sources of truth:
`docs/MAP.md`'s subsystem table, the renderer's own routes (`App.tsx`, `SessionDrawer.tsx`),
and the screenshot rig's full plan set (`scripts/ui-review/plans/*.json`, 424 planned shots
across midnight/light/meadow-mist per `scratch/element-sweep/coverage.md`).

## Surface list

Grouped by how often a user sees it. "Screenshot?" cites the plan/shot or says none exists.
"Examined by" cites the doc that discusses it, or "source-only" (cited by file:line, never
by picture), or "none".

| Surface | Reached by | Screenshot? | Examined by | Notes |
|---|---|---|---|---|
| Chat / composer / bubbles / tool cards | default view | `shots-main/*` (extensive) | buttons/cards/headers/labels/lists/status decks | thoroughly covered |
| Session Files drawer | header file icon | `shots-main/session-files-pane`, `-filter` | cards-rows-spacing.md | covered |
| **Git file review (diff view)** | Session Files drawer → open a changed file → Review | **none** | source-only: `inventory/cards-rows-spacing.md:132,235,251,280,284`, `inventory/headers-text.md:307` | see "Never examined" |
| Terminal view, no active shell | header Terminal icon | `shots-main/terminal-view-no-pty`, `shots-narrow/terminal-no-pty` | shells-icons-nav.md, settings-screens.md | covered (empty state only — see below) |
| Terminal view, live PTY output | same, with a real shell running | `electron-live-session.json#e2-terminal-view` plan exists | **none — 0 PNGs on disk anywhere** | plan defined, never run |
| Settings → all 11 rows (Account, Assistant, Appearance, Buddy Floater, Sound, Backup & Sync, Remote Access, Help, Development, Keyboard Shortcuts, About, Donate) | header gear | `shots-main/settings-*` (mostly partial: 2 of 3 themes) | audit/settings-screens.md — very thorough, screen-by-screen | covered in substance, meadow-mist theme thin |
| Assistant settings 5 pages (General, Cloud providers, Local models, Permissions, Specialists) | Settings → Assistant settings | `shots-assistant-settings-r2..r6/*` | settings-screens.md | covered |
| Assistant settings search box (filtering rows) | Assistant settings → type in search | plan exists (`assistant-search`, `assistant-search-addkey`) but capture lands on the General tab, not a filtered list — see "New issues" | none | broken plan, unexamined |
| Model picker (favorite bands, search, providers) | composer model chip | `shots-main/model-picker`, `shots-narrow/model-picker` | headers/labels decks | covered |
| Resume browser + conversation preview | header clock icon | `shots-main/resume-browser*`, `resume-preview/*` | cards-rows-spacing.md, conversation-previews | covered |
| Marketplace (grid, detail, search, filters) | header marketplace icon | `shots-marketplace*`, `shots-marketplace-overhaul*` (narrow too) | cards/status/headers decks | covered |
| Library (installed skills/themes) | header library icon | `shots-main/library*`, `shots-empty-marketplace/library*` | covered | some meadow-mist partials |
| Projects (switcher, context, file filter) | header projects icon | `shots-main/projects*`, `overlays/projects-*` | headers-text.md | covered |
| Pages: landing, create/edit, view, connections/approvals | header Pages | `shots-pages*/*` (very large set) | headers/cards/menus decks, decisions.md | covered — best-covered subsystem |
| Games arcade: picker, Chess, Connect 4, 2048, Flappy, leaderboard | header gamepad | `shots-games-*` | headers/buttons/spacing decks | covered; a couple of degraded/empty states MISSED (below) |
| First-run / setup wizard (prereqs, dev mode, authenticate, launch) | fresh install, or Settings → re-run | `shots-overlays/first-run-*` | button-placement, guide-contradictions | covered |
| First-run "Start your first session" dialog | first launch, no sessions yet | `shots-main/welcome-empty` — MISSED status, but a usable PNG exists (checked directly, see below) | **none** | highest-frequency screen in the whole app; not cited by name anywhere |
| Sign in with ChatGPT / OpenRouter | first-run, Assistant settings → Cloud providers | `shots-chatgpt-signin/*`, `shots-openrouter-*` | settings-screens.md | partially covered — several sub-states MISSED (below) |
| Local model engine setup (advanced, ROCm, installed/recommended lists) | Assistant settings → Local models → Advanced | `shots-local-engine/*` — all 6 shots land on the plain Settings root menu, not the intended screen | **none** | see "New issues" — plan is broken |
| Remote Access (pairing, devices) | Settings → Remote Access | `shots-main/settings-remote-access` (partial) | settings-screens.md | the panel itself is covered; the phone-side pairing UI is not (below) |
| **Remote/phone-browser login + paired-device UI** | a phone opening the tailnet URL | **none** | none | see "Never examined" |
| **Android app rendering** | Android device | **none — no plan ever sets a mobile platform** | none | see "Never examined" |
| Narrow/phone-width desktop layout | `?viewport=narrow` | `shots-narrow/*` (17 shots), `assistant-settings-narrow/*` | covered | this is desktop-at-380px, not real Android chrome — see "Never examined" |
| Buddy Floater — the settings toggle row | Settings → Buddy Floater | `shots-main/settings-buddy-floater` (partial) | settings-screens.md — thorough, calls it "one of the better screens" | covered |
| **Buddy Floater — the floating window itself** (welcome card, new-session form, resume list, docked/dragged chrome) | enable the toggle → a separate OS window appears | **none — the capture tool refuses this window by design** | source-only: `inventory/buttons-controls.md:60,134`, `inventory/menus-search-fields.md:67-69` | see "Never examined" |
| Specialists chip + popup, subagent bar | header chip when specialists run | `shots-cc-subagents/*`, `shots-helper-asks*` | cards/headers/notifications decks | covered |
| Status bar + `/usage` menu, all provider variants | bottom bar | `shots-statusbar-relevance/*` | covered | covered |
| Sync spaces / Backup & Sync (errors, oversize, retry) | Settings → Backup & Sync | `shots-sync-oversize-fix/*` | error docs | covered |
| Error / empty states (~30 named failures) | various | `shots-error-batch1/*`, `shots-error-audit-current/*` | dedicated error-inventory investigation (referenced in MAP) | broadly covered; a few report-dialog states MISSED |
| Artifact viewer: image/SVG/PDF zoom, loupe, ladder | open a deliverable | `shots-artifact-zoom*/*` (very thorough) | covered | covered, best-tested corner of the app |
| Compare view (`?view=compare`) | dev-only workbench toolbar | `shots-main/compare-view` — covered | none | **this is a workbench dev debug tool, not a user feature or the git diff/compare screen** — flagging so it isn't mistaken for git review coverage |
| Overlays: context menus, close-session prompt, theme cycle editor | various right-clicks | `shots-overlays/*` | covered | 2 context-menu shots (code-block, file-pill) MISSED |
| Tag manager / tag picker / tag chip | session tags | `shots-tag-chip/*`, error states | covered | covered |
| Tall-viewport variants (compare, tool gallery) | `?height=tall` | `shots-tall/*` — both shots exist but unverified | none | minor, low-frequency |
| Games: Connect 4 win/lose "record" overlay | finish a match | `shots-games-record/connect4-record` — unverified but a usable PNG exists (checked directly, looks clean) | none | not cited by name anywhere despite being the natural end-state of every match |

## Never examined

These have **zero screenshot anywhere on disk** (verified or not) and are not discussed
except by source-line citation. Ranked by how often a real user would hit them.

1. **The floating Buddy window's own content** (`components/buddy/BuddyWelcome.tsx`,
   `BuddyNewSessionForm.tsx`, `BuddyResumeList.tsx`, and the docked/dragged chrome from
   `buddy-window-manager.ts`). This is structural, not an oversight anyone can casually fix:
   `scripts/ui-review/shot.mjs` line 144-145 explicitly **excludes** any browser target whose
   URL matches `buddy` when picking what to screenshot. The review docs only ever cite this
   surface by file:line (`inventory/buttons-controls.md:60,134`, `inventory/menus-search-fields.md:67-69`,
   which literally says "Screenshot: none found"). Anyone who turns on "Show buddy floater"
   gets a second OS window the design-guide effort has never once looked at.

2. **Git file review** (`components/git/GitReviewView.tsx`, opened from the Session Files
   drawer by picking a changed file and choosing Review — `SessionDrawer.tsx:1194`). MAP.md
   lists "Git surface (status, review, watching)" as its own subsystem. The inventory docs
   cite it five times by file:line for its card/divider styling (`cards-rows-spacing.md`)
   but no plan opens it and no picture of it exists. It's the one MAP-listed subsystem with a
   dedicated renderer component and zero visual review.

3. **Android app rendering.** Every one of the 424 planned shots drives the desktop Electron
   workbench over Chrome DevTools Protocol; none passes a mobile platform switch. The
   `shots-narrow/*` plans approximate phone WIDTH on the desktop shell, but Android has its
   own runtime (`youcoded/app/src/main/kotlin/...`), its own first-run/auth paths, system
   chrome, and safe-area insets — none of that has ever been screenshotted or reviewed.

4. **Remote / phone-browser login and paired-device UI** (a phone opening this computer's
   tailnet URL, `remote-server.ts` + `remote-shim.ts`). The only related shot,
   `chatsearch-gate-main/android-fallback`, is itself MISSED (stale selector) and only tests
   a text fallback inside the desktop app, not the actual phone-side login screen.

5. **The "real built app" cross-check plans** (`scripts/ui-review/plans/electron-welcome.json`,
   `electron-live-session.json`, `electron-pages.json` — ~35 named shots, including a genuine
   live-PTY terminal, real first-run, real Settings, real Marketplace, real session creation).
   These plans exist in the repo and are clearly meant to verify the MOCKED workbench matches
   the REAL app, but `find scratch -ipath '*electron*' -iname '*.png'` returns **zero files**
   anywhere in the worktree. Every judgment in `decisions.md` and `guide-draft.md` has been
   made against the workbench mock only; none of it has been cross-checked against the actual
   running app.

## New issues not in any doc

1. **A cluster of "settings" plans is silently broken and captures the wrong screen.**
   Opened directly: `shots-local-engine/*/_unverified/local-engine-card.png`,
   `shots-main/*/_unverified/settings-model-providers.png`, and
   `shots-assistant-settings/*/_unverified/assistant-search.png` — all three land on the plain
   Settings root menu (or the General tab), not the Local Engine / Model Providers / search-filtered
   screens their plan names promise. This reads as an IA change (Model Providers and Permissions
   appear to have been folded into the single "Assistant settings" row shown in every one of
   these screenshots) that the plans' click sequences were never updated for. Net effect: the
   6 `local-engine` shots, `settings-model-providers`, `settings-permissions`,
   `settings-defaults`, `assistant-search`, `assistant-search-addkey` and the ChatGPT-tab shots
   in `assistant-settings/*` are not really "missing pictures" — they're pictures of the wrong
   thing, and whatever they were meant to show has never actually been looked at. This is worth
   fixing in the plans (or confirming the screens no longer exist as separate surfaces) before
   trusting "MISSED" vs "covered" counts for the Settings area.

2. **`shots-main/welcome-empty.png`** (the "Start your first session" dialog — the very first
   screen a new install shows) was opened directly for this audit. It renders cleanly: centered
   card, mascot, Project folder / Model / Skip permissions fields, Cancel + filled Create
   Session. No design-language problem found. But it is the single highest-frequency surface
   in the entire app and is not cited by name in `decisions.md`, `guide-draft.md`, or any
   `audit/*.md` file — it should get an explicit "reviewed, no issues" citation rather than
   silence, so a future reader doesn't have to re-derive that it was actually looked at.

3. **`shots-games-record/connect4-record.png`** (the "You Win! / Congratulations! / Rematch /
   Back to Lobby" end-of-match overlay) — also opened directly, also renders cleanly, also
   uncited anywhere despite being the natural end-state of every completed match.

## No screenshot yet

Two tiers, worth keeping separate:

**Genuinely zero capture (no plan even attempts it):** the floating Buddy window's content,
Git file review, Android rendering, remote/phone-browser login, and the ~35 "real app"
electron-*.json shots — all five items under "Never examined" above.

**A PNG exists but nobody has judged it** — the 87 surfaces coverage.md marks MISSED (of 424
planned) mostly aren't blank: spot-checking `shots-chatgpt-signin`, `shots-assistant-settings`,
`shots-model-brand`, `shots-narrow`, and `shots-marketplace-overhaul` shows each has a real
PNG sitting in its theme's `_unverified/` folder — the automated DOM-assertion that confirms
"the right thing is on screen" failed (usually a stale CSS selector), but a picture was taken.
Nobody has opened these ~87 pictures and asked "does this look right." Recommend a follow-up
pass through `scratch/element-sweep/shots-*/*/_unverified/*.png` before calling design-guide
coverage complete — this audit only spot-checked a handful (local-engine-card, connect4-record,
model-list, assistant-search, settings-model-providers, welcome-empty) rather than all 87.

## Coverage

- Screenshot rig: **282 covered / 55 partial / 87 missed of 424 planned surfaces**, three
  themes (midnight, light, meadow-mist) — from `scratch/element-sweep/coverage.md`
  (2026-09-23 run). Meadow-mist is disproportionately the missing theme across partials.
- Design-guide docs (`inventory/`, `audit/`, `decisions.md`, `guide-draft.md`) review UI
  *elements* (buttons, headers, cards, lists, status, roundness) using crops pulled from a
  subset of the 424 shots as evidence — they are not a screen-by-screen checklist, so a
  screen can be structurally "examined" (cited for one element) while never being looked at
  as a whole, or never used as evidence at all.
- 5 real subsystems have **no screenshot under any circumstance** with the current tooling:
  Buddy floating window content, Git file review, Android rendering, remote/phone-browser
  login, and the real (non-mocked) built app. Two of these (Buddy window, Android) are
  excluded by design in the capture tooling itself, not by oversight.
- Of the 87 "MISSED" planned surfaces, spot-checks found the underlying screenshots do exist
  (just unverified) for at least local-engine, chatgpt-signin, assistant-settings,
  model-brand, narrow, and marketplace-overhaul — meaning the true "no picture exists" count
  is much smaller than 87; most of that number is "picture exists, unjudged" or "picture is
  of the wrong screen because the plan is stale" (see "New issues" #1).
