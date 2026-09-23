---
status: draft
owner: Destin (decisions)
date: 2026-09-23
---

# Project-scoped skills, plugins, and MCP — decisions to preserve

**This is a decision record, not an approved UI or implementation spec.** It records what Destin decided in conversation and in `docs/active/design/2026-09-23-project-plugin-controls/project-plugin-controls.questions.answers.json`. Do not fill gaps by extrapolating from the rejected mockups. The built-in **Your Assistant** project itself remains a planned project (`docs/roadmap/native-harness.md` → sessions), so this feature depends on work not yet shipped.

## Availability and scope

- Use **one installed copy with per-project availability settings**, not separate copies per project or a shared installed/uninstalled switch. Destin chose this in chat after comparing three approaches; it was not an answer on the saved questions deck. YouCoded should ultimately manage marketplace plugins **and** personally added skills, externally installed Claude Code plugins, and MCP servers; native YouCoded sessions come first.
- Enabling a skill for a project means the assistant knows it exists and may choose to read/invoke it when relevant, following the current on-demand loading behavior. Do **not** inject every enabled skill's full file into every new conversation. A skill that is off for automatic use remains deliberately callable through `/` or the command drawer. Manual use does not change a project setting; its contents can remain in that conversation's history afterward.
- A plugin's project switch is a **master pause for automatic use**, not a prohibition on deliberately invoking its skills. Turning the whole plugin on enables its parts; users can then turn individual parts off. Turning the master off remembers those item choices. Skills beneath an off master may be less prominent in the command drawer; exact presentation is not decided.
- MCP servers differ: an off server's tools are unavailable in that conversation. Turning it on affects **new conversations**, not an open one. On-demand or mid-session MCP connections are deferred. MCP entries should still be discoverable in the drawer as unavailable, without pretending they can be invoked from the open conversation.
- All availability changes apply **only to new conversations**; no automatic injection, refresh, or mid-session tool-set change is in this initial design. Configuration should say so. A no-project/incognito conversation gets **no automatically available skills** (including Chat Search).
- A setting in Your Assistant applies to conversations in **Your Assistant only**; it does not become an inherited global setting in ordinary projects.

## Installation, defaults, and existing state

- A **new marketplace download** starts installed but inactive in every project. Immediately open configuration for that downloaded plugin. If the user closes it without enabling anything, the plugin stays installed and inactive and can be configured later from Projects. The user can make choices for several projects during this flow.
- **Do not auto-disable or migrate existing items to off.** Marketplace installs and other items already present when these controls arrive keep their current behavior. A newly added personal or project skill outside the marketplace also keeps today's discovery/default behavior; if it is enabled, show that as enabled in the configuration UI.
- The four bundled plugins currently are Chat Search, Page Builder, Marketplace Publisher, and Theme Builder (`youcoded/desktop/src/shared/bundled-plugins.ts`). **All four are always available and cannot be disabled in Your Assistant.** The intended defaults for ordinary projects are Chat Search, Page Builder, and Marketplace Publisher automatically enabled **but disableable**, with Theme Builder off and enableable. Incognito is the exception: none is automatic there, including Chat Search. Bundled plugins remain installed regardless of these project choices. **How those defaults apply to pre-existing projects without violating the preserve-current-behavior decision is not settled**; do not silently turn off a bundled skill that currently works there.
- Enabling components that **connect or execute automatically** (e.g., MCP servers or hooks) requires a risk explanation and confirmation **every time they are enabled**. Turning on a whole plugin with multiple such components gets **one confirmation listing the affected components**, not one popup per component. Ordinary skill discovery alone does not trigger this confirmation. The precise risk copy and interaction need UI review; confirmation is not approval to bypass existing permissions.

## Across devices and Claude Code

- Project availability choices should follow the synced project to other devices. **Do not auto-install plugin files.** If a configured plugin is absent on another device, keep it visible in the relevant project controls with an **Install** action; it cannot run until installed locally.
- **Never sync MCP credentials**, and likely do not sync device-specific MCP settings. An enabled server without local setup is omitted when a conversation starts, **without a start-of-chat notice**. Project configuration instead shows a **Set up on this device** action/notice.
- Destin expects skill files *inside a synced project folder* to travel with that project's file sync; the current project sync default ignores do not exclude `.claude/skills/` (`youcoded/desktop/src/main/sync-spaces/guards.ts`), subject to sync actually being enabled and file-size/ignore rules. His Q-4 note was a question about existing behavior, not proof that every project's files already sync. A personal skill in `~/.claude/skills/` is outside the project; Destin prefers such files to travel too, but **how to sync personal skills safely is undecided**. Do not claim project sync already covers the personal folder.
- Do not silently rewrite or override existing Claude Code settings. Later Claude Code integration may make project switches apply to Claude Code conversations **only after explicit user consent that explains which settings YouCoded would change**. Without consent, Claude Code remains exempt from these controls. Build and test native behavior first; the practical interaction with new marketplace installs and Claude Code's current registries still needs design.

## UI direction, not an approved layout

- Destin proposed an install flow focused on the downloaded plugin, with all projects visible as expandable entries and that plugin's master and item controls per project. The settings should remain reachable from the Projects page. This is **behavioral direction, not approval of the mockup's layout**.
- The command drawer should convey **automatic / manual / unavailable** states (or equivalent clear statuses). Off skills can still be deliberately invoked; off MCP tools cannot. Whether these states need separate sections, tags, ordering or both is **deferred to UI review**.
- Your Assistant's non-disableable bundled switches were approved in the second review **shown on but visually subdued, with a hover/focus explanation**. The round-6 group styling below is the other visual direction approved so far.
- **The install-flow card grouping in rounds 1–5 was rejected.** Destin: it “disregarded how all app pages/settings menus group and arrange items.” Round 6 changed only grouping/collapsing/styling to follow an existing YouCoded collapsible-card pattern: a project contains a plugin group, and the plugin contains individual setting cards. Destin approved **that grouping direction only** in `project-plugin-controls.review-6.answers.json` (“good enough for now”). This does **not** approve the standalone mockup as the full install-flow layout, its sample data, the command drawer, or backend behavior. Do not copy `youcoded/desktop/src/renderer/dev/workbench/mockups/ProjectPluginControls.tsx` wholesale as an implementation contract; review the feature in the actual Projects/settings screen before building it.

## Still open before a build contract

1. A visually approved, full-context Projects install/configuration flow, including install-on-other-device and local-MCP-setup states; command drawer status treatment and accessibility on desktop/phone. **The round-6 grouping direction is approved; the full install-layout mockup is not.**
2. Personal-skill syncing outside project folders, and the representation/control of external skills and servers across different devices.
3. Native MCP tool connection and policy behavior, with a later separate decision on one-time/mid-session connections; Claude Code opt-in design after native behavior works.
4. A written implementation/acceptance contract and platform verification. This record is **not** that contract and authorizes no production behavior change.

No production code, marketplace installation policy, or live configuration was changed during this discussion. The only app code in this session's worktree is a **workbench-only visual prototype**; its round-6 card grouping is approved as a direction, but the overall feature UI remains unapproved.
