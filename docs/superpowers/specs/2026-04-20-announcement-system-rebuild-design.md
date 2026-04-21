# Announcement System Rebuild — Design Spec

**Date:** 2026-04-20
**Status:** Approved for implementation planning
**Scope:** Move announcement ownership from `youcoded-core` (toolkit) into `youcoded` (app). Fix expiry, clear, and Android parity bugs along the way.

---

## Motivation

Announcements are about the YouCoded **app**, but today they live in the YouCoded **toolkit** repo (`youcoded-core/announcements.txt`). This mixes the two projects' concerns and pollutes the toolkit's git history with unrelated commits.

Audit of the current system surfaced five concrete issues:

1. **Expired announcements render in the app status bar.** The terminal statusline filters `expires < today`; the React status bar widget does not. A recent "BANGER UPDATE OUT NOW!!!" announcement with `expires: 2026-04-09` was still visible on 2026-04-20.
2. **Double writer.** Both `desktop/src/main/announcement-service.ts` (24h) and `desktop/hook-scripts/announcement-fetch.js` (6h) write to `~/.claude/.announcement-cache.json`. Atomic rename prevents corruption, but the two fetchers are redundant and the new TS service has weaker freshness than the legacy JS hook it was meant to replace.
3. **Clear doesn't propagate.** Emptying `announcements.txt` leaves clients showing the stale message for up to 24h because `fetchAnnouncement` returns early without writing when `parseAnnouncement` returns `null`.
4. **Android has no fetcher.** Android's `~/.claude` lives inside the Termux env and nothing on Android populates the cache. Android users don't see announcements in either the terminal statusline or the status bar widget.
5. **Admin skill writes to the wrong repo.** `/announce` currently commits to `youcoded-core`.

## Goals

- Single source of truth in `youcoded/announcements.txt`.
- One fetcher per platform, no duplication.
- Expired content never renders, even for a single tick.
- Clearing an announcement propagates within the refresh interval.
- Android achieves parity with desktop on both the terminal statusline and the status bar widget.
- No change to the plaintext file format — the same `YYYY-MM-DD: message` (with expiry) / `message` (no expiry) / empty convention stays.

## Non-goals

- Faster-than-GitHub-raw publish (no Cloudflare Worker, no API). Scope is "structural only."
- Richer payloads (no JSON, no severity levels, no clickable URLs, no announcement IDs).
- Cross-platform cache sharing. Desktop and Android fetch independently.

---

## Architecture

```
Author              Storage                             Public URL
─────────────       ──────────────────────────          ───────────────────────────────
/announce skill  →  youcoded/announcements.txt      ←   raw.githubusercontent.com/
(youcoded-admin)    (committed to master)               itsdestin/youcoded/master/
                                                        announcements.txt

                                                                │
                                                                │  HTTP GET every 1h
                                                                │
                    ┌───────────────────────────────────────────┼───────────────────────────┐
                    │                                           │                           │
            Desktop (Electron main)                    Android (SessionService)
                    │                                                                       │
                    ▼                                                                       ▼
            announcement-service.ts                               AnnouncementService.kt (new)
                    │                                                                       │
                    ▼                                                                       ▼
            ~/.claude/.announcement-cache.json                    ~/.claude/.announcement-cache.json
            { message, fetched_at, expires? }                     (Android's Termux-local path)
                    │                                                                       │
                    ├────── read by ──────┐                   ┌────── read by ──────┬───────┤
                    ▼                     ▼                   ▼                     ▼       ▼
            ipc-handlers.ts         youcoded-core/     SessionService          app/…/      (future
            buildStatusData()       hooks/             buildStatusData()        statusline   Kotlin
                    │               statusline.sh      (Android)                .sh          readers)
                    │                                         │
                    ▼                                         ▼
            status:data IPC                          status:data over WebSocket
                    │                                         │
                    └───────────────────►  StatusBar.tsx  ◄──┘
                                          (shared React UI)
                                          renders ★ pill
                                          with isExpired() gate
```

**Key property:** the source file, the URL, the cache shape, and the render path are identical on both platforms. The only per-platform code is the fetcher itself (one TS, one Kotlin).

---

## Components

### 1. Source file — `youcoded/announcements.txt`

Plaintext, committed to the `youcoded` repo root. Format unchanged:

```
# With expiry (auto-clears after date passes):
2026-06-15: New skill drop — update now!

# Without expiry (stays until manually cleared):
Hey friends — check the new journaling skill!

# Empty file = no announcement shown to users
```

