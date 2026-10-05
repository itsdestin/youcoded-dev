---
status: shipped
---
# Brand identity + website — what is built, merge order, what is left (2026-10-04)

Every design pick and its deck answer: `docs/archive/design/2026-10-01-brand-identity-v2/DECISIONS.md`.
**Outcome (2026-10-04): all of it merged the same day on Destin's word** ("lets merge everything") —
including wecoded-themes, without waiting for the app release (so until that release, 1.3.x users on
macOS 26 who pick one of the seven themes see the flat theme icon in the Dock instead of the glass one).
Rounds 1–4 were kept as specs + answers only: `docs/archive/design/2026-10-01-brand-identity/`.
What follows is the record as written before the merge.

## The branches (all pushed, none merged)

| Repo | Branch | What it carries |
|---|---|---|
| youcoded | `session/brand-identity-v2` | `scripts/build-icons.mjs` + `scripts/icons/brand-icons.html` (every icon), new desktop/Android icon files, Liquid Glass `desktop/assets/icon.icon`, theme icons on window / Windows taskbar / Mac Dock / tray (`window:set-icon` → `desktop/src/main/theme-icon-swap.ts`) |
| wecoded-themes | `session/brand-identity-v2` | seven themes gain `assets/app-icon/` + `appIcon`/`appIconVariants`, versions bumped |
| youcoded-dev (workspace) | `session/brand-identity-v2` | design decks and DECISIONS, docs, `scripts/vm/vm.sh` (Tahoe is the only Mac VM), roadmap, this file |
| youcoded | `session/brand-website` | `docs/index.html` logo/tab icon/title/nav font, `docs/brand/` icons, new `docs/og-image.png` (v=6), `docs/favicon.svg` removed |
| youcoded-dev (workspace) | `session/brand-website` | website decks `docs/archive/design/2026-10-04-brand-website/`, landing-page rule + ui-review README pointing at `docs/brand/` |

State on 2026-10-04: youcoded `session/brand-identity-v2` has origin/master merged in (the one-core
refactor moved `window:set-icon` into `desktop/src/main/ipc/window.ts`); `verify.sh --full` green;
CI "Desktop Test Build" run 37268608642 on that commit. The workspace branch also has master merged.
Both website branches started from current master; no conflicts with each other or with the icon branches.

## Merge order

1. **youcoded `session/brand-website` together with youcoded `session/brand-identity-v2`.** The site's
   comments and the workspace docs name `scripts/build-icons.mjs --site docs/brand`, which only the
   icon branch adds. Merging the website publishes youcoded.ai at once (GitHub Pages serves `docs/`).
2. **Both workspace branches** after their youcoded halves: the workspace landing-page rule verifies
   `youcoded/docs/brand/default-32.png`, which exists only once the website branch is on master.
3. **wecoded-themes LAST — after an app release that contains the icon branch.** Released apps
   (1.3.x) already put a theme's `appIcon` on the window and, on a Mac, the Dock — but without the new
   taskbar, tray and Liquid Glass handling, so on macOS 26 a flat icon would replace the glass one while
   one of those seven themes is on. Waiting for the release gives everyone the complete behaviour at once.

## Open decision: the round 1–4 branch

Workspace `session/brand-identity` (worktree `worktrees/sessions/brand-identity`) holds brand rounds
1–4 — decks, answers and ~98 MB of pictures — and is NOT contained in `session/brand-identity-v2`
(round 5 onward). Its picks were superseded by later rounds, but its `*.answers.json` are the only record
of those four rounds. Destin decides: merge it as history, keep only its answers files, or delete it.
It merges into master with no conflicts.

## After merging

- Close the roadmap item `operations:The new site header does not match` with `node scripts/roadmap-check.mjs --close … --ref <commit>`.
- Archive `docs/archive/design/2026-10-01-brand-identity-v2/`, `docs/archive/design/2026-10-04-brand-website/` and this file.

## Left open on purpose

- Ubuntu dock icon per theme: unverified (roadmap `themes.md`). Android launcher icon: not seen on a device.
- The grey icon and the "yc" initials are approved but used nowhere yet.
- A pinned Windows taskbar button changes theme icon only at the next sign-in (accepted, DECISIONS round 32).
- The icon code moved during the master merge; a quick look at the Windows taskbar and Mac Dock in the
  VMs with the run above's build is worthwhile before release (`scripts/vm/vm.sh win load run:<id>`; for
  the Mac, `load run:<id>` misses the dmg — roadmap `dev-workspace.md` — so download it and `load` the file).
- The macOS 26 VM has no saved ready state yet (roadmap `dev-workspace.md`).
