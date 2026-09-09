# Friendly mascots design review 1

Parent-supplied review, triaged during implementation:

- R1-1 accepted — catchlights need independent variables, preserving existing circle opacities.
- R1-2 accepted — use default-only paint variables; keep authored community --rig-* mappings intact.
- R1-3 accepted — Buddy's outer wrapper supplies sibling PeekHands inheritance.
- R1-4 accepted — default-only variables are supplied even for custom URLs, covering fetch-failure substitution without recoloring authored art.
- R1-5 accepted — paint is reactive to useTheme(), not tied to the rig URL.
- R1-6 accepted — Icons fallback gets scoped art paint, including hardcoded eye/mouth fills; unrelated icons and button tokens remain untouched.

Verification boundaries: shared renderer tests, workspace verify.sh; parent-owned workbench production screenshot review. No Android build (SDK unavailable), live settings, installs, paid evaluator or commits.
