---
status: active
date: 2026-09-04
feature: linux-buddy-helper
branch: feat/linux-buddy-kwin-helper (youcoded)
worktree: worktrees/linux-buddy-helper
spec: docs/active/design/2026-09-04-linux-buddy-helper/technical-design.md (revision 7)
contract: docs/active/design/2026-09-04-linux-buddy-helper/linux-buddy-helper.contract.json (13 rows, signed)
---

# Linux buddy helper — build breakdown

The design is revision 7 (48 review findings across four rounds, all accepted;
revision 7 adds the `needed` gate after probe Round 7).
This file exists for one reason: **to fix the module boundaries up front so the
build can run in parallel without the builders inventing incompatible
interfaces.** Everything else is in the design; a builder that contradicts the
design opens a question, it does not decide.

Descriptions, not pre-written code — the feature-flow default. The signatures
below are the exception, and they are the *only* thing pre-written, because they
are the contract between concurrently-running tasks.

## Module contracts — fixed, do not renegotiate

### `desktop/src/main/kde-dbus.ts` — new (task B1)

Extracted from `kwin-keep-above.ts`'s qdbus discovery (§7: *reuse, do not
re-implement*), plus the reads §0 and §4 need.

```ts
export type Rect = { x: number; y: number; width: number; height: number };

/** qdbus6, then qdbus. Cached after first success. null = neither exists. */
export function qdbusPath(): Promise<string | null>;

/**
 * One qdbus call. Treats an unparseable/error stdout as failure even at exit 0
 * — see §0.1: qdbus6 writes "I don't know how to display…" to STDOUT and exits
 * 0, which is why this wrapper exists and the raw one in kwin-keep-above.ts is
 * not enough.
 */
export function kdeCall(args: string[]): Promise<
  { ok: true; stdout: string } | { ok: false; reason: string }>;

export type KdeScreen = { name: string; enabled: boolean; bounds: Rect; scale: number };
export type KdeSession = { kwinMajor: number; wayland: boolean; screens: KdeScreen[] };

/** Parses org.kde.KWin.supportInformation(). null = KWin not reachable. */
export function readKdeSession(): Promise<KdeSession | null>;

/** Exported for tests — pure. */
export function parseSupportInformation(text: string): KdeSession | null;
```

### `desktop/src/main/buddy-work-area.ts` — new (task B1)

```ts
export type ResolvedArea = { rect: Rect; resolved: boolean };

export class WorkAreaResolver {
  /** Awaited once at startup before any buddy window exists (§0.6). */
  refresh(): Promise<void>;
  /** Never throws. Falls back to display.bounds with resolved:false. */
  areaFor(display: Electron.Display): ResolvedArea;
  readonly ready: boolean;
}

/** All pure, all exported for tests. */
export function parseAvailableScreenRect(stdout: string): Rect | null;
export function matchScreens(
  displays: ReadonlyArray<{ id: number; bounds: Rect }>,
  kde: ReadonlyArray<KdeScreen>,
): Map<number, KdeScreen[]>;   // >1 entry = ambiguous, intersect their rects
export function containedIn(inner: Rect, outer: Rect): boolean;
```

### `desktop/src/main/kwin-helper.ts` — new (task B2)

```ts
export type HelperStatus = {
  /**
   * The app cannot position its own windows here, so a helper is required at
   * all. linux && app.commandLine.getSwitchValue('ozone-platform') === 'wayland'.
   * NOT an env var and NOT KWin's Operation Mode — probe Round 7 measured both
   * identical under XWayland. false ⇒ no helper UI anywhere.
   */
  needed: boolean;
  supported: boolean;      // a helper can work here: KWin >= 6 AND Wayland (§4)
  installed: boolean;      // isScriptLoaded — never files-plus-config (§4)
  reason?: string;         // why unsupported; for the honest disabled state
};

export function helperPluginId(): string;                 // youcodedbuddyhelper-<token>
export function helperStatus(): Promise<HelperStatus>;
export function installHelper(): Promise<{ ok: boolean; error?: string }>;
export function removeHelper(): Promise<{ ok: boolean; error?: string }>;
/** Orphan sweep + the R11 version check. Runs at launch, before the buddy. */
export function syncHelperOnLaunch(): Promise<void>;
```

### `desktop/src/shared/buddy-caption.ts` — new (task B3)

```ts
export type BuddyRole = 'mascot' | 'chat' | 'bar';
export function buildCaption(role: BuddyRole, x: number, y: number): string;   // YC:<role>@<x>,<y>
export function parseCaption(caption: string): { role: BuddyRole; x: number; y: number } | null;
```

### IPC channels (task B4)

`buddy:helper-status` · `buddy:install-helper` · `buddy:remove-helper`.
Four files per §4: `shared/types.ts` (the constant map), `preload.ts` (map **and**
the `buddy:` API object), `ipc-handlers.ts`, `remote-shim.ts`. No Kotlin, no
`remote-server.ts` — §4 says why, and the new `ipc-channels.test.ts` block must
say so too.

**Ownership split, to avoid two tasks editing one interface:** task **B5** owns
the `BuddyApi` interface in `shared/types.ts` and the workbench mock. Task B4
owns the channel constant map, `preload.ts`, `ipc-handlers.ts` and
`remote-shim.ts`.

## Tasks

| # | Task | Depends on | Owns these files |
|---|---|---|---|
| B1 | DBus foundation + work-area resolver (§0) | — | `kde-dbus.ts`, `buddy-work-area.ts`, `kwin-keep-above.ts` (extraction only), `buddy-work-area.test.ts` |
| B2 | Bundled helper package + installer lifecycle (§1, §6) | B1 | `assets/kwin-helper/**`, `kwin-helper.ts`, `kwin-helper.test.ts`, packaging config |
| B3 | Caption channel in the window manager (§2, §3, §7) | B1 | `buddy-caption.ts`, `buddy-window-manager.ts`, `main.ts` (buddy window creation), 3 test files |
| B4 | IPC + main-side consent gate (§4, §5) | B2 | channel map, `preload.ts`, `ipc-handlers.ts`, `remote-shim.ts`, `ipc-channels.test.ts`, `buddy-consent-gate.test.ts` |
| B5 | Renderer: Remove helper, consent copy, R12 migration (§6) | — (channel names only) | `SettingsPanel.tsx`, `shared/types.ts` `BuddyApi`, `mock-shim.ts`, `mock-only.ts`, `App.tsx`, `buddy-linux-migration.test.ts` |
| B5b | Renderer: the three-state `needed`/`supported` rendering (§4) and R12's `needed` gate | B4 | same files as B5 |

**Waves:** B1 + B5 → B2 + B3 → B4 → B5b → integration. Every task gets a fresh
reviewer before its wave is considered done.

## Standing rules for every builder

- **The design is the spec.** A contradiction with it is a question back to the
  session, never a silent decision. The contract's 13 rows are the definition of
  done.
- **WHY comment at every non-trivial edit.** Destin does not read code; the
  comments are how he follows what changed.
- **No misleading error messages** (`docs/error-message-standards.md`). Specific
  and accurate, or general and non-committal with the two actions.
- **`bash scripts/verify.sh worktrees/linux-buddy-helper` must pass** before a
  task reports done. It will fail on another wave's missing module — say so
  rather than stubbing around it.
- **Never touch Destin's running app.** No dev instance, no Electron launch, no
  KDE configuration change, no DBus setter. This build is code and unit tests
  only; every runtime claim it needs is already measured in the probe FINDINGS.
- Do not commit. The session commits per wave.