- First non-empty, non-comment line wins.
- `YYYY-MM-DD: ` prefix sets expiry (zero-padded, required format).
- Non-matching first line = message with no expiry.
- Empty file = no announcement.
- Expiry is inclusive of the date itself: `expires: 2026-04-20` is visible *on* 2026-04-20 and disappears on 2026-04-21.

### 2. Desktop fetcher — `desktop/src/main/announcement-service.ts`

Existing file, modified:

- **URL** swaps from `youcoded-core/master/announcements.txt` to `youcoded/master/announcements.txt`.
- **`REFRESH_MS`** changes from 24h to 1h (`60 * 60 * 1000`).
- **`parseAnnouncement()`** gains fetch-time expiry filter: if the matched line has a `YYYY-MM-DD: ` prefix and that date is strictly less than today (local time, `YYYY-MM-DD` format), return `null` as if the file were empty. Uses the shared `isExpired` helper.
- **`fetchAnnouncement()`** clear-propagation fix: when `parseAnnouncement` returns `null`, **write** an empty cache entry `{ fetched_at, message: null }` instead of returning without touching disk. This is what lets cleared announcements propagate within 1h instead of lingering until the next non-null fetch.
- **Offline behavior unchanged**: `fetch` failures and non-200 responses leave the existing cache alone.

### 3. Legacy hook — deleted

- **Delete** `desktop/hook-scripts/announcement-fetch.js`.
- **Delete** the spawning block in `desktop/src/main/ipc-handlers.ts:1390-1404` (the interval + `refreshAnnouncementCache` function that invokes it). Clear the `announceRefreshInterval` binding too.

### 4. Android fetcher — `app/src/main/kotlin/com/youcoded/app/runtime/AnnouncementService.kt` (new)

- Kotlin coroutine service launched from `SessionService.onCreate()`, running on `Dispatchers.IO`.
- Loop: fetch immediately, then `delay(3_600_000)` (1h). No backoff on failure — just keep the loop going.
- Fetch URL identical to desktop: `https://raw.githubusercontent.com/itsdestin/youcoded/master/announcements.txt`.
- Parser mirrors the TS version:
  - Iterate lines, skip empty/comment.
  - Match `^(\d{4}-\d{2}-\d{2}): (.+)$` on the first non-skipped line.
  - If date matched and `date < today`, treat as empty (return `null`).
  - If date matched and date is today or future, capture `expires` and `message`.
  - If no date match, capture message with no expiry.
- Write atomically to `~/.claude/.announcement-cache.json` — resolve `$HOME` via the same env the rest of the Android runtime uses (Termux HOME, not hardcoded to `context.filesDir`). The service runs from `SessionService`, which already knows how to resolve this path:
  - Write to `.announcement-cache.json.tmp`, then rename.
  - Clean up tmp on exception.
  - Shape: `{ message, fetched_at, expires? }`. Same JSON as desktop.
- Offline behavior: catch `IOException` / network errors silently; existing cache stays intact.
- Clear propagation: mirror desktop — when parse returns `null`, write `{ fetched_at, message: null }` explicitly.

### 5. Android status-bar wiring — `SessionService`

- Add cache read to whatever path assembles `status:data` for Android (mirror of `ipc-handlers.ts:1287`).
- Include `announcement` field in the payload with the parsed JSON contents.
- `StatusBar.tsx` already consumes `statusData.announcement?.message` — no renderer change needed for Android.

### 6. Render-time expiry filter — `StatusBar.tsx`

- New shared helper at `desktop/src/shared/announcement.ts` (or similar shared location accessible from renderer):

  ```ts
  export function isExpired(expires?: string | null): boolean {
    if (!expires) return false;
    const d = new Date();
    const today =
      d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
    return expires < today;
  }
  ```

- `StatusBar.tsx:844` gate changes from:

  ```tsx
  {show('announcement') && statusData.announcement?.message && (...)}
  ```

  to:

  ```tsx
  {show('announcement') &&
    statusData.announcement?.message &&
    !isExpired(statusData.announcement.expires) && (...)}
  ```

- No change to the terminal statusline scripts (`youcoded-core/hooks/statusline.sh`, `youcoded/app/src/main/assets/statusline.sh`) — they already filter expiry correctly.

### 7. `/announce` admin skill — `youcoded-admin/skills/announce/SKILL.md`

Rewrite to target the `youcoded` repo. Resolution:

