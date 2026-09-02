---
date: 2026-09-01
status: active
type: investigation
topic: what "report a comment" actually costs — the reports table is welded to ratings by NOT NULLs, not by foreign keys
---

# Report a comment — the real cost

Deliberately absent in the feedback v1 (spec §5). The deferred note used to overstate the
cost: `reports_v2` is not structurally welded to ratings — its PK is a plain random id and
`rating_user_id` / `rating_plugin_id` are ordinary `NOT NULL` columns with no foreign key.
<!-- claim: {"path": "wecoded-marketplace/worker/migrations/0003_accounts_identity.sql", "contains": "rating_plugin_id TEXT NOT NULL"} -->

Pointing it at a comment needs a nullable `comment_id` plus relaxing those two `NOT NULL`s
(a SQLite table rebuild, which migration 0003 already does five times) **and** the reporting
UI, an admin queue and a resolution flow. Real work, not a redesign.

This is a **re-add**, not a first build: the mockup shipped a Report button on comments that
filed against the commenter's *star rating* — removed 2026-08-28.

History: added 2026-08-28 (old ROADMAP L945). Re-checked 2026-09-01: no `comment_id` anywhere
under `worker/`.
