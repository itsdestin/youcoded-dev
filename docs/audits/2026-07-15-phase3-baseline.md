---
date: 2026-07-15
scope: baseline (mechanical only)
residue: 0
verified_shas:
  workspace: 9b8cc35460a1590b0679090fc89d173f5705a7d2
  youcoded: eb2036a3307b77eb9c273bb50872ffebf94275ef
  youcoded-core: 973accd78f2bd2d2c1ecd970aeafd90873af1653
  youcoded-admin: dedf2d66ed72f1e1de751357adc8002b50fb1e27
  wecoded-themes: d389311007399205649b79a0f9d1508947d70ba0
  wecoded-marketplace: 558608a3944b64327f1984c08f3b19748d6e83b8
---

# Audit baseline — 2026-07-15

First report under the rebuilt /audit (Phase 3 of the knowledge-management redesign).
Mechanical pass only: all rule `verify:` anchors, MAP paths, rule globs, and store
budgets pass (`node scripts/audit-anchors.mjs` exit 0 at the SHAs above). Semantic
verification is deliberately omitted — Phases 1–2 verified every rule and depth doc
against code on this same date (see `2026-07-15-knowledge-mgmt-changelog.md`).

This report exists to seed diff-scoping: the next `/audit` diffs each repo from the
`verified_shas` above and re-verifies only what changed.
