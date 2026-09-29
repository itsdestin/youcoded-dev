---
status: shipped
---

# Approved native harness plan — review

Reviewed: master plan plus turn-lifecycle, instruction-lifecycle, and tools/connections batch plans; decision record and implementation contract. Reviewer task: `d837931a-8c08-4eaf-966f-92f9201795df`.

- F1 accepted — Delayed group termination must not rely solely on a negative-PID/group-existence check: a numeric group ID can be recycled after the original group exits. Task C2 now requires retained process-instance ownership evidence, fresh identity/membership verification, explicit handling of verification-to-signal races, and skipping escalation with an unconfirmed-cleanup outcome when ownership cannot be established. Added planned regressions for recycled group IDs, recycled member PIDs, inaccessible identity and changes during verification. The implementation still needs fresh process-safety review and executed tests; this is a plan correction, not a repaired runtime.

The reviewer found no other material contradiction in the reviewed plans. The change narrows execution to the contract's existing “verified group” requirement; it does not change the user's chosen two-second grace, background-job policy, or approved scope. The served contract and historical answers were not modified by this correction.
