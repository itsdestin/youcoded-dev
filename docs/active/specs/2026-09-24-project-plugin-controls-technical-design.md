---
status: draft
date: 2026-09-24
---

# Project skills & tools — technical design (first build)

Product decisions: `2026-09-23-project-extension-availability-decisions.md`. Approved UI and answers:
`docs/active/design/2026-09-23-project-plugin-controls/` (final rounds: `combined-review`,
`combined-review-2`). This document is HOW; it adds no product behaviour. Where the code
forced a choice the decks did not settle, it is listed under **Open for Destin**.

## Scope

In: desktop native (YouCoded harness) conversations in ordinary projects; the Projects →
Skills & tools tab; the command drawer's status chips; the Marketplace post-install
project setup; the risk confirmation; the needs-setup popup; remote-browser access to all of
it (same renderer, desktop backend).

Out (decided): Your Assistant's locked switches (Q-1, added when that project ships);
Claude Code sessions on any platform (exempt until an opt-in); personal-skill file sync;
mid-conversation MCP connection; a tool-connection settings form (Q-3).

## Source facts this design rests on (origin/master, 2026-09-24)

- The model's skill list is `HarnessSession.scopedSkillCatalog()` (`harness-session.ts`):
  it already narrows `list()` by a preset allowlist and leaves `load()` open. The
  Skill tool, the "What the assistant was given" panel and `loadSkillBody` all read it.
- Manual `/skill` goes `native.invokeSkill` → `NativeSessionHost.invokeSkill`, which builds
  an UNFILTERED `createSkillCatalog(undefined, cwd)` — so narrowing the model's list never
  blocks manual use.
- MCP: one process-wide `McpManager`; `NativeSessionHost.acquireMcp(sessionId)` at
  `create()`/`resume()`; tools fixed for the session's life. Registry
  `~/.youcoded/mcp.json` already syncs across devices WITHOUT secrets; an entry whose
  secrets are absent resolves with `missingSecrets` (= "needs setup here").
- Skill entries carry `source` (`self` = `~/.claude/skills`, `project`, plugin sources)
  and `pluginName`. Marketplace installs record `installedAt` (`skill-config-store.ts`).
- Projects are the saved folders (`saved-folder-projects.ts`). A synced project's
  cross-device identity is its folder `name` (`sync-spaces/project-registry.ts`,
  `Personal/ProjectSync/<name>.json`). That record's `parseEntry` REBUILDS the object on
  every read, on this build as well as older ones, so any field we added there would be
  dropped by the next rename or description write.
- Android: local sessions run Claude Code; every `artifacts:*` Projects channel answers
  `not-implemented-on-mobile` (`SessionService.kt`) — the Android app has **no Projects
  screen today**. The only phone that can open Skills & tools is a phone browser using
  remote access to the desktop, where the tab fully applies.

## 1. Storage

**One settings record per project**, keyed by a project key:
- synced project → `name`; stored at `Personal/ProjectExtensions/<name>.json` (a
  SIBLING folder, not a field in `ProjectSync/<name>.json`, so an older build rewriting the
  registry record cannot erase it). Conflict copies fold on read like ProjectSync does.
- unsynced saved folder → canonical path; stored locally in
  `~/.youcoded/project-extensions.local.json` (map of path → record). Never synced.

Record (`schemaVersion: 1`):

    { schemaVersion, seededAt,                       // ms; see §2
      plugins: { [pluginId]: { on, partsChosen, at } },
      items:   { [itemKey]:  { on, at } } }          // at = ms clock, per entry

`seededAt` merges as the EARLIEST non-zero value across copies, so every device agrees on
one seed moment (it only ever moves earlier, never later).

`itemKey`: skills by their catalog id (`plugin:skill`, or `self:<name>` / `project:<name>`
for non-plugin skills); tool connections as `mcp:<serverId>`. Merge across devices is
**per entry, last-writer-wins by `at`** (content tie-break), so switching two different
items on two devices both survive. Unknown keys are preserved on write.

Writes go through one main-process module (`project-extensions/store.ts`) using the
existing locked read-modify-write helper (`artifacts/cas-write.ts`), all async (perf rule 1).

## 2. Defaults and migration ("don't turn off what works today")

An item with no entry in the record resolves by rule, evaluated on the device:
1. Bundled plugins: Chat Search, Page Builder, Marketplace Publisher → on. Theme Builder →
   off (a project that existed before the feature already has an explicit `on` from
   seeding, below, so this only affects new projects).
