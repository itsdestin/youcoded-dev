---
id: 51
title: Marketplace listings and previews: faults and the featured list
stage: planning
priority: P2
tags: marketplace, catalog, marketplace-screen, bug
branch: 51-catalog-listings-and-previews-3
roadmap: marketplace: Catalog listings and previews: 3 small faults.
created: 2026-10-15
summary: Marketplace listings that undersell or mislead, unreliable theme preview pictures, and a featured list that needs re-curating.
area: Marketplace & library
side: screens
vision: marketplace.browse, marketplace.setup.install
---
Progress
Done: Split in three on 2026-11-10: this card keeps listings and previews; install faults moved to #244; comments, admin upkeep and the "Likely safe" badge moved to #245. Nothing on this card was changed by Batch 5, because every item changes what a listing shows.
Next: Destin decides which listing and preview changes to make; item (c) below (missed theme update) moved to #244.
Blocked: nothing recorded.

See also #130: Both are about theme preview pictures being unreliable (51b in the marketplace, 130a for themes you build yourself), and Destin asked to fix the whole class.

Chats

From the old roadmap (marketplace › catalog, status confirmed, seen on all, last checked 2026-09-01)
Catalog listings and previews: 3 small faults. (a) The "What this can do" panel under-reported capable plugins; four now show their real shell/network/key lines, but `desktop-commander` lists only "Connects to the internet" + "Adds 6 skills" — unverified whether that is honest. (b) Theme previews (Devil's Garden, Kuromi Dreamer) showed a blank band in the app; they now fall back to colour swatches, but whether the pictures load is unverified. Destin 2026-09-02: "previews in general are unreliable (not always created or shown correctly); fix the class". (c) A theme installed from a preview can keep the old mascot after its first release (Morning Rounds: Update hidden because both versions said 1.0.0); prevent it without forcing every new theme to bump.

From the 2026-10-16 document sweep
- Re-curate the featured list: unhide google-services, spotify-services and youcoded-chatsearch, and fix the hero item. Source: docs/active/investigations/2026-08-31-marketplace-featuring-recommendations.md
- Nine featured items show "Not checked"; the "What this can do" panel should say what an MCP server can do; MCP servers need an install path. Source: same document
