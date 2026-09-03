---
date: 2026-09-01
status: active
type: investigation
topic: Multi-model cwd contract — Bash workdir param, file-tool relative-path policy, one canonical cwd-rules block; blocked on a Destin decision
---

# Multi-model cwd contract

**Symptom.** After the shell's directory has moved (a `cd` inside Bash), a relative path that exists
under BOTH the workspace root and the shell's directory makes Read and Bash silently open two
different files. Non-Claude models also get only a one-line "Working directory:" statement and no
rules for how the file tools and the shell resolve paths.

## State (re-checked against master 2026-09-01, `f2d229e4`)

Plan: `docs/active/plans/2026-07-18-multi-model-cwd-contract.md` (4 work items).

- Item 1, Bash `workdir` param — unbuilt (`rg -n workdir tools/bash.ts` → 0).
- Item 4, `<cwd-rules>` block — unbuilt (see below).
- Item 2 shipped in a DIFFERENT shape on 2026-08-11: `harness/tools/guards.ts`'s `shellCwdMissHint` /
  `workspaceRootMissHint` name the *other* cwd when a path misses, instead of rejecting relative
  paths.
- **Residual hazard the hints do not cover:** they fire only on a MISS. When the same relative name
  exists under both roots, nothing fires and the two tools diverge silently.

`prompt-assembly.ts` still emits only the one-line working-directory statement — no rules block.
<!-- claim: {"path": "youcoded/desktop/src/main/harness/prompt-assembly.ts", "contains": "Working directory: \\$\\{i\\.cwd\\}"} -->

## The decision (Destin)

Reject relative paths outright in the file tools — breaks nothing today, but changes every model's
habits — or keep accepting them with the miss hints, leaving the both-files-exist case open?

History: filed 2026-08-26 (plan written 2026-07-18). Re-verified 2026-09-01.
