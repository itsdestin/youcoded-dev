---
id: 245
title: Marketplace comments, admin upkeep and the "Likely safe" badge
stage: planning
priority: P2
tags: marketplace, backend, security, bug
branch: 245-marketplace-comments-admin-upkeep-and
created: 2026-11-10
summary: You cannot delete or report a marketplace comment, admin analytics gaps, and a "Likely safe" badge that claims more than the scan checks.
area: Marketplace & library
---
Progress
Done: Split out of #51 on 2026-11-10. Phone users are now counted as phones (marketplace update, Nov 2 2026). Nothing else here was touched by Batch 5: every item changes what users see, so it waits for Destin.
Next: Destin decides the badge question below, and which comment and admin items to build.
Blocked: nothing.

Open choice for Destin (2026-11-10): the "Likely safe" badge
Today the badge only means "no leaked keys and the files are the right shape". The unsafe-plugin warning that shipped on Nov 5 uses a hand-reviewed block list, not the scan.
   - Keep the wording and add an AI review of each plugin against a written list of what makes one unsafe (your 2026-09-23 direction, postponed 2026-10-05). The badge earns its name; it is a real build with a running cost per plugin, and the AI can be wrong in both directions.
   - Reword the badge to what the scan checks (for example "No leaked keys found"). Honest today and nearly free; the listing looks less reassuring.
   - Leave as is. No work; the badge keeps promising more than is checked.

Chats

From card #51 before the split
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