```bash
REPO="$HOME/youcoded-dev/youcoded"
```

The `youcoded` repo isn't symlinked under `~/.claude/` the way the toolkit is, so the `readlink -f ~/.claude/plugins/youcoded-core` indirection used today stops making sense. The new skill hardcodes the workspace path. Because `/announce` is admin-only (used by Destin from his machine), hardcoding `$HOME/youcoded-dev/youcoded` is acceptable; no other users run this skill. The skill should check `[ -d "$REPO" ]` and error cleanly if the workspace isn't where expected.

All three flows (create / clear / view) get their path references updated. Commit messages, preview copy, error messages, and the View flow's "Last synced locally" note all work unchanged.

Also update the copy at `~/.claude/skills/announce/SKILL.md` (Destin's personal skills dir) — either re-symlink to the admin-plugin version or copy the new content.

### 8. Documentation — `docs/PITFALLS.md`

Add a new "Announcements" subsection (or fold into an existing group) capturing:

- Single fetcher per platform — never reintroduce parallel fetchers to the same cache file.
- Two filters: fetch-time and render-time. Both must exist; removing either regresses the expired-render-bug or the clear-propagation-bug.
- Cache shape keyed by `message: null` meaning "explicitly empty" (distinct from "no cache file").

---

## Data flow

### Publish path

1. Destin runs `/announce` in a session where the admin plugin is available.
2. Skill gathers message + optional expiry, shows preview, asks for confirmation.
3. On confirm: write to `$HOME/youcoded-dev/youcoded/announcements.txt`, `git add`, `git commit`, `git push origin master`.
4. GitHub raw CDN serves the new content (propagation is seconds to a couple of minutes).
5. Each user's desktop fetcher picks it up within ≤1h; Android within ≤1h.
6. Cache updates; next `status:data` tick (every 10s) pushes to the renderer; status bar ★ pill appears.

**End-to-end latency from push to visible:** ≤1h + ≤10s, typically much less right after a publish since the fetcher runs on app launch.

### Clear path

1. Destin runs `/announce` → clear flow → confirm.
2. Skill empties `announcements.txt`, commits, pushes.
3. Each client's next fetch sees an empty file, parses to `null`, writes `{ fetched_at, message: null }` to cache.
4. Next `status:data` tick: renderer sees `announcement.message === null`, gate in `StatusBar.tsx` is falsy, pill disappears.

**End-to-end clear latency:** ≤1h + ≤10s.

### Expiry path

- **At midnight local time**, the date string advances. The next status-bar render tick calls `isExpired(expires)` with the new today; the gate flips false; pill disappears **immediately** without waiting for a fetch.
- The cache entry itself is still present but unused by the render path.
- On the next fetch (within 1h), the fetcher also drops it, so the cache eventually self-cleans.

---

## Error handling

| Error | Behavior |
|-------|----------|
| Network failure during fetch | Leave existing cache intact. User keeps seeing the last known announcement. |
| HTTP non-200 (rare for GitHub raw) | Same as network failure — no cache write. |
| Malformed `announcements.txt` | Parser returns `null` → cache gets `{ fetched_at, message: null }` → no pill renders. Fail safe, not loud. |
| Cache file corrupted / unreadable | Read paths treat as no-cache → no pill renders. Next fetch rewrites it. |
| Clock skew (user's clock off by >1 day) | Expiry filter uses the user's local date. A user with a future clock will see announcements expire early; a user with a past clock sees them linger. Acceptable given announcements are low-criticality. |
| Android `context.filesDir` path changes between app versions | `~/.claude` is resolved via Termux HOME env, not hardcoded, so this is Termux-environment-scoped and stable across app upgrades. |

---

## Testing

**Unit tests (desktop):**

- `parseAnnouncement` with valid future-date prefix → `{ message, expires }`.
- `parseAnnouncement` with past-date prefix → `null` (fetch-time filter).
- `parseAnnouncement` with no-prefix line → `{ message }` with no expiry.
- `parseAnnouncement` with empty / comment-only input → `null`.
- `parseAnnouncement` with whitespace-only message after stripping prefix → `null`.
- `isExpired(undefined)` → `false`.
- `isExpired('2026-04-19')` on 2026-04-20 → `true`.
- `isExpired('2026-04-20')` on 2026-04-20 → `false` (same-day visible).
- `isExpired('2026-04-21')` on 2026-04-20 → `false`.

**Integration test (desktop):**

- Stub `global.fetch` to return a sequence: empty → filled with future expiry → cleared-to-empty. Verify cache file state after each fetch: null → non-null with message → null again. Confirms clear propagation works.

**Manual verification (both platforms):**

- Publish a test announcement with `expires: <today>`. Verify it renders, and verify it disappears at next local midnight without restarting the app.
- Publish without expiry, then clear via `/announce` clear flow. Verify pill disappears within 1h.
- Airplane-mode test: publish an announcement, let it render, then disconnect network and restart app. Verify pill keeps showing (offline-tolerant).
- Android: launch app fresh, verify pill renders in status bar widget and in terminal statusline.

**Doc audit:**

- Run `/audit` after implementation to surface any remaining docs that reference the old `youcoded-core/announcements.txt` path.

---

## Migration plan

Four coordinated changes across three repos. Order matters because the `/announce` skill and the app fetch URL must stay consistent with the file's actual location.

**Step 1 — Seed the new location (one-off, manual):**

1. Copy current content of `youcoded-core/announcements.txt` into `youcoded/announcements.txt`.
2. Empty `youcoded-core/announcements.txt` (don't delete yet — needed for the cutover grace period).

**Step 2 — youcoded PR:**

3. Commit new `youcoded/announcements.txt`.
4. Update `desktop/src/main/announcement-service.ts` — URL, 1h interval, expiry filter, clear propagation.
5. Delete `desktop/hook-scripts/announcement-fetch.js` and its spawning block in `desktop/src/main/ipc-handlers.ts:1390-1404`.
6. Add `desktop/src/shared/announcement.ts` (`isExpired` helper).
7. Update `desktop/src/renderer/components/StatusBar.tsx:844` with the `isExpired` render-time filter.
8. Add `app/src/main/kotlin/com/youcoded/app/runtime/AnnouncementService.kt` (new).
9. Wire Android's `status:data` to include the `announcement` field from the cache.
10. Add unit tests described above.

**Step 3 — youcoded release** (tag `vX.Y.Z`, ship desktop + Android artifacts). Wait for adoption.

**Step 4 — youcoded-admin PR:**

11. Rewrite `/announce` skill to target `$HOME/youcoded-dev/youcoded/announcements.txt`.
12. Update the personal-skills copy at `~/.claude/skills/announce/SKILL.md`.

**Step 5 — youcoded-core cleanup PR (last):**

13. Delete `youcoded-core/announcements.txt` entirely.
14. Update any youcoded-core docs that still reference it as a source: `docs/system-architecture.md`, `specs/system-architecture-spec.md`, `specs/statusline-spec.md`, `specs/INDEX.md`.
15. Update `youcoded-core/CHANGELOG.md` noting the ownership move.

**Step 6 — workspace docs:**

16. Add the Announcements pitfall subsection to `docs/PITFALLS.md`.

### Ordering safety

Until the youcoded release (Step 3), all clients keep fetching from `youcoded-core/master/announcements.txt`, which is kept empty during the transition (Step 1). Users see no announcement during the gap, which is better than seeing duplicates from both URLs. After Step 3 ships, newer clients pick up the new URL; older (un-updated) clients continue hitting the empty `youcoded-core` URL and just see no announcement until they update. Step 5 deletes the old file — by then the stragglers' "no announcement" state already matches reality, so no user-visible change.

---

## Open questions / risks

- **CHANGELOG pollution:** commits to `youcoded/announcements.txt` will appear in the app's git history. That's acceptable because announcements genuinely are app-scoped; the commits can be filtered out of release notes by subject line if needed.
- **Admin-only workflow:** `/announce` remains admin-gated via the `youcoded-admin` plugin. No change to who can publish.
- **Android fetcher execution context:** `SessionService` is the natural place to launch the service, but it runs as long as the service lives. On app process death the coroutine dies; it resumes on next service start. That matches desktop behavior (fetch on launch + interval).

---

## Success criteria

1. `/announce create`, `/announce clear`, `/announce view` all target `youcoded/announcements.txt` and succeed end-to-end.
2. An expired announcement never renders in the status bar widget, on either platform.
3. A cleared announcement disappears from all clients within ≤1h (plus the 10s status:data tick).
4. Only one fetcher exists per platform; `announcement-fetch.js` and its spawning block are gone.
5. Android users see the same announcement as desktop users on both the terminal statusline and the status bar widget.
6. No references to `youcoded-core/announcements.txt` remain in workspace or toolkit docs.
