# Accounts Phase 1 — Client Account Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the marketplace sign-in to the YouCoded account in the app: rename the IPC surface `marketplace:auth:*` → `account:*`, add profile/handle/delete/logout plumbing on all platforms, ship a Settings → Account section and a post-sign-in handle prompt, and update the in-app privacy copy.

**Architecture:** Channel strings and the `window.claude` namespace rename to `account`; the React context keeps its `useMarketplaceAuth` name for now (Phase 2 renames it when the friends UI lands — renaming 10+ marketplace components now is churn without payoff). All new Worker endpoints ship in the companion plan `2026-07-07-accounts-phase1-worker.md`, which MUST be merged and deployed first. Spec: `docs/superpowers/specs/2026-07-03-youcoded-accounts-friendship-consolidated-design.md` §6.

**Tech Stack:** Electron (preload/ipcMain), React + context, remote-shim WebSocket IPC, Kotlin `SessionService` + OkHttp client, vitest.

**Working rules:**
- Repo: `youcoded`. Worktree: from `C:\Users\desti\youcoded-dev\youcoded` run `git fetch origin && git pull origin master && git worktree add ../youcoded.wt/accounts-client -b feat/accounts-client origin/master`, then `npm ci` in `<worktree>/desktop`. Paths below are relative to the worktree root.
- IPC parity is scope: every renamed/new type lands in `preload.ts`, `remote-shim.ts`, `marketplace-api-handlers.ts`, AND `SessionService.kt` in the same task, pinned by a new `ipc-channels.test.ts` describe. (The remote-server path is channel-string-agnostic — verified: `remote-server.ts` contains no `marketplace:auth` references — so no edit there.)
- Annotate non-trivial edits with WHY comments.
- Pre-existing failing tests on master: `tests/ipc-handlers.test.ts` (electron mock) and 3 in `tests/remote-config.test.ts` — not yours to fix; compare failures against a clean checkout if unsure.

**Channel map (single source of truth for this plan):**

| Old channel | New channel |
|---|---|
| `marketplace:auth:start` | `account:start` |
| `marketplace:auth:poll` | `account:poll` |
| `marketplace:auth:signed-in` | `account:signed-in` |
| `marketplace:auth:user` | `account:user` |
| `marketplace:auth:sign-out` | `account:sign-out` (now also revokes server-side) |
| — (new) | `account:update-profile` |
| — (new) | `account:set-handle` |
| — (new) | `account:delete` |

`marketplace:install` / `marketplace:rate` / `marketplace:rate:delete` / `marketplace:theme:like` / `marketplace:report` are marketplace *features*, not identity — they keep their names.

---

### Task 1: API client — extended MeResponse + account endpoints

**Files:**
- Modify: `desktop/src/renderer/state/marketplace-api-client.ts`
- Modify: `desktop/src/main/marketplace-auth-store.ts` (user shape)
- Test: `desktop/tests/marketplace-api-client.test.ts`

- [ ] **Step 1: Write failing tests**

Open `desktop/tests/marketplace-api-client.test.ts`, note its existing fetch-mock convention (module-level `vi.stubGlobal('fetch', ...)` or equivalent — reuse it exactly), and add:

