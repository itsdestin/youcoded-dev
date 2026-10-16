---
id: 51
title: Marketplace: listing, install and admin faults, and the "Likely safe" badge
stage: planning
priority: P2
tags: marketplace, catalog, marketplace-screen, security, backend, install, bug
branch: 51-catalog-listings-and-previews-3
roadmap: marketplace: Catalog listings and previews: 3 small faults.
created: 2026-10-15
summary: Marketplace fixes: listings that undersell, install and library faults, admin and comment faults, and a "Likely safe" badge that needs real checks.
area: Marketplace & library
side: screens
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #130: Both are about theme preview pictures being unreliable (51b in the marketplace, 130a for themes you build yourself), and Destin asked to fix the whole class.

Chats

From the old roadmap (marketplace › catalog, status confirmed, seen on all, last checked 2026-09-01)
Catalog listings and previews: 3 small faults. (a) The "What this can do" panel under-reported capable plugins; four now show their real shell/network/key lines, but `desktop-commander` lists only "Connects to the internet" + "Adds 6 skills" — unverified whether that is honest. (b) Theme previews (Devil's Garden, Kuromi Dreamer) showed a blank band in the app; they now fall back to colour swatches, but whether the pictures load is unverified. Destin 2026-09-02: "previews in general are unreliable (not always created or shown correctly); fix the class". (c) A theme installed from a preview can keep the old mascot after its first release (Morning Rounds: Update hidden because both versions said 1.0.0); prevent it without forcing every new theme to bump.

Merged in #53 "Marketplace admin and comments: six small faults"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (marketplace › backend, status confirmed, seen on all, last checked 2026-09-01)
Admin analytics, comments and service upkeep: 6 small faults. (a) The Regions list in admin analytics is empty; every device arrives with a blank region. (b) Destin's Android phone is still counted as a user; likely fix is a "Copy analytics ID" control in About. (c) You cannot delete your own marketplace comment. (d) You cannot report a marketplace comment; needs a reporting UI, admin queue and resolution flow (report: docs/active/investigations/2026-09-01-marketplace-report-a-comment.md). (e) The old `wecoded-marketplace-api...workers.dev` address must stay alive until no supported build uses it; switching it off once took down the games lobby, sync and accounts. (f) The "publish to marketplace" plugin cannot be changed by a normal pull request because its deliberate test keys trip the key scan, so its help-text update was dropped.

Merged in #54 "Make the "Likely safe" badge earn its name"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (marketplace › backend, status confirmed, seen on all, last checked 2026-09-23)
The "Likely safe" badge claims more than the scan checks: it only looks for leaked secrets and file shapes. Destin, 2026-09-23: keep the wording and make the scan earn it — "maybe just use an llm … to evaluate for certain criteria". Wanted: an AI review of each plugin against a written list of what makes one unsafe, feeding the badge. Destin 2026-10-05 triage (roadmap-triage-2026-10-05#20): postponed — "1.3.2/1.3.3"

Merged in #56 "Installing and library: three faults"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

Chats

From the old roadmap (marketplace › install, status confirmed, seen on all, last checked 2026-09-01)
Installing and library: 3 faults. (a) 314 Docker-packaged MCP listings can be browsed but not installed; the page shows "Open source" instead of "Get" (report: docs/active/investigations/2026-09-01-marketplace-docker-mcp-install.md). (b) Installed plugins vanish when Claude Code refreshes its marketplace; bundled ones reinstall on launch, others stay dead until reinstalled by hand; needs a design pass (report: docs/active/investigations/2026-09-01-marketplace-plugins-install-into-cc-owned-dir.md). (c) Nothing warns you when an installed plugin turns unsafe; the Library row never changes (report: docs/active/investigations/2026-09-01-marketplace-installed-plugin-turns-unsafe.md).
