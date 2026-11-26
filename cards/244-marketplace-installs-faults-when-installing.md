---
id: 244
title: Marketplace installs: faults when installing, updating and keeping plugins
stage: planning
priority: P2
tags: marketplace, install, bug
branch: 244-marketplace-installs-faults-when-installing
created: 2026-11-10
summary: Plugins and themes that fail to install, update or stay installed: Docker listings, Todoist, Messaging on Mac and Linux, missed theme updates.
area: Marketplace & library
work: session/security-server-batch
---
Progress
Done: 2026-11-13: update faults F1-F6 confirmed plus 9 more (uninstall reports success on failure, interrupted installs, no locks, drift, delisted plugins unflagged). Destin answered the marketplace-overhaul questions deck: updates follow the author's newest, only built-ins update by themselves, plugins move to an app-owned folder, hide 77 dead Docker listings, Messaging marked Windows only, badge reworded with a What-we-checked section, Library warns on Caution. Draft design: docs/active/specs/2026-11-13-marketplace-foundation-design.md on session/marketplace-update-faults.
Next: Destin confirms two scope points (plugins under YouCoded's own engine; key entry for Todoist), then mockups of the visible changes.
Blocked: nothing.

Open choices for Destin (2026-11-10)

1. Docker-packaged tool listings (293 in the catalog today) can be browsed but not installed; the page shows "Open source" instead of "Get", and for 77 of them that button is greyed out because the listing names no source.
   - Leave as is. Nothing changes; 77 listings stay a dead end with honest wording.
   - Hide the 77 with no source link. No dead buttons; those listings disappear from browsing.
   - Build Docker installs. A working "Get"; the user must have Docker, a key-entry screen is needed, and it is a large build.

2. Todoist shows an Install button that always fails with "This integration's setup method isn't supported in this version"; Try again fails the same way.
   - Mark it "Coming soon". Quick and honest; the Install button goes away.
   - Build key-entry setup. Todoist works; needs a new screen and secure storage for the key.

3. The Messaging listing says "SMS/iMessage" and looks installable everywhere, but it contains only a Windows program for Google Messages and no iMessage part.
   - Fix the wording only. Accurate text; Mac and Linux users can still install a plugin that does nothing for them.
   - Fix the wording and show it on Windows only. Matches reality; the listing disappears for Mac and Linux users.

4. Installed plugins can vanish if Claude Code re-downloads its marketplace folder, because the app installs into that folder. Checked 2026-11-10: no sign this is happening now — automatic refresh has been off since April and plugins installed July to November are all still in place on Destin's computer; the July incident was most likely a manual refresh.
   - Do nothing until it is seen again. No new code; if it recurs, plugins stay dead until reinstalled by hand.
   - Add a launch-time repair as insurance. Missing plugins come back by themselves; it is extra code for a problem not currently observed, in a file another unfinished branch (plugin-project-controls) also edits.
   - Move installs to a folder the app owns. The permanent fix; needs a design pass and a one-time move of every installed plugin.

Also found 2026-11-10, not acted on: the theme registry's rule says every content change must raise the version number; the new fingerprint check makes that a safety net rather than the only signal.

Chats
- 2026-11-10 session/security-server-batch: Batch 5: theme update check and Windows-only Messaging tool server built; four choices left for Destin
- 2026-10-18 session/google-connections-planning: Recovered TWO distinct historical findings (both re-checked 2026-11-10 and still real — choices 2 and 3 above)

From card #51 before the split
Merged in #56 "Installing and library: three faults"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (marketplace › install, status confirmed, seen on all, last checked 2026-09-01)
Installing and library: 3 faults. (a) 314 Docker-packaged MCP listings can be browsed but not installed; the page shows "Open source" instead of "Get" (report: docs/active/investigations/2026-09-01-marketplace-docker-mcp-install.md). (b) Installed plugins vanish when Claude Code refreshes its marketplace; bundled ones reinstall on launch, others stay dead until reinstalled by hand; needs a design pass (report: docs/active/investigations/2026-09-01-marketplace-plugins-install-into-cc-owned-dir.md). (c) Nothing warns you when an installed plugin turns unsafe; the Library row never changes (report: docs/active/investigations/2026-09-01-marketplace-installed-plugin-turns-unsafe.md).

(c) from the listings group, moved here because it is an update fault: A theme installed from a preview can keep the old mascot after its first release (Morning Rounds: Update hidden because both versions said 1.0.0); prevent it without forcing every new theme to bump.
