---
status: draft
created: 2026-07-16
subsystem: sync-spaces
related:
  - youcoded/desktop/src/main/device-identity.ts
  - youcoded/desktop/src/main/sync-spaces/device-registry.ts
---

# Machine-Scoped Device Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the device registry from registering a new "device" for every Electron `userData` profile, so one physical machine shows exactly one row in "Your devices" — and give the user a way to remove rows that outlive their device.

**Architecture:** The registry and the lease system currently share one id, but mean different things by "device". Leases need a per-**install** id (the dev instance and built app share `~/.claude` and must coordinate cross-process — this is a pinned invariant). The registry needs a per-**machine** id. Split them: `getDeviceIdentity(userData)` keeps minting the per-install lease id exactly as it does today, and a new read-only `getMachineIdentity(builtAppUserData)` resolves the **built app's** `device-id.json` as the canonical machine identity. Dev profiles read that file and never mint their own. Because the machine id is defined as "what is durably on disk", an install that failed to persist its id resolves to `null` and simply does not register — which structurally closes the "ephemeral id → a new orphan row every launch" hole.

**Tech Stack:** TypeScript, Electron main process, Vitest, React (renderer), Kotlin (Android stub only).

---

## Background: the bug this fixes

`device-identity.ts` writes its UUID into Electron's `userData` dir. `run-dev.sh` sets `YOUCODED_PROFILE`, which points `userData` at `%APPDATA%/youcoded-<profile>/`. Each profile therefore mints a fresh UUID, and `upsertSelf` registers each one as a distinct device named `os.hostname()`. Verified on the owner's machine 2026-07-16 — three rows, all "GalaxyBook":

| Registry record | Profile dir |
|---|---|
| `8814edbf-0916-429d-b55c-704f4183ecee` | `%APPDATA%/youcoded` (built app) |
| `683147cc-4923-425d-afc5-dc23078338b9` | `%APPDATA%/youcoded-dev` |
| `de7773e0-77b2-4454-bb3f-7ef7a818c90d` | `%APPDATA%/youcoded-dev2` |

Thirteen `youcoded*` profile dirs exist; only three have a `device-id.json` because the registry is new. Every future profile name adds a permanent row.

## Rejected alternative (do not "simplify" to this)

Storing the machine id at `~/.claude/youcoded-device-id.json` was the first proposal and is **rejected**. `~/.claude` is the directory most likely to be replicated across machines — dotfile repos, and YouCoded's own SyncPanel copy already promises Personal carries "your conversations, memory, skills" (memory and skills *are* `~/.claude/CLAUDE.md` and `~/.claude/skills/`). If a future phase syncs those, two physical machines would share one machine id and the registry would silently merge them into a single row that fights over `platform` via last-writer-wins. That is a worse and much harder-to-diagnose bug than the one being fixed. `%APPDATA%` is never dotfile-synced.

## Out of scope

- **`lastSeen` is a launch stamp, not a heartbeat.** `upsertSelf` is called once, at `main.ts:1573`; nothing bumps it while the app runs. "last seen 4 hours ago" means "last launched 4 hours ago", and `SyncPanel.tsx:1496` masks this for `self` by hard-coding "active now". Real heartbeating trades honesty against sync churn (every bump is a file write that triggers a push). Captured as a ROADMAP item in Task 7 — do not bundle it here.
- **Two real machines with the same hostname** both render as one name and are indistinguishable. Pre-existing; the rename affordance is the current answer.
- **Android** has no `syncspaces:*` handlers (Phase 3). This plan only keeps its not-implemented stub list in parity.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `youcoded/desktop/src/main/device-identity.ts` | Owns BOTH identities: per-install (leases) and per-machine (registry) | Modify — add `getMachineIdentity()` |
| `youcoded/desktop/tests/device-identity.test.ts` | Guards both identities, incl. the regression pin | Modify |
| `youcoded/desktop/src/main/sync-spaces/device-registry.ts` | Registry record CRUD + merge lattice | Modify — add `removeDevice()` |
| `youcoded/desktop/tests/sync-spaces-device-registry.test.ts` | Guards registry CRUD | Modify |
| `youcoded/desktop/src/main/main.ts` | Resolves both identities, calls `upsertSelf` | Modify |
| `youcoded/desktop/src/main/ipc-handlers.ts` | Electron IPC surface + self-marking | Modify |
| `youcoded/desktop/src/main/remote-server.ts` | Remote WS surface + self-marking (parity) | Modify |
| `youcoded/desktop/src/shared/types.ts`, `preload.ts`, `remote-shim.ts`, `useIpc.ts` | Channel constant + typed bridge | Modify |
| `youcoded/app/.../runtime/SessionService.kt` | Android not-implemented stub list | Modify |
| `youcoded/desktop/tests/ipc-channels.test.ts` | Four-surface parity contract | Modify |
| `youcoded/desktop/src/renderer/components/SyncPanel.tsx` | Devices tab UI | Modify |

---

### Task 1: Add `getMachineIdentity()` to device-identity.ts

