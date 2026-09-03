---
date: 2026-09-01
status: active
type: investigation
topic: A remembered "Always allow" outranks the destructive deny-list — no non-overridable floor under native permissions
---

# Nothing sits below a remembered grant

**Symptom.** Once the user has saved a wide-enough Bash approval, a destructive command
(`rm -rf …` on a workspace or system directory) can run without asking. Claude Code stops
these regardless of any rule; the native harness does not.

**Mechanism.** `decidePermission` in `youcoded/desktop/src/main/harness/permission-engine.ts`
concatenates the layers `presetRules → modeRules → denyList → rememberedRules` and lets the
*last* match win — by design, remembered user decisions are the final word, including over
the deny-list.
<!-- claim: {"path": "youcoded/desktop/src/main/harness/permission-engine.ts", "contains": "final word — including over the deny-list"} -->
The deny-list itself (`DESTRUCTIVE_DENY_LIST`, `shared/permission-types.ts`) is pattern
matching (`* rm *`), so it is only as good as the pattern. The offer side is guarded —
`bashGrantOptions` (`shared/bash-grant-shapes.ts`) never *offers* a rung that admits a
`HOSTILE_CORPUS` command — but a stored rule, once it exists, is not re-checked at decision
time against anything that cannot be expressed as a rule. The engine's own header says the
tool-layer guards (secret paths, external directory) are the only non-rule checks.

**Shape.** Port Claude Code's `rm`-target analyzer as a check *below* the permission system
that no rule can auto-allow: resolve the removal target statically and refuse (or force an
ask) for the six cases in the family — workspace directory, critical system directory,
target not statically resolvable, glob traversing non-enumerable directories, `$UNSET`
expanding to `/`, `cd` before removal. Pure logic, own test suite, platform-independent;
it belongs next to `guards.ts`, not in the rule layers.

**Verified 2026-09-01.** `rg -i "rm-target|rmTarget|analyzeRm|criticalSystem"
desktop/src` → nothing.

History: filed 2026-08-26.
