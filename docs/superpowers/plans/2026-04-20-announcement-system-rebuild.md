# Announcement System Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move announcement ownership from `youcoded-core` (toolkit) into `youcoded` (app), consolidate to one fetcher per platform, add Android parity, and fix the two lifecycle bugs (expired-still-rendering and clear-lingers-for-hours) via defense-in-depth expiry filtering.

**Architecture:** The source file moves from `youcoded-core/announcements.txt` to `youcoded/announcements.txt`, published via `raw.githubusercontent.com/itsdestin/youcoded/master/announcements.txt`. One TypeScript fetcher runs in Electron main (`announcement-service.ts`, 1h cadence); a new Kotlin service mirrors it in Android's `SessionService`. Both write `~/.claude/.announcement-cache.json` with shape `{ message, fetched_at, expires? }`. Expiry is filtered twice — at fetch time (parser drops past-date lines) and at render time (`StatusBar.tsx` gates on a shared `isExpired` helper). Clear-propagation works by writing `{ fetched_at, message: null }` when the remote file is empty (today's bug: no write at all, stale entry lingers). `/announce` admin skill rewritten to target `youcoded`.

**Tech Stack:** TypeScript (Electron main + React renderer), Kotlin (Android SessionService), Vitest for desktop unit tests. GitHub raw CDN for delivery. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-20-announcement-system-rebuild-design.md`

**Sub-repos touched:**
- `youcoded` (app) — fetchers, renderer filter, new source file
- `youcoded-admin` — `/announce` skill rewrite
- `youcoded-core` — delete old source file + doc cleanup
- `youcoded-dev` — workspace PITFALLS.md entry

**Ordering constraint:** youcoded PR (Tasks 1-9) merges and ships first; only then does the `/announce` skill rewrite (Tasks 10-11) + youcoded-core cleanup (Tasks 12-13) make sense. Workspace docs (Task 14) are independent and can go at any point.

---

## File Structure

### Created

| Path | Repo | Responsibility |
|------|------|----------------|
| `announcements.txt` | youcoded (root) | Plaintext source of truth for announcements |
| `desktop/src/shared/announcement.ts` | youcoded | Shared `isExpired()` helper + `Announcement` type |
| `desktop/tests/announcement.test.ts` | youcoded | Unit tests for `isExpired` |
| `desktop/tests/announcement-service.test.ts` | youcoded | Unit tests for `parseAnnouncement` |
| `app/src/main/kotlin/com/youcoded/app/runtime/AnnouncementService.kt` | youcoded | Android fetcher (Kotlin coroutine + HttpURLConnection) |

### Modified

| Path | Repo | Change |
|------|------|--------|
| `desktop/src/main/announcement-service.ts` | youcoded | URL, 1h interval, import `isExpired`, fetch-time expiry filter, clear-write propagation |
| `desktop/src/main/ipc-handlers.ts` | youcoded | Delete lines 1390-1404 (legacy spawner) + `clearInterval(announceRefreshInterval)` in shutdown |
| `desktop/src/renderer/components/StatusBar.tsx` | youcoded | Import `isExpired`, wrap render gate on line 844 |
| `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` | youcoded | Launch `AnnouncementService`; read cache into `status:data` payload in `startStatusBroadcast` |
| `youcoded-admin/skills/announce/SKILL.md` | youcoded-admin | Repo path → `$HOME/youcoded-dev/youcoded` (hardcoded workspace path, admin-only) |
| `~/.claude/skills/announce/SKILL.md` | (personal) | Mirror the admin-plugin rewrite |
| `docs/PITFALLS.md` | youcoded-dev | New "Announcements" subsection |
| `CHANGELOG.md` | youcoded-core | Note the ownership move |
| `docs/system-architecture.md` | youcoded-core | Strike references to toolkit-owned announcements |
| `specs/system-architecture-spec.md` | youcoded-core | Same |
| `specs/statusline-spec.md` | youcoded-core | Same |
| `specs/INDEX.md` | youcoded-core | Same |

### Deleted

| Path | Repo | Why |
|------|------|-----|
| `desktop/hook-scripts/announcement-fetch.js` | youcoded | Legacy; redundant with TS service |
| `announcements.txt` | youcoded-core | Moved to youcoded |

---

## Task 1: Seed new location in youcoded + empty youcoded-core source

**Files:**
- Create: `~/youcoded-dev/youcoded/announcements.txt`
- Modify: `~/youcoded-dev/youcoded-core/announcements.txt`

- [ ] **Step 1: Read current announcement content**

Run:
```bash
cat ~/youcoded-dev/youcoded-core/announcements.txt
```

Capture the content for re-use. Typical shape is one line like `2026-04-09: BANGER UPDATE OUT NOW!!!` or a bare message with no prefix.

- [ ] **Step 2: Seed the new location**

Run:
```bash
cp ~/youcoded-dev/youcoded-core/announcements.txt ~/youcoded-dev/youcoded/announcements.txt
```

- [ ] **Step 3: Empty the old location**

Run:
```bash
: > ~/youcoded-dev/youcoded-core/announcements.txt
```

(`: > file` truncates the file to zero bytes without deleting it. Keep the file present for the cutover grace period so existing-version clients see an empty fetch rather than a 404.)

- [ ] **Step 4: Verify**

Run:
```bash
[ -s ~/youcoded-dev/youcoded/announcements.txt ] && echo "NEW: has content" || echo "NEW: empty (ok if there was no announcement)"
[ -s ~/youcoded-dev/youcoded-core/announcements.txt ] && echo "OLD: still has content (UNEXPECTED)" || echo "OLD: empty (ok)"
```

Expected: NEW has the preserved content (or empty if none was set); OLD is empty.

- [ ] **Step 5: Commit youcoded-core (empty-out)**

```bash
cd ~/youcoded-dev/youcoded-core
git add announcements.txt
git commit -m "chore: empty announcements.txt (moved to youcoded)"
git push origin master
```

The youcoded-side commit happens as part of Task 9 so the new file lands with the app changes that consume it.

---

## Task 2: Create shared `isExpired` helper with TDD

**Files:**
- Create: `~/youcoded-dev/youcoded/desktop/src/shared/announcement.ts`
- Create: `~/youcoded-dev/youcoded/desktop/tests/announcement.test.ts`

- [ ] **Step 1: Write the failing test**

Create `~/youcoded-dev/youcoded/desktop/tests/announcement.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isExpired } from '../src/shared/announcement';

