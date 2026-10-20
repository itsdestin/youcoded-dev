# Standalone Claude queue transport review

status: active

Fresh read-only reviewer: Vega / b018ee40-8b22-48e6-afa3-15c8e90aa1de. The six actual-CLI cases and 299 focused tests are positive evidence, not exhaustive race coverage. All findings below are accepted and assigned to the implementation worker before final app enablement.

| ID | Severity | Disposition | Finding and required regression |
|---|---|---|---|
| T2-R1 | Critical | accepted; fix assigned | Native admission validated its fence before awaiting CAS and host admission acknowledgement, then invoked next without rechecking. Delay admitted acknowledgement past deadline/release; prove zero downstream invocation and explicit pre-invocation resolution. |
| T2-R2 | Important | accepted; fix assigned | CAS admission followed by failed host bookkeeping returned drop without next but left the lease permanently admitted/unknown. Track an explicit admitted-but-not-invoked terminal outcome; prove guarded cleanup and safe reconciliation while preserving uncertainty after any actual next invocation. |
| T2-R3 | Important | accepted; fix assigned | A claim invalidated before worker acquire was returned to waiting but its in-memory attempt correlation remained, blocking subsequent offers. Defer claim persistence, change input safety, then restore safety; a fresh boundary must claim the waiting item. Retain conservative state if notSent persistence fails. |

Task3 integration obligations remain: positive authoritative input-safety, Stop/Clear revocation and durable Clear gate, observed identity binding, stable epochs/tokens, worker-ownership teardown, native-incarnation reconciliation, surfaced uncertainty and deliberate safe recovery. No automatic legacy fallback after ambiguous queue submission.

The user's open .4 test copy remains separate and does not contain this unshipped queue implementation.