2. A marketplace plugin (and its skills / tool connections) whose `installedAt` is AFTER the
   project's `seededAt` → **off**. `installedAt` is an ISO string in `youcoded-skills.json`;
   it is parsed with `Date.parse` and a missing or unparseable value counts as "before"
   (so a damaged record can only keep something on, never turn it off) (new downloads start inactive; the setup flow writes `on`).
3. Everything else (earlier installs, personal/project skills, user-added or adopted tool
   connections) → **on**, which is today's behaviour.

`seededAt` is written ONCE per project, only when absent, and only when the user opens that
project's Skills & tools tab or starts a conversation in it — never by listing projects, so
opening the Projects page causes no writes (pin: listing N projects writes nothing; a second
seed of the same project writes nothing). To make "what works today" identical on every
device, seeding also **materialises** the rule result for every item present at that
moment into explicit `items`/`plugins` entries (including Theme Builder = on for projects
that existed before the feature). Explicit entries then sync; a second device merges them
rather than recomputing. A project created after the feature ships gets `seededAt` at
creation and Theme Builder off, matching the approved defaults.

Uninstall: removing a plugin writes `plugins[p] = {on:false, removed:true, at}` in every
project that has an entry for it (mirroring `skill-config-store`'s `removePackage` cascade).
`removed` hides it from needs-setup on every device, so no phantom "Install" row appears
for something deliberately removed; installing it again clears `removed` through the setup
flow.

Plugin master: `plugins[p].on=false` pauses automatic use of every part; part entries keep
their values (approved: pause remembers choices). First enable with `partsChosen=false`
turns all parts on and sets `partsChosen=true`.

## 3. Enforcement (desktop native only)

`resolveAvailability(projectKey, catalogEntries, mcpEntries) → { skillIds:Set, mcpIds:Set }`
— pure function, the single source of truth, unit-tested.

- **Skills:** `NativeSessionHost` resolves the conversation's project from its cwd by EXACT canonical-path match to a
  saved folder — the same rule Project View's `matchProjectByPath` uses, so both always
  agree. No ancestor matching: the app seeds a "Home" saved folder at the user's home
  directory and picks it as the default new-conversation folder
  (`folders-service.ts`, `FolderSwitcher.tsx`), so an ancestor rule would have swallowed
  every folder into Home and silently defeated B-1. Conversations in the Home folder are in
  the Home project and follow its switches (seeded to today's behaviour), computes availability at
  `create()`, and passes a filtered `list()` into the session catalog alongside the preset
  allowlist (intersection). `load()` stays open, matching the allowlist precedent — manual
  `/skill` keeps working through the unfiltered host path.
- **Tool connections:** `McpManager.acquire(sessionId, allowIds?)` gains an optional
  allowlist, applied to `registry.resolveAllEnabled()` BEFORE any connect, so a turned-off
  server is never spawned for that session. The existing per-model budget drop then runs
  on the remaining list unchanged. `allowIds` undefined (every current caller) keeps
  today's behaviour exactly.
- **Frozen per conversation (Q-2):** written for EVERY native session, including those
  outside a project (empty set, per B-1). the resolved `{skillIds, mcpIds}` is written into the
  native session header at create. `resume()` reuses the stored set, not the current
  setting, so reopening an old conversation keeps what it started with. Sessions with no
  stored set (created before this build) resolve as "everything on", i.e. today.
- **Outside any project:** see Open for Destin #1.
- **Claude Code sessions:** untouched. No write to `~/.claude/settings.json` or plugin
  registries.

## 4. IPC (new channels, parity per `youcoded/CLAUDE.md`)

| Channel | Returns |
|---|---|
| `project-extensions:get` `{projectKey}` | resolved view for the tab: bundled / installed / needs-setup rows with on/off and why |
| `project-extensions:set` `{projectKey, changes}` | writes entries; returns the new view |
| `project-extensions:for-session` `{sessionId}` | the frozen set + whether the project's current setting differs (drawer chips and the Q-2 line) |

`preload.ts`, `remote-shim.ts`, `ipc-handlers.ts` and `remote-server.ts` (the remote
browser's router, beside the existing `artifacts:*`/`project:*` cases) get all three; `SessionService.kt`
answers `not-implemented-on-mobile` (same convention as every Projects channel), and the
renderer hides chips when the answer is not-implemented. Remote browsers use the desktop
backend and get the full feature.

## 5. Renderer

- **Skills & tools tab:** production component replaces the workbench demo, fed by
  `project-extensions:get`. Rows reuse the approved anatomy (full-width `SettingRow`,
  wrapping descriptions on narrow, group micro-labels). Kept-mounted rule: the tab is a
  `hidden` + `React.memo` child with stable props and no own context read (perf rule 2).
- **Risk confirmation:** the approved popup (`Dialog`, prompt size) whenever an `on`
  change includes a tool connection; one popup per change naming every such part.
- **Needs setup:** rows for items on in the project but absent here — a synced marketplace
  plugin not installed (Install), a personal skill missing (Q-3: Ask assistant / Choose skill
  file — a personal skill is a FOLDER, so the picker selects its `SKILL.md` and the whole
  containing folder is copied with async `fs.promises.cp(…, {recursive})` into
  `~/.claude/skills/<name>/`, refusing to overwrite an existing folder), a tool connection with `missingSecrets` (Ask assistant). "Ask assistant" starts a
  new conversation in that project with a prefilled request; "Choose skill file" opens the
  existing file picker and copies the file into `~/.claude/skills/<name>/`.
- **Drawer chips:** `CommandDrawer` is mounted once at the App shell with no session id, so
  App passes the active session id down as a plain prop (no new context). A small hook
  `useSessionAvailability(sessionId, open)` fetches `for-session` ONLY while the drawer is
  open, and again when the session id changes while open — same gating as the sibling
  `useMarketplace(open)` (perf rules 2–4). Chips: green Automatic (in the frozen set), amber
  Manual use (installed, not in the set), red Unavailable. `SkillCard`'s status type gains
  `'unavailable'`. Unavailable items are not in `SkillContext.installed`, so `for-session`
  returns them as `missing[]` ({key, displayName, kind, projectKey}) and the drawer renders
  them as their own dimmed cards after the installed grid (the approved shape); clicking
  one closes the drawer and opens Projects → Skills & tools for that project, scrolled to
  its row. One quiet line when the project setting differs from the frozen set (Q-2).
- **Marketplace post-install (net-new, the largest renderer piece):** a production
  `ProjectSetupPanel` replaces the workbench demo. It takes the installed plugin's id and
  its parts (skills + tool connections from the install result) and lists every project
  from `artifacts:list-projects-index`, each an expandable row of the approved anatomy;
  toggles write through `project-extensions:set` (with the risk popup), so Done/close keep
  choices. `MarketplaceDetailOverlay` shows it after `installSkill` resolves successfully
  for a plugin that has parts — for every plugin, not a fixture id — and resets on target
  change (`targetKey`). Themes and prompt-only skills keep today's post-install view.

## 6. Tests (pinning what must not regress)

- `resolveAvailability` unit table: every default rule, pause-preserves-parts, first-enable,
  materialised seeding, per-entry merge.
- Store: conflict-copy fold, unknown-key preservation, no sync write for unsynced folders.
- Host: a turned-off skill is absent from the Skill tool list but `/skill` still loads it;
  a turned-off server gets no tools and is not acquired; resume uses the stored set.
- IPC parity test covers the three channels; `bundled-plugins-parity` unaffected.
- Renderer: tab rows from a fixture view; chips per status including a `missing[]` card;
  `useSessionAvailability` fetches nothing while the drawer is closed (pin: a session switch
  with the drawer closed makes zero `for-session` calls); a new case in
  `busy-app-render-budget.test.tsx` — streaming into a hidden tab redraws neither the drawer
  nor the Skills & tools tab.

## Resolved by Destin (`project-plugin-controls.build-questions.answers.json`, 2026-09-24)

1. **B-1 `none-outside`:** a native conversation whose cwd is in no saved-folder project
   gets NO automatic skills and NO tool connections (including Chat Search). Manual `/skill`
   still works (the host path is unfiltered). The drawer shows every installed skill amber "Manual use"
   there and no Unavailable cards (there is no project whose choices could be missing).
   In practice this is rarer than it sounds: new conversations default to the Home folder,
   which IS a project (see §3). This is a deliberate behaviour change: release notes must say so.
2. **B-2 `later`:** no Android work in this build. Android keeps answering the new channels
   `not-implemented-on-mobile`; the renderer hides chips on that answer. Remote browsers get
   the full feature from the desktop.