describe('isExpired', () => {
  beforeEach(() => {
    // Pin "today" to 2026-04-20 local time. Use local-time constructor
    // (year, monthIndex, day) not a UTC string, because isExpired uses
    // local-date components.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 20, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when expires is undefined', () => {
    expect(isExpired(undefined)).toBe(false);
  });

  it('returns false when expires is null', () => {
    expect(isExpired(null)).toBe(false);
  });

  it('returns false when expires is empty string', () => {
    expect(isExpired('')).toBe(false);
  });

  it('returns true when expires is strictly before today', () => {
    expect(isExpired('2026-04-19')).toBe(true);
  });

  it('returns false when expires is today (same-day visible)', () => {
    expect(isExpired('2026-04-20')).toBe(false);
  });

  it('returns false when expires is after today', () => {
    expect(isExpired('2026-04-21')).toBe(false);
    expect(isExpired('2099-12-31')).toBe(false);
  });

  it('zero-pads single-digit months and days in today comparison', () => {
    vi.setSystemTime(new Date(2026, 0, 5, 12, 0, 0)); // 2026-01-05
    expect(isExpired('2026-01-04')).toBe(true);
    expect(isExpired('2026-01-05')).toBe(false);
    expect(isExpired('2025-12-31')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run:
```bash
cd ~/youcoded-dev/youcoded/desktop && npx vitest run tests/announcement.test.ts
```

Expected: FAIL with "Cannot find module '../src/shared/announcement'".

- [ ] **Step 3: Write the implementation**

Create `~/youcoded-dev/youcoded/desktop/src/shared/announcement.ts`:

```typescript
// Shared announcement types + helpers. Used by both main (fetcher) and
// renderer (status bar). Lives in src/shared/ so no Node-only imports.

export interface Announcement {
  message: string | null;
  fetched_at: string;
  expires?: string;
}

// Today's date in YYYY-MM-DD, local time, zero-padded. Matches the
// announcements.txt prefix format so string comparison works.
function todayYYYYMMDD(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

// True when a dated announcement should no longer be shown. An announcement
// with expires == today is still visible; it drops off at local midnight.
// Undefined/null/empty expires means "no expiry" — never expired.
export function isExpired(expires: string | null | undefined): boolean {
  if (!expires) return false;
  return expires < todayYYYYMMDD();
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run:
```bash
cd ~/youcoded-dev/youcoded/desktop && npx vitest run tests/announcement.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/youcoded-dev/youcoded
git add desktop/src/shared/announcement.ts desktop/tests/announcement.test.ts
git commit -m "feat(desktop): shared isExpired helper for announcements"
```

---

## Task 3: Update `announcement-service.ts` — URL, interval, expiry filter, clear-write

**Files:**
- Create: `~/youcoded-dev/youcoded/desktop/tests/announcement-service.test.ts`
- Modify: `~/youcoded-dev/youcoded/desktop/src/main/announcement-service.ts`

- [ ] **Step 1: Write failing parser tests**

Create `~/youcoded-dev/youcoded/desktop/tests/announcement-service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { __test } from '../src/main/announcement-service';

const { parseAnnouncement } = __test;

describe('parseAnnouncement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 20, 12, 0, 0)); // 2026-04-20 local
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for empty input', () => {
    expect(parseAnnouncement('')).toBeNull();
  });

  it('returns null for comment-only input', () => {
    expect(parseAnnouncement('# comment one\n# comment two')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(parseAnnouncement('\n   \n\t\n')).toBeNull();
  });

  it('parses a plain line with no prefix', () => {
    expect(parseAnnouncement('Hello world')).toEqual({ message: 'Hello world' });
  });

  it('parses a dated line with future expiry', () => {
    expect(parseAnnouncement('2026-06-15: New skill drop')).toEqual({
      message: 'New skill drop',
      expires: '2026-06-15',
    });
  });

  it('parses a dated line with today as expiry (same-day visible)', () => {
    expect(parseAnnouncement('2026-04-20: Happens today')).toEqual({
      message: 'Happens today',
      expires: '2026-04-20',
    });
  });

  it('drops a dated line with past expiry (fetch-time filter)', () => {
    expect(parseAnnouncement('2026-04-19: Already expired')).toBeNull();
  });

  it('skips comments and blank lines before matching the first real line', () => {
    const input = [
      '# this is a comment',
      '',
      '   ',
      '2026-12-01: Actual announcement',
    ].join('\n');
    expect(parseAnnouncement(input)).toEqual({
      message: 'Actual announcement',
      expires: '2026-12-01',
    });
  });

  it('uses only the first valid line', () => {
    const input = [
      '2026-06-01: First',
      '2026-07-01: Second (ignored)',
    ].join('\n');
    expect(parseAnnouncement(input)).toEqual({
      message: 'First',
      expires: '2026-06-01',
    });
  });
});
```

- [ ] **Step 2: Run tests — existing 3 pass, the new "past expiry" test fails**

Run:
```bash
cd ~/youcoded-dev/youcoded/desktop && npx vitest run tests/announcement-service.test.ts
```

Expected: "drops a dated line with past expiry" FAILS — current `parseAnnouncement` returns `{ message, expires }` instead of `null` for past dates. Other tests may pass because they match today's parser behavior.

- [ ] **Step 3: Rewrite `announcement-service.ts`**

Replace the entire contents of `~/youcoded-dev/youcoded/desktop/src/main/announcement-service.ts` with:

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';
import { log } from './logger';
import { isExpired, type Announcement } from '../shared/announcement';

/**
 * Announcement Service
 *
 * Fetches the first non-comment line from youcoded's announcements.txt
 * (repo root) and caches it at ~/.claude/.announcement-cache.json for the
 * status bar widget and the terminal statusline.
 *
 * Format on the wire (first non-# line wins):
 *   YYYY-MM-DD: message         -> expires at that date
 *   message                     -> never expires
 *   (empty or comments only)    -> no announcement
 *
 * Lifecycle bugs this service is responsible for preventing:
 *   - Fetch-time expiry filter: past-date lines are treated as empty so
 *     already-stale content never lands in the cache.
 *   - Clear propagation: when the remote file is empty, we *write* a
 *     cleared cache ({ message: null, fetched_at }) rather than returning
 *     without touching disk. This is what lets the status bar pill
 *     disappear within the refresh interval instead of lingering.
 *
 * Called on app launch and every 1h while running.
 */

const ANNOUNCEMENTS_URL =
  'https://raw.githubusercontent.com/itsdestin/youcoded/master/announcements.txt';
const CACHE_PATH = path.join(os.homedir(), '.claude', '.announcement-cache.json');
const TMP_PATH = `${CACHE_PATH}.tmp`;
const REFRESH_MS = 60 * 60 * 1000; // 1 hour

function writeAtomic(data: Announcement): void {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  try {
    fs.writeFileSync(TMP_PATH, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(TMP_PATH, CACHE_PATH);
  } catch (e) {
    try { fs.unlinkSync(TMP_PATH); } catch { /* best-effort cleanup */ }
    throw e;
  }
}

// Returns { message, expires? } for a valid unexpired line, or null for
// empty/comments-only/expired input. Callers treat null as "clear the cache."
function parseAnnouncement(text: string): { message: string; expires?: string } | null {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const dateMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2}): (.+)$/);
    if (dateMatch) {
      const expires = dateMatch[1];
      // Fetch-time expiry filter: already-past dates are treated as empty.
      // Prevents a freshly-fetched stale entry from ever entering the cache.
      if (isExpired(expires)) return null;
      return { message: dateMatch[2].trim(), expires };
    }
    return { message: trimmed };
  }
  return null;
}

/**
 * Fetch announcements once. Network failure or non-200 leaves the existing
 * cache intact (users don't lose announcements on going offline). An empty
 * or all-expired remote file writes a cleared cache so the status bar
 * pill disappears within the refresh interval.
 */
export async function fetchAnnouncement(): Promise<void> {
  let response: Response;
  try {
    response = await fetch(ANNOUNCEMENTS_URL);
  } catch {
    return; // offline / DNS failure — leave cache alone
  }
  if (!response.ok) return;

  const text = await response.text();
  const parsed = parseAnnouncement(text);

  const cache: Announcement = parsed
    ? {
        message: parsed.message,
        fetched_at: new Date().toISOString(),
        ...(parsed.expires ? { expires: parsed.expires } : {}),
      }
    : {
        // Clear-propagation write. null (vs. undefined) distinguishes
        // "explicitly cleared" from "no cache file yet" on the reader side.
        message: null,
        fetched_at: new Date().toISOString(),
      };

  try {
    writeAtomic(cache);
    log('INFO', 'Announcements', 'Cache updated', {
      cleared: cache.message === null,
      hasExpiry: !!cache.expires,
    });
  } catch (e) {
    log('ERROR', 'Announcements', 'Cache write failed', { error: String(e) });
  }
}

let refreshTimer: NodeJS.Timeout | null = null;

/**
 * Kick off the first fetch immediately and schedule a 1h refresh loop. Safe
 * to call more than once; subsequent calls reset the timer.
 */
export function startAnnouncementService(): void {
  stopAnnouncementService();
  fetchAnnouncement().catch(e =>
    log('ERROR', 'Announcements', 'Initial fetch threw', { error: String(e) }),
  );
  refreshTimer = setInterval(() => {
    fetchAnnouncement().catch(e =>
      log('ERROR', 'Announcements', 'Scheduled fetch threw', { error: String(e) }),
    );
  }, REFRESH_MS);
  // Don't keep the event loop alive just for this — app shutdown shouldn't wait.
  refreshTimer.unref?.();
}

export function stopAnnouncementService(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

// Exposed for tests
export const __test = { parseAnnouncement };
```

- [ ] **Step 4: Run tests — everything passes**

Run:
```bash
cd ~/youcoded-dev/youcoded/desktop && npx vitest run tests/announcement-service.test.ts tests/announcement.test.ts
```

Expected: all tests in both files PASS.

- [ ] **Step 5: Run typecheck**

Run:
```bash
cd ~/youcoded-dev/youcoded/desktop && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors. (If `npm run build` runs Vite + TSC, this catches shared-types drift.)

- [ ] **Step 6: Commit**

```bash
cd ~/youcoded-dev/youcoded
git add desktop/src/main/announcement-service.ts desktop/tests/announcement-service.test.ts
git commit -m "feat(desktop): 1h refresh + fetch-time expiry + clear-propagation for announcements"
```

---

## Task 4: Remove legacy `announcement-fetch.js` and its spawner

**Files:**
- Delete: `~/youcoded-dev/youcoded/desktop/hook-scripts/announcement-fetch.js`
- Modify: `~/youcoded-dev/youcoded/desktop/src/main/ipc-handlers.ts`

- [ ] **Step 1: Delete the legacy script**

Run:
```bash
rm ~/youcoded-dev/youcoded/desktop/hook-scripts/announcement-fetch.js
```

- [ ] **Step 2: Remove the spawner block from `ipc-handlers.ts`**

Edit `~/youcoded-dev/youcoded/desktop/src/main/ipc-handlers.ts`. Delete these exact lines (currently at 1390-1404):

```typescript
  // --- Announcement cache refresher ---
  // Runs announcement-fetch.js on startup and every 6 hours to keep
  // .announcement-cache.json fresh without relying on the toolkit's session-start.sh.
  const rawAnnounceFetchPath = path.resolve(__dirname, '../../hook-scripts/announcement-fetch.js');
  const unpackedAnnounceFetchPath = rawAnnounceFetchPath.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  const announceFetchScript = fs.existsSync(unpackedAnnounceFetchPath) ? unpackedAnnounceFetchPath : rawAnnounceFetchPath;

  function refreshAnnouncementCache() {
    try {
      execFile('node', [announceFetchScript], { timeout: 15000 }, () => {});
    } catch { /* node not found or script error — announcement just stays stale */ }
  }

  refreshAnnouncementCache();
  const announceRefreshInterval = setInterval(refreshAnnouncementCache, 6 * 60 * 60 * 1000);
```

Also remove the matching cleanup line (currently 1759):

```typescript
    clearInterval(announceRefreshInterval);
```

- [ ] **Step 3: Verify no stray references remain**

Run:
```bash
cd ~/youcoded-dev/youcoded && grep -rn "announcement-fetch\|announceRefreshInterval\|refreshAnnouncementCache" desktop/src 2>&1 | grep -v node_modules
```

Expected: no output. If any matches appear, delete those references too.

- [ ] **Step 4: Verify `execFile` import is still used elsewhere**

Run:
```bash
cd ~/youcoded-dev/youcoded && grep -c "execFile" desktop/src/main/ipc-handlers.ts
```

Expected: at least 1 (if it's imported but no longer used, remove the import — otherwise leave it).

- [ ] **Step 5: Typecheck**

Run:
```bash
cd ~/youcoded-dev/youcoded/desktop && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
cd ~/youcoded-dev/youcoded
git add -u desktop/hook-scripts/announcement-fetch.js desktop/src/main/ipc-handlers.ts
git commit -m "chore(desktop): delete legacy announcement-fetch.js and its spawner"
```

---

## Task 5: Wire render-time `isExpired` gate into `StatusBar.tsx`

**Files:**
- Modify: `~/youcoded-dev/youcoded/desktop/src/renderer/components/StatusBar.tsx`

- [ ] **Step 1: Add the import**

Open `~/youcoded-dev/youcoded/desktop/src/renderer/components/StatusBar.tsx`. Add near the top imports:

```typescript
import { isExpired } from '../../shared/announcement';
```

(Verify the relative path against the file's existing imports — `StatusBar.tsx` lives at `desktop/src/renderer/components/StatusBar.tsx`, so `../../shared/announcement` resolves to `desktop/src/shared/announcement.ts`.)

- [ ] **Step 2: Update the render gate at line 844**

Find this block (currently at line 844):

```tsx
      {/* Platform announcement — ★ orange pill, truncates long copy */}
      {show('announcement') && statusData.announcement?.message && (
        <span
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm border truncate max-w-[280px]"
          style={{
            backgroundColor: 'rgba(255,152,0,0.15)',
            color: '#FF9800',
            borderColor: 'rgba(255,152,0,0.25)',
          }}
          title={statusData.announcement.message}
        >
          <span aria-hidden>★</span>
          <span className="truncate">{statusData.announcement.message}</span>
        </span>
      )}
```

Change the opening condition to:

```tsx
      {/* Platform announcement — ★ orange pill, truncates long copy.
          Gate on isExpired so a stale cache entry (e.g. cleared remote but
          not yet re-fetched, or a date that rolled past midnight since
          last fetch) doesn't render. Defense-in-depth alongside the
          fetch-time filter in announcement-service.ts. */}
      {show('announcement') &&
        statusData.announcement?.message &&
        !isExpired(statusData.announcement.expires) && (
        <span
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm border truncate max-w-[280px]"
          style={{
            backgroundColor: 'rgba(255,152,0,0.15)',
            color: '#FF9800',
            borderColor: 'rgba(255,152,0,0.25)',
          }}
          title={statusData.announcement.message}
        >
          <span aria-hidden>★</span>
          <span className="truncate">{statusData.announcement.message}</span>
        </span>
      )}
```

- [ ] **Step 3: Typecheck**

Run:
```bash
cd ~/youcoded-dev/youcoded/desktop && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors. Confirms the shared helper resolves correctly from the renderer.

- [ ] **Step 4: Manual smoke test in dev**

Launch dev:
```bash
bash ~/youcoded-dev/scripts/run-dev.sh
```

Put a deliberately expired announcement in the local cache to verify the gate works:
```bash
cat > ~/.claude/.announcement-cache.json <<'EOF'
{ "message": "SHOULD NOT APPEAR", "fetched_at": "2026-04-20T00:00:00.000Z", "expires": "2020-01-01" }
EOF
```

Wait up to 10s for the next `status:data` tick. The ★ pill should **not** appear. Then replace with a future expiry:
```bash
cat > ~/.claude/.announcement-cache.json <<'EOF'
{ "message": "SHOULD APPEAR", "fetched_at": "2026-04-20T00:00:00.000Z", "expires": "2099-01-01" }
EOF
```

Wait up to 10s. The ★ pill should appear with "SHOULD APPEAR" text. Clean up after verifying:
```bash
rm ~/.claude/.announcement-cache.json
```

(The cache gets repopulated on next fetch — this is a safe one-time stomp.)

- [ ] **Step 5: Commit**

```bash
cd ~/youcoded-dev/youcoded
git add desktop/src/renderer/components/StatusBar.tsx
git commit -m "fix(desktop): hide expired announcements in status bar via isExpired gate"
```

---

## Task 6: Add Android `AnnouncementService.kt` (Kotlin fetcher)

**Files:**
- Create: `~/youcoded-dev/youcoded/app/src/main/kotlin/com/youcoded/app/runtime/AnnouncementService.kt`

- [ ] **Step 1: Create the file**

Create `~/youcoded-dev/youcoded/app/src/main/kotlin/com/youcoded/app/runtime/AnnouncementService.kt`:

```kotlin
package com.youcoded.app.runtime

import android.util.Log
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Android-side announcement fetcher. Mirror of desktop's
 * `announcement-service.ts`. Fetches youcoded/announcements.txt once per
 * hour and writes ~/.claude/.announcement-cache.json so that:
 *
 *   - the terminal statusline.sh can render the ★ announcement line, AND
 *   - SessionService.startStatusBroadcast() can fold the cache into
 *     status:data for the React status-bar widget.
 *
 * Lifecycle rules (must match desktop):
 *   - Fetch-time expiry filter: if the first non-comment line has a
 *     YYYY-MM-DD prefix that is strictly less than today (device local
 *     date), treat it as empty. Already-stale content never reaches cache.
 *   - Clear propagation: when the remote file is empty (after comment
 *     stripping), write { message: null, fetched_at } so readers can
 *     distinguish "explicitly cleared" from "no cache yet."
 *   - Offline tolerance: any exception during fetch leaves the existing
 *     cache untouched.
 *
 * Launch from SessionService.onCreate() via startAnnouncementService(homeDir).
 */
class AnnouncementService(private val homeDir: File) {

    private var timer: java.util.Timer? = null

    fun start() {
        stop()
        timer = java.util.Timer("announcement-fetch", true).apply {
            scheduleAtFixedRate(object : java.util.TimerTask() {
                override fun run() {
                    try {
                        fetchOnce()
                    } catch (e: Exception) {
                        Log.w(TAG, "fetch threw: ${e.message}")
                    }
                }
            }, INITIAL_DELAY_MS, REFRESH_MS)
        }
    }

    fun stop() {
        timer?.cancel()
        timer = null
    }

    private fun fetchOnce() {
        val text: String = try {
            val conn = (URL(URL_STR).openConnection() as HttpURLConnection).apply {
                connectTimeout = 10_000
                readTimeout = 10_000
                requestMethod = "GET"
            }
            try {
                if (conn.responseCode !in 200..299) return
                conn.inputStream.bufferedReader().use { it.readText() }
            } finally {
                conn.disconnect()
            }
        } catch (e: Exception) {
            // Offline / DNS / network: leave existing cache alone.
            return
        }

        val parsed: ParsedAnnouncement? = parseAnnouncement(text)

        val nowIso = iso8601Now()
        val json = JSONObject()
        if (parsed != null) {
            json.put("message", parsed.message)
            json.put("fetched_at", nowIso)
            if (parsed.expires != null) json.put("expires", parsed.expires)
        } else {
            // Explicit clear: message: null lets StatusBar's isExpired gate
            // hide the pill even if the on-disk cache was previously
            // populated with an unrelated entry.
            json.put("message", JSONObject.NULL)
            json.put("fetched_at", nowIso)
        }

        writeAtomic(json.toString(2))
    }

    private fun writeAtomic(contents: String) {
        val claudeDir = File(homeDir, ".claude").apply { mkdirs() }
        val cache = File(claudeDir, ".announcement-cache.json")
        val tmp = File(claudeDir, ".announcement-cache.json.tmp")
        try {
            tmp.writeText(contents, Charsets.UTF_8)
            if (!tmp.renameTo(cache)) {
                // Rename can fail if dest is on a different mount; fall back
                // to copy + delete to preserve atomic-ish behavior.
                cache.writeText(contents, Charsets.UTF_8)
                tmp.delete()
            }
        } catch (e: Exception) {
            try { tmp.delete() } catch (_: Exception) {}
            Log.w(TAG, "cache write failed: ${e.message}")
        }
    }

    companion object {
        private const val TAG = "AnnouncementService"
        private const val URL_STR =
            "https://raw.githubusercontent.com/itsdestin/youcoded/master/announcements.txt"
        private const val INITIAL_DELAY_MS = 5_000L
        private const val REFRESH_MS = 60L * 60L * 1000L // 1 hour

        data class ParsedAnnouncement(val message: String, val expires: String?)

        // Pure function; unit-testable in isolation if needed.
        fun parseAnnouncement(text: String): ParsedAnnouncement? {
            val datePrefix = Regex("""^(\d{4}-\d{2}-\d{2}): (.+)$""")
            for (raw in text.split('\n')) {
                val trimmed = raw.trim()
                if (trimmed.isEmpty() || trimmed.startsWith("#")) continue
                val m = datePrefix.matchEntire(trimmed)
                if (m != null) {
                    val expires = m.groupValues[1]
                    // Fetch-time expiry filter — mirrors desktop's isExpired.
                    if (expires < todayYYYYMMDD()) return null
                    return ParsedAnnouncement(m.groupValues[2].trim(), expires)
                }
                return ParsedAnnouncement(trimmed, null)
            }
            return null
        }

        private fun todayYYYYMMDD(): String {
            val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
                timeZone = TimeZone.getDefault()
            }
            return fmt.format(Date())
        }

        private fun iso8601Now(): String {
            val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
            return fmt.format(Date())
        }
    }
}
```

- [ ] **Step 2: Compile**

Run:
```bash
cd ~/youcoded-dev/youcoded && ./gradlew :app:compileDebugKotlin 2>&1 | tail -20
```

Expected: `BUILD SUCCESSFUL`. (Full `assembleDebug` is slower and not needed here.)

- [ ] **Step 3: Commit**

```bash
cd ~/youcoded-dev/youcoded
git add app/src/main/kotlin/com/youcoded/app/runtime/AnnouncementService.kt
git commit -m "feat(android): add AnnouncementService.kt for 1h announcement fetch"
```

---

## Task 7: Launch `AnnouncementService` from `SessionService` and fold cache into `status:data`

**Files:**
- Modify: `~/youcoded-dev/youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`

- [ ] **Step 1: Add a field for the service instance**

Open `~/youcoded-dev/youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`. Near the top of the class, alongside the other timer/service fields (e.g. `usageRefreshTimer`, `statusBroadcastTimer`), add:

```kotlin
    private var announcementService: AnnouncementService? = null
```

- [ ] **Step 2: Start the service after Bootstrap completes**

Find the place where `startUsageRefresh(bs)` is called (inside the post-bootstrap block — search for `startUsageRefresh` to locate it). Immediately after that call, add:

```kotlin
        announcementService = AnnouncementService(bs.homeDir).also { it.start() }
```

(`bs.homeDir` is the same field used by `startUsageRefresh` to locate the user's `~/` on Android. Don't hardcode the path.)

- [ ] **Step 3: Stop the service on shutdown**

Find the service's `onDestroy` (or equivalent lifecycle teardown where `statusBroadcastTimer?.cancel()` and `usageRefreshTimer?.cancel()` are called). Add:

```kotlin
        announcementService?.stop()
        announcementService = null
```

- [ ] **Step 4: Fold the cache into `status:data`**

Locate `startStatusBroadcast` (around line 289). Inside the `run()` block, after the existing "Usage cache (rate limits)" read and before the "Sync status" read, add:

```kotlin
                        // Announcement cache (mirror of desktop's
                        // ipc-handlers.ts:1287). The renderer's StatusBar
                        // gates on isExpired so stale entries don't render
                        // even if they slipped through the fetch-time filter.
                        val announcementFile = File(claudeDir, ".announcement-cache.json")
                        if (announcementFile.exists()) {
                            try {
                                payload.put("announcement", JSONObject(announcementFile.readText()))
                            } catch (_: Exception) {}
                        }
```

- [ ] **Step 5: Compile**

Run:
```bash
cd ~/youcoded-dev/youcoded && ./gradlew :app:compileDebugKotlin 2>&1 | tail -20
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 6: Build the React UI asset bundle and a debug APK**

Run:
```bash
cd ~/youcoded-dev/youcoded && ./scripts/build-web-ui.sh && ./gradlew assembleDebug 2>&1 | tail -30
```

Expected: `BUILD SUCCESSFUL`. The APK lands at `app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 7: Manual verification on device (optional if device available)**

Install APK, launch, wait ~10s for status broadcast, confirm:
- Terminal statusline shows the ★ announcement line (if a live one exists).
- Status bar ★ pill shows the announcement in the React UI.
- `adb shell run-as com.youcoded.app cat files/home/.claude/.announcement-cache.json` returns the fetched JSON. (Exact run-as / path command depends on debuggable app + Termux HOME; use whatever the Android runtime docs describe.)

If no device is available, mark this step skipped — the compile step catches wiring mistakes; real-device verification is a release-time gate, not a per-task gate.

- [ ] **Step 8: Commit**

```bash
cd ~/youcoded-dev/youcoded
git add app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "feat(android): launch AnnouncementService and fold cache into status:data"
```

---

## Task 8: Add `youcoded/announcements.txt` to the repo (the file seeded in Task 1)

**Files:**
- Add: `~/youcoded-dev/youcoded/announcements.txt`

- [ ] **Step 1: Verify the file exists from Task 1**

Run:
```bash
ls -la ~/youcoded-dev/youcoded/announcements.txt
cat ~/youcoded-dev/youcoded/announcements.txt
```

Expected: file exists with whatever content was seeded (may be empty).

- [ ] **Step 2: Stage and commit**

```bash
cd ~/youcoded-dev/youcoded
git add announcements.txt
git commit -m "feat: seed announcements.txt (moved from youcoded-core)"
```

---

## Task 9: Push youcoded and release

**Files:** none (release-only)

- [ ] **Step 1: Verify local branch is clean and ahead of origin**

Run:
```bash
cd ~/youcoded-dev/youcoded && git status && git log origin/master..HEAD --oneline
```

Expected: working tree clean; commits from Tasks 2-8 listed (six commits).

- [ ] **Step 2: Push to master**

```bash
cd ~/youcoded-dev/youcoded && git push origin master
```

- [ ] **Step 3: Bump Android `versionCode` and `versionName`**

Edit `~/youcoded-dev/youcoded/app/build.gradle.kts`. Find the `versionCode` and `versionName` lines (currently `versionCode = 7` and `versionName = "2.3.2"`) and increment to the next patch version (e.g. `versionCode = 8`, `versionName = "2.3.3"`). Match the Destin-standard scheme — see `docs/build-and-release.md`.

- [ ] **Step 4: Commit the version bump**

```bash
cd ~/youcoded-dev/youcoded
git add app/build.gradle.kts
git commit -m "release: v2.3.3"
git push origin master
```

- [ ] **Step 5: Tag and trigger CI**

```bash
cd ~/youcoded-dev/youcoded
git tag v2.3.3
git push origin v2.3.3
```

Expected: `desktop-release.yml` and `android-release.yml` both fire in GitHub Actions. A single GitHub Release should appear with APK/AAB/Windows/Mac/Linux artifacts.

- [ ] **Step 6: Watch CI**

Open the Actions tab in GitHub and confirm both workflows complete green. If either fails, diagnose — this plan cannot continue until the release is live because Tasks 10-13 depend on clients running the new fetcher URL.

---

## Task 10: Rewrite `/announce` admin skill to target `youcoded`

**Files:**
- Modify: `~/youcoded-dev/youcoded-admin/skills/announce/SKILL.md`

- [ ] **Step 1: Read the current skill file**

Run:
```bash
cat ~/youcoded-dev/youcoded-admin/skills/announce/SKILL.md
```

Capture the current structure for reference.

- [ ] **Step 2: Overwrite with the rewritten skill**

Replace the entire contents of `~/youcoded-dev/youcoded-admin/skills/announce/SKILL.md` with:

````markdown
---
name: announce
description: Manage YouCoded announcements. Use when the user says "create/post/set an announcement", "clear/remove the announcement", or "what's the current announcement"/"show the announcement".
---

# Announce — YouCoded Admin Skill

You manage the live announcement broadcast for YouCoded via `announcements.txt` in the `youcoded` app repo.

## Repo Details

- **Repo path:** `$HOME/youcoded-dev/youcoded` (workspace clone — admin-only skill, so this path is hardcoded intentionally)
- **File:** `announcements.txt` (repo root)
- **Branch:** `master` (always — never `main`)
- **Public URL (what apps fetch):** `https://raw.githubusercontent.com/itsdestin/youcoded/master/announcements.txt`
- **Cache:** `~/.claude/.announcement-cache.json` (read-only from this skill)

## File Format

```
# With expiry (auto-clears after date passes):
2026-03-25: New skill drop — update now!

# Without expiry (stays until manually cleared):
Hey friends — check the new journaling skill!

# Empty file = no announcement shown to users
```

Rules:
- First non-empty, non-comment line is used
- `YYYY-MM-DD: message` sets an expiry (zero-padded months and days required)
- Non-matching first line = message with no expiry
- Empty file = no announcement
- Expiry is **inclusive** of the date: `expires: 2026-04-20` shows on 2026-04-20, disappears on 2026-04-21

---

## Detect Intent

Read the user's message and determine which flow to run:

- **Create:** mentions "create", "post", "set", "send", "broadcast", "new announcement", or provides message text directly
- **Clear:** mentions "clear", "remove", "delete", "empty", "take down" the announcement
- **View:** mentions "current", "show", "what is", "status", "check" the announcement

If intent is ambiguous, ask: "Do you want to create a new announcement, clear the current one, or view what's live?"

---

## Create Flow

**Goal:** Write a new message to `announcements.txt`, commit, push.

1. **Gather message** — if not already provided, ask: "What's the announcement message?"

2. **Gather expiry** — if not mentioned, ask: "Any expiry date? Format: YYYY-MM-DD (or press enter to skip)"
   - Validate format if provided: must match `YYYY-MM-DD` with zero-padded month and day. If invalid, ask again.
   - If skipped: no expiry

3. **Compose the line:**
   - With expiry: `YYYY-MM-DD: message`
   - Without expiry: `message`

4. **Show preview:**
   ```
   Will post: ★ [message]  (expires YYYY-MM-DD)
   ```
   or
   ```
   Will post: ★ [message]  (no expiry)
   ```
   Ask: "Looks good? (yes/no)"

5. **On confirm — run these Bash commands:**

```bash
REPO="$HOME/youcoded-dev/youcoded"
if [ ! -d "$REPO" ]; then
  echo "ERROR: Expected youcoded repo at $REPO. Is the workspace cloned?"
  exit 1
fi
if [ ! -f "$REPO/announcements.txt" ]; then
  echo "ERROR: $REPO/announcements.txt missing. Did the rebuild land yet?"
  exit 1
fi
echo "ANNOUNCEMENT_LINE" > "$REPO/announcements.txt"
cd "$REPO"
git add announcements.txt
git commit -m "chore: set announcement — MESSAGE_PREVIEW"
git push origin master
```

Replace `ANNOUNCEMENT_LINE` with the composed line (e.g. `2026-04-01: April Fools!`) and `MESSAGE_PREVIEW` with a short (≤50 char) version of the message for the commit subject.

6. **Report success:**
   ```
   ✓ Announcement live. Users will see: ★ [message]
   Propagation: clients fetch every hour, so it'll appear within ~1h (faster if they restart the app).
   ```

---

## Clear Flow

**Goal:** Empty `announcements.txt`, commit, push.

1. **Read the current file:**

```bash
REPO="$HOME/youcoded-dev/youcoded"
cat "$REPO/announcements.txt"
```

2. **If already empty** (no non-comment, non-blank lines) → say "No active announcement to clear." and stop.

3. **Show what will be cleared:**
   ```
   Current announcement: ★ [message]
   Clear it? (yes/no)
   ```

4. **On confirm — run:**

```bash
REPO="$HOME/youcoded-dev/youcoded"
: > "$REPO/announcements.txt"
cd "$REPO"
git add announcements.txt
git commit -m "chore: clear announcement"
git push origin master
```

5. **Report success:**
   ```
   ✓ Announcement cleared. Users will stop seeing the pill within ~1h.
   ```

---

## View Flow

**Goal:** Show the current state without modifying anything.

1. **Read `announcements.txt`:**

```bash
REPO="$HOME/youcoded-dev/youcoded"
cat "$REPO/announcements.txt"
```

Parse the first non-empty, non-comment line:
- If matches `YYYY-MM-DD: message` → message = part after `: `, expires = date
- If plain text → message = the line, no expiry
- If empty/comment-only → no active announcement

2. **Read local cache** (for last-fetched time only):

```bash
cat ~/.claude/.announcement-cache.json 2>/dev/null
```

Extract `fetched_at` field only. `announcements.txt` in the repo is authoritative for message and expiry.

3. **Display:**

```
Current announcement:  [message]  OR  (none)
Expires:               [YYYY-MM-DD]  OR  never
Last synced locally:   [fetched_at formatted as local time]  OR  not yet fetched
```

---

## Error Handling

| Error | Response |
|-------|----------|
| `$HOME/youcoded-dev/youcoded` missing | "Workspace clone not found. Run `bash setup.sh` from `~/youcoded-dev` first." |
| `announcements.txt` missing | "Expected `announcements.txt` in `$HOME/youcoded-dev/youcoded`. Has the rebuild release landed on master?" |
| `git push` fails | Show the raw git error output. Do not retry. |
| File already empty (clear) | "No active announcement to clear." — stop, no commit. |
| User cancels at confirm | "Cancelled. No changes made." |
````

- [ ] **Step 3: Commit the skill rewrite**

```bash
cd ~/youcoded-dev/youcoded-admin
git add skills/announce/SKILL.md
git commit -m "feat(announce): rewrite skill to target youcoded repo instead of youcoded-core"
git push origin master
```

---

## Task 11: Mirror the `/announce` skill update to the personal skills dir

**Files:**
- Modify: `~/.claude/skills/announce/SKILL.md`

- [ ] **Step 1: Detect whether it's a symlink or a copy**

Run:
```bash
ls -la ~/.claude/skills/announce/SKILL.md
```

If the output starts with `lrwx` (symlink) and points into the youcoded-admin repo, **skip to Step 3** — the symlink already reflects the Task 10 change.

If it's a regular file (`-rw...`), it's a copy and needs updating.

- [ ] **Step 2: If it's a copy, overwrite with the rewritten version**

Run:
```bash
cp ~/youcoded-dev/youcoded-admin/skills/announce/SKILL.md ~/.claude/skills/announce/SKILL.md
```

- [ ] **Step 3: Verify skill activates with the new content**

Run:
```bash
grep -c 'youcoded-dev/youcoded"' ~/.claude/skills/announce/SKILL.md
```

Expected: `5` (the new file references that path in Create, Clear, View flows and the error-handling table).

No commit needed — `~/.claude/skills` is personal, not under version control in the workspace.

---

## Task 12: Delete `youcoded-core/announcements.txt`

**Files:**
- Delete: `~/youcoded-dev/youcoded-core/announcements.txt`

- [ ] **Step 1: Confirm no active announcement content is stranded here**

Run:
```bash
cat ~/youcoded-dev/youcoded-core/announcements.txt
```

Expected: empty (emptied in Task 1). If it's not empty, **STOP** — someone posted an announcement to the old location after the cutover. Move it to `youcoded/announcements.txt` first, then return here.

- [ ] **Step 2: Delete**

Run:
```bash
rm ~/youcoded-dev/youcoded-core/announcements.txt
```

- [ ] **Step 3: Commit and push**

```bash
cd ~/youcoded-dev/youcoded-core
git add -u announcements.txt
git commit -m "chore: delete announcements.txt (moved to youcoded app repo)"
git push origin master
```

---

## Task 13: Strike youcoded-core docs references to the old announcements location

**Files:**
- Modify: `~/youcoded-dev/youcoded-core/docs/system-architecture.md`
- Modify: `~/youcoded-dev/youcoded-core/specs/system-architecture-spec.md`
- Modify: `~/youcoded-dev/youcoded-core/specs/statusline-spec.md`
- Modify: `~/youcoded-dev/youcoded-core/specs/INDEX.md`
- Modify: `~/youcoded-dev/youcoded-core/CHANGELOG.md`

- [ ] **Step 1: Find all current references**

Run:
```bash
cd ~/youcoded-dev/youcoded-core && grep -rn "announcement" docs/ specs/ CHANGELOG.md 2>&1 | grep -v ".git/"
```

Capture every hit. Each needs to be updated to either (a) point to the new `youcoded` location, (b) be reworded as historical, or (c) be deleted if it's no longer accurate.

- [ ] **Step 2: For each hit, apply one of three treatments**

**Treatment A — Update path:** if the line describes where announcements live or how they're fetched, update it to `youcoded/announcements.txt` and the new URL `raw.githubusercontent.com/itsdestin/youcoded/master/announcements.txt`.

**Treatment B — Rewrite as historical:** if the line is in a spec describing past architecture (e.g. "the toolkit used to own announcement fetch"), rewrite to reflect current reality: "Announcements are owned by the YouCoded app (`youcoded/announcements.txt`); the toolkit no longer fetches them."

**Treatment C — Delete:** if the line exists only to document a piece of logic that's now gone (e.g. `session-start.sh` announcement-fetch invocation — already commented out in the header per session-start.sh:7-11), remove it.

- [ ] **Step 3: Add a CHANGELOG entry**

Prepend to the top of `~/youcoded-dev/youcoded-core/CHANGELOG.md`:

```markdown
## Unreleased

- **Announcements moved to the app.** `announcements.txt` now lives in the `youcoded` repo, not `youcoded-core`. The toolkit no longer fetches or caches announcements — the app does it natively on both desktop and Android. Update your `/announce` workflow (it now targets `youcoded`).
```

- [ ] **Step 4: Verify nothing unexpected remains**

Run:
```bash
cd ~/youcoded-dev/youcoded-core && grep -rn "announcement" docs/ specs/ 2>&1 | grep -v ".git/"
```

Every remaining hit should either be historical context clearly marked as such, or something intentional. No stale "`youcoded-core/announcements.txt`" references.

- [ ] **Step 5: Commit and push**

```bash
cd ~/youcoded-dev/youcoded-core
git add docs/ specs/ CHANGELOG.md
git commit -m "docs: remove references to youcoded-core-owned announcements"
git push origin master
```

---

## Task 14: Add a PITFALLS.md entry for the announcement invariants

**Files:**
- Modify: `~/youcoded-dev/docs/PITFALLS.md`

- [ ] **Step 1: Open PITFALLS.md and find a logical insertion point**

Read `~/youcoded-dev/docs/PITFALLS.md`. Good insertion points are near the top-level grouping for app-wide invariants. The file is grouped by subsystem (Chat Reducer, Android Runtime, Toolkit & Hooks, etc.). Announcements don't fit any existing group cleanly, so add a new top-level section.

- [ ] **Step 2: Add a new section**

Add after an existing section (e.g. after "Remote Access State Sync" or wherever fits the existing flow). Insert:

```markdown
## Announcements

- **Single fetcher per platform.** Desktop runs `announcement-service.ts` (Electron main, 1h cadence); Android runs `AnnouncementService.kt` from `SessionService`. Both write `~/.claude/.announcement-cache.json` in their respective home dirs. **Never reintroduce a parallel fetcher to the same cache file** — the legacy `desktop/hook-scripts/announcement-fetch.js` and its spawner in `ipc-handlers.ts` were removed for exactly this reason; two writers is redundant work and divergent freshness (the 6h JS and 24h TS services were writing the same file).
- **Two expiry filters, both required.** Fetch-time in the parser (drops past-date lines before writing cache) and render-time in `StatusBar.tsx` via the shared `isExpired()` helper. Removing the fetch-time filter lets stale entries enter the cache; removing the render-time filter lets entries linger past local midnight until the next fetch. Keep both.
- **Clear propagation is an explicit null-write.** When the remote `announcements.txt` is empty (or all lines are expired/comments), the fetcher writes `{ message: null, fetched_at }` to the cache rather than skipping the write. Today's pattern lets the status-bar gate flip off within the refresh interval. If you "simplify" this back to a no-op-on-empty write, clears linger for up to 1h with no way to force-expire on the reader side.
- **Source of truth is `youcoded/announcements.txt`** (app repo), not `youcoded-core`. Earlier versions owned this in the toolkit repo; that ownership moved in the 2026-04 rebuild. Admin `/announce` skill writes to the app repo — pushing to `youcoded-core` does nothing.
- **Cache shape contract:** `{ message: string | null, fetched_at: string, expires?: string }`. `message: null` means explicitly cleared; `message: undefined` / no cache file means never-fetched. Both result in no pill; distinction matters only for diagnostics.
```

- [ ] **Step 3: Commit**

```bash
cd ~/youcoded-dev
git add docs/PITFALLS.md
git commit -m "docs(pitfalls): announcement system invariants (single fetcher, two filters, clear-write)"
```

(No push to the workspace scaffold is needed unless Destin has an upstream wired up for `youcoded-dev` — follow whatever workflow he uses for PITFALLS.md updates.)

---

## Self-Review Checklist

After all tasks complete, verify against the spec (`docs/superpowers/specs/2026-04-20-announcement-system-rebuild-design.md`):

- [ ] Spec §Goals #1 "Single source of truth in `youcoded/announcements.txt`" — covered by Tasks 1, 8, 12
- [ ] Spec §Goals #2 "One fetcher per platform" — covered by Tasks 3 (desktop), 4 (legacy delete), 6 (Android)
- [ ] Spec §Goals #3 "Expired content never renders" — covered by Tasks 2 (helper), 3 (fetch-time), 5 (render-time), 6 (Android fetch-time)
- [ ] Spec §Goals #4 "Clearing propagates within refresh interval" — covered by Task 3 (desktop null-write) and Task 6 (Android null-write)
- [ ] Spec §Goals #5 "Android parity" — covered by Tasks 6 and 7
- [ ] Spec §Goals #6 "No change to plaintext format" — verified: Tasks 3 and 6 preserve the same parser grammar
- [ ] Spec §Success Criteria #1 `/announce` retargeted — Task 10
- [ ] Spec §Success Criteria #2 expired never renders — Tasks 2, 3, 5, 6
- [ ] Spec §Success Criteria #3 cleared disappears within 1h — Tasks 3, 6
- [ ] Spec §Success Criteria #4 only one fetcher per platform — Tasks 4, 6
- [ ] Spec §Success Criteria #5 Android sees same as desktop — Tasks 6, 7
- [ ] Spec §Success Criteria #6 no lingering references to `youcoded-core/announcements.txt` — Task 13

Run a final cross-repo sweep:

```bash
grep -rn "youcoded-core/announcements\|announcement-fetch\.js" \
  ~/youcoded-dev/youcoded ~/youcoded-dev/youcoded-core \
  ~/youcoded-dev/youcoded-admin ~/youcoded-dev/docs \
  2>&1 | grep -v ".git/\|node_modules"
```

Expected: no matches (or only intentional historical references clearly marked as such in changelogs).
