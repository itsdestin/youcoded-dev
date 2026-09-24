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

`seededAt` is written the first time the new build touches a project (listing it, opening
its tab, or starting a conversation in it). To make "what works today" identical on every
device, seeding also **materialises** the rule result for every item present at that
moment into explicit `items`/`plugins` entries (including Theme Builder = on for projects
that existed before the feature). Explicit entries then sync; a second device merges them
rather than recomputing. A project created after the feature ships gets `seededAt` at
creation and Theme Builder off, matching the approved defaults.

Plugin master: `plugins[p].on=false` pauses automatic use of every part; part entries keep
their values (approved: pause remembers choices). First enable with `partsChosen=false`
turns all parts on and sets `partsChosen=true`.

## 3. Enforcement (desktop native only)

`resolveAvailability(projectKey, catalogEntries, mcpEntries) → { skillIds:Set, mcpIds:Set }`
— pure function, the single source of truth, unit-tested.

- **Skills:** `NativeSessionHost` resolves the conversation's project from its cwd: the saved
  folder whose canonical path equals the cwd, or else the LONGEST saved folder that
  contains it (a conversation started in a subfolder of a project belongs to it). No
  existing helper does ancestor matching, so this is new code with its own unit table
  (exact, subfolder, sibling-prefix `proj` vs `project`, case on Windows, none), computes availability at
  `create()`, and passes a filtered `list()` into the session catalog alongside the preset
  allowlist (intersection). `load()` stays open, matching the allowlist precedent — manual
  `/skill` keeps working through the unfiltered host path.
- **Tool connections:** `McpManager.acquire(sessionId, allowIds?)` gains an optional
  allowlist, applied to `registry.resolveAllEnabled()` BEFORE any connect, so a turned-off
  server is never spawned for that session. The existing per-model budget drop then runs
  on the remaining list unchanged. `allowIds` undefined (every current caller) keeps
  today's behaviour exactly.
- **Frozen per conversation (Q-2):** the resolved `{skillIds, mcpIds}` is written into the
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
  file), a tool connection with `missingSecrets` (Ask assistant). "Ask assistant" starts a
  new conversation in that project with a prefilled request; "Choose skill file" opens the
  existing file picker and copies the file into `~/.claude/skills/<name>/`.
- **Drawer chips:** from `for-session`: green Automatic (in frozen set), amber Manual use
  (installed, not in set), red Unavailable (on in project, missing here; click opens the
  tab at the needs-setup section). One quiet line when the project setting differs from
  the frozen set (Q-2).
- **Marketplace post-install:** after a successful install the detail overlay switches to
  the approved project list (existing overlay, `targetKey` reset); every toggle writes
  through `project-extensions:set`, so Done/close keep choices.

## 6. Tests (pinning what must not regress)

- `resolveAvailability` unit table: every default rule, pause-preserves-parts, first-enable,
  materialised seeding, per-entry merge.
- Store: conflict-copy fold, unknown-key preservation, no sync write for unsynced folders.
- Host: a turned-off skill is absent from the Skill tool list but `/skill` still loads it;
  a turned-off server gets no tools and is not acquired; resume uses the stored set.
- IPC parity test covers the three channels; `bundled-plugins-parity` unaffected.
- Renderer: tab rows from a fixture view; chips per status; busy-app render budget stays
  green (the tab and chips must not subscribe to chat state).

## Open for Destin

1. **Conversations outside any project.** The decisions say no-project conversations get
   no automatic skills (not even Chat Search). Today they get everything, and "don't turn
   off what works today" also stands. The app has no incognito conversation yet.
   Proposed: outside a project, keep today's behaviour until incognito exists, then apply
   "none" to incognito only.
2. **Android.** The Android app has no Projects screen (every Projects channel is
   desktop-only), so Q-4's "show it with a note" has nowhere to appear yet. A phone browser
   on remote access does get the full tab, and there the switches really apply. Proposed:
   no Android work in this build; the note ships with whatever later build brings Projects
   to the Android app.
