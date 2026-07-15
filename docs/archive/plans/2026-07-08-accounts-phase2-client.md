---
status: shipped
---

# Accounts Phase 2 — Client (friends UI, presence, games) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give YouCoded a friends system — add-by-handle, requests, blocks, friends-only presence and game challenges — on both desktop and Android, replacing the PartyKit global lobby with the platform Worker's `PresenceRoom`, plus the account-context rename and the Phase 1 knowledge-debt batch.

**Architecture:** The platform layer owns the presence WebSocket (Electron main via `ws`; Android `SessionService` via OkHttp) and relays events to React as a `social:presence-event` push — the session token never crosses into the renderer. React gains a `social:*` IPC group (four-surface parity), a `usePresence` hook replacing `usePartyLobby`, and the games panel's lobby becomes the friends list. Game *rooms* stay on PartyKit (dumb relay keyed by room code). Design spec: `docs/superpowers/specs/2026-07-03-youcoded-accounts-friendship-consolidated-design.md` §2, §3, §6.

**Tech Stack:** React (shared UI), Electron main (`ws` ^8), Kotlin (OkHttp WebSocket), vitest.

**Repo:** `youcoded` (worktree). **Prerequisite:** the worker plan (`2026-07-08-accounts-phase2-worker.md`) must be **merged and CI-deployed** before Task 11's runtime verification. Tasks 1–10 can be built and unit-tested before that.

---

## Standing context (read before Task 1)

- **Read the current file before editing it.** Phase 1 review iterations hardened code beyond its plan text; master is the source of truth.
- **Destin is a non-developer:** WHY comments on every non-trivial edit. Plain words in UI — **never status glyphs** (`●◐○` banned; write "Online", "In game", "Last seen 2h ago").
- **Parity is scope:** every new IPC type lands in `preload.ts` + `remote-shim.ts` + a desktop main handler file + `SessionService.kt` in the SAME task, pinned in `desktop/tests/ipc-channels.test.ts`. Quote conventions in that test: preload/remote-shim assert `'type'` (single quotes), handler files and SessionService assert `"type"` (double quotes).
- Overlays: `<Scrim layer={2}>` / `<OverlayPanel layer={2}>` from `components/overlays/Overlay.tsx`; anchored popovers use `.layer-surface`; ESC via the `useEscClose` stack.
- Pre-existing failing desktop tests on master: `tests/ipc-handlers.test.ts` (electron mock crash) and 3 tests in `tests/remote-config.test.ts`. Anything beyond those is your regression. Never run the suite while a dev instance from the same worktree is live.
- Dev instance: `YOUCODED_PORT_OFFSET=150 YOUCODED_PROFILE=dev2` (Vite 5323). Port 5273 belongs to another session's live dev instance — do not kill it. Unset `CLAUDECODE*`/`CLAUDE_*` env vars when launching dev from a Claude session (`scripts/run-dev.sh` handles it).
- Worker API host: `MARKETPLACE_API_HOST` in `desktop/src/main/marketplace-api-client.ts` (`https://wecoded-marketplace-api.destinj101.workers.dev`). Kotlin mirror in `MarketplaceApiClient.kt`.
- Key current-state anchors (verified 2026-07-08): context = `desktop/src/renderer/state/marketplace-auth-context.tsx` (exports `MarketplaceAuthProvider`, `useMarketplaceAuth`); lobby hook = `desktop/src/renderer/hooks/usePartyLobby.ts`; game hook = `desktop/src/renderer/hooks/usePartyGame.ts`; game state = `desktop/src/renderer/state/game-{types,reducer,context}.ts`; games UI = `desktop/src/renderer/components/game/`; account IPC = `preload.ts:197-205` + `remote-shim.ts:787-799` + `desktop/src/main/marketplace-api-handlers.ts` + `SessionService.kt:2389-2568`; push-event pattern = `ipc-handlers.ts` `send()` helper (desktop), `dispatchEvent` switch in `remote-shim.ts` `handleMessage`, `bridgeServer.broadcast(...)` (Android).

**Server wire shapes this plan consumes** (defined by the worker plan — snake_case):
- Card: `{ id, display_name, handle, avatar_url }`
- Friends list row: card + `last_seen_at: number | null` + `created_at`
- Requests: `{ incoming: [{id, from: card, created_at}], outgoing: [{id, to: card, created_at}] }`
- Presence events (server→client): `presence {users: [card+status]}` · `user-joined {user}` · `user-left {id}` · `user-status {id, status}` · `challenge {from: card, gameType, code}` · `challenge-response {from: card, accept}` · `challenge-failed {target}` · `pong`
- Presence sends (client→server): `ping` · `status {status}` · `challenge {target, gameType, code}` · `challenge-response {to, accept}`

---

### Task 0: Worktree setup

- [ ] **Step 1:**

```bash
cd /c/Users/desti/youcoded-dev/youcoded
git fetch origin && git pull origin master
mkdir -p ../youcoded.wt
git worktree add ../youcoded.wt/accounts-phase2 -b feat/accounts-phase2
cd ../youcoded.wt/accounts-phase2/desktop
npm ci
npm test   # baseline: only the pre-existing failures listed above
```

---

### Task 1: Context rename — `useMarketplaceAuth` → `useAccount`

Pure mechanical rename, zero behavior change, committed alone so the diff is reviewable.

**Files:**
- Rename: `desktop/src/renderer/state/marketplace-auth-context.tsx` → `desktop/src/renderer/state/account-context.tsx`
- Modify: all 11 consumer files (list below)

- [ ] **Step 1: Rename file + exports**

```bash
git mv desktop/src/renderer/state/marketplace-auth-context.tsx desktop/src/renderer/state/account-context.tsx
```

