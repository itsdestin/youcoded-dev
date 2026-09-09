---
status: shipped
date: 2026-09-09
---

# UI refinement review

Fresh read-only code review (Juniper) identified three races in the UI-only preview:

- F1 accepted — asynchronous title loads could replace state after dialog identity changed. Worker added identity/cancellation guards and tests.
- F2 accepted — preview projection could mask newer source titles after automatic reset. Worker made projections yield to newer source titles and added tests.
- F3 accepted — Retry could retain an operation for an earlier dialog identity. Worker isolated retry state to dialog identity and added tests.

Worker evidence: `scratch/naming-races-green.log` (7 focused tests), `scratch/naming-races-verify.log` (full desktop verifier passed). No backend ownership or persistence claim follows from these preview tests.

Parent visual/interaction checks:

- Saved-session list and rename dialog: `scratch/naming-saved.log`, four verified shots in Light and Midnight.
- 390px-wide list and dialog: `scratch/naming-narrow.log`, visible controls without horizontal clipping in inspected screenshot.
- Save “Biology revision”, reopen and show manual ownership plus automatic-reset action: `scratch/naming-manual.log`, one verified shot. First attempt used unsupported Ctrl+A shorthand; retry used the input’s actual select operation.
- Use automatic name restores the original saved-row name: `scratch/naming-restored.log`, one verified shot.

These run only against the isolated fake workbench. Theme contrast scan counts include existing/background UI and are not a clean contrast verdict. Native Android, generated names, cross-device sync, and persistence across app restarts remain unimplemented/unverified.
