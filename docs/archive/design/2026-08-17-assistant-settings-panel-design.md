---
status: superseded
---

> **SUPERSEDED 2026-09-04.** Destin reviewed the React mockup (branch
> `feat/assistant-settings-mockup`) in the workbench and rejected the implementation: "decent
> in concept, but I hate this implementation" — built by another model on outdated workspace
> tooling. Branch, worktree and mockup files are DELETED; the stowaway
> `test-engine/conversation-triage.mjs` was rescued to `origin/chore/conversation-triage-script`.
> The panel restarts from a fresh session through the feature flow (questions deck first).
> Two things from this round survive and the restart should read them:
> the **concept** — one "Assistant settings" row replacing Defaults + Permissions + Model
> Providers, organised provider-first (Claude Code · OpenRouter · Local · Global), no search
> box, no invented settings; and the **fact-check** — Claude Code sessions and native
> (OpenRouter/Local) sessions use different permission-mode sets that share no strings, so a
> single shared permissions page is not free. Everything below is history.

# Assistant Settings — Consolidated Panel Design

**Date:** 2026-08-17
**Status:** Draft — design + interactive mockup, awaiting Destin's review
**Prototype:** `docs/active/prototypes/2026-08-17-assistant-settings-panel.html`

> **STATUS (verified 2026-08-26): superseded in part by a later React mockup that Destin has still
> never signed off on, and that mockup is UNCOMMITTED and AT RISK.**
>
> **The real current prototype is not the HTML file above.** On 2026-08-18 a follow-up session
> (`1e322bd4…`, "Consolidated Assistant Settings Panel") rebuilt this surface in the actual renderer
> as `youcoded/desktop/src/renderer/components/AssistantSettingsFinal.tsx` +
> `AssistantSettingsShared.tsx`, viewable at
> `?mode=workbench&view=assistant-final`. Those two files are **untracked in the MAIN CHECKOUT**
> (`git -C youcoded status --porcelain` → `?? desktop/src/renderer/components/AssistantSettings*.tsx`),
> which violates the workspace worktree rule. They are 16.5 KB + 17.1 KB of hand-written work with
> **no copy anywhere in git history** — losing them loses the whole second design round. The route
> that renders them lives in an *uncommitted hunk* of `desktop/src/renderer/index.tsx`, and the
> `Dialog` size it needs (`app: min(820px, 92vw)`) is an uncommitted hunk of
> `desktop/src/renderer/components/ui/Dialog.tsx` + `tests/dialog-shell.test.tsx`. All five pieces
> must move together or the mockup does not boot.
>
> **Claims below that the later mockup deliberately reversed (do not build from them):**
> - *"5 tabs"* / *"The five tabs"* (General · Providers · Local models · Permissions · Advanced) —
>   the final is **4 provider-first pages**: Claude Code · OpenRouter · Local · Global. The reviewer's
>   verdict was that an engine picker stacked above tabs is "navigation inside navigation".
> - *"one large, **searchable**, tabbed panel"* and the whole "Search" section — the search box was
>   **removed** as noise at four tabs.
> - *"Friendly mode (new — plain-reply toggle)"* and Open Question 4 — **dropped**; it is not a real
>   setting and inventing one was the finding.
> - *"the mockup renders ~900px"* (Open Question 3) — the built `app` Dialog size is **820px**.
> - *"New `AssistantSettingsPanel.tsx`"* — the file that exists is `AssistantSettingsFinal.tsx`.
> - *"add a `xlarge`/`document` width"* — the width added is named `app`.
> - The design also asserts every mode is shared across providers; the 2026-08-17 fact-check
>   disproved that (Claude Code sessions use NORMAL/ACCEPT CHANGES/PLAN/AUTO/BYPASS; OpenRouter and
>   Local are native sessions using ASK FIRST/AUTO EDIT/FULL AUTO — the unions share no strings).
>
> **`status: draft` is still correct.** The 2026-08-18 session ended with the assistant declaring the
> mockup "complete, verified, and live" and Destin never replied (session `lastActive` is that same
> assistant turn, 2026-08-18T05:27:29Z). No approval exists, so nothing here is settled.
> The ROADMAP has no item for this panel — only a `**Related:**` mention inside the
> "Tell the USER when context files were truncated" item.

## The problem in one sentence

Today, the things that make your assistant *your* assistant live in four or more separate settings popups that have already started to blur into each other — **Defaults** (default model, skip-permissions), **Permissions** (always-allow grants), **Model Providers** (engine/Claude Code/OpenRouter/local models/web search), plus whatever the next engine (Codex) and the next hundred config options would have become.

If we keep adding settings the way we have so far, Settings becomes a long drawer of near-identical rows, each popping open a small dense popup — and the moment there are 15 of them, nothing is findable unless you already know where it is. Normal people never get a *map* of what their assistant can do; developers never get *depth*.

## The proposal, in one sentence

Collapse Defaults + Permissions + Model Providers (+ future configs and sign-ins) into a **single Settings row — "Assistant settings" — that opens one large, searchable, tabbed panel**, and let the visual hierarchy do the work: 5 tabs for everyone, an optional power-user sidebar, and a search box that works before you even learn the tabs.