**Files:**
- Modify: `youcoded/desktop/src/main/device-identity.ts`
- Test: `youcoded/desktop/tests/device-identity.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `youcoded/desktop/tests/device-identity.test.ts`. Note the import on line 5 must become:

```typescript
import { getDeviceIdentity, getMachineIdentity } from '../src/main/device-identity';
```

Then append these tests at the end of the file:

```typescript
describe('getMachineIdentity', () => {
  // Stands in for the BUILT app's userData dir. main.ts passes the REAL one,
  // captured from app.getPath('userData') BEFORE any dev-profile override — so
  // nothing here or there hardcodes the app's folder name (see Task 2 Step 3).
  const builtApp = () => path.join(tmp, 'youcoded');

  it('returns the built app userData id when it exists', () => {
    const builtId = getDeviceIdentity(builtApp()).id; // built app minted its id
    expect(getMachineIdentity(builtApp())).toEqual({ id: builtId });
  });

  it('returns null when the built app has never run (no file to adopt)', () => {
    expect(getMachineIdentity(builtApp())).toBeNull();
  });

  it('returns null on a corrupt built-app id file — never throws, never mints', () => {
    fs.mkdirSync(builtApp(), { recursive: true });
    fs.writeFileSync(path.join(builtApp(), 'device-id.json'), '{not valid json');
    expect(getMachineIdentity(builtApp())).toBeNull();
  });

  it('returns null for a valid-JSON file with an empty id', () => {
    fs.mkdirSync(builtApp(), { recursive: true });
    fs.writeFileSync(path.join(builtApp(), 'device-id.json'), JSON.stringify({ id: '' }));
    expect(getMachineIdentity(builtApp())).toBeNull();
  });

  it('NEVER writes — a dev profile must not mint the built app identity', () => {
    expect(getMachineIdentity(builtApp())).toBeNull();
    // The absence of the dir is the assertion: a read-only resolver leaves no trace.
    expect(fs.existsSync(builtApp())).toBe(false);
  });

  // THE REGRESSION PIN. This is the bug: three userData profiles on one machine
  // produced three "GalaxyBook" rows because the registry keyed on the per-install
  // id. Leases still need those ids distinct; the registry must not.
  it('collapses built app + dev profiles to ONE machine id while leases stay distinct', () => {
    const builtInstall = getDeviceIdentity(builtApp()).id;
    const devInstall = getDeviceIdentity(path.join(tmp, 'youcoded-dev')).id;
    const dev2Install = getDeviceIdentity(path.join(tmp, 'youcoded-dev2')).id;

    // Lease identity stays per-INSTALL — this invariant is load-bearing and must NOT regress.
    expect(new Set([builtInstall, devInstall, dev2Install]).size).toBe(3);

    // Registry identity is per-MACHINE: all three profiles ask the SAME built-app
    // dir, so all three resolve to one row.
    expect(getMachineIdentity(builtApp())).toEqual({ id: builtInstall });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd youcoded/desktop && npx vitest run tests/device-identity.test.ts`
Expected: FAIL — `getMachineIdentity is not a function`.

- [ ] **Step 3: Implement**

Replace the whole of `youcoded/desktop/src/main/device-identity.ts` with:

```typescript
// TWO identities live here. They are NOT the same thing and must not be merged.
//
// 1. getDeviceIdentity(userData) — per-INSTALL, for LEASE coordination.
//    userData-scoped ON PURPOSE: the dev instance and built app share ~/.claude but
//    have separate userData, so they get distinct ids and leases coordinate them
//    cross-process (spec §3.4). Do not "fix" this to be machine-scoped.
//
// 2. getMachineIdentity(builtAppUserData) — per-MACHINE, for the DEVICE REGISTRY.
//    "Your devices" means physical machines, so every profile on one machine must
//    resolve to ONE id. The built app's userData id IS the machine identity; dev
//    profiles READ it and never mint their own. Before this split, the registry
//    reused the per-install id and every YOUCODED_PROFILE added a permanent
//    duplicate row (three "GalaxyBook" rows, 2026-07-16).
//
// Why not ~/.claude/youcoded-device-id.json: that dir is the one most likely to be
// replicated across machines (dotfile repos; the app's own "memory + skills sync"
// roadmap). A shared machine id would silently merge two real machines into one
// row. %APPDATA% is never dotfile-synced.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Reads a device-id.json without ever creating one. Returns null for
// absent/corrupt/empty — callers treat null as "no durable identity here".
function readIdFile(dir: string): { id: string } | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'device-id.json'), 'utf8'));
    if (typeof parsed?.id === 'string' && parsed.id) return { id: parsed.id };
  } catch { /* absent or corrupt */ }
  return null;
}

export function getDeviceIdentity(userDataDir: string): { id: string } {
  const existing = readIdFile(userDataDir);
  // Reuse the existing id so this install keeps ONE stable identity across launches.
  if (existing) return existing;
  const fresh = { id: randomUUID() };
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(path.join(userDataDir, 'device-id.json'), JSON.stringify(fresh));
  } catch { /* read-only disk: ephemeral id this launch — see getMachineIdentity */ }
  return fresh;
}

/** The per-MACHINE identity for the device registry: the BUILT app's install id.
 *
 *  Pass the BUILT app's userData dir — main.ts captures it from
 *  app.getPath('userData') BEFORE applying any dev-profile override. Taking it as
 *  a parameter (rather than deriving `<appData>/youcoded` here) keeps the app's
 *  folder name out of this file: Electron derives it from the app name, and
 *  hardcoding the current value would silently resolve to null on every platform
 *  if a productName were ever added to package.json.
 *
 *  READ-ONLY on purpose — a dev profile must never mint the built app's identity,
 *  or whichever instance launched first would win and orphan the real row.
 *
 *  null means "no durable machine identity" and the caller MUST skip registration.
 *  Two cases both land here, and both should register nothing rather than a ghost:
 *    - the built app has never run on this machine (a dev-only checkout), and
 *    - getDeviceIdentity's write failed, leaving an ephemeral in-memory id. That
 *      second case is why durability is structural here: registering an ephemeral
 *      id would leave a NEW orphan row on EVERY launch. */
