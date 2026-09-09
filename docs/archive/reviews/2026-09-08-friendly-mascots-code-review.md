# Friendly mascots — code review

Fresh reviewer inspected production default paint resolver/CSS, bundled rig, Icons, BuddyMascot and Flappy integration. Existing zoom/CORS/theme synchronization fixes were not re-reviewed in this pass.

- F1 already handled — Default icon body color now reaches the SVG despite text-fg-dim call-site classes.
- F2 already handled — Large welcome/gate mascots explicitly set small=false; normal and failed-custom-URL fallback paths honor that flag. Small-only rim no longer applies to 144px/64px callers.
- F3 already handled — Smile excluded from silhouette rim styling; final shown small-icon treatment matches approved captures.
- F4 already handled — Tests use the implemented default-only variables rather than obsolete rig-variable expectations.

Final reviewer verdict: approved, no outstanding blockers. Review was source-only; execution evidence is supplied by the separate final verification and visual captures. No new requirement beyond the approved scope.
