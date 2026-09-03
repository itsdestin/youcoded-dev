---
date: 2026-09-01
status: active
type: investigation
topic: A saved Bash permission that ALMOST covers a command looks like the app forgot the approval
---

# A saved permission that almost covers a command asks again, with no hint why

**Symptom.** The user picked a wide "Always allow" (e.g. "any `npm run`", or "pushing to
`feat/x`"). A later command that looks covered still raises the permission card, and the
card gives no reason — it presents exactly like the app forgot the grant.

**Mechanism.** `ruleMatches` in `youcoded/desktop/src/shared/subject-glob.ts` is the one
decision-path matcher, and it deliberately refuses a wildcard Bash grant in two cases:

1. **Chained command** — the command contains a shell operator the pattern does not
   (`npm run build && echo hi` under `npm run*`). Safety rule 1.
   <!-- claim: {"path": "youcoded/desktop/src/shared/subject-glob.ts", "contains": "SAFETY RULE 1 — a wildcard never swallows a second command"} -->
2. **Destructive flag after a bounded wildcard** — `git push origin feat/x --force` under a
   grant built for `git push origin feat/x` (`BOUNDED_RUNG_VETO`, safety rule 2).

Both refusals are correct. The defect is that the refusal is silent: `ruleMatches` returns
a bare `false`, `decidePermission` (`permission-engine.ts`) falls through to
`{ action: 'ask' }`, and the `AskRequest` shape in
`youcoded/desktop/src/main/harness/permission-broker.ts` carries `denyListed`, `external`,
`permissionMode`, `specialist` — but no field saying "a rule matched and was vetoed, and
why". The renderer card therefore cannot distinguish "no rule" from "rule vetoed".

**Constraint carried from the original decision (spec §4.5, amendment A5).** M5 2c
proposed surfacing only case 1, threaded engine → broker → dispatcher → card, and the plan
dropped it: explaining half the cases still leaves the user unable to trust that they will
be told. Do both cases or neither. Until then the caveat lives in the option's wording on
the Always-allow menu.

**Shape of the fix.** `ruleMatches` (or a sibling that returns a reason) reports which
safety rule vetoed the match; the engine records it on the decision; the broker threads it
onto `AskRequest`; the card renders one line ("Your `npm run` approval doesn't cover
commands joined with `&&`" / "…doesn't cover `--force`").

**Verified 2026-09-01.** No `nearMiss`/`almost` field exists anywhere under
`desktop/src/main/harness` or `desktop/src/shared/subject-glob.ts`; no commit touching
`subject-glob.ts`, `permission-broker.ts` or `permission-engine.ts` since 2026-08-13
addresses it.

History: filed 2026-08-13 (ROADMAP v1.3.1 section, deferred out of M5 2c by amendment A5).
Spec: `docs/archive/specs/2026-08-13-bash-always-allow-rule-shape.md` §4.5 + §15 A5.