```ts
describe("account endpoints", () => {
  it("updateProfile PATCHes /auth/profile with auth", async () => {
    mockFetchOnce(200, { display_name: "New Name" });
    const out = await client.updateProfile("New Name");
    expect(out).toEqual({ display_name: "New Name" });
    expectLastRequest("PATCH", "/auth/profile", { display_name: "New Name" }, /* auth */ true);
  });
  it("setHandle PUTs /auth/handle with auth", async () => {
    mockFetchOnce(200, { handle: "destin" });
    const out = await client.setHandle("Destin");
    expect(out).toEqual({ handle: "destin" });
    expectLastRequest("PUT", "/auth/handle", { handle: "Destin" }, true);
  });
  it("deleteAccount DELETEs /auth/account with auth", async () => {
    mockFetchOnce(204, null);
    await client.deleteAccount();
    expectLastRequest("DELETE", "/auth/account", undefined, true);
  });
  it("logout POSTs /auth/logout with auth", async () => {
    mockFetchOnce(204, null);
    await client.logout();
    expectLastRequest("POST", "/auth/logout", undefined, true);
  });
});
```
(`mockFetchOnce` / `expectLastRequest` stand for the file's existing mock helpers — match whatever names it actually uses; if it has none, follow its inline `vi.mocked(fetch)` assertions.)

- [ ] **Step 2: Run to verify failure**

Run: `cd desktop && npx vitest run tests/marketplace-api-client.test.ts` → FAIL (methods missing).

- [ ] **Step 3: Implement**

In `desktop/src/renderer/state/marketplace-api-client.ts`:

(a) Extend `AuthMeResponse` (Worker now returns the account-native fields):

```ts
export interface AuthMeResponse {
  id: string;
  login: string;              // GitHub login (player-tag continuity)
  display_name: string;
  avatar_url: string | null;
  handle: string | null;
}
```

(b) Add to the `MarketplaceApiClient` interface:

```ts
  updateProfile(displayName: string): Promise<{ display_name: string }>;
  setHandle(handle: string): Promise<{ handle: string }>;
  deleteAccount(): Promise<void>;
  logout(): Promise<void>;
```

(c) Add to the returned object (next to `authMe`):

```ts
    updateProfile: (display_name) =>
      request<{ display_name: string }>("/auth/profile", { method: "PATCH", body: JSON.stringify({ display_name }), auth: true }),
    setHandle: (handle) =>
      request<{ handle: string }>("/auth/handle", { method: "PUT", body: JSON.stringify({ handle }), auth: true }),
    deleteAccount: async () => {
      await request("/auth/account", { method: "DELETE", auth: true });
    },
    logout: async () => {
      await request("/auth/logout", { method: "POST", auth: true });
    },
```
(If `request()` throws on empty 204 bodies, follow the existing `postInstall` pattern for void endpoints.)

(d) In `desktop/src/main/marketplace-auth-store.ts`, extend the stored user:

```ts
export interface MarketplaceUser {
  id: string;
  login: string;
  avatar_url: string;
  display_name?: string;      // account-native fields (Worker ≥ Phase 1)
  handle?: string | null;
}
```

- [ ] **Step 4: Run tests** → `npx vitest run tests/marketplace-api-client.test.ts tests/marketplace-auth-store.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/state/marketplace-api-client.ts desktop/src/main/marketplace-auth-store.ts desktop/tests/marketplace-api-client.test.ts
git commit -m "feat(account): api-client account endpoints + extended user shape

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Desktop main — rename channels, add handlers, server-side sign-out

**Files:**
- Modify: `desktop/src/main/marketplace-api-handlers.ts`
- Test: `desktop/tests/` — the handler behavior is covered indirectly; the channel strings are pinned in Task 5's parity test.

- [ ] **Step 1: Rename the CHANNELS array and registrations**

In `desktop/src/main/marketplace-api-handlers.ts` replace the five auth channel strings per the channel map (in `CHANNELS` lines 35–46 AND each `ipcMain.handle("...")`), and add the three new channels to `CHANNELS`:

```ts
const CHANNELS = [
  "account:start",
  "account:poll",
  "account:signed-in",
  "account:user",
  "account:sign-out",
  "account:update-profile",
  "account:set-handle",
  "account:delete",
  "marketplace:install",
  "marketplace:rate",
  "marketplace:rate:delete",
  "marketplace:theme:like",
  "marketplace:report",
] as const;
```

- [ ] **Step 2: Upgrade sign-out and add the new handlers**

Replace the `marketplace:auth:sign-out` handler with:

```ts
  // Sign-out now revokes server-side too (spec §1) — best-effort: if the
  // Worker is unreachable, the local clear still wins (never trap the user
  // signed-in). The 90-day expiry + prune cron mop up the orphaned row.
  ipcMain.handle("account:sign-out", async () => {
    try { await client.logout(); } catch { /* offline sign-out is fine */ }
    store.signOut();
  });
```

Add after it:

```ts
  ipcMain.handle("account:update-profile", (_e, displayName: string): Promise<ApiResult<{ display_name: string }>> =>
    wrap(async () => {
      const out = await client.updateProfile(displayName);
      const user = store.getUser();
      if (user) store.setSession(store.getToken()!, { ...user, display_name: out.display_name });
      return out;
    })
  );

  ipcMain.handle("account:set-handle", (_e, handle: string): Promise<ApiResult<{ handle: string }>> =>
    wrap(async () => {
      const out = await client.setHandle(handle);
      const user = store.getUser();
      if (user) store.setSession(store.getToken()!, { ...user, handle: out.handle });
      return out;
    })
  );

  ipcMain.handle("account:delete", (): Promise<ApiResult<void>> =>
    wrap(async () => {
      await client.deleteAccount();
      // Server rows are gone (cascade); clear the local session too.
      store.signOut();
    })
  );
```

Also update `toStoredUser` to carry the new fields:

```ts
function toStoredUser(me: { id: string; login: string; avatar_url: string | null; display_name?: string; handle?: string | null }) {
  return { id: me.id, login: me.login, avatar_url: me.avatar_url ?? "", display_name: me.display_name, handle: me.handle ?? null };
}
```

- [ ] **Step 3: Typecheck** → `cd desktop && npx tsc -p tsconfig.json --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/main/marketplace-api-handlers.ts
git commit -m "feat(account): rename auth IPC to account:* + profile/handle/delete handlers, server-side sign-out

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: preload + remote-shim + types — `window.claude.account`

**Files:**
- Modify: `desktop/src/main/preload.ts:197-202` (constants) and `:426-441` (namespace)
- Modify: `desktop/src/renderer/remote-shim.ts:782-793`
- Modify: `desktop/src/renderer/hooks/useIpc.ts:112-129`
- Modify: `desktop/src/renderer/state/marketplace-auth-context.tsx` (5 call sites + new actions)

- [ ] **Step 1: preload.ts**

Replace the constants (197–202):

```ts
  // Account (formerly marketplace auth) — byte-identical to marketplace-api-handlers.ts CHANNELS
  ACCOUNT_START: 'account:start',
  ACCOUNT_POLL: 'account:poll',
  ACCOUNT_SIGNED_IN: 'account:signed-in',
  ACCOUNT_USER: 'account:user',
  ACCOUNT_SIGN_OUT: 'account:sign-out',
  ACCOUNT_UPDATE_PROFILE: 'account:update-profile',
  ACCOUNT_SET_HANDLE: 'account:set-handle',
  ACCOUNT_DELETE: 'account:delete',
```

Replace the namespace block (426–441) — note the key renames `marketplaceAuth` → `account`:

```ts
  // YouCoded account (device-code OAuth) — token stays in main process.
  // start/poll/update/set/delete wrap API calls and return ApiResult; signedIn/user/signOut are local.
  account: {
    start: (): Promise<ApiResult<AuthStartResponse>> => ipcRenderer.invoke(IPC.ACCOUNT_START),
    poll: (deviceCode: string): Promise<ApiResult<AuthPollResponse>> => ipcRenderer.invoke(IPC.ACCOUNT_POLL, deviceCode),
    signedIn: (): Promise<boolean> => ipcRenderer.invoke(IPC.ACCOUNT_SIGNED_IN),
    user: (): Promise<MarketplaceUser | null> => ipcRenderer.invoke(IPC.ACCOUNT_USER),
    signOut: (): Promise<void> => ipcRenderer.invoke(IPC.ACCOUNT_SIGN_OUT),
    updateProfile: (displayName: string): Promise<ApiResult<{ display_name: string }>> => ipcRenderer.invoke(IPC.ACCOUNT_UPDATE_PROFILE, displayName),
    setHandle: (handle: string): Promise<ApiResult<{ handle: string }>> => ipcRenderer.invoke(IPC.ACCOUNT_SET_HANDLE, handle),
    deleteAccount: (): Promise<ApiResult<void>> => ipcRenderer.invoke(IPC.ACCOUNT_DELETE),
  },
```

- [ ] **Step 2: remote-shim.ts** (782–793) — same shape, WebSocket transport:

```ts
    // YouCoded account — same shape as preload.ts. Android handlers in SessionService.kt.
    account: {
      start: (): Promise<ApiResult<unknown>> => invoke('account:start'),
      poll: (deviceCode: string): Promise<ApiResult<unknown>> => invoke('account:poll', { deviceCode }),
      signedIn: (): Promise<boolean> => invoke('account:signed-in'),
      user: (): Promise<MarketplaceUser | null> => invoke('account:user'),
      signOut: (): Promise<void> => invoke('account:sign-out'),
      updateProfile: (displayName: string): Promise<ApiResult<unknown>> => invoke('account:update-profile', { displayName }),
      setHandle: (handle: string): Promise<ApiResult<unknown>> => invoke('account:set-handle', { handle }),
      deleteAccount: (): Promise<ApiResult<unknown>> => invoke('account:delete'),
    },
```
(Note: shim wraps args in objects — `{ deviceCode }` etc. — matching the existing convention; Kotlin reads them with `optString`.)

- [ ] **Step 3: useIpc.ts** — replace the `marketplaceAuth` type block (112–129) with the `account` equivalent (same method names/types as preload, `poll` result union gains `user?: { id: string; login: string; avatar_url: string | null; display_name?: string; handle?: string | null }` on the complete branch).

- [ ] **Step 4: marketplace-auth-context.tsx** — switch the 5 call sites (`window.claude.marketplaceAuth.X` → `window.claude.account.X` at lines 78, 80, 99, 117, 150) and extend the context surface:

```ts
interface MarketplaceAuthCtx {
  signedIn: boolean;
  user: MarketplaceUser | null;
  signInPending: boolean;
  startSignIn(): Promise<void>;
  signOut(): Promise<void>;
  /** Update display name; refreshes user state on success. Throws on failure. */
  updateProfile(displayName: string): Promise<void>;
  /** Set/change handle; refreshes user state. Throws with the server's message on 400/409. */
  setHandle(handle: string): Promise<void>;
  /** Delete the account server-side and clear local state. */
  deleteAccount(): Promise<void>;
}
```

Implementations (inside the provider, alongside `signOut`):

```ts
  const updateProfile = useCallback(async (displayName: string) => {
    const res = await window.claude.account.updateProfile(displayName);
    if (!res.ok) throw new Error(res.message ?? "couldn't update name");
    await refresh();
  }, [refresh]);

  const setHandle = useCallback(async (handle: string) => {
    const res = await window.claude.account.setHandle(handle);
    if (!res.ok) throw new Error(res.message ?? "couldn't set handle");
    await refresh();
  }, [refresh]);

  const deleteAccount = useCallback(async () => {
    const res = await window.claude.account.deleteAccount();
    if (!res.ok) throw new Error(res.message ?? "couldn't delete account");
    setSignedIn(false);
    setUser(null);
  }, []);
```
Add the three to the memoized context value + deps. Keep the exported names `MarketplaceAuthProvider` / `useMarketplaceAuth` (add a WHY comment: "this is the account context; hook rename lands with the Phase 2 friends UI").

- [ ] **Step 5: Fix compile fallout + run renderer tests**

Run: `npx tsc -p tsconfig.json --noEmit` — chase every `marketplaceAuth` reference the compiler flags (tests mock `window.claude.marketplaceAuth` in `tests/marketplace-auth-context.test.tsx` and the marketplace component tests — update mocks to `window.claude.account`).
Run: `npx vitest run tests/marketplace-auth-context.test.tsx` → PASS.

- [ ] **Step 6: Commit**

```bash
git add desktop/src desktop/tests
git commit -m "feat(account): window.claude.account namespace + context profile/handle/delete actions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Android — SessionService rename + new cases + heal parity

**Files:**
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:2372-2457`
- Modify: `app/src/main/kotlin/com/youcoded/app/marketplace/MarketplaceApiClient.kt`
- Modify: `app/src/main/kotlin/com/youcoded/app/marketplace/MarketplaceAuthStore.kt` (user fields)

- [ ] **Step 1: Kotlin API client methods**

In `MarketplaceApiClient.kt`, add next to `authPoll` (reusing the private `request` helper):

```kotlin
    // Account endpoints (Worker Phase 1). All auth'd; small JSON bodies.
    suspend fun authMe(): ApiResult<JSONObject> =
        request("/auth/me", "GET", auth = true)

    suspend fun updateProfile(displayName: String): ApiResult<JSONObject> =
        request("/auth/profile", "PATCH", JSONObject().put("display_name", displayName), auth = true)

    suspend fun setHandle(handle: String): ApiResult<JSONObject> =
        request("/auth/handle", "PUT", JSONObject().put("handle", handle), auth = true)

    suspend fun deleteAccount(): ApiResult<JSONObject> =
        request("/auth/account", "DELETE", auth = true)

    suspend fun logout(): ApiResult<JSONObject> =
        request("/auth/logout", "POST", auth = true)
```
(Match the actual `request` signature — if it takes a body string or lacks PATCH support in OkHttp's convenience methods, use `Request.Builder().method("PATCH", body)` per the file's existing style. If 204 bodies parse as errors, mirror how `authPoll` treats 202.)

- [ ] **Step 2: Extend the Kotlin user model**

In `MarketplaceAuthStore.kt`, extend the data class (nullable, default null, so stored JSON from older versions still parses):

```kotlin
data class MarketplaceUser(
    val id: String,
    val login: String,
    val avatarUrl: String,
    val displayName: String? = null,
    val handle: String? = null,
)
```
Update its JSON (de)serialization in `getUser`/`setSession` to read/write `displayName`/`handle` keys.

- [ ] **Step 3: Rename the when-cases + add new ones**

In `SessionService.kt` (2372–2457): rename the five case strings per the channel map. Then:

(a) `account:user` gains the lazy heal (desktop parity — a token stored before profile storage heals itself):

```kotlin
            "account:user" -> {
                var user = marketplaceAuthStore.getUser()
                if (user == null && marketplaceAuthStore.getToken() != null) {
                    // Heal: pre-profile-storage token — fetch /auth/me once and persist.
                    val me = marketplaceApiClient.authMe()
                    if (me is ApiResult.Ok) {
                        user = MarketplaceUser(
                            id = me.value.optString("id"),
                            login = me.value.optString("login"),
                            avatarUrl = me.value.optString("avatar_url", ""),
                            // NOTE: optString(name, null) is a Java-null trap — use isNull() checks.
                            displayName = if (me.value.isNull("display_name")) null else me.value.optString("display_name"),
                            handle = if (me.value.isNull("handle")) null else me.value.optString("handle"),
                        )
                        marketplaceAuthStore.setSession(marketplaceAuthStore.getToken()!!, user)
                    }
                }
                val result: Any = if (user != null) JSONObject().apply {
                    put("id", user.id); put("login", user.login); put("avatar_url", user.avatarUrl)
                    put("display_name", user.displayName ?: JSONObject.NULL)
                    put("handle", user.handle ?: JSONObject.NULL)
                } else JSONObject.NULL
                msg.id?.let { bridgeServer.respond(ws, msg.type, it, result) }
            }
```

(b) `account:sign-out` revokes server-side first, best-effort:

```kotlin
            "account:sign-out" -> {
                // Best-effort server revocation; offline sign-out still clears locally.
                runCatching { marketplaceApiClient.logout() }
                marketplaceAuthStore.signOut()
                msg.id?.let { bridgeServer.respond(ws, msg.type, it, true) }
            }
```

(c) New cases (payload keys match remote-shim: `displayName`, `handle`):

```kotlin
            "account:update-profile" -> {
                val result = marketplaceApiClient.updateProfile(msg.payload.optString("displayName", ""))
                msg.id?.let { bridgeServer.respond(ws, msg.type, it, result.toJson { v -> v }) }
            }
            "account:set-handle" -> {
                val result = marketplaceApiClient.setHandle(msg.payload.optString("handle", ""))
                msg.id?.let { bridgeServer.respond(ws, msg.type, it, result.toJson { v -> v }) }
            }
            "account:delete" -> {
                val result = marketplaceApiClient.deleteAccount()
                if (result is ApiResult.Ok) marketplaceAuthStore.signOut()
                msg.id?.let { bridgeServer.respond(ws, msg.type, it, result.toJson { v -> v }) }
            }
```
(After update-profile/set-handle succeed, the renderer calls `account:user` again via `refresh()` — the heal path repopulates, so no store write is needed here beyond what poll already does. If you prefer store freshness, mirror the desktop handlers' store update.)

- [ ] **Step 4: Compile** → `cd <worktree> && ./gradlew :app:compileDebugKotlin` → BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/kotlin/com/youcoded/app
git commit -m "feat(account,android): account:* cases, /auth/me heal, profile/handle/delete, server-side sign-out

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Parity test

**Files:**
- Modify: `desktop/tests/ipc-channels.test.ts`

- [ ] **Step 1: Add the describe (copy the `dev:* channel parity` pattern at lines 96–125), asserting all 8 channels on FOUR surfaces** — preload.ts + remote-shim.ts + marketplace-api-handlers.ts (single-quoted) and SessionService.kt (double-quoted):

```ts
describe('account:* channel parity', () => {
  const NEW_TYPES = [
    'account:start', 'account:poll', 'account:signed-in', 'account:user',
    'account:sign-out', 'account:update-profile', 'account:set-handle', 'account:delete',
  ];
  const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

  it('all account:* types are declared in preload.ts', () => {
    const src = read('src', 'main', 'preload.ts');
    for (const t of NEW_TYPES) expect(src).toContain(`'${t}'`);
  });
  it('all account:* types are referenced in remote-shim.ts', () => {
    const src = read('src', 'renderer', 'remote-shim.ts');
    for (const t of NEW_TYPES) expect(src).toContain(`'${t}'`);
  });
  it('all account:* types are handled in marketplace-api-handlers.ts', () => {
    const src = read('src', 'main', 'marketplace-api-handlers.ts');
    for (const t of NEW_TYPES) expect(src).toContain(`"${t}"`);
  });
  it('all account:* types are handled by SessionService.kt (Android)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'src', 'main', 'kotlin', 'com', 'youcoded', 'app', 'runtime', 'SessionService.kt'), 'utf8');
    for (const t of NEW_TYPES) expect(src).toContain(`"${t}"`);
  });
  it('no marketplace:auth:* strings remain anywhere', () => {
    for (const p of [['src','main','preload.ts'],['src','renderer','remote-shim.ts'],['src','main','marketplace-api-handlers.ts']] as const) {
      expect(read(...p)).not.toContain('marketplace:auth:');
    }
  });
});
```
(Match the file's actual `fs`/`path` import style and the Kotlin-path convention used by the existing `dev:*` block — copy, don't invent.)

- [ ] **Step 2: Run** → `npx vitest run tests/ipc-channels.test.ts` → PASS.

- [ ] **Step 3: Commit**

```bash
git add desktop/tests/ipc-channels.test.ts
git commit -m "test(account): 4-surface parity for account:* channels

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Settings → Account section

**Files:**
- Create: `desktop/src/renderer/components/AccountSection.tsx`
- Modify: `desktop/src/renderer/components/SettingsPanel.tsx` (mount in `DesktopSettings` ~line 2294 stack AND `AndroidSettings` ~line 1991 stack)
- Test: `desktop/tests/account-section.test.tsx`

- [ ] **Step 1: Write failing render tests**

Create `desktop/tests/account-section.test.tsx` following the render-test conventions of `tests/marketplace-auth-context.test.tsx` (same providers/mocks):

```tsx
// Three states: signed out (sign-in row), signed in (profile fields), delete confirm gate.
it("signed out: shows a Sign in with GitHub row", ...);
it("signed in: shows avatar, display name, handle, connected-provider row, sign out", ...);
it("delete requires typing the confirmation word before the button enables", ...);
```
Write real assertions against the strings specified in Step 2 (e.g. `getByText('Sign in with GitHub')`, `getByLabelText('Display name')`, delete button disabled until the input value is `delete`).

- [ ] **Step 2: Implement `AccountSection.tsx`**

One self-contained section component following the SettingsPanel row-button + popup pattern (`<Scrim layer={2}>` + `<OverlayPanel layer={2}>`, `useMarketplaceAuth()` for state). Contents:

- **Row button** (in the settings stack): avatar (or generic icon when signed out), label "Account", description "Signed in as @{user.handle ?? user.login}" / "Sign in to like themes, rate plugins, and play games".
- **Popup, signed out:** explainer ("One sign-in for the marketplace and games — GitHub only sees your public profile.") + button wired to `startSignIn()` ("Signing in…" while `signInPending`).
- **Popup, signed in:**
  - Avatar + non-editable "Connected: GitHub (@{user.login})" row (the linked-provider list, single provider in Phase 1).
  - **Display name** — text input seeded from `user.display_name ?? user.login`, Save button calls `updateProfile`; inline error text on failure (surface `err.message`).
  - **Handle** — text input seeded from `user.handle ?? ""`, prefixed with a literal `@`, Save calls `setHandle`; show the server's message on 400/409 (taken / reserved / cooldown all arrive as messages). Plain words for status, never glyphs.
  - **Sign out** button → `signOut()`.
  - **Danger zone:** "Delete account" — expands to a typed-confirm input ("type **delete** to confirm"), button disabled until it matches, then `deleteAccount()`; on success close the popup. Copy: "Deletes your account and everything attached to it — likes, reviews, install history. This cannot be undone."
- All buttons/inputs use existing token classes (`bg-inset`, `text-fg-muted`, etc.) — copy the row-button classes verbatim from the About row (SettingsPanel.tsx:2451–2469).

- [ ] **Step 3: Mount it** — add `<AccountSection />` to the `DesktopSettings` stack (after `<PerformanceButton />`, before `<SyncSection …/>`) and to the `AndroidSettings` stack in the equivalent slot. Import at the top of SettingsPanel.tsx.

- [ ] **Step 4: Run** → `npx vitest run tests/account-section.test.tsx` → PASS. Also `npx tsc -p tsconfig.json --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/components/AccountSection.tsx desktop/src/renderer/components/SettingsPanel.tsx desktop/tests/account-section.test.tsx
git commit -m "feat(account): Settings → Account section (profile, handle, sign out, typed-confirm delete)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Post-sign-in handle prompt

**Files:**
- Create: `desktop/src/renderer/components/HandlePrompt.tsx`
- Modify: `desktop/src/renderer/App.tsx` (mount inside `MarketplaceAuthProvider`)
- Test: `desktop/tests/handle-prompt.test.tsx`

- [ ] **Step 1: Failing tests**

```tsx
it("shows when signed in with no handle and not previously dismissed", ...);
it("does not show when the user has a handle", ...);
it("skip sets the dismissal flag and closes", ...);           // localStorage 'youcoded-handle-prompt-dismissed' = '1'
it("saving a handle closes without setting the dismissal flag", ...);
```

- [ ] **Step 2: Implement `HandlePrompt.tsx`**

```tsx
// Post-sign-in handle prompt (spec §2/§6): you need a handle to be
// discoverable, so ask once right after sign-in. Skippable; "skip" persists
// so we never nag. Also catches pre-existing signed-in users without handles.
```
Behavior: `useMarketplaceAuth()`; local `open` state driven by an effect — `signedIn && user && !user.handle && localStorage.getItem('youcoded-handle-prompt-dismissed') !== '1'` → open. L2 `<Scrim>`+`<OverlayPanel>`: title "Pick a handle", copy "Friends will find you by your handle — like a username. You can change it later in Settings → Account.", `@`-prefixed input, Save → `setHandle(value)` (inline error on throw), "Skip for now" → set the localStorage flag + close. Closing via ESC = same as skip (register with `useEscClose` if that's the app convention — check how other L2 popups register).

- [ ] **Step 3: Mount** in `App.tsx` inside `MarketplaceAuthProvider` (next to other always-mounted overlays; render nothing when closed).

- [ ] **Step 4: Run tests** → PASS. **Step 5: Commit**

```bash
git add desktop/src/renderer/components/HandlePrompt.tsx desktop/src/renderer/App.tsx desktop/tests/handle-prompt.test.tsx
git commit -m "feat(account): skippable post-sign-in handle prompt

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Privacy copy (AboutPopup)

**Files:**
- Modify: `desktop/src/renderer/components/AboutPopup.tsx` (locate the existing Privacy section — it already documents the analytics device-hash promise)

- [ ] **Step 1: Add an "Account" paragraph to the Privacy section**, matching the surrounding JSX/classes, with exactly this copy:

> **Your account (optional).** Signing in with GitHub creates a YouCoded account. We store: your GitHub username, display name, avatar, and handle; your theme likes, plugin reviews, and install records. We never see your GitHub password or private repos — sign-in uses read-only access to your public profile. Delete your account any time in Settings → Account; deletion removes everything above immediately. Analytics stays separate: your account is never linked to the anonymous device statistics described below.

- [ ] **Step 2: Typecheck + eyeball in dev** (`npx tsc -p tsconfig.json --noEmit`; visual check happens in Task 9's runtime pass). **Step 3: Commit**

```bash
git add desktop/src/renderer/components/AboutPopup.tsx
git commit -m "docs(privacy): in-app copy for the optional YouCoded account

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Verify + merge

- [ ] **Step 1: Full desktop suite + build**

Run: `cd desktop && npx vitest run && npm run build`
Expected: only the two pre-existing failing files (`ipc-handlers.test.ts`, `remote-config.test.ts` × 3) — verify identical failures on a clean master checkout if anything else is red. Build: SUCCESS.

- [ ] **Step 2: Android compile** → `./gradlew :app:compileDebugKotlin` → BUILD SUCCESSFUL.

- [ ] **Step 3: Runtime pass (dev app, from the worktree)**

```bash
cd <worktree>/desktop && YOUCODED_PORT_OFFSET=150 YOUCODED_PROFILE=dev2 npm run dev
```
(Unset the `CLAUDECODE*` env vars per scripts/run-dev.sh if launching from a Claude session.) With Destin driving:
1. Fresh sign-in (all pre-rebuild sessions are dead — expected!) → handle prompt appears → set a handle.
2. Settings → Account: avatar/name/handle correct; rename display name; rename handle (old one enters cooldown — verify re-taking it immediately 409s).
3. Games panel still gates/connects exactly as Phase 0 (login unchanged).
4. Sign out → sign-in prompt states return everywhere (marketplace chip, games gate, Account section).
5. Do NOT delete the real account; deletion was covered by Worker tests + can be demoed later with a throwaway GitHub account.

- [ ] **Step 4: Merge + push + clean up**

```bash
cd C:\Users\desti\youcoded-dev\youcoded
git fetch origin && git pull origin master
git merge --no-ff feat/accounts-client -m "Merge feat/accounts-client: account:* IPC, Settings Account section, handle prompt (accounts Phase 1 client)"
git push origin master
git worktree remove --force ../youcoded.wt/accounts-client && git branch -D feat/accounts-client
```

- [ ] **Step 5: Update the spec status line** in `youcoded-dev/docs/superpowers/specs/2026-07-03-youcoded-accounts-friendship-consolidated-design.md` ("Phase 1 merged: worker <sha>, client <sha>") and commit to youcoded-dev.

---

## Post-plan notes

- **Hard dependency:** the Worker plan (`2026-07-07-accounts-phase1-worker.md`) must be merged AND deployed before Task 9's runtime pass — Tasks 1–8 can be built/tested against mocks beforehand, but sign-in against the live Worker requires the new schema.
- **Deliberately deferred:** renaming `useMarketplaceAuth`/`MarketplaceAuthProvider`/`marketplace-auth-*` file names (Phase 2, with the friends UI); Android Settings→Account visual QA on a real device (the section renders via the shared React UI; `project:*`-style stubbing is NOT needed since all account IPC is real on Android).
