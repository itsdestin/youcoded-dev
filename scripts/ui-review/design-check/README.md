# design-check decks — design warnings shown on real screens

Turns `npm run lint:design` warnings into a review deck that boxes the exact element each
warning is about. Used for `docs/archive/design/2026-09-14-design-check-in-context` and
`docs/archive/design/2026-09-16-design-check-fixes`. The scripts were rebuilt once after living only in a
scratch folder that a reboot wiped — keep them here.

1. `cd <app worktree>/youcoded/desktop && npx oxlint -c .oxlintrc.design.json -f json > design.json`
2. `node gen-data.mjs design.json items.json` — `[rule, file, line, class, message]` per warning.
3. Write the flagged class names to a JSON list and photograph every screen with the collector on:
   `node scripts/shoot/shoot.mjs --all --themes meadow-mist,light --collect <list.json> --worktree <checkout> --out <out>`
   (records every visible element carrying a listed class, with its full class list; the matcher
   reads `<out>/manifest.json`, and still reads an old sweep's `shots-*` folders).
4. `node match-elements.mjs <out> items.json <checkout root> meadow-mist [fixes-log.json] > matched.json` —
   a warning matches an element only if the element carries EVERY static class of the class
   string on that source line; one class alone (`px-2`) is everywhere.
5. `node crop-for.mjs matched.json overlays/projects-switcher 'ProjectSwitcher' --fixed-only`
   prints the deck crop and highlight box for one slide.

Sweep the BEFORE code (a detached worktree at the merge base) for the boxes — a fix renames
the class, so the after sweep cannot find the element by it. Error and sync states are screens of their own now (`shoot --list --tag error-state`), so far
more flagged elements are reachable than the ~70 of 92 surfaces the old sweep opened.
