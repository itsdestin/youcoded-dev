---
date: 2026-09-01
status: active
type: investigation
topic: the catalog ingest scans a repo's default branch and ignores index.json's sourceGitRef
---

# Ingest ignores `sourceGitRef`

`index.json` may record a `sourceGitRef` for a plugin that ships from a non-default branch.
The WeCoded ingest (`wecoded-marketplace/scripts/catalog/sources/wecoded.mjs`) never reads
it: for every repo it asks GitHub for the tip of `default_branch` and scans that tree.
<!-- claim: {"path": "wecoded-marketplace/scripts/catalog/sources/wecoded.mjs", "contains": "commits/\\$\\{r\\.default_branch\\}"} -->

Four live entries name something other than the default branch — `netsuite-ai-companion`,
`netsuite-finance-analyst`, `netsuite-suitecloud` (all `ai-plugins-dist`) and
`42crunch-api-security-testing` (`v1.5.5`). Their folders do not exist on the default
branch, so the fetch returned an empty file list, the scan found nothing suspicious in
nothing, and stamped `checked` — the exact thing `.claude/rules/catalog.md` forbids.

**What has been done:**
- wecoded-marketplace#77 stops NEW false verdicts (an unreadable tree now forces
  `unchecked`, guarded by a test).
- The existing false verdicts were cleared by hand on 2026-08-31 — 19 rows deleted from
  production D1 and rebuilt by the next ingest: 13 netsuite rows now `unchecked`; 42crunch
  came back genuinely `checked` (its files ARE readable on the default branch). No listing
  currently claims a verdict nobody earned.

**What remains:** the root cause. Those 13 netsuite rows will read "Not checked" forever even
though their code is scannable on `ai-plugins-dist`. Fix = resolve `sourceGitRef` when
present (84 live entries record one; 4 name a non-default ref). Note the deletion trick is
NOT a general remedy — merge rule 1 (an incoming `unchecked` never overwrites a stored
`checked`) will protect any future false verdict the same way; `--force-rescan` blanks the
skip key, not the merge. `docs/catalog.md` in the marketplace repo records the same finding.

History: added 2026-08-31 (old ROADMAP L127). Re-checked 2026-09-01: `sourceGitRef` still
appears nowhere under `worker/src` or `scripts/catalog/sources/`.
