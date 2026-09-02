---
date: 2026-09-01
status: active
type: investigation
topic: a plugin you already installed can turn unsafe in the catalog and nothing tells you
---

# Nothing warns you when an installed plugin becomes unsafe

The hourly ingest re-scans a plugin's files every time its author pushes, so the catalog
*knows* when something a user installed weeks ago started downloading and running remote
code, or gained a hard-coded key. That never reaches the user: the Library row does not
change, no notification fires, and the safety shield is rendered in exactly one place —
the marketplace `TrustBadges` — on a page they have no reason to revisit.
<!-- claim: {"path": "youcoded/desktop/src/renderer/components/marketplace/TrustBadges.tsx", "contains": "data-scan=\\{scan\\.status\\}"} -->

This is a surfacing problem, not a detection one — the data and the scan exist since the
overhaul's Phase 2.

Wants: compare the installed `PackageInfo.commit` against the catalog's current `scan.status`
for that id, and surface a change from `checked` → `caution` on the Library row plus wherever
update badges already appear.

**Guard it the way "No longer listed" is guarded** — only act when the *catalog* answered
`fetchIndex()`, never the `index.json` fallback or a stale cache; otherwise one unreachable
Worker flags everything on the machine.

Highest-value safety gap left after the overhaul: the scanner's whole value is telling users
what a version does, and today it says it once, at the moment they were already deciding.

History: added 2026-08-31 (old ROADMAP L924). Re-checked 2026-09-01: `scan.status` is read
only under `components/marketplace/`; nothing in `skill-provider.ts` or the Library compares
it against an installed package.
