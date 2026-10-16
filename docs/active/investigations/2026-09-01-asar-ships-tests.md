---
date: 2026-09-01
status: active
type: investigation
topic: Every tsc-emitted file ships inside app.asar, tests and workbench included — electron-builder's files allowlist is `dist/**/*`
---

# The installer packs every `tsc` output, tests included

> **Status 2026-10-16:** partly fixed: `desktop/tsconfig.json` on master now excludes `src/**/*.test.ts(x)` (commit b1840ab34), so test files no longer compile into `dist/` and the 47 `.test.js` files should no longer ship. `electron-builder` still packs `dist/**/*` (only `dist/main/harness/eval` is excluded), so the 19 `dist/renderer/dev/workbench` files probably still ship; the installer has not been re-measured. Card #29 (release pipeline upkeep) links this report.

**Measured.** On the 1.2.4 Linux build (re-measured 2026-08-12): **47 `.test.js` files**
(`dist/main/__tests__/*`, `dist/main/analytics-service.test.js`, …) plus **19
`dist/renderer/dev/workbench/*.js`** files, including `fixture-loader.test.js`, are inside
`app.asar`. None is reachable: `index.html` loads only `assets/`, main loads `dist/main/main.js`, and
the entry chunk contains no `dev/workbench` reference. So this is installer weight and a slightly
larger surface for anyone unpacking the asar — not executable dead code, which is why it is a bug and
not a release blocker.

**Mechanism.** `npm run build` runs `tsc` over the whole `src/` tree into `dist/`, then
`vite build` produces the bundle the renderer loads. `youcoded/desktop/electron-builder.yml` has a
`files:` allowlist, but it is the whole of `dist/`:
<!-- claim: {"path": "youcoded/desktop/electron-builder.yml", "contains": "\n  - dist/\\*\\*/\\*"} -->

**Fix.** Narrow that `files:` entry (or narrow `tsconfig` `include` from `src/**/*` to `src/main/`),
then re-measure the asar file count. Pre-dates the workbench; the workbench made it 19 files worse
and is what surfaced it.

**History.** Filed 2026-07-29 while proving the UI workbench tree-shakes; corrected 2026-08-12
(config location); re-verified 2026-09-01.