In the renamed file: `MarketplaceAuthProvider` → `AccountProvider`, `useMarketplaceAuth` → `useAccount`, `MarketplaceAuthCtx` → `AccountCtx`. Update the file-header comment (it currently notes the rename is deferred to Phase 2 — this IS that rename; say so). Keep the `MarketplaceUser` type name (it's the shared main-process type; renaming it is churn without payoff).

- [ ] **Step 2: Update every consumer** (import path + hook/provider name):

`App.tsx`, `components/HandlePrompt.tsx`, `components/AccountSection.tsx`, `hooks/usePartyLobby.ts`, `components/game/GameLobby.tsx`, `components/marketplace/MarketplaceDetailOverlay.tsx`, `components/marketplace/SignInPromptModal.tsx`, `components/marketplace/MarketplaceAuthChip.tsx`, `components/marketplace/LikeButton.tsx`, `components/marketplace/ReportReviewButton.tsx`, `components/marketplace/RatingSubmitModal.tsx`.

Then verify nothing is left: `grep -rn "useMarketplaceAuth\|MarketplaceAuthProvider\|marketplace-auth-context" desktop/src/` → zero hits.

- [ ] **Step 3: Verify + commit**

Run: `npm test && npx tsc --noEmit` (or the repo's typecheck script — check `package.json`). Expected: baseline failures only.

```bash
git add -A && git commit -m "refactor(account): rename marketplace-auth context to account-context (useAccount/AccountProvider)"
```

---

### Task 2: Context hardening + `account:refresh` (knowledge-debt #5, #6, #8)

**Files:**
- Modify: `desktop/src/renderer/state/account-context.tsx`
- Modify: `desktop/src/main/preload.ts`, `desktop/src/renderer/remote-shim.ts`, `desktop/src/main/marketplace-api-handlers.ts`, `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`
- Modify: `desktop/tests/ipc-channels.test.ts` (add the two new types to `NEW_TYPES`)
- Modify: `desktop/src/renderer/components/marketplace/SignInPromptModal.tsx`, `RatingSubmitModal.tsx`, `MarketplaceAuthChip.tsx`, `components/game/GameLobby.tsx` (SignInScreen)

- [ ] **Step 1: Add `account:refresh` on all four surfaces**

New channel `account:refresh` — forces a `GET /auth/me`, updates the stored profile, returns the fresh user (or 401-clears via the existing `clearSessionOn401`).

Desktop handler in `marketplace-api-handlers.ts` (add `"account:refresh"` to `CHANNELS`; model the body on the existing `account:user` heal path — read it first):

```ts
ipcMain.handle("account:refresh", () => wrap(async () => {
  const token = store.getToken();
  if (!token) return null;
  // Force-revalidate the cached profile (knowledge-debt: a rename on device A
  // never reached device B until sign-out/in).
  const result = await client.authMe(token);
  clearSessionOn401(result);
  if (!result.ok) throw new Error(result.error);
  store.setSession(token, result.value);
  return result.value;
}));
```

`preload.ts`: add `ACCOUNT_REFRESH: 'account:refresh'` to the IPC constants and `refresh: () => ipcRenderer.invoke(IPC.ACCOUNT_REFRESH)` to `window.claude.account`.
`remote-shim.ts`: `refresh: () => invoke('account:refresh')` in the account object.
`SessionService.kt`: new `"account:refresh"` when-case mirroring the existing `account:user` heal (capture the token BEFORE the suspend call — the Phase 1 NPE lesson), but unconditionally re-fetching `/auth/me` and persisting via `authStore.setSession(...)` before responding.
`ipc-channels.test.ts`: append `'account:refresh'` to the account describe's `NEW_TYPES`.

- [ ] **Step 2: Context — `signInError`, poll cancellation, focus revalidation**

In `account-context.tsx`:

```ts
// 1) signInError (knowledge-debt #6): startSignIn failures were void-swallowed
//    at 4 callsites. One context-level error string fixes all of them.
const [signInError, setSignInError] = useState<string | null>(null);
// inside startSignIn: setSignInError(null) at entry; in the catch,
// setSignInError(message) before any rethrow/return.

// 2) Poll cancellation (knowledge-debt #5): an in-flight sign-in poll loop
//    could complete AFTER signOut/deleteAccount and flip state back to
//    signed-in. Epoch counter: bump on signOut/deleteAccount; the poll loop
//    captures the epoch at start and discards its result if it changed.
const signInEpoch = useRef(0);
// poll loop: const epoch = signInEpoch.current; ... if (signInEpoch.current !== epoch) return;
// signOut()/deleteAccount(): signInEpoch.current += 1; (first line)

// 3) Focus revalidation (knowledge-debt #8): re-fetch the profile when the
//    window regains focus (min 60s between refreshes) and every 15 minutes.
useEffect(() => {
  if (!signedIn) return;
  let last = 0;
  const doRefresh = async () => {
    if (Date.now() - last < 60_000) return;
    last = Date.now();
    try { await refresh(); } catch { /* offline is fine; next focus retries */ }
  };
  const onFocus = () => { void doRefresh(); };
  window.addEventListener('focus', onFocus);
  const timer = setInterval(() => { void doRefresh(); }, 15 * 60_000);
  return () => { window.removeEventListener('focus', onFocus); clearInterval(timer); };
}, [signedIn]);
```

Where `refresh()` is a new context action calling `window.claude.account.refresh()` and applying the returned user to state (null result = signed out — apply that too, it's the 401-auto-signout propagating). Add `signInError: string | null` and `refresh(): Promise<void>` to the `AccountCtx` interface and the memoized value.

- [ ] **Step 3: Surface `signInError` at the four void-swallow callsites**

In `SignInPromptModal.tsx`, `RatingSubmitModal.tsx`, `MarketplaceAuthChip.tsx`, and `GameLobby.tsx`'s `SignInScreen`: read `const { signInError } = useAccount()` and render below the sign-in button when set:

```tsx
{signInError && (
  <p className="text-[11px] text-red-400 mt-2">Sign-in failed: {signInError}. Try again.</p>
)}
```

(Match each file's existing error-text styling if one exists — read the file first.)

- [ ] **Step 4: Test**

Add to `desktop/tests/` a small unit test if the context has one already (grep `marketplace-auth` in tests/); otherwise the parity test + typecheck + manual pass in Task 11 cover it. Run `npm test` — baseline only. Kotlin: `cd .. && ./gradlew :app:compileDebugKotlin`.

- [ ] **Step 5: Commit** — `git commit -am "feat(account): signInError surfacing, sign-in poll cancellation, profile revalidation via account:refresh"`

---

### Task 3: HandlePrompt per-account dismissal (knowledge-debt #4)

**Files:** Modify: `desktop/src/renderer/components/HandlePrompt.tsx`

- [ ] **Step 1:** Change the dismissal key from the machine-global `'youcoded-handle-prompt-dismissed'` to per-account:

```ts
// Keyed by account id (knowledge-debt: user A skipping used to suppress the
// prompt for user B on the same machine). The legacy global key is honored
// once as a fallback so existing dismissals don't re-prompt.
const LEGACY_DISMISS_KEY = 'youcoded-handle-prompt-dismissed';
const dismissKey = (userId: string) => `youcoded-handle-prompt-dismissed:${userId}`;
```

In the open-effect: `const dismissed = user ? (localStorage.getItem(dismissKey(user.id)) === '1' || localStorage.getItem(LEGACY_DISMISS_KEY) === '1') : false;`. In `skip()`: write the per-account key (and leave the legacy key alone — it ages out naturally).

- [ ] **Step 2:** `npm test` baseline; commit — `git commit -am "fix(account): handle-prompt dismissal keyed per account id"`

---

### Task 4: Kotlin sign-out timeout + pending state (knowledge-debt #7)

**Files:**
- Modify: `app/src/main/kotlin/com/youcoded/app/marketplace/MarketplaceApiClient.kt` (logout call)
- Modify: `desktop/src/renderer/components/AccountSection.tsx` (Sign out pending state)

- [ ] **Step 1:** In `MarketplaceApiClient.kt`, give the `logout` request a bounded timeout — build a per-call client: `client.newBuilder().callTimeout(5, TimeUnit.SECONDS).build()` for the logout request only (desktop got a 5s AbortSignal in Phase 1; this is the parity fix). WHY comment: sign-out is best-effort revocation; a hung network must not hold the UI.

- [ ] **Step 2:** In `AccountSection.tsx` `SignedInBody`, add a pending state to the Sign out button:

```tsx
const [signingOut, setSigningOut] = useState(false);
// onClick: setSigningOut(true); try { await signOut(); } finally { setSigningOut(false); }
// button: disabled={signingOut}, label {signingOut ? 'Signing out…' : 'Sign out'}
```

- [ ] **Step 3:** `./gradlew :app:compileDebugKotlin` + `npm test`; commit — `git commit -am "fix(account): bounded Kotlin logout timeout + sign-out pending state"`

---

### Task 5: `social:*` request/response IPC + `account:export` (four surfaces + parity)

**Files:**
- Modify: `desktop/src/main/marketplace-api-client.ts` (social + export + me methods)
- Create: `desktop/src/main/social-handlers.ts`
- Modify: wherever `registerMarketplaceApiHandlers(store)` is called (grep — `main.ts` or `ipc-handlers.ts`): add `registerSocialHandlers(store)`
- Modify: `desktop/src/main/preload.ts`, `desktop/src/renderer/remote-shim.ts`
- Modify: `desktop/src/main/marketplace-api-handlers.ts` (`account:export` lives with the account group)
- Modify: `app/.../marketplace/MarketplaceApiClient.kt`, `app/.../runtime/SessionService.kt`
- Test: `desktop/tests/ipc-channels.test.ts` (new `social:* channel parity` describe)

**The channel set (must be byte-identical on all four surfaces):**

| Channel | Worker endpoint | Args |
|---|---|---|
| `social:lookup-handle` | `GET /social/users/:handle` | `{handle}` |
| `social:send-request` | `POST /social/requests` | `{handle}` |
| `social:list-requests` | `GET /social/requests` | — |
| `social:accept-request` | `POST /social/requests/:id/accept` | `{id}` |
| `social:decline-request` | `POST /social/requests/:id/decline` | `{id}` |
| `social:cancel-request` | `DELETE /social/requests/:id` | `{id}` |
| `social:list-friends` | `GET /social/friends` | — |
| `social:unfriend` | `DELETE /social/friends/:userId` | `{userId}` |
| `social:block` | `POST /social/blocks` | `{userId}` |
| `social:unblock` | `DELETE /social/blocks/:userId` | `{userId}` |
| `social:list-blocks` | `GET /social/blocks` | — |
| `account:export` | `GET /auth/export` | — (desktop: save dialog; Android: Downloads) |

- [ ] **Step 1: Write the failing parity test** — copy the `account:* channel parity` describe (`ipc-channels.test.ts:127-160`) into a new `social:* channel parity` describe listing the 11 `social:*` types, asserting presence in `preload.ts` / `remote-shim.ts` (single-quoted) and `social-handlers.ts` / `SessionService.kt` (double-quoted). Add `'account:export'` to the account describe's `NEW_TYPES`. Run: fails on all surfaces.

- [ ] **Step 2: Desktop api-client methods** (`marketplace-api-client.ts`) — one thin method per endpoint using the existing `request()` helper, all taking `token` first, e.g.:

```ts
lookupHandle: (token: string, handle: string) =>
  request<UserCard>("GET", `/social/users/${encodeURIComponent(handle)}`, token),
sendFriendRequest: (token: string, handle: string) =>
  request<{ status: "pending" | "friends" }>("POST", "/social/requests", token, { handle }),
listRequests: (token: string) => request<RequestsPayload>("GET", "/social/requests", token),
acceptRequest: (token: string, id: string) => request("POST", `/social/requests/${encodeURIComponent(id)}/accept`, token),
declineRequest: (token: string, id: string) => request("POST", `/social/requests/${encodeURIComponent(id)}/decline`, token),
cancelRequest: (token: string, id: string) => request("DELETE", `/social/requests/${encodeURIComponent(id)}`, token),
listFriends: (token: string) => request<FriendRow[]>("GET", "/social/friends", token),
unfriend: (token: string, userId: string) => request("DELETE", `/social/friends/${encodeURIComponent(userId)}`, token),
block: (token: string, userId: string) => request("POST", "/social/blocks", token, { user_id: userId }),
unblock: (token: string, userId: string) => request("DELETE", `/social/blocks/${encodeURIComponent(userId)}`, token),
listBlocks: (token: string) => request<BlockRow[]>("GET", "/social/blocks", token),
exportData: (token: string) => request<Record<string, unknown>>("GET", "/auth/export", token),
```

Match the actual `request()` signature in the file (read it first — it may take an options object). Define the payload types (`UserCard {id, display_name, handle, avatar_url}`, `FriendRow = UserCard & {last_seen_at: number | null, created_at: number}`, etc.) in this file and export them.

- [ ] **Step 3: `social-handlers.ts`** — mirror `marketplace-api-handlers.ts`'s structure (read it first): a `CHANNELS` array with the 11 strings, a `registerSocialHandlers(store)` that removes-then-registers, the same `wrap()`/`clearSessionOn401` treatment (import or duplicate the tiny helpers — prefer exporting them from `marketplace-api-handlers.ts` and importing). Every handler: token from `store.getToken()` (throw "not signed in" when null) → api-client call → `clearSessionOn401(result)` → return. Example:

```ts
ipcMain.handle("social:send-request", (_e, args: { handle: string }) => wrap(async () => {
  const token = store.getToken();
  if (!token) throw new Error("not signed in");
  const result = await client.sendFriendRequest(token, args.handle);
  clearSessionOn401(result);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}));
```

`account:export` (in `marketplace-api-handlers.ts` with the account group): fetch the JSON, then `dialog.showSaveDialog` (defaultPath `youcoded-account-export-<YYYY-MM-DD>.json`), write with `fs.promises.writeFile`, return `{ path }` or `{ canceled: true }`.

- [ ] **Step 4: preload + remote-shim** — new `window.claude.social` namespace (both files, identical shape):

```ts
social: {
  lookupHandle: (handle) => invoke-or-ipcRenderer('social:lookup-handle', { handle }),
  sendRequest: (handle) => …('social:send-request', { handle }),
  listRequests: () => …('social:list-requests'),
  acceptRequest: (id) => …('social:accept-request', { id }),
  declineRequest: (id) => …('social:decline-request', { id }),
  cancelRequest: (id) => …('social:cancel-request', { id }),
  listFriends: () => …('social:list-friends'),
  unfriend: (userId) => …('social:unfriend', { userId }),
  block: (userId) => …('social:block', { userId }),
  unblock: (userId) => …('social:unblock', { userId }),
  listBlocks: () => …('social:list-blocks'),
}
// and in the account object: exportData: () => …('account:export')
```

(`preload.ts` uses `IPC.SOCIAL_*` constants + `ipcRenderer.invoke`; `remote-shim.ts` uses `invoke('social:…', {…})` — follow each file's account-section style exactly.)

- [ ] **Step 5: Android** — `MarketplaceApiClient.kt`: add the matching suspend methods (same OkHttp `request()` pattern as `authMe`/`setHandle`). `SessionService.kt`: 12 new when-cases (11 social + `account:export`), each following the existing `account:update-profile` shape — capture token, call client, `clearSessionOn401`-equivalent, `bridgeServer.respond(ws, msg.type, it, result.toJson { v -> v })`. `account:export` on Android writes the JSON to the public Downloads collection via `MediaStore.Downloads` (filename `youcoded-account-export-<date>.json`) and responds `{path: "Downloads/…"}`; WHY comment: Android WebView has no save-dialog path.

- [ ] **Step 6: Run** the parity test → PASS. `npm test` baseline. `./gradlew :app:compileDebugKotlin` green.

- [ ] **Step 7: Commit** — `git commit -am "feat(social): social:* IPC group + account:export across all four surfaces"`

---

### Task 6: Platform-owned presence socket (desktop `ws` + Android OkHttp) + push relay

**Files:**
- Create: `desktop/src/main/presence-socket.ts`
- Modify: `desktop/src/main/social-handlers.ts` (`social:presence-connect/-disconnect/-send` + event relay)
- Modify: `desktop/src/main/preload.ts`, `desktop/src/renderer/remote-shim.ts` (3 channels + `social:presence-event` push)
- Modify: `desktop/src/main/remote-server.ts` IF pushes need explicit forwarding to remote clients (see Step 3)
- Create: `app/src/main/kotlin/com/youcoded/app/social/PresenceClient.kt`
- Modify: `app/.../runtime/SessionService.kt` (3 when-cases + broadcast)
- Modify: `desktop/tests/ipc-channels.test.ts` (add the 4 types to the social describe)

- [ ] **Step 1: `presence-socket.ts`** — a desired-state connection manager. The session token lives main-side only (spec §6):

```ts
// desktop/src/main/presence-socket.ts
// Platform-owned presence socket (spec §6): Electron main holds the account
// session token and the WebSocket; the renderer only ever sees relayed events.
import WebSocket from 'ws';

const PRESENCE_URL = 'wss://wecoded-marketplace-api.destinj101.workers.dev/social/presence';
const PING_INTERVAL_MS = 30_000;
const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000]; // capped exponential

export interface PresenceSocket {
  setDesired(want: boolean): void;
  send(message: Record<string, unknown>): void;
  destroy(): void;
}

export function createPresenceSocket(opts: {
  getToken: () => string | null;
  onEvent: (ev: Record<string, unknown>) => void; // relayed as social:presence-event
}): PresenceSocket {
  let desired = false;
  let ws: WebSocket | null = null;
  let attempts = 0;
  let pingTimer: NodeJS.Timeout | null = null;
  let retryTimer: NodeJS.Timeout | null = null;

  function connect() {
    const token = opts.getToken();
    if (!desired || ws || !token) return;
    const sock = new WebSocket(PRESENCE_URL, { headers: { Authorization: `Bearer ${token}` } });
    ws = sock;
    sock.on('open', () => {
      attempts = 0;
      opts.onEvent({ type: 'connected' });
      pingTimer = setInterval(() => sock.send(JSON.stringify({ type: 'ping' })), PING_INTERVAL_MS);
    });
    sock.on('message', (data) => {
      try { opts.onEvent(JSON.parse(String(data))); } catch { /* non-JSON frame: ignore */ }
    });
    sock.on('close', (code, reason) => cleanup({ type: 'disconnected', code, reason: String(reason) }));
    sock.on('error', (err) => {
      opts.onEvent({ type: 'error', message: err.message });
      sock.close(); // 'close' fires next and schedules the retry
    });
  }
  function cleanup(ev: Record<string, unknown>) {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    ws = null;
    opts.onEvent(ev);
    if (desired) {
      // Reconnect with capped backoff — a Worker deploy or network blip
      // shouldn't sign you out of presence for the rest of the session.
      const delay = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
      attempts += 1;
      retryTimer = setTimeout(connect, delay);
    }
  }
  return {
    setDesired(want) {
      desired = want;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      if (want) connect();
      else if (ws) { const s = ws; ws = null; desired = false; s.close(1000, 'incognito or sign-out'); if (pingTimer) { clearInterval(pingTimer); pingTimer = null; } opts.onEvent({ type: 'disconnected', code: 1000, reason: 'local' }); }
    },
    send(message) { ws?.send(JSON.stringify(message)); },
    destroy() { desired = false; retryTimer && clearTimeout(retryTimer); ws?.close(); },
  };
}
```

- [ ] **Step 2: Wire into `social-handlers.ts`** — instantiate once at registration:

```ts
const presence = createPresenceSocket({
  getToken: () => store.getToken(),
  onEvent: (ev) => broadcastPresenceEvent(ev),
});
ipcMain.handle("social:presence-connect", () => { presence.setDesired(true); return { ok: true }; });
ipcMain.handle("social:presence-disconnect", () => { presence.setDesired(false); return { ok: true }; });
ipcMain.handle("social:presence-send", (_e, args: { message: Record<string, unknown> }) => { presence.send(args.message); return { ok: true }; });
```

`broadcastPresenceEvent` sends `'social:presence-event'` to every window — reuse the `send()` helper pattern from `ipc-handlers.ts:62-73` (import it if exported, else replicate the 6-line loop over `windowRegistry.getWindowIds()`).

- [ ] **Step 3: Remote-browser forwarding** — remote clients must receive the push too (the host relays presence like every other push event, spec §6). Grep `remote-server.ts` for how an existing main-originated push (e.g. `update:progress` or `theme:reload`) reaches remote WS clients; mirror that exact mechanism for `social:presence-event`. If pushes to remote ride automatically off the same `send()` path, no change is needed — verify by reading, don't assume.

- [ ] **Step 4: preload + remote-shim** — constants + methods on `window.claude.social`:

```ts
presenceConnect: () => …('social:presence-connect'),
presenceDisconnect: () => …('social:presence-disconnect'),
presenceSend: (message) => …('social:presence-send', { message }),
onPresenceEvent: (cb) => subscribe to 'social:presence-event',  // returns unsubscribe fn
```

preload: `ipcRenderer.on(IPC.SOCIAL_PRESENCE_EVENT, (_e, ev) => cb(ev))` with removal on unsubscribe. remote-shim: `addListener('social:presence-event', cb)` + a case in the `handleMessage` push switch dispatching `dispatchEvent('social:presence-event', payload)` (copy the `theme:reload` case shape at `remote-shim.ts:256-262`).

- [ ] **Step 5: Android `PresenceClient.kt`**

```kotlin
// app/src/main/kotlin/com/youcoded/app/social/PresenceClient.kt
// Android mirror of desktop's presence-socket.ts: SessionService owns the
// socket + token; React only sees relayed social:presence-event pushes.
package com.youcoded.app.social

import okhttp3.*
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class PresenceClient(
    private val getToken: () -> String?,
    private val onEvent: (JSONObject) -> Unit,
) {
    private val http = OkHttpClient.Builder().pingInterval(30, TimeUnit.SECONDS).build()
    private var ws: WebSocket? = null
    @Volatile private var desired = false
    private var attempts = 0
    private val backoffMs = longArrayOf(1_000, 2_000, 5_000, 10_000, 30_000)
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())

    fun setDesired(want: Boolean) {
        desired = want
        if (want) connect()
        else { ws?.close(1000, "incognito or sign-out"); ws = null }
    }

    fun send(message: JSONObject) { ws?.send(message.toString()) }

    private fun connect() {
        val token = getToken() ?: return
        if (!desired || ws != null) return
        val req = Request.Builder()
            .url("wss://wecoded-marketplace-api.destinj101.workers.dev/social/presence")
            .header("Authorization", "Bearer $token")
            .build()
        ws = http.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                attempts = 0
                onEvent(JSONObject().put("type", "connected"))
            }
            override fun onMessage(webSocket: WebSocket, text: String) {
                runCatching { onEvent(JSONObject(text)) }
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = retry(code, reason)
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = retry(1006, t.message ?: "failure")
        })
    }

    private fun retry(code: Int, reason: String) {
        ws = null
        onEvent(JSONObject().put("type", "disconnected").put("code", code).put("reason", reason))
        if (desired) {
            // Capped backoff so a Worker deploy doesn't kill presence for the session
            val delay = backoffMs[minOf(attempts, backoffMs.size - 1)]
            attempts += 1
            handler.postDelayed({ connect() }, delay)
        }
    }
}
```

`SessionService.kt`: hold a lazy `presenceClient = PresenceClient(getToken = { authStore.getToken() }, onEvent = { ev -> bridgeServer.broadcast(JSONObject().apply { put("type", "social:presence-event"); put("payload", ev) }) })`; three when-cases (`social:presence-connect` → `setDesired(true)`, `-disconnect` → `setDesired(false)`, `-send` → `presenceClient.send(msg.payload.getJSONObject("message"))`), each responding `{ok: true}`.

- [ ] **Step 6:** Parity test additions (`social:presence-connect/-disconnect/-send/-event` — for the event, preload/remote-shim/SessionService carry it; the desktop main sender is `social-handlers.ts`) → run → PASS. `npm test` baseline; Kotlin compiles.

- [ ] **Step 7: Commit** — `git commit -am "feat(social): platform-owned presence socket on both platforms + social:presence-event relay"`

---### Task 7: Renderer — account identity in game state + `usePresence` (replaces `usePartyLobby`)

**Files:**
- Modify: `desktop/src/renderer/state/game-types.ts`, `game-reducer.ts`
- Create: `desktop/src/renderer/hooks/usePresence.ts`
- Delete: `desktop/src/renderer/hooks/usePartyLobby.ts`
- Modify: `desktop/src/renderer/hooks/usePartyGame.ts` (display-name tag), `desktop/src/renderer/App.tsx` (wiring)
- Test: `desktop/tests/game-reducer.test.ts` (extend if it exists — grep; else create for the changed actions)

- [ ] **Step 1: Types.** In `game-types.ts`:

```ts
// Identity is the ACCOUNT now (spec §3): display name is the visible tag,
// account id is the stable key (display names aren't unique).
export interface OnlineUser {
  id: string;
  name: string;            // display_name from the account
  handle: string | null;
  status: 'idle' | 'in-game';
}
```

Actions change payloads: `USER_JOINED {user: OnlineUser}`, `USER_LEFT {id: string}`, `USER_STATUS {id, status}`, `CHALLENGE_RECEIVED {from: {id, name, handle}, gameType, code}`, `CHALLENGE_ACCEPTED {by: {id, name}}`, `CHALLENGE_DECLINED {by: {id, name}}`, `CHALLENGE_FAILED {target: string}`. State: `challengeFrom: {id, name} | null` (was a username string — check and update every reader). **Delete** `slowConnect`/`slowConnectHint` state fields and the `PARTY_SLOW_CONNECT` action — the socket lives in main now and the PartyKit HTTP-probe heuristic is gone (also delete `classifySlowConnect` with the old hook and any UI that rendered the hint in `GameLobby.tsx`).

- [ ] **Step 2: Reducer.** Update the presence/challenge cases in `game-reducer.ts` to key by `id` instead of `username` (the `PRESENCE_UPDATE` malformed-payload fallback at lines 64-72 stays). `CHALLENGE_RECEIVED` keeps forcing `panelOpen: true`.

- [ ] **Step 3: `usePresence.ts`** — same public shape `usePartyLobby` had so `GameConnection` assembly barely changes:

```ts
// desktop/src/renderer/hooks/usePresence.ts
// Replaces usePartyLobby (PartyKit global lobby, retired — spec §3). The
// socket itself lives in the PLATFORM layer (Electron main / SessionService);
// this hook only expresses desired state and translates relayed events into
// game-reducer actions. Same reducer event names as before.
import { useEffect, useRef, useState } from 'react';
import { useAccount } from '../state/account-context';
import { useGameDispatch } from '../state/game-context';

export function usePresence(isLeader: boolean = true) {
  const { signedIn, user } = useAccount();
  const dispatch = useGameDispatch();
  const [incognito, setIncognitoState] = useState(false);
  const loadedRef = useRef(false);

  // Incognito persists exactly as before (window.claude.getIncognito/setIncognito)
  useEffect(() => {
    let alive = true;
    void window.claude.getIncognito?.().then((v: boolean) => { if (alive) { setIncognitoState(Boolean(v)); loadedRef.current = true; } });
    return () => { alive = false; };
  }, []);

  // Desired-state: connected iff signed in, not incognito, and this window
  // leads (buddy windows must not double-drive the single main-process socket).
  useEffect(() => {
    if (!loadedRef.current && incognito === false) { /* first paint before load — effect re-runs after */ }
    if (signedIn && !incognito && isLeader) void window.claude.social.presenceConnect();
    else void window.claude.social.presenceDisconnect();
  }, [signedIn, incognito, isLeader]);

  // Relayed events → reducer actions (same names the old lobby dispatched)
  useEffect(() => {
    const unsubscribe = window.claude.social.onPresenceEvent((ev: any) => {
      switch (ev.type) {
        case 'connected':
          dispatch({ type: 'PARTY_CONNECTED', username: user?.display_name ?? user?.login ?? '' });
          break;
        case 'disconnected':
          dispatch({ type: 'PARTY_DISCONNECTED', code: ev.code, reason: ev.reason });
          break;
        case 'error':
          dispatch({ type: 'PARTY_ERROR', message: ev.message });
          break;
        case 'presence':
          dispatch({ type: 'PRESENCE_UPDATE', online: (ev.users ?? []).map(toOnlineUser) });
          break;
        case 'user-joined':
          dispatch({ type: 'USER_JOINED', user: toOnlineUser(ev.user) });
          break;
        case 'user-left':
          dispatch({ type: 'USER_LEFT', id: ev.id });
          break;
        case 'user-status':
          dispatch({ type: 'USER_STATUS', id: ev.id, status: ev.status });
          break;
        case 'challenge':
          dispatch({ type: 'CHALLENGE_RECEIVED', from: card(ev.from), gameType: ev.gameType, code: ev.code });
          break;
        case 'challenge-response':
          dispatch(ev.accept ? { type: 'CHALLENGE_ACCEPTED', by: card(ev.from) } : { type: 'CHALLENGE_DECLINED', by: card(ev.from) });
          break;
        case 'challenge-failed':
          dispatch({ type: 'CHALLENGE_FAILED', target: ev.target });
          break;
      }
    });
    return unsubscribe;
  }, [dispatch, user?.display_name, user?.login]);

  const toggleIncognito = async () => {
    const next = !incognito;
    setIncognitoState(next);
    await window.claude.setIncognito?.(next);
  };

  return {
    updateStatus: (status: 'idle' | 'in-game') => void window.claude.social.presenceSend({ type: 'status', status }),
    challengePlayer: (targetId: string, gameType: string, code: string) =>
      void window.claude.social.presenceSend({ type: 'challenge', target: targetId, gameType, code }),
    respondToChallenge: (toId: string, accept: boolean) =>
      void window.claude.social.presenceSend({ type: 'challenge-response', to: toId, accept }),
    incognito,
    toggleIncognito,
    reconnect: () => { void window.claude.social.presenceDisconnect(); void window.claude.social.presenceConnect(); },
  };
}
function toOnlineUser(u: any) { return { id: u.id, name: u.display_name, handle: u.handle ?? null, status: u.status === 'in-game' ? 'in-game' : 'idle' } as const; }
function card(u: any) { return { id: u.id, name: u.display_name, handle: u.handle ?? null }; }
```

(Adapt the `PARTY_CONNECTED/DISCONNECTED/ERROR` payload fields to whatever `game-reducer.ts` actually expects — read the current action definitions first.)

- [ ] **Step 4: Callers.** In `App.tsx`: `usePartyLobby(` → `usePresence(`; the `GameConnection` assembly (App.tsx:423-433) keeps the same keys. In `usePartyGame.ts`: the in-room player tag becomes the display name — where the hook takes/derives `username`, use `user?.display_name ?? user?.login` (spec §3: display_name is the visible tag; GitHub login is the fallback for accounts that predate display names). `challengePlayer(target)` in `usePartyGame.ts:269-278` now receives an **account id** as `target` — no code change if it just forwards to `lobbyChallenge`, but verify the param naming/comment. Delete `usePartyLobby.ts`. `grep -rn "usePartyLobby\|PARTY_SLOW_CONNECT\|slowConnect" desktop/src/` → zero hits.

- [ ] **Step 5: Reducer tests.** Grep `desktop/tests/` for game-reducer tests; update/extend to pin: `USER_LEFT` removes by id; `CHALLENGE_RECEIVED` stores `{id, name}` and opens the panel; `PRESENCE_UPDATE` replaces the list. Run `npm test` — baseline only. Commit — `git commit -am "feat(games): account-identity presence via usePresence; PartyKit lobby client retired"`

---

### Task 8: Friends UI — the games panel lobby becomes the friends list

**Files:**
- Modify: `desktop/src/renderer/components/game/GameLobby.tsx` (replace `LobbyScreen` with `FriendsScreen`)
- Create: `desktop/src/renderer/components/game/friends-data.ts` (small fetch/merge helpers, pure where possible)
- Test: `desktop/tests/friends-data.test.ts`

Spec §6: display name + handle + plain-word status; add-friend by handle; requests section when non-empty; block via row menu; challenge buttons on online friends only.

- [ ] **Step 1: Pure helpers + failing tests**

```ts
// desktop/src/renderer/components/game/friends-data.ts
import type { OnlineUser } from '../../state/game-types';

export interface FriendRowData {
  id: string; name: string; handle: string | null; avatarUrl: string | null;
  lastSeenAt: number | null;
  online: OnlineUser | null; // live presence entry when connected
}

/** Merge the server friends list with live presence, online first. */
export function mergeFriends(
  friends: Array<{ id: string; display_name: string; handle: string | null; avatar_url: string | null; last_seen_at: number | null }>,
  online: OnlineUser[],
): FriendRowData[] {
  const liveById = new Map(online.map((u) => [u.id, u]));
  return friends
    .map((f) => ({ id: f.id, name: f.display_name, handle: f.handle, avatarUrl: f.avatar_url, lastSeenAt: f.last_seen_at, online: liveById.get(f.id) ?? null }))
    .sort((a, b) => (a.online ? 0 : 1) - (b.online ? 0 : 1) || a.name.localeCompare(b.name));
}

/** Plain-word status — never glyphs (workspace rule). */
export function statusLabel(row: FriendRowData): string {
  if (row.online) return row.online.status === 'in-game' ? 'In game' : 'Online';
  if (!row.lastSeenAt) return 'Offline';
  const mins = Math.floor(Date.now() / 1000 / 60 - row.lastSeenAt / 60);
  if (mins < 2) return 'Active just now';
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Last seen ${days}d ago`;
  return `Last seen ${new Date(row.lastSeenAt * 1000).toLocaleDateString()}`;
}
```

Tests (`desktop/tests/friends-data.test.ts`): online-first ordering; live status wins over lastSeenAt; the coarsening ladder (mock `Date.now`). Write tests first, watch them fail on the missing module, implement, pass.

- [ ] **Step 2: `FriendsScreen`** replacing `LobbyScreen` in `GameLobby.tsx`. Structure (reuse the file's existing row/typography classes — read `LobbyScreen` at GameLobby.tsx:206-262 before writing):

  - **Data:** on mount and after every mutation, `Promise.all([window.claude.social.listFriends(), window.claude.social.listRequests()])`; keep in local state; merge with `gameState.onlineUsers` via `mergeFriends`. A lightweight `refresh()` is also called when a `user-joined` presence event arrives for an id not in the friends list (a request you sent was just accepted).
  - **Incoming requests section** (only when non-empty): `{from.display_name} @{from.handle}` + Accept / Decline buttons → `acceptRequest(id)` / `declineRequest(id)` → refresh.
  - **Add a friend:** text input (lowercased) + "Send request" button → `sendRequest(handle)`. Feedback inline: `{status:'friends'}` → "You're now friends with @handle" (mutual-intent auto-accept); `{status:'pending'}` → "Request sent"; 404 error → "No one has that handle"; 429 → "Daily request limit reached". Plain sentences, no toast dependency.
  - **Friends list:** per row — name, `@handle` (dim), `statusLabel(row)`, a Challenge button **only when `row.online` is set** (`connection.challengePlayer(row.id)`), and a "…" row menu (`.layer-surface` popover) with **Unfriend** and **Block**. Block confirms inline first with consequence copy (workspace rule: consequence-gated destructive UI): "Blocking removes this friend, cancels pending requests, and hides you from each other. You can unblock later in Settings → Account." + Confirm/Cancel → `block(userId)` → refresh.
  - **Outgoing pending** (only when non-empty, collapsed under a "Sent requests" heading): `@handle · Cancel`.
  - **Empty state:** "No friends yet. Ask a friend for their handle and add them above." (The favorites-star + "Top Players" leaderboard placeholder from the old LobbyScreen are removed — favorites made sense for a global room of strangers, not a friends list.)
  - The incoming-challenge Accept/Decline UI (GameLobby.tsx:143-167) stays, rendering `challengeFrom.name` now.

- [ ] **Step 3:** `npm test` baseline; visual check deferred to Task 11's dev run. Commit — `git commit -am "feat(games): friends list UI — add by handle, requests, challenge online friends, block/unfriend"`

---

### Task 9: Settings → Account — blocked users + Download my data

**Files:**
- Modify: `desktop/src/renderer/components/AccountSection.tsx`

- [ ] **Step 1: Blocked users section** in `SignedInBody` **view mode**, after the linked-provider list (AccountSection.tsx:229-233, before the `<hr>` at :235): on popup open (signed-in only), `window.claude.social.listBlocks()`; render nothing when empty; else a "Blocked users" list — `{display_name} @{handle}` + an Unblock button (`unblock(id)` → refetch). Unblock needs no confirm (it's the recovery action, not the destructive one).

- [ ] **Step 2: "Download my data"** button in view mode near Sign out: calls `window.claude.account.exportData()`; pending label "Preparing export…"; on `{path}` show "Saved to {path}"; on `{canceled}` do nothing. One-line explainer under the button: "Downloads a file containing everything YouCoded's server stores about your account."

- [ ] **Step 3:** `npm test` baseline; commit — `git commit -am "feat(account): blocked-users management + data export in Settings → Account"`

---

### Task 10: Privacy copy (AboutPopup) — DRAFT, requires Destin's approval

**Files:** Modify: `desktop/src/renderer/components/AboutPopup.tsx` (both platform branches)

The header comment in that file says copy is user-approved — **do not merge this task's wording without Destin explicitly approving it.** Present the draft to him during Task 11's runtime pass.

- [ ] **Step 1:** Add after the "Your account (optional)" paragraph, in BOTH branches:

```tsx
<p className="text-[11px] text-fg-dim leading-relaxed">
  <strong className="text-fg-2 font-semibold">Friends & presence (optional).</strong> If you use friends, we store your friend list, pending requests, and your block list (your block list is visible only to you). While you're signed in with the app open, your friends — and only your friends — can see that you're online and, after you disconnect, a single "last seen" time. We never keep a history of when you were online. You can appear offline any time (incognito in the games panel), download everything we store (Settings → Account → Download my data), and deleting your account removes all of it immediately.
</p>
```

- [ ] **Step 2:** Update the desktop games paragraph (AboutPopup.tsx:170-172) — the lobby no longer touches PartyKit:

```tsx
<p className="text-[11px] text-fg-dim leading-relaxed">
  Multiplayer game moves are relayed through a PartyKit server (Cloudflare) only while a game is open; challenges and the friends lobby go through the YouCoded server. No game traffic is retained server-side beyond the active room.
</p>
```

- [ ] **Step 3:** Commit with a `DRAFT — pending Destin approval` note in the commit body; get approval before the branch merges — `git commit -am "docs(privacy): Phase 2 friends/presence/last-seen wording (draft, needs approval)"`

---

### Task 11: Verification + ship

**Precondition: the worker plan is merged and CI-deployed.**

- [ ] **Step 1: Full local verification**

```bash
cd desktop && npm test          # baseline failures only
npm run build                   # desktop build green
cd .. && ./scripts/build-web-ui.sh && ./gradlew assembleDebug && ./gradlew test
```

- [ ] **Step 2: Runtime pass with Destin (dev instance, NEVER the live app)**

```bash
YOUCODED_PORT_OFFSET=150 YOUCODED_PROFILE=dev2 bash scripts/run-dev.sh
```

Checklist for Destin: sign in → Add a friend by handle (use a throwaway second account or coordinate step 3) → requests appear/accept → friends list shows plain-word statuses → challenge button gated to online friends → incognito disconnects presence → Settings → Account shows blocked users + Download my data works → AboutPopup copy review/approval.

- [ ] **Step 3: Two-user verification (the Phase 2 gate, spec §7 — inherently two-person, coordinate with Destin for a second human):** add-by-handle → accept → mutual presence on both machines → challenge → full Connect-4 game → block behavior (both sides vanish from each other, challenge refused) → last-seen sensible after one side quits. Run desktop↔desktop AND desktop↔Android if a device is available. This also empirically closes the long-standing "lobby emptiness" root-cause question (spec §0 correction 2).

- [ ] **Step 4: Merge + push** (Destin's go-ahead required): PR to youcoded master, merge, push. Shut down the dev instance (only this worktree's processes — check `netstat` before killing anything; 5273 belongs to another session).

- [ ] **Step 5: Docs + cleanup**

- Spec status line: Phase 2 merged + SHAs (`docs/superpowers/specs/2026-07-03-…-consolidated-design.md` in youcoded-dev).
- `docs/knowledge-debt.md`: mark items (4)–(8) resolved with commit refs; note the PartyKit **game rooms** remain (follow-up: migrate rooms into the Worker, then decommission the PartyKit project — spec's out-of-scope list).
- `youcoded/docs/cc-dependencies.md`: no CC coupling added (confirm — presence is all our own protocol).
- Worktree cleanup: `git worktree remove ../youcoded.wt/accounts-phase2 && git branch -D feat/accounts-phase2` (after confirming the merge landed: `git branch --contains <sha>`).

---

## Self-review checklist (run before handing off)

- Spec §6 coverage: friends-list-as-lobby ✓ (T8), add-by-handle ✓, requests section ✓, block via row menu + block list in Settings ✓ (T8/T9), plain words never glyphs ✓, platform-owned socket ✓ (T6), four-surface parity pinned ✓ (T5/T6), no desktop-only stubs for social ✓.
- Spec §3 client coverage: `usePartyLobby` → `usePresence` ✓ (T7), same reducer events ✓, identity = display name + handle keyed by account id ✓, incognito unchanged ✓, leader gating carried ✓, game rooms stay PartyKit with display-name tag ✓, lobby retired ✓.
- Spec §5: export UI ✓ (T9), privacy copy ships with the feature ✓ (T10, approval-gated).
- Knowledge-debt batch: #4 ✓ (T3), #5 ✓ (T2), #6 ✓ (T2/T2-step3), #7 ✓ (T4), #8 ✓ (T2). (#1–#3 are worker-plan scope.)
- Type consistency: `OnlineUser {id, name, handle, status}` used by reducer (T7), `mergeFriends` (T8), and `toOnlineUser` (T7) — field names match; server wire is snake_case (`display_name`), renderer camel (`name`), converted only at the hook/data boundary.
