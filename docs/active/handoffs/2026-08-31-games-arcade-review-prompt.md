---
status: active
date: 2026-08-31
tags: [games, arcade, handoff, review]
---

# Games arcade — review-and-merge prompt

Paste the block below into a fresh session.

---

Review and merge the games arcade. Two PRs, both green, both mine:

- **wecoded-marketplace#78** — the server. **Merge this FIRST**: this repo auto-deploys to Cloudflare on push to master, and the app calls these endpoints.
- **youcoded#369** — the app. 16 commits.

Read in this order before reviewing:

1. `docs/active/specs/2026-08-30-games-arcade-design.md` — §12 is the status table; two sections are corrected in place where building disproved them.
2. `docs/active/design/2026-08-30-games-arcade/decisions.md` — D-1…D-14, every call Destin made and why.
3. `docs/active/handoffs/2026-08-31-games-arcade-handoff.md` — what is left and what will bite you.

**One open contradiction to settle, not to gloss:** spec §5.3 says the chess room validates moves; it relays, and both clients re-validate instead. Either build the server-side referee (adds `chess.js` to `partykit/`) or correct §5.3. Do not merge leaving the spec claiming something the code does not do.

Also filed, deliberately out of scope: Connect 4's columns are not keyboard-playable, and three hand-rolled badges should move to the new shared `Badge` (both in ROADMAP).

Verification already run on both branches, merged up to master: desktop `scripts/verify.sh --full` green, Android `./gradlew test` 212 pass, worker 304 pass, 17 arcade surfaces captured in six themes with 0 missed. Re-run rather than trust it if master has moved.

After merging: archive the spec, decisions and handoffs to `docs/archive/`, flip the ROADMAP item to `[x]`, and remove the `worktrees/games-arcade` worktree plus both branches.