export function getMachineIdentity(builtAppUserDataDir: string): { id: string } | null {
  return readIdFile(builtAppUserDataDir);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd youcoded/desktop && npx vitest run tests/device-identity.test.ts`
Expected: PASS — all 9 tests (4 pre-existing + 5 new).

Note: `getDeviceIdentity` now `mkdirSync`s its own dir before writing. The pre-existing tests pass a `mkdtemp` dir that already exists, so they are unaffected; the new `getMachineIdentity` tests rely on this to create `<tmp>/youcoded/`.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/device-identity.ts desktop/tests/device-identity.test.ts
git commit -m "fix(sync): split per-machine device identity from the per-install lease id

The device registry reused the lease's per-INSTALL id, so every Electron
userData profile (each YOUCODED_PROFILE from run-dev.sh) registered itself
as a separate device named os.hostname() — three 'GalaxyBook' rows on one
laptop. Leases still need per-install ids; the registry does not.

getMachineIdentity() resolves the built app's userData id read-only, so
every profile on a machine maps to one row. null (no built app / a failed
write) means skip registration rather than mint an orphan per launch."
```

---

### Task 2: Register the machine identity, not the install identity

**Files:**
- Modify: `youcoded/desktop/src/main/main.ts:25` (import), `:102` (state), `:193-197` (capture built-app userData), `:681` (resolve), `:1568-1574` (upsertSelf)

- [ ] **Step 1: Update the import**

`main.ts:25` currently reads:

```typescript
import { getDeviceIdentity } from './device-identity';
```

Change it to:

```typescript
import { getDeviceIdentity, getMachineIdentity } from './device-identity';
```

- [ ] **Step 2: Add the machineIdentity module state**

`main.ts:102` currently reads:

```typescript
let deviceIdentity: { id: string } | null = null;
```

Add directly below it:

```typescript
// The per-MACHINE id backing the device registry — distinct from deviceIdentity
// (per-INSTALL, for leases). null = no durable machine identity: register nothing.
let machineIdentity: { id: string } | null = null;
```

- [ ] **Step 3: Capture the BUILT app's userData dir before the dev override**

This is the only place that can know the built app's userData path without hardcoding the app's folder name. Electron derives that name from `package.json` (`name: youcoded`, no `productName`), and `app.getPath('userData')` returns the default until `setPath` overrides it — so reading it *before* the `if (DEV_PROFILE)` block yields the built app's real dir on every platform. Hardcoding `youcoded` instead would silently resolve to `null` — no device rows at all, everywhere — the day anyone adds a `productName` to `package.json` to match `electron-builder.yml`.

`main.ts:193-197` currently reads:

```typescript
const DEV_PROFILE = process.env.YOUCODED_PROFILE;
if (DEV_PROFILE) {
  app.setPath('userData', path.join(app.getPath('appData'), `youcoded-${DEV_PROFILE}`));
  app.setName(DEV_PROFILE === 'dev' ? 'YouCoded Dev' : `YouCoded Dev (${DEV_PROFILE})`);
}
```

Replace with:

```typescript
const DEV_PROFILE = process.env.YOUCODED_PROFILE;
// Captured BEFORE the override below, so this is the BUILT app's userData dir even
// in a dev instance — Electron derives it from the app name, so nothing here has to
// hardcode 'youcoded' (a productName added to package.json would change it).
// It holds the machine identity backing the device registry: a dev profile READS
// this dir rather than minting its own id. See device-identity.ts.
const BUILT_APP_USER_DATA = app.getPath('userData');
if (DEV_PROFILE) {
  app.setPath('userData', path.join(app.getPath('appData'), `youcoded-${DEV_PROFILE}`));
  app.setName(DEV_PROFILE === 'dev' ? 'YouCoded Dev' : `YouCoded Dev (${DEV_PROFILE})`);
}
```

- [ ] **Step 4: Resolve the machine identity alongside the device identity**

`main.ts:681` currently reads:

```typescript
  deviceIdentity = getDeviceIdentity(app.getPath('userData'));
```

Add directly below it:

```typescript
  // Per-MACHINE id for the device registry, from the BUILT app's userData — so a
  // dev profile heartbeats the machine's real row instead of minting its own.
  // In the built app this resolves the id getDeviceIdentity just wrote; in a dev
  // profile it reads across to the built app's dir.
  machineIdentity = getMachineIdentity(BUILT_APP_USER_DATA);
```

- [ ] **Step 5: Register the machine id, and skip when there isn't one**

`main.ts:1568-1574` currently reads:

```typescript
  // Device registry (spec §10a, Plan 2b): stamp this device's own record
  // (friendly name + lastSeen) on launch so Task 12's "Your devices" list is
  // never empty. No-op when sync is off (no personal root yet).
  try {
    const pr = getManagedRoots()?.personalRoot;
    if (pr && deviceIdentity) void upsertSelf(pr, { id: deviceIdentity.id, platform: process.platform }).catch(() => { /* best-effort */ });
  } catch { /* sync not configured */ }
```

Replace it with:

```typescript
  // Device registry (spec §10a, Plan 2b): stamp this MACHINE's record (friendly
  // name + lastSeen) on launch so the "Your devices" list is never empty. No-op
  // when sync is off (no personal root yet).
  //
  // Keys on machineIdentity, NOT deviceIdentity: deviceIdentity is per-INSTALL, so
  // registering it gave every YOUCODED_PROFILE its own permanent "GalaxyBook" row.
  // A null machineIdentity means no durable id (no built app on this machine, or
  // the id write failed) — register NOTHING. Registering an ephemeral id would
  // leave a fresh orphan row on every launch, which is the same bug, worse.
  try {
    const pr = getManagedRoots()?.personalRoot;
    if (pr && machineIdentity) void upsertSelf(pr, { id: machineIdentity.id, platform: process.platform }).catch(() => { /* best-effort */ });
    else if (pr) log('INFO', 'Main', 'Device registry: no durable machine identity — skipping self-registration');
  } catch { /* sync not configured */ }
```

- [ ] **Step 6: Verify it compiles**

Run: `cd youcoded/desktop && npx tsc --noEmit`
Expected: no errors. (`machineIdentity` is read again in Task 3; an unused-variable warning here is fine and resolves there.)

- [ ] **Step 7: Commit**

```bash
git add desktop/src/main/main.ts
git commit -m "fix(sync): register the machine identity, skip when it isn't durable"
```

---

### Task 3: Thread machineId through BOTH IPC surfaces for self-marking

Self-marking currently compares a registry row against the **lease** id, in two places. After Task 2 the registry stores machine ids, so both comparisons would silently never match — no row would say "(this device)". Both surfaces must move together; `ipc-channels.test.ts` exists precisely because this pair drifts.

**Files:**
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts:124-131` (wiring type), `:2456-2463` (handler)
- Modify: `youcoded/desktop/src/main/remote-server.ts:85-89` (field), `:112-121` (setter), `:1587-1593` (case)
- Modify: `youcoded/desktop/src/main/main.ts:705-706` (call site)

- [ ] **Step 1: Widen the ipc-handlers wiring type**

`ipc-handlers.ts:124-131` currently reads:

```typescript
    setHolderTakeover: (fn: (sessionId: string, from?: { deviceId: string; device: string }) => void) => void;
    requester: RequesterTakeoverType;
    // deviceId + hubLeaseRequest + materializeOne + syncSpacesSyncNow are all
    // built in main.ts (the whenReady scope) and injected here.
    // Plan 2b Task 11: this machine's device id, so the list-devices handler can
    // mark self:true without re-reading device-identity.
    deviceId: string;
```

Replace the `deviceId: string;` line and its comment with:

```typescript
    // deviceId + hubLeaseRequest + materializeOne + syncSpacesSyncNow are all
    // built in main.ts (the whenReady scope) and injected here.
    //
    // deviceId  — per-INSTALL. Leases ONLY. Distinguishes the dev instance from
    //             the built app on one machine; never use it for the registry.
    // machineId — per-MACHINE. Device registry ONLY (self-marking). '' when this
    //             machine has no durable identity, which matches no row — correct,
    //             since nothing was registered either.
    deviceId: string;
    machineId: string;
```

- [ ] **Step 2: Mark self by machineId in the Electron handler**

`ipc-handlers.ts:2458-2463` currently reads:

```typescript
  ipcMain.handle(IPC.SYNC_SPACES_LIST_DEVICES, () => {
    const pr = getManagedRoots()?.personalRoot;
    if (!pr) return [];
    const selfId = leaseWiring?.deviceId ?? '';
    return readDevices(pr).map((d) => ({ ...d, self: d.id === selfId }));
  });
```

Replace with:

```typescript
  ipcMain.handle(IPC.SYNC_SPACES_LIST_DEVICES, () => {
    const pr = getManagedRoots()?.personalRoot;
    if (!pr) return [];
    // machineId, not deviceId — rows are keyed per-MACHINE, so the per-install
    // lease id would never match and no row would render "(this device)".
    const selfId = leaseWiring?.machineId ?? '';
    return readDevices(pr).map((d) => ({ ...d, self: !!selfId && d.id === selfId }));
  });
```

- [ ] **Step 3: Widen the remote-server field + setter**

`remote-server.ts:85-89` currently reads:

```typescript
  private leaseWiring: {
    client: import('./conversations/lease-client').LeaseClient;
    requester: import('./conversations/takeover').RequesterTakeoverType;
    deviceId: string;
  } | null = null;
```

Replace with:

```typescript
  private leaseWiring: {
    client: import('./conversations/lease-client').LeaseClient;
    requester: import('./conversations/takeover').RequesterTakeoverType;
    deviceId: string;  // per-INSTALL — leases only
    machineId: string; // per-MACHINE — device-registry self-marking only
  } | null = null;
```

`remote-server.ts:112-121` currently reads:

```typescript
  /** Injected by ipc-handlers after main.ts builds the lease client/requester,
   *  so remote WS clients reach the SAME lease state the Electron IPC handlers
   *  use (mirrors setNativeRuntime). deviceId marks self in list-devices. */
  setLeaseWiring(w: {
    client: import('./conversations/lease-client').LeaseClient;
    requester: import('./conversations/takeover').RequesterTakeoverType;
    deviceId: string;
  }): void {
    this.leaseWiring = w;
  }
```

Replace with:

```typescript
  /** Injected by ipc-handlers after main.ts builds the lease client/requester,
   *  so remote WS clients reach the SAME lease state the Electron IPC handlers
   *  use (mirrors setNativeRuntime). machineId marks self in list-devices —
   *  deviceId is the per-INSTALL lease id and must NOT be used for that. */
  setLeaseWiring(w: {
    client: import('./conversations/lease-client').LeaseClient;
    requester: import('./conversations/takeover').RequesterTakeoverType;
    deviceId: string;
    machineId: string;
  }): void {
    this.leaseWiring = w;
  }
```

- [ ] **Step 4: Mark self by machineId in the remote WS case**

`remote-server.ts:1587-1593` currently reads:

```typescript
      case 'syncspaces:list-devices': {
        const pr = getManagedRoots()?.personalRoot;
        const selfId = this.leaseWiring?.deviceId ?? '';
        this.respond(client.ws, type, id,
          pr ? readDevices(pr).map((d) => ({ ...d, self: d.id === selfId })) : []);
        break;
      }
```

Replace with:

```typescript
      case 'syncspaces:list-devices': {
        const pr = getManagedRoots()?.personalRoot;
        // machineId — must match the Electron handler exactly (ipc-channels.test.ts
        // pins the channel pair; this is the semantic half it can't see).
        const selfId = this.leaseWiring?.machineId ?? '';
        this.respond(client.ws, type, id,
          pr ? readDevices(pr).map((d) => ({ ...d, self: !!selfId && d.id === selfId })) : []);
        break;
      }
```

- [ ] **Step 5: Pass machineId from the main.ts call site**

`main.ts:705-706` currently reads:

```typescript
  cleanupIpcHandlers = registerIpcHandlers(ipcMain, sessionManager, mainWindow, skillProvider, commandProvider, hookRelay, remoteConfig, remoteServer, windowRegistry,
    { client: leaseClient, setHolderTakeover: (fn) => { holderTakeoverRef.fn = fn; }, requester, deviceId: deviceIdentity.id });
```

Replace with:

```typescript
  cleanupIpcHandlers = registerIpcHandlers(ipcMain, sessionManager, mainWindow, skillProvider, commandProvider, hookRelay, remoteConfig, remoteServer, windowRegistry,
    { client: leaseClient, setHolderTakeover: (fn) => { holderTakeoverRef.fn = fn; }, requester,
      deviceId: deviceIdentity.id, machineId: machineIdentity?.id ?? '' });
```

- [ ] **Step 6: Forward machineId to the remote server**

`ipc-handlers.ts:1945` currently reads:

```typescript
    remoteServer.setLeaseWiring({ client: leaseWiring.client, requester: leaseWiring.requester, deviceId: leaseWiring.deviceId });
```

Replace with:

```typescript
    remoteServer.setLeaseWiring({ client: leaseWiring.client, requester: leaseWiring.requester, deviceId: leaseWiring.deviceId, machineId: leaseWiring.machineId });
```

- [ ] **Step 7: Verify it compiles and the parity suite still passes**

Run: `cd youcoded/desktop && npx tsc --noEmit && npx vitest run tests/ipc-channels.test.ts`
Expected: no type errors; ipc-channels parity PASS.

- [ ] **Step 8: Commit**

```bash
git add desktop/src/main/ipc-handlers.ts desktop/src/main/remote-server.ts desktop/src/main/main.ts
git commit -m "fix(sync): mark device-list self by machineId on both IPC surfaces"
```

---

### Task 4: Add `removeDevice()` to the registry

A device row currently outlives its device forever — there is no removal path. This is what makes an orphan survivable, and it is needed regardless of Task 1 (machines get reimaged and replaced).

Removal is a plain delete, not a tombstone: "remove" means "forget this device", and a device that is still alive re-registering itself on next launch is the *correct* outcome. Conflict copies must be deleted alongside the canonical file — `readDevices` groups by `extractConflictBase` and only checks `base === '<id>.json'`, so a surviving copy resurrects the row in the UI even with the canonical file gone.

**Files:**
- Modify: `youcoded/desktop/src/main/sync-spaces/device-registry.ts`
- Test: `youcoded/desktop/tests/sync-spaces-device-registry.test.ts`

- [ ] **Step 1: Write the failing tests**

Update the import block at `tests/sync-spaces-device-registry.test.ts:9-12` to include `removeDevice`:

```typescript
import {
  readDevices, upsertSelf, renameDevice, removeDevice,
  mergeDeviceEntries, foldDeviceEntries, DEVICE_REGISTRY_SCHEMA, type DeviceRecord,
} from '../src/main/sync-spaces/device-registry';
```

Append these tests to the end of the file:

```typescript
describe('device registry store — removal', () => {
  it('removeDevice deletes the canonical record and drops it from readDevices', async () => {
    await upsertSelf(personal, { id: 'dev-1', name: 'Old Laptop', platform: 'win32' });
    await upsertSelf(personal, { id: 'dev-2', name: 'Desktop', platform: 'linux' });
    await removeDevice(personal, 'dev-1');
    expect(fs.existsSync(path.join(dir(), 'dev-1.json'))).toBe(false);
    expect(readDevices(personal).map(d => d.id)).toEqual(['dev-2']);
  });

  it('removeDevice also deletes conflict copies — a surviving copy resurrects the row', async () => {
    // readDevices folds `<id> (from X).json` into the group keyed by the record's
    // own id, and that grouping does NOT require the canonical file to exist. So
    // deleting only the canonical would leave the device still listed.
    write('dev-1.json', E({ id: 'dev-1' }));
    write('dev-1 (from Phone).json', E({ id: 'dev-1', name: 'Renamed On Phone' }));
    await removeDevice(personal, 'dev-1');
    expect(fs.readdirSync(dir())).toEqual([]);
    expect(readDevices(personal)).toEqual([]);
  });

  it('removeDevice leaves OTHER devices and their conflict copies untouched', async () => {
    write('dev-1.json', E({ id: 'dev-1' }));
    write('dev-2.json', E({ id: 'dev-2', name: 'Keep Me' }));
    write('dev-2 (from Phone).json', E({ id: 'dev-2', name: 'Keep Me Too' }));
    await removeDevice(personal, 'dev-1');
    expect(readDevices(personal).map(d => d.id)).toEqual(['dev-2']);
    expect(fs.existsSync(path.join(dir(), 'dev-2 (from Phone).json'))).toBe(true);
  });

  it('removeDevice on an unknown id is a silent no-op (never throws)', async () => {
    await upsertSelf(personal, { id: 'dev-1', name: 'Laptop', platform: 'win32' });
    await expect(removeDevice(personal, 'nope')).resolves.toBeUndefined();
    expect(readDevices(personal)).toHaveLength(1);
  });

  it('removeDevice with a missing Devices dir is a silent no-op (never throws)', async () => {
    await expect(removeDevice(personal, 'dev-1')).resolves.toBeUndefined();
  });

  it('removeDevice refuses an empty id rather than globbing the whole dir', async () => {
    await upsertSelf(personal, { id: 'dev-1', name: 'Laptop', platform: 'win32' });
    await expect(removeDevice(personal, '')).rejects.toThrow();
    expect(readDevices(personal)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd youcoded/desktop && npx vitest run tests/sync-spaces-device-registry.test.ts`
Expected: FAIL — `removeDevice is not a function`.

- [ ] **Step 3: Implement**

Append to the end of `youcoded/desktop/src/main/sync-spaces/device-registry.ts`:

```typescript
/** Remove a device row entirely: the canonical `<id>.json` AND every conflict copy
 *  that folds into it.
 *
 *  Deleting the conflict copies is load-bearing, not tidiness: readDevices groups
 *  by extractConflictBase and only checks that the base matches the record's own
 *  id — it does NOT require the canonical file to exist. Leaving a copy behind
 *  keeps the device listed after a "remove".
 *
 *  Deliberately a plain delete, not a tombstone (unlike the Project Registry's
 *  stopped-dominates state). "Remove" means "forget this device"; a device that
 *  is still alive re-registering on its next launch is CORRECT. Only a device
 *  that never comes back — the case this exists for — stays gone.
 *
 *  Fail-soft: an unknown id or a missing dir is a silent no-op. */
export async function removeDevice(personalRoot: string, id: string): Promise<void> {
  // Guard the empty id: `${''}.json` would match nothing here, but an empty id is
  // always a caller bug — surface it rather than silently no-op.
  if (!id || typeof id !== 'string') throw new Error(`device-registry: invalid id '${id}'`);
  const dir = registryDir(personalRoot);
  let names: string[];
  try { names = fs.readdirSync(dir); } catch { return; } // no dir — nothing to remove
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    const base = isConflictCopyName(n) ? extractConflictBase(n) : n;
    if (base !== `${id}.json`) continue;
    try { fs.rmSync(path.join(dir, n), { force: true }); } catch { /* vanished / locked — skip */ }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd youcoded/desktop && npx vitest run tests/sync-spaces-device-registry.test.ts`
Expected: PASS — all pre-existing tests plus the 6 new ones.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/sync-spaces/device-registry.ts desktop/tests/sync-spaces-device-registry.test.ts
git commit -m "feat(sync): removeDevice() — drop a device row and its conflict copies"
```

---

### Task 5: Expose `syncspaces:remove-device` across all four surfaces

**Files:**
- Modify: `youcoded/desktop/src/shared/types.ts:845-846`
- Modify: `youcoded/desktop/src/main/preload.ts:191-192, :829-832`
- Modify: `youcoded/desktop/src/renderer/remote-shim.ts:1117-1118`
- Modify: `youcoded/desktop/src/main/ipc-handlers.ts:2464-2469`
- Modify: `youcoded/desktop/src/main/remote-server.ts:1594-1599`
- Modify: `youcoded/desktop/src/renderer/hooks/useIpc.ts:339-340`
- Modify: `youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:3610-3611`
- Test: `youcoded/desktop/tests/ipc-channels.test.ts:555-556, :583-584`

- [ ] **Step 1: Write the failing parity test**

In `tests/ipc-channels.test.ts`, add to the `channels` array after line 556:

```typescript
    ['syncspaces:remove-device', 'IPC.SYNC_SPACES_REMOVE_DEVICE'],
```

And add to the `leaseDeviceRequestChannels` array after line 584:

```typescript
    'syncspaces:remove-device',
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd youcoded/desktop && npx vitest run tests/ipc-channels.test.ts`
Expected: FAIL — `syncspaces:remove-device` not found in preload / remote-shim / ipc-handlers / remote-server / SessionService.kt.

- [ ] **Step 3: Add the channel constant**

`types.ts:845-846` currently reads:

```typescript
  SYNC_SPACES_LIST_DEVICES: 'syncspaces:list-devices',
  SYNC_SPACES_RENAME_DEVICE: 'syncspaces:rename-device',
```

Add below:

```typescript
  SYNC_SPACES_REMOVE_DEVICE: 'syncspaces:remove-device',
```

- [ ] **Step 4: Add it to preload**

`preload.ts:191-192` — add below the two existing constants (channel names are inlined in preload by design; it cannot import):

```typescript
  SYNC_SPACES_REMOVE_DEVICE: 'syncspaces:remove-device',
```

`preload.ts:830-832` currently reads:

```typescript
    listDevices: () => ipcRenderer.invoke(IPC.SYNC_SPACES_LIST_DEVICES),
    renameDevice: (id: string, name: string) =>
      ipcRenderer.invoke(IPC.SYNC_SPACES_RENAME_DEVICE, { id, name }),
```

Add below:

```typescript
    // removeDevice forgets a row whose device is gone. A LIVE device re-registers
    // itself on its next launch — that's intended, not a bug.
    removeDevice: (id: string) =>
      ipcRenderer.invoke(IPC.SYNC_SPACES_REMOVE_DEVICE, { id }),
```

- [ ] **Step 5: Add it to the remote shim**

`remote-shim.ts:1117-1118` currently reads:

```typescript
      listDevices: () => invoke('syncspaces:list-devices'),
      renameDevice: (id: string, name: string) => invoke('syncspaces:rename-device', { id, name }),
```

Add below:

```typescript
      removeDevice: (id: string) => invoke('syncspaces:remove-device', { id }),
```

- [ ] **Step 6: Add the typed declaration**

`useIpc.ts:339-340` currently reads:

```typescript
        listDevices?: () => Promise<Array<{ schemaVersion: number; id: string; name: string; platform: string; lastSeen: number; updatedAt: number; self: boolean }>>;
        renameDevice?: (id: string, name: string) => Promise<{ ok: boolean }>;
```

Add below:

```typescript
        removeDevice?: (id: string) => Promise<{ ok: boolean }>;
```

- [ ] **Step 7: Add the Electron handler**

`ipc-handlers.ts:55` — update the import:

```typescript
import { readDevices, renameDevice, removeDevice } from './sync-spaces/device-registry';
```

After the `SYNC_SPACES_RENAME_DEVICE` handler (ends line 2469), add:

```typescript
  ipcMain.handle(IPC.SYNC_SPACES_REMOVE_DEVICE, async (_e, p: { id: string }) => {
    const pr = getManagedRoots()?.personalRoot;
    if (!pr) return { ok: false };
    const id = String(p?.id ?? '');
    if (!id) return { ok: false };
    // Refuse to remove THIS machine: upsertSelf re-creates the row on the next
    // launch, so it would read as a no-op that "didn't work". The UI hides the
    // affordance for self; this is the enforcement half (remote clients too).
    if (id === (leaseWiring?.machineId ?? '')) return { ok: false, error: 'cannot remove this device' };
    try { await removeDevice(pr, id); return { ok: true }; }
    catch { return { ok: false }; }
  });
```

- [ ] **Step 8: Add the remote WS case**

`remote-server.ts:28` — update the import:

```typescript
import { readDevices, renameDevice, removeDevice } from './sync-spaces/device-registry';
```

After the `syncspaces:rename-device` case (ends line 1599), add:

```typescript
      case 'syncspaces:remove-device': {
        const pr = getManagedRoots()?.personalRoot;
        if (!pr) { this.respond(client.ws, type, id, { ok: false }); break; }
        const target = String(payload?.id ?? '');
        if (!target) { this.respond(client.ws, type, id, { ok: false }); break; }
        // Same self-guard as the Electron handler — a remote client must not be
        // able to remove the host machine's own row (it re-registers anyway).
        if (target === (this.leaseWiring?.machineId ?? '')) {
          this.respond(client.ws, type, id, { ok: false, error: 'cannot remove this device' });
          break;
        }
        try { await removeDevice(pr, target); this.respond(client.ws, type, id, { ok: true }); }
        catch { this.respond(client.ws, type, id, { ok: false }); }
        break;
      }
```

- [ ] **Step 9: Add the Android stub**

`SessionService.kt:3611` currently reads:

```kotlin
            "syncspaces:rename-device",
```

Add below:

```kotlin
            "syncspaces:remove-device",
```

- [ ] **Step 10: Run the parity test to verify it passes**

Run: `cd youcoded/desktop && npx tsc --noEmit && npx vitest run tests/ipc-channels.test.ts`
Expected: PASS — `syncspaces:remove-device` present in all four desktop surfaces plus the Kotlin stub.

- [ ] **Step 11: Commit**

```bash
git add desktop/src/shared/types.ts desktop/src/main/preload.ts desktop/src/renderer/remote-shim.ts \
        desktop/src/renderer/hooks/useIpc.ts desktop/src/main/ipc-handlers.ts desktop/src/main/remote-server.ts \
        desktop/tests/ipc-channels.test.ts app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "feat(sync): syncspaces:remove-device across all four surfaces + Android stub"
```

---

### Task 6: Add the Remove affordance to the Devices tab

Plain words, no glyphs (the Devices list is spec'd as plain text and the owner dislikes status glyphs). Two-step inline confirm with plain-language consequence copy — not a typed confirm, because this is recoverable: a live device re-registers.

**Files:**
- Modify: `youcoded/desktop/src/renderer/components/SyncPanel.tsx:664-677` (parent handler), `:997` (call site), `:1472-1531` (DevicesTab)

- [ ] **Step 1: Add the parent remove handler**

After `handleRenameDevice` (ends `SyncPanel.tsx:674`), add:

```typescript
  const handleRemoveDevice = useCallback(async (id: string) => {
    const fn = (window as any).claude?.syncSpaces?.removeDevice;
    if (typeof fn !== 'function') return;
    try { await fn(id); } catch {}
    await loadDevices(); // re-fetch so a refused remove (self) doesn't lie about the list
  }, [loadDevices]);
```

- [ ] **Step 2: Pass it to DevicesTab**

`SyncPanel.tsx:997` currently reads:

```tsx
                        {countTab === 'dev' && <DevicesTab devices={devices} onRename={handleRenameDevice} />}
```

Replace with:

```tsx
                        {countTab === 'dev' && <DevicesTab devices={devices} onRename={handleRenameDevice} onRemove={handleRemoveDevice} />}
```

- [ ] **Step 3: Render the affordance**

`SyncPanel.tsx:1472-1474` currently reads:

```tsx
function DevicesTab({ devices, onRename }: { devices: DeviceRow[] | null; onRename: (id: string, name: string) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
```

Replace with:

```tsx
function DevicesTab({ devices, onRename, onRemove }: { devices: DeviceRow[] | null; onRename: (id: string, name: string) => void; onRemove: (id: string) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  // Two-step confirm: the id awaiting confirmation, if any. Removal is recoverable
  // (a live device re-registers), so this is a plain inline confirm rather than the
  // typed-confirm gate reserved for irreversible edits.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
```

Then replace the `<li>` body at `SyncPanel.tsx:1499-1527` — currently:

```tsx
          <li key={d.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-1.5">
```

...through the closing `</li>`. The full replacement:

```tsx
          <li key={d.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-1.5">
              {editingId === d.id ? (
                <input
                  value={draft}
                  autoFocus
                  onChange={e => setDraft(e.target.value)}
                  onBlur={() => commitRename(d.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename(d.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="bg-inset text-fg text-xs rounded px-2 py-1 border border-edge-dim focus:border-accent outline-none min-w-0"
                />
              ) : (
                // Click the name to edit — it's just a nickname, so no confirm gate.
                <button
                  type="button"
                  onClick={() => { setEditingId(d.id); setDraft(d.name); }}
                  className="text-xs text-fg-2 hover:text-fg truncate text-left"
                  title="Click to rename this device"
                >
                  {d.name}
                </button>
              )}
              {d.self && <span className="text-[10px] text-fg-muted shrink-0">(this device)</span>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-fg-muted">{right}</span>
              {/* No Remove for self: upsertSelf re-creates this row on the next
                  launch, so offering it would read as a button that does nothing. */}
              {!d.self && (confirmingId === d.id ? (
                <span className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-fg-muted">Remove?</span>
                  <button
                    type="button"
                    onClick={() => { setConfirmingId(null); onRemove(d.id); }}
                    className="text-danger hover:underline"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingId(null)}
                    className="text-fg-muted hover:text-fg"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingId(d.id)}
                  className="text-[10px] text-fg-muted hover:text-fg"
                  title="Forget this device. If it syncs again, it comes back."
                >
                  Remove
                </button>
              ))}
            </div>
          </li>
```

- [ ] **Step 4: Verify the token exists**

Run: `cd youcoded/desktop && grep -rn '\--danger\|text-danger' src/renderer/styles/globals.css tailwind.config.js | head -5`
Expected: a `danger` color token is defined. **If it is not, use `text-[#e5534b]` is WRONG** — status colors are theme-independent and hardcoded per `desktop/CLAUDE.md`, so use the same class the codebase already uses for destructive text. Find it with: `grep -rn 'text-red-\|text-danger' src/renderer/components/*.tsx | head -5` and match the established choice.

- [ ] **Step 5: Verify it compiles**

Run: `cd youcoded/desktop && npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/renderer/components/SyncPanel.tsx
git commit -m "feat(sync): Remove affordance for stale device rows (plain-words confirm)"
```

---

### Task 7: Documentation, rule anchors, and the deferred heartbeat item

**Files:**
- Modify: `youcoded-dev/.claude/rules/sync-spaces.md`
- Modify: `youcoded-dev/.claude/rules/conversations.md`
- Modify: `youcoded-dev/ROADMAP.md`

- [ ] **Step 1: Pin the invariant in the sync-spaces rule**

In `youcoded-dev/.claude/rules/sync-spaces.md`, under the "Project UX + discovery" section, add a new bullet group:

```markdown
## Device registry (`device-identity.ts`, `sync-spaces/device-registry.ts`) — guard: `device-identity.test.ts`, `sync-spaces-device-registry.test.ts`
- **TWO identities, never merged: `getDeviceIdentity(userData)` is per-INSTALL (leases only); `getMachineIdentity(builtAppUserData)` is per-MACHINE (registry only).** The registry once reused the per-install id and every `YOUCODED_PROFILE` became a permanent duplicate row (three "GalaxyBook" rows, 2026-07-16). `getMachineIdentity` READS the built app's `device-id.json` and never mints — a dev profile minting it would orphan the real row.
- **`null` machine identity ⇒ register NOTHING** (no built app, or the id write failed). An ephemeral id would leave a fresh orphan row on EVERY launch.
- **`main.ts` captures `BUILT_APP_USER_DATA = app.getPath('userData')` BEFORE the dev-profile `setPath` override** — never hardcode the `youcoded` dirname. Electron derives it from the app name; adding a `productName` to `package.json` (to match `electron-builder.yml`) would break a hardcoded path into `null` — i.e. NO device rows, silently, on every platform.
- **Machine id lives in `%APPDATA%`, NOT `~/.claude`** — `~/.claude` is dotfile-synced and slated to carry memory+skills; a shared machine id would merge two real machines into one row.
- **`removeDevice` must delete conflict copies too** — `readDevices` folds `<id> (from X).json` without needing the canonical, so a surviving copy resurrects a removed row. Plain delete, NOT a tombstone: a live device re-registering is correct.
- **Self-marking uses `machineId` on BOTH surfaces** (`ipc-handlers.ts` + `remote-server.ts`); `deviceId` there is the lease id and matches no row.
```

Update the frontmatter `last_verified:` to `2026-07-16` and add to the `verify:` block:

```yaml
  - path: youcoded/desktop/src/main/device-identity.ts
    contains: "getMachineIdentity"
  - path: youcoded/desktop/src/main/sync-spaces/device-registry.ts
    contains: "removeDevice"
  - test: youcoded/desktop/tests/device-identity.test.ts
```

- [ ] **Step 2: Correct the conversations rule**

`youcoded-dev/.claude/rules/conversations.md` says leases key on "the per-INSTALL `deviceId` (`device-identity.ts`, a UUID in Electron `userData`)". That stays true, but the file now holds two identities. Replace that bullet with:

```markdown
- **Leases key on the per-INSTALL `deviceId`** (`device-identity.ts` → `getDeviceIdentity(userData)`, a UUID in Electron `userData`), NEVER the client `device` label (dev + built app share `~/.claude`, split `userData`). Do NOT swap this for `getMachineIdentity()` — that id is per-MACHINE and is the DEVICE REGISTRY's, so using it here would make the dev instance and built app indistinguishable to leases. See `.claude/rules/sync-spaces.md` → Device registry.
```

- [ ] **Step 3: Capture the deferred heartbeat item**

Add to `youcoded-dev/ROADMAP.md` under the sync section:

```markdown
- [ ] `bug` `#sync` **Device `lastSeen` is a launch stamp, not a heartbeat** (2026-07-16) — `upsertSelf` runs once at `main.ts:1573`; nothing bumps `lastSeen` while the app runs, so "last seen 4 hours ago" actually means "last launched 4 hours ago". `SyncPanel.tsx:1496` masks it for self by hard-coding "active now". A real heartbeat costs a file write + push per bump; decide the interval (or a >1h staleness gate) before implementing.
```

- [ ] **Step 4: Run the mechanical audit**

Run: `cd youcoded-dev && node scripts/audit-anchors.mjs`
Expected: PASS — every new `verify:` anchor resolves.

- [ ] **Step 5: Commit (workspace repo — NOT the youcoded sub-repo)**

```bash
cd youcoded-dev
git add .claude/rules/sync-spaces.md .claude/rules/conversations.md ROADMAP.md
git commit -m "docs(sync): pin the two-identity device rule; roadmap the lastSeen heartbeat"
```

---

### Task 8: Full verification, then clean up the orphan rows

Cleanup must come **last**. Deleting the rows before the fix is running just means the next `run-dev.sh` recreates them.

- [ ] **Step 1: Run the full desktop suite**

Run: `cd youcoded/desktop && npm test`
Expected: PASS. Pay attention to `sync-spaces-two-device.test.ts` and `lease-client.test.ts` — leases must be untouched by this change.

- [ ] **Step 2: Verify in the dev app (never the built app)**

Run: `bash scripts/run-dev.sh` from the workspace root, open Settings → Sync → Devices.

Expected: the dev instance shows **one** "GalaxyBook" row marked "(this device)" — the same row the built app owns (`8814edbf-0916-429d-b55c-704f4183ecee`) — and does NOT create a `%APPDATA%/youcoded-dev/`-keyed row. Confirm no new file appeared:

```bash
ls ~/YouCoded/Personal/Devices/
```

Expected: still the four known ids, no fifth.

- [ ] **Step 3: Open the PR**

```bash
cd youcoded
gh pr create --title "fix(sync): one device row per machine, not per userData profile" \
  --body "$(cat <<'EOF'
The device registry keyed on the per-INSTALL lease id, so every Electron
userData profile registered itself as a separate device named os.hostname().
One laptop, three "GalaxyBook" rows.

Splits the two identities: leases keep `getDeviceIdentity(userData)`
(unchanged — pinned invariant), the registry gets `getMachineIdentity(appData)`,
which reads the built app's id read-only so every profile maps to one row.
A null machine identity registers nothing, closing the "ephemeral id → an
orphan row every launch" hole.

Also adds `removeDevice` + a Remove affordance, since rows currently outlive
their devices forever with no way out.

Out of scope, roadmapped: `lastSeen` is a launch stamp, not a heartbeat.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Merge AND push, then clean up the worktree**

```bash
git branch --contains <sha>   # must list master before removing anything
git worktree remove <path>
git branch -D <branch>
```

- [ ] **Step 5: Remove the two orphan rows — by dogfooding the new button**

Once the merged fix is running, open Settings → Sync → Devices and use **Remove** on the two dev-profile rows:

- `683147cc-4923-425d-afc5-dc23078338b9` (`%APPDATA%/youcoded-dev`)
- `de7773e0-77b2-4454-bb3f-7ef7a818c90d` (`%APPDATA%/youcoded-dev2`)

Keep `8814edbf-...` (the machine's real row) and `07393a0e-...` (`destinsZ13`, the Linux machine).

Verify the deletion propagated:

```bash
ls ~/YouCoded/Personal/Devices/     # expect exactly 2 files
```

Expected: `07393a0e-....json` and `8814edbf-....json` only. The deletion pushes on the next sync; `destinsZ13` picks it up on pull with no conflict, since it only ever writes its own row.

- [ ] **Step 6: Archive this plan and flip the roadmap item**

Per the workspace lifecycle rule — merge means merge AND push AND archive AND flip:

```bash
cd youcoded-dev
git mv docs/active/plans/2026-07-16-device-identity-machine-scoped.md docs/archive/plans/
# set `status: shipped` in the frontmatter
git commit -m "docs: archive the device-identity plan — shipped"
```

---

## Self-Review

**Spec coverage.** Every point from the agreed shape has a task: canonical id from the built app's userData with dev read-only (Tasks 1–2); skip registration when the id isn't durable (Task 1 structurally + Task 2 Step 5); thread the id through both IPC surfaces (Task 3); row removal (Tasks 4–6); orphans deleted last (Task 8 Step 5). The rejected `~/.claude` option is documented so it isn't re-proposed.

**Type consistency.** `getMachineIdentity(builtAppUserDataDir: string): { id: string } | null` is used identically in Task 1 (definition + tests, which pass a built-app dir directly), Task 2 (`machineIdentity = getMachineIdentity(BUILT_APP_USER_DATA)`, read as `machineIdentity?.id ?? ''`), and Task 3 (`machineId: string` on both wiring types). `removeDevice(personalRoot: string, id: string): Promise<void>` matches its Task 5 callers (`await removeDevice(pr, id)`), and the `{ ok, error? }` return shape is consistent across the Electron handler, the WS case, and the `useIpc.ts` declaration. No module hardcodes the app's userData dirname: `BUILT_APP_USER_DATA` is captured once in Task 2 Step 3 and threaded from there.

**Revision note (2026-07-16).** An earlier draft exported a `BUILT_APP_USER_DATA_DIRNAME = 'youcoded'` constant and derived `<appData>/youcoded` inside `getMachineIdentity`. That was correct only by coincidence — `package.json` has no `productName`, so Electron falls back to `name: youcoded`, while `electron-builder.yml` separately declares `productName: YouCoded`. Anyone "aligning" those two would have silently produced zero device rows on every platform. Replaced with the capture-before-override approach above.

**Known soft spot.** Task 6 Step 4 does not hardcode a destructive-text class because the repo's convention wasn't verified while writing this plan; the step instructs the implementer to match the established one rather than invent a token.