## The visual hierarchy (the core thinking)

The panel is organized on four layers. Each layer is *more powerful and more dense*, and each one is reachable without understanding the layers above it:

| Layer | What it is | Who it's for |
|---|---|---|
| **1 — Header** | Name + one-sentence plain-language description + search box | Everyone, first visit |
| **2 — Tabs** | 5 stable categories, ordered by how-often-touched | Normal people (students, teachers, professionals) |
| **3 — Cards & rows** | The actual settings — one group per card, `SettingRow` inside | Everyone |
| **4 — Sidebar ("Fuller view")** | Left rail grouping every advanced setting, incl. anything that will later need its own page (Harness, MCP, Skills, Storage) | Developers / power users |

Why this specific shape:

1. **Five tabs is the ceiling.** The tab research (NN/g + Apple HIG) is consistent: tabs work for a *small* number of options; beyond ~5–8 they overflow, stop being discoverable, and force redesign. Five is the most we can have before the pattern breaks — so the five are chosen to be the ones *every* user needs, and everything else parks in layer 4. If we need a sixth category later, the answer is *not* a sixth tab; the sidebar gets a new group.

2. **Tabs are for the map, not the detail.** Each tab is a page with a clear job: *General* (defaults), *Providers* (who powers it), *Local models* (what runs here), *Permissions* (what it may do), *Advanced* (the rest). The alternative — vertical accordions of everything — was rejected because no single pane would stay scannable once we pass a couple dozen rows. Sidebar-only (like VS Code / Chrome) needs room we don't always have; drill-down pages (iOS-style) bury the map. Tabs keep the map visible *while* you read the detail, and each page is independently scrollable.

3. **Search is the power feature, and it's out front.** VS Code's lesson: when you have many settings, search *is* the navigation. The header search filters rows live and auto-jumps to the tab that has the match. A student who knows only "the computer does something called permissions" can type "permission" and land on the right tab without understanding the model at all.

4. **"Fuller view" hides developer depth in plain sight.** Toggle is *in* the panel (General tab), not buried — one switch reveals the left rail. The rail groups *everything* the panel hosts plus future homes (Harness, MCP servers, Skills, Storage & caches), so it can grow forever. It's the escape hatch that keeps us from ever needing a 6th tab.

5. **Status dots carry "something needs attention" without prose.** The Providers tab carries a small dot when a provider is disconnected; the row list, chips, and panels all already use this visual language. Dots on rows/tabs are the lowest-effort way to say "look here" to everyone, and the app already does it for sounds and pending challenges.

## What the Settings drawer becomes

The drawer keeps its current, *already-approved* flat list of rows (Account, Appearance, Sounds, Sync, etc.). Only the four engine/permission/logins rows consolidate:

**Before (4 rows in the drawer):**
```
Defaults            Sonnet · Skip perms
Model Providers     Claude Code, OpenRouter…
Permissions         Things you approved…
```
…plus whatever next configs we would have added.

**After (1 row in the drawer):**
```
[stacked-layers icon]  Assistant settings   [NEW]  Claude Code · Sonnet ›
```
- **Title:** "Assistant settings" (deliberately not "Model Providers" — it now covers permissions/defaults/environment too).
- **Subtitle:** live summary, e.g. `Claude Code · Sonnet`, computed from the active engine + default model. Status dot when something needs attention (e.g. key expired).
- Reuses the existing `SettingRow` nav pattern and the "Model Providers" stacked-layers glyph.

