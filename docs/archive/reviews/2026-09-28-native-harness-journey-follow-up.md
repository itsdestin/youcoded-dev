---
status: shipped
---

# Resume journey — upstream driver lead

The workspace startup inspection found upstream commit `d0cd18b9`, which changes `scripts/shoot/driver.mjs` to resolve the click target again after pointer movement. Movement can trigger a hovered control, shift the row, and make previously resolved coordinates stale. No upstream merge or source transplant has occurred in this session.

Read-only reviewer `7c2cdc6e-f4d3-4070-a617-336420b43b1a` compared current shared source with the preserved worktree and the original failure evidence. Conclusion: this hazard is consistent with the missing Resume Browser after the journey's first two clicks, but the missing press/release trace prevents claiming it was the original root cause.

Bounded next action, after the active C2 writer finishes:

1. Add a deterministic fixture to `scripts/shoot/tests/explore.test.mjs` using existing browser helpers and `makeDriver`. A labelled target relocates once on pointer arrival; a decoy occupies the stale position. Record the clicked button.
2. Require `driver.perform({ do: 'click', target: { role: 'button', label: 'Target' } })` to click only the relocated target. Observe the old driver fail without time-based hover assumptions.
3. Apply only the self-contained upstream move-then-resolve hunk through normal reviewed edits; no branch merge or unrelated upstream integration.
4. Rerun the regression, the existing driver tests and the Resume journey. Describe this as a proven stale-coordinate repair, not retroactive proof of the original intermittent event.

This is test-runner work to address a failure encountered during the approved verification. No product navigation redesign, timeout inflation, live-app access or new testing rig is needed. C2 remains the sole active implementation task; do not overlap changes with its source/test execution.
