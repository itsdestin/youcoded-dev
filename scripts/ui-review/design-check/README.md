# design-check decks — design warnings shown on real screens

Turns `npm run lint:design` warnings into a review deck that boxes the exact element each
warning is about. Used for `docs/archive/design/2026-09-14-design-check-in-context` and
`docs/archive/design/2026-09-16-design-check-fixes`. The scripts were rebuilt once after living only in a
scratch folder that a reboot wiped — keep them here.

1. `cd <app worktree>/youcoded/desktop && npx oxlint -c .oxlintrc.design.json -f json > design.json`
2. `node gen-data.mjs design.json items.json` — `[rule, file, line, class, message]` per warning.
3. Write the flagged class names to a JSON list and sweep with the collector on:
   `UI_REVIEW_COLLECT=<list.json> UI_REVIEW_PLANS=main,overlays,marketplace bash scripts/ui-review/run-review.sh <checkout> <out> meadow-mist,light`
   (`shot.mjs` records every visible element carrying a listed class, with its full class list).
4. `node match-elements.mjs <out> items.json <checkout root> meadow-mist [fixes-log.json] > matched.json` —
   a warning matches an element only if the element carries EVERY static class of the class
   string on that source line; one class alone (`px-2`) is everywhere.
5. `node crop-for.mjs matched.json overlays/projects-switcher 'ProjectSwitcher' --fixed-only`
   prints the deck crop and highlight box for one slide.

Sweep the BEFORE code (a detached worktree at the merge base) for the boxes — a fix renames
the class, so the after sweep cannot find the element by it. Only ~70 of 92 surfaces open in
the workbench; many flagged elements live in error or sync states it never reaches.