Everything else in the drawer stays exactly where it is: Account, Appearance, Buddy, Sound, Performance, Backup & Sync, Tier, Remote Access, Development, Shortcuts, Donate, About. (Remote Access was considered for the merge; it stays separate — it's about *devices and networking*, not about *how the assistant behaves*, and it has its own distinct setup flow. Defaults + Permissions + Providers, plus future engine/harness config, is the coherent "assistant" cluster.)

## The five tabs — contents and rationale

### 1. General — *how it starts*
- **New-session defaults:** Default engine (Claude Code / OpenRouter / Local), Default model (Haiku/Sonnet/Opus/Opus 1M), Project folder, Close-session prompt — lifted straight from today's **Defaults** popup.
- **Your assistant:** Buddy floater (from the drawer), Friendly mode (new — plain-reply toggle for students/teachers), Fuller view (the sidebar toggle).
- Why first: "what happens when I start a chat" is the most common settings need; everything here is a *choice*, not a *risk*, so it's the gentlest entry point.

### 2. Providers — *who powers it*
- Provider cards (mirrors today's `ModelProvidersPopup`): **Claude Code** (sign-in status + Account + Claude Code prefs), **OpenRouter / API** (connected/Test/Replace key), direct provider keys (Anthropic/OpenAI/Gemini), custom endpoints, **Web search** (Tavily/Exa).
- A dimmed **Codex** card with a `PLANNED` badge proves the pattern: a future engine just *gets a card in this list*. Same for anything else.
- Status dot on the tab when any provider is disconnected/missing.

### 3. Local models — *what runs here*
- Storage gauge + disk-guard note, model list with Ready / Downloading / Install buttons — lifted from `LocalModelsSection`.
- Lives in the *same panel* as providers because the engine choice and the models are one decision: *which brain do I use*.

### 4. Permissions — *what it may do*
- **Permission mode** as three (plus two gated) visual cards: Standard / Accept changes / Plan — a much friendlier presentation of the current `Shift+Tab` cycle, and a *control* for it rather than a keyboard-only ritual. (Auto / Bypass stay gated like today.)
- **Always allow** list with per-rule Revoke (from `PermissionsSection`), **Protections** toggles (from Defaults' advanced overrides).
- Why merge here: the Defaults popup already contains permission logic, and the status bar already exposes a per-session cycle; giving this real UI is a win that the merge unlocks.

### 5. Advanced — *the rest, honestly labeled*
- **Sub-agents & parallelism**, **Environment** (Harness, MCP servers, Installed skills → existing screens), **Toolkit** (package tier), and a **Reset assistant settings** danger action.
- Copy is explicit: "for fine-grained control and developer workflows." No pretending this is for everyone; also no *hiding* it — it's one of five tabs.
- This is the tab that measures our restraint: every future config that is not for the average user lands **here**, not as a new surface.

## Search behavior

Typing in the header filters every row/value in every pane live, hides tabs with no match, and auto-jumps to the first tab that has one. Clearing restores everything. (Prototype implements this.) If we later want VS Code-style `@` filters, the shape is ready for it.

## Focus state & the drawer path

- The panel opens from the **Assistant settings** row; it also becomes the deep-link target for the existing "Open Settings" jump from provider-error bubbles (replace `providersAutoOpen` deep-link with `assistantTab: 'providers'`).
- Sizing: this is the largest surface in Settings, so it uses a **new `document`-scale Dialog** (`min(600px, 88vw)` existing width, with an explicit wider variant when we ship it, e.g. `min(900px, 92vw)`) — deliberately larger than the current `panel` (420px) popups, because tabs + rail + rows all need horizontal room. Max height follows the existing 1.4× ratio rule (≈840px ceiling) with an internal scroll region — matching how Appearance/Remote Access already hand a sub-view to a Dialog.
- Narrow viewport: the Settings drawer already collapses to full-width below 640px; the panel follows suit — tabs scroll horizontally (already in the prototype with a hidden scrollbar), the rail hides, cards go full-width. This mirrors WhatsApp/Telegram: same surface, adaptive presentation. The phone experience is *read* the panel through its tabs, exactly like a full-screen settings page.

## What this does NOT change

- No new persistence or IPC is invented for the mockup; every row shown maps to an existing channel (`defaults.set`, `providers.list/setKey/test`, `search.setKey`, `permissions:list/remove`, `firstRun.getState`, downloads). "Friendly mode" and "Fuller view" are the only net-new settings, and both are trivial localStorage toggles.
- Claude Code's own preferences stay in Claude Code's preferences (the existing `onOpenClaudePreferences` button from the current popup).
- Android: the panel should render on Android settings too once permissions channels exist there (the current PermissionsButton already renders everywhere the channels exist); until then the row can be desktop-gated exactly as `ModelProvidersSection` is today.

## Open questions for Destin

1. **Row label:** "Assistant settings" vs "Model Providers" vs "Engine & permissions" — I've used **Assistant settings** because it also covers defaults + environment, but it's a judgment call.
2. **Where Remote Access lives:** kept separate in this mockup; worth an explicit nod if you'd rather it fold into the panel's Advanced tab later.
3. **Panel width:** the mockup renders ~900px; on a 1366px laptop that's comfortable. On smaller screens it degrades to full-width. Confirm that's the target.
4. **Friendly mode:** this is a *new* setting (plain-language replies) that I added as an example of the kind of row this panel is for; it may already exist as a concept elsewhere (a preference we could surface). Flag if so.
5. **`NEW` badge on the row:** mockup shows it; remove if we don't want anointments.

## Files this would touch (implementation sketch, for later)

- `desktop/src/renderer/components/SettingsPanel.tsx` — replace 4 rows (DefaultsButton, PermissionsButton, ModelProvidersSection + future) with 1 row; keep all existing handlers.
- `desktop/src/renderer/components/ModelProvidersPopup.tsx` — becomes the panel's Providers tab content.
- New `AssistantSettingsPanel.tsx` — the tab shell: header + search + tabs + rail + routing between the four sources above.
- `desktop/src/renderer/components/ui/Dialog.tsx` — add a `xlarge`/`document` width if we don't reuse `document` (600px is too narrow for two-column tabs).
- `desktop/src/renderer/components/ui/` — reusable pagination-style `TabBar` if `SegmentedTabs` (contained, one row) isn't the right fit for top-level navigation.
- Permissions mode cards reuse `permission-types.ts`; the mode control wires to the same Shift+Tab PTY channel the status bar uses.