---
status: shipped
---
# Friendly mascots implementation

Approved contract: `../design/2026-09-08-friendly-mascots/friendly-mascots.contract.json` (C yes; V-1/G-1 yes; Q-1 palette).

1. Pin the Light/Crème paint, unchanged other themes, independent catchlights and default-only small rim with failing tests.
2. Add one renderer paint definition shared by BuddyMascot, ThemeMascot fallback and Flappy. Keep authored rigs and UI tokens untouched; scope rim selectors to default art. Put buddy paint on the common ancestor so cloned PeekHands inherit it. Preserve all existing uncommitted drag/theme fixes.
3. Correct theme-builder art guidance and the registry's stale Halftone claim; leave generator defaults unchanged.
4. Run focused tests, registry/generator guards and workspace verify.sh. Parent validates actual production screenshots in its isolated workbench, then requests fresh code/UX review and grading. No installs, settings mutations, commits or server shutdown.
