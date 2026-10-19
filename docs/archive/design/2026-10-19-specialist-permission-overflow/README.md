---
status: approved
---

# Specialist permission popup layout

A bounded visual fix: cap the non-shrinking permission panel at its outer card’s width, and render the popup safety-stop region as a nested card with a complete border and the same theme-controlled `rounded-lg` corner token as the outer Callout. Transcript footers and permission decisions are unchanged.

The first review requested the nested rounded border. The second review approved it. Both submitted answer files and their rendered HTML/image snapshots are retained here; the JSON specs record the original disposable capture locations.

Regression coverage: `youcoded/desktop/tests/specialist-ask-block.test.tsx`; the existing Full Auto stop tests verify the unchanged permission choices.

Verification: required desktop `scripts/verify.sh` passed all gates after installing fresh isolated dependencies: 4,183 tests passed, 36 skipped, plus source/test types, lint/design lint, knip, invariants, screen opening and click journeys. Screenshot captures show the overflow corrected and the rounded inner card. App PR: https://github.com/itsdestin/youcoded/pull/649.

Related work item: #71. Its original unrelated behavior, report, cost and transcript-retention requests remain open.
