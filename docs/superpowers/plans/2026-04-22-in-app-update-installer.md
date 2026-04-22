# In-App Update Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser-open behavior of `UpdatePanel.tsx`'s "Update Now" button with a one-click in-app download-and-launch flow — the app downloads the platform-specific installer to its own cache, shows progress, and spawns the OS installer before quitting.

**Architecture:** New main-process module `desktop/src/main/update-installer.ts` owns download/cancel/launch and emits throttled progress. Five new IPC channels (`update:download`, `update:cancel`, `update:launch`, `update:progress`, `update:get-cached-download`) exposed via `window.claude.update.*`. Renderer `UpdatePanel.tsx` gains a local state machine that morphs the "Update Now" button through `idle → downloading → ready → launching | error`. Android gets parity stubs that return `{ success: false, error: 'not-supported' }`.

**Tech Stack:** TypeScript, Electron (main + renderer), React, Vitest, Kotlin (Android stub only).

**Spec:** `docs/superpowers/specs/2026-04-22-in-app-update-installer-design.md`

---

## Preconditions

- [ ] **Verify workspace is up-to-date**

Run:
```bash
cd /c/Users/desti/youcoded-dev/youcoded && git fetch origin && git pull origin master
```
Expected: `Already up to date` or clean fast-forward. Verify `desktop/src/renderer/components/UpdatePanel.tsx` and `desktop/src/main/changelog-service.ts` both exist — these landed from the update-panel-popup branch earlier 2026-04-22.

---

## Task 0: Create worktree for this work

Per workspace CLAUDE.md: "Any work beyond a handful of lines must be done in a separate git worktree." This feature touches ~7 files and adds ~6 new ones.

**Files:**
- New worktree at `/c/Users/desti/youcoded-worktrees/update-installer/`

- [ ] **Step 1: Create worktree**

Run:
```bash
cd /c/Users/desti/youcoded-dev/youcoded && git worktree add -b feat/update-installer /c/Users/desti/youcoded-worktrees/update-installer master
```
Expected: `Preparing worktree (new branch 'feat/update-installer')` and `/c/Users/desti/youcoded-worktrees/update-installer/` exists.

- [ ] **Step 2: cd into worktree for all subsequent work**

```bash
cd /c/Users/desti/youcoded-worktrees/update-installer
```

- [ ] **Step 3: Install deps if needed**

```bash
cd desktop && npm ci
```
Expected: clean install, no errors. Verify by running the existing test suite:
```bash
npx vitest run --reporter=verbose tests/shim-parity.test.ts
```
Expected: all tests pass (establishes a baseline).

---

## Task 1: Shared types

**Responsibility:** Define the shared type surface used by main, preload, and renderer. No runtime logic; no tests required (type-only file).

**Files:**
- Create: `desktop/src/shared/update-install-types.ts`

- [ ] **Step 1: Create the types file**

Create `desktop/src/shared/update-install-types.ts` with exactly this content:

```ts
// Shared types for the in-app update installer.
// Consumed by: desktop/src/main/update-installer.ts, desktop/src/main/ipc-handlers.ts,
// desktop/src/main/preload.ts, desktop/src/renderer/remote-shim.ts,
// desktop/src/renderer/components/UpdatePanel.tsx,
// app/src/main/kotlin/.../runtime/UpdateInstallerStub.kt (mirror).
//
// Keep in sync with the Kotlin stub's error code enum — see parity test in tests/update-install-ipc.test.ts.

export type UpdateInstallErrorCode =
  | 'spawn-failed'          // spawn() threw or child exited non-zero within 2s
  | 'file-missing'          // download file does not exist on disk
  | 'appimage-not-writable' // EACCES/EPERM replacing a root-owned AppImage
  | 'dmg-corrupt'           // `open -W` exited non-zero on macOS
  | 'unsupported-platform'  // platform/arch combination we don't handle
  | 'remote-unsupported'    // attempted from a remote-browser session
  | 'network-failed'        // download failed mid-stream
  | 'disk-full'             // ENOSPC during write
  | 'url-rejected'          // failed HTTPS / domain allowlist check
  | 'not-supported';        // Android stub's universal error

export interface UpdateDownloadResult {
  jobId: string;
  filePath: string;
  bytesTotal: number;
}

export interface UpdateProgressEvent {
  jobId: string;
  bytesReceived: number;
  bytesTotal: number;  // 0 if Content-Length was absent
  percent: number;     // 0-100, or -1 if bytesTotal unknown
}

export type UpdateLaunchResult =
  | { success: true; quitPending: true }                         // installer spawned, app.quit() scheduled
  | { success: true; quitPending: false; fallback: 'browser' }   // .deb / missing-APPIMAGE: shell.openExternal, app keeps running
  | { success: false; error: UpdateInstallErrorCode };

export interface UpdateCachedDownload {
  filePath: string;
  version: string;
}
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
cd desktop && npx tsc --noEmit -p tsconfig.json
```
Expected: No errors introduced by the new file (there may be pre-existing errors elsewhere — only care about errors referencing `update-install-types.ts`).

- [ ] **Step 3: Commit**

```bash
cd /c/Users/desti/youcoded-worktrees/update-installer
git add desktop/src/shared/update-install-types.ts
git commit -m "feat(update-installer): add shared types for download/launch IPC"
```

---

## Task 2: URL validation + filename derivation (pure functions, TDD)

**Responsibility:** Two pure helpers the main module will use before kicking off a download — `validateDownloadUrl(url)` (HTTPS-only + domain allowlist) and `deriveDownloadFilename(url, platform)` (safe basename + extension whitelist).

**Files:**
- Create: `desktop/src/main/update-installer.ts` (with only these two helpers for now)
- Create: `desktop/tests/update-installer.test.ts`

- [ ] **Step 1: Write failing tests for validateDownloadUrl**

Create `desktop/tests/update-installer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateDownloadUrl, deriveDownloadFilename } from '../src/main/update-installer';

describe('validateDownloadUrl', () => {
  it('accepts github.com release URLs', () => {
    expect(() => validateDownloadUrl('https://github.com/itsdestin/youcoded/releases/download/v1.2.3/YouCoded-Setup-1.2.3.exe')).not.toThrow();
  });

  it('accepts objects.githubusercontent.com URLs', () => {
    expect(() => validateDownloadUrl('https://objects.githubusercontent.com/github-production-release-asset-xyz/YouCoded-1.2.3.dmg')).not.toThrow();
  });

  it('rejects http:// URLs with url-rejected', () => {
    expect(() => validateDownloadUrl('http://github.com/itsdestin/youcoded/releases/download/v1/YouCoded.exe'))
      .toThrow(/url-rejected/);
  });

  it('rejects non-GitHub domains with url-rejected', () => {
    expect(() => validateDownloadUrl('https://evil.example.com/YouCoded.exe'))
      .toThrow(/url-rejected/);
  });

  it('rejects malformed URLs with url-rejected', () => {
    expect(() => validateDownloadUrl('not a url')).toThrow(/url-rejected/);
  });
});

describe('deriveDownloadFilename', () => {
  it('derives .exe for Windows URL', () => {
    const f = deriveDownloadFilename('https://github.com/itsdestin/youcoded/releases/download/v1.2.3/YouCoded-Setup-1.2.3.exe', 'win32');
    expect(f).toBe('YouCoded-Setup-1.2.3.exe');
  });

  it('derives .dmg for macOS URL', () => {
    const f = deriveDownloadFilename('https://github.com/itsdestin/youcoded/releases/download/v1.2.3/YouCoded-1.2.3-arm64.dmg', 'darwin');
    expect(f).toBe('YouCoded-1.2.3-arm64.dmg');
  });

  it('derives .AppImage for Linux AppImage URL', () => {
    const f = deriveDownloadFilename('https://github.com/itsdestin/youcoded/releases/download/v1.2.3/YouCoded-1.2.3.AppImage', 'linux');
    expect(f).toBe('YouCoded-1.2.3.AppImage');
  });

  it('derives .deb for Linux deb URL', () => {
    const f = deriveDownloadFilename('https://github.com/itsdestin/youcoded/releases/download/v1.2.3/youcoded_1.2.3_amd64.deb', 'linux');
    expect(f).toBe('youcoded_1.2.3_amd64.deb');
  });

  it('rejects path traversal with url-rejected', () => {
    expect(() => deriveDownloadFilename('https://github.com/foo/../../etc/passwd', 'linux'))
      .toThrow(/url-rejected/);
  });

  it('rejects unknown extensions with url-rejected', () => {
    expect(() => deriveDownloadFilename('https://github.com/itsdestin/youcoded/releases/download/v1/foo.zip', 'win32'))
      .toThrow(/url-rejected/);
  });

  it('strips querystrings before extension check', () => {
    const f = deriveDownloadFilename('https://objects.githubusercontent.com/YouCoded-1.2.3.exe?token=abc', 'win32');
    expect(f).toBe('YouCoded-1.2.3.exe');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run:
```bash
cd desktop && npx vitest run tests/update-installer.test.ts
```
Expected: All tests fail with "validateDownloadUrl is not defined" / "deriveDownloadFilename is not defined" (or module-resolution error if the source file doesn't exist yet).

- [ ] **Step 3: Implement the two helpers**

Create `desktop/src/main/update-installer.ts`:

```ts
// update-installer.ts — In-app download-and-launch lifecycle for YouCoded updates.
// Spec: docs/superpowers/specs/2026-04-22-in-app-update-installer-design.md
// Shared types: desktop/src/shared/update-install-types.ts
//
// Responsibilities (added incrementally across tasks):
//   Task 2: URL validation + filename derivation (this file currently)
//   Task 3: startDownload / cancelDownload / progress throttling
//   Task 4: cleanupStaleDownloads
//   Task 5: launchInstaller (platform branches)
//   Task 6: getCachedDownload

import type { UpdateInstallErrorCode } from '../shared/update-install-types';

// Domains we'll accept release-asset downloads from. GitHub Releases sometimes
// redirects the download URL from github.com -> objects.githubusercontent.com;
// both need to be allowed. A malicious metadata response that tried to point
// us elsewhere (e.g. an attacker-controlled CDN) would be rejected here.
const ALLOWED_HOSTS = new Set(['github.com', 'objects.githubusercontent.com']);

// Whitelist of extensions we know how to launch. Prevents path-traversal payloads
// that smuggle arbitrary file types into userData/update-cache/.
const ALLOWED_EXTENSIONS_BY_PLATFORM: Record<string, readonly string[]> = {
  win32:  ['.exe'],
  darwin: ['.dmg'],
  linux:  ['.AppImage', '.deb'],
};

export class UpdateInstallError extends Error {
  constructor(public readonly code: UpdateInstallErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'UpdateInstallError';
  }
}

/**
 * Throws UpdateInstallError('url-rejected') if `url` is not HTTPS or its host
 * is outside the GitHub allowlist. Returns the parsed URL on success.
 */
export function validateDownloadUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UpdateInstallError('url-rejected', `malformed url: ${url}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new UpdateInstallError('url-rejected', `non-https: ${parsed.protocol}`);
  }
  if (!ALLOWED_HOSTS.has(parsed.host)) {
    throw new UpdateInstallError('url-rejected', `host not allowed: ${parsed.host}`);
  }
  return parsed;
}

/**
 * Extracts a safe basename from the URL path (strips query/hash), rejects any
 * path-traversal payload, and enforces a per-platform extension whitelist.
 */
export function deriveDownloadFilename(url: string, platform: NodeJS.Platform): string {
  const parsed = validateDownloadUrl(url);
  // URL pathname is always absolute (leading '/'); last segment after '/' is the filename.
  const rawName = parsed.pathname.split('/').filter(Boolean).pop() ?? '';
  if (!rawName || rawName.includes('..') || rawName.includes('\\')) {
    throw new UpdateInstallError('url-rejected', `unsafe filename: ${rawName}`);
  }
  const allowed = ALLOWED_EXTENSIONS_BY_PLATFORM[platform] ?? [];
  const match = allowed.find(ext => rawName.endsWith(ext));
  if (!match) {
    throw new UpdateInstallError('url-rejected', `extension not allowed for ${platform}: ${rawName}`);
  }
  return rawName;
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run:
```bash
cd desktop && npx vitest run tests/update-installer.test.ts
```
Expected: All 11 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/desti/youcoded-worktrees/update-installer
git add desktop/src/main/update-installer.ts desktop/tests/update-installer.test.ts
git commit -m "feat(update-installer): URL validation + safe filename derivation"
```

---

## Task 3: Download engine (startDownload, cancelDownload, progress throttling)

**Responsibility:** Stream a validated URL to `{userData}/update-cache/<filename>.partial`, atomically rename on success, throttle progress events to ~250ms/5% boundaries, and support cancellation mid-stream. Single-job invariant: a second `startDownload` while one is in flight returns the existing jobId.

**Files:**
- Modify: `desktop/src/main/update-installer.ts`
- Modify: `desktop/tests/update-installer.test.ts`

- [ ] **Step 1: Add failing tests for the download engine**

Append to `desktop/tests/update-installer.test.ts`:

```ts
import { createUpdateInstaller } from '../src/main/update-installer';
import { createServer, Server } from 'http';
import { createServer as createHttpsServer } from 'https';
import { AddressInfo } from 'net';
import fs from 'fs';
import os from 'os';
import path from 'path';
import https from 'https';
import { EventEmitter } from 'events';
import { Readable } from 'stream';

// We can't easily stand up a real HTTPS server in tests (needs certs).
// Instead, inject a fake `httpsGet` into the installer factory so tests
// can drive the request/response by hand. This is a deliberate seam.

function makeFakeHttpsGet(scripts: Map<string, Buffer | Error>) {
  return (url: string, cb: (res: any) => void) => {
    const emitter = new EventEmitter() as any;
    emitter.destroy = () => { emitter.emit('abort'); };
    setImmediate(() => {
      const scripted = scripts.get(url);
      if (scripted instanceof Error) {
        emitter.emit('error', scripted);
        return;
      }
      if (!scripted) {
        emitter.emit('error', new Error(`no script for ${url}`));
        return;
      }
      const res = new Readable({ read() {} }) as any;
      res.statusCode = 200;
      res.headers = { 'content-length': String(scripted.length) };
      res.resume = () => {};
      cb(res);
      // Feed bytes in small chunks so progress throttling is exercised.
      const CHUNK = 1024;
      for (let i = 0; i < scripted.length; i += CHUNK) {
        res.push(scripted.subarray(i, Math.min(i + CHUNK, scripted.length)));
      }
      res.push(null);
    });
    return emitter;
  };
}

describe('createUpdateInstaller download engine', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-installer-test-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('downloads a file to update-cache, renaming .partial on completion', async () => {
    const url = 'https://github.com/itsdestin/youcoded/releases/download/v1/YouCoded.exe';
    const payload = Buffer.from('fake installer content '.repeat(100));
    const installer = createUpdateInstaller({
      cacheDir: tmpDir,
      httpsGet: makeFakeHttpsGet(new Map([[url, payload]])),
      platform: 'win32',
      onProgress: () => {},
    });

    const result = await installer.startDownload(url);
    expect(result.bytesTotal).toBe(payload.length);
    expect(result.filePath).toBe(path.join(tmpDir, 'YouCoded.exe'));
    expect(fs.readFileSync(result.filePath)).toEqual(payload);
    // No leftover .partial
    expect(fs.existsSync(result.filePath + '.partial')).toBe(false);
  });

  it('emits progress events at 250ms/5% throttle boundaries', async () => {
    const url = 'https://github.com/itsdestin/youcoded/releases/download/v1/YouCoded.exe';
    const payload = Buffer.alloc(100 * 1024); // 100 KB
    const progressEvents: { bytesReceived: number; percent: number }[] = [];
    const installer = createUpdateInstaller({
      cacheDir: tmpDir,
      httpsGet: makeFakeHttpsGet(new Map([[url, payload]])),
      platform: 'win32',
      onProgress: (ev) => progressEvents.push({ bytesReceived: ev.bytesReceived, percent: ev.percent }),
    });

    await installer.startDownload(url);

    // At least 2 events (one mid-download, one at 100%). Never one-per-chunk.
    expect(progressEvents.length).toBeGreaterThanOrEqual(2);
    expect(progressEvents.length).toBeLessThan(100); // not per-chunk
    // Final event is 100%.
    expect(progressEvents[progressEvents.length - 1].percent).toBe(100);
  });

  it('returns the existing jobId when a second startDownload is issued while one is in flight', async () => {
    const url = 'https://github.com/itsdestin/youcoded/releases/download/v1/YouCoded.exe';
    const payload = Buffer.alloc(50 * 1024);
    const installer = createUpdateInstaller({
      cacheDir: tmpDir,
      httpsGet: makeFakeHttpsGet(new Map([[url, payload]])),
      platform: 'win32',
      onProgress: () => {},
    });

    const p1 = installer.startDownload(url);
    const p2 = installer.startDownload(url);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.jobId).toBe(r2.jobId);
    expect(r1.filePath).toBe(r2.filePath);
  });

  it('cancelDownload removes the .partial file and rejects the in-flight promise', async () => {
    const url = 'https://github.com/itsdestin/youcoded/releases/download/v1/YouCoded.exe';
    // Never resolves — emits no data, we cancel first.
    const fakeGet = ((_url: string, cb: (res: any) => void) => {
      const emitter = new EventEmitter() as any;
      emitter.destroy = () => { emitter.emit('abort'); };
      setImmediate(() => {
        const res = new Readable({ read() {} }) as any;
        res.statusCode = 200;
        res.headers = { 'content-length': '1000000' };
        res.resume = () => {};
        cb(res);
        // Feed 1 KB then stall
        res.push(Buffer.alloc(1024));
      });
      return emitter;
    });
    const installer = createUpdateInstaller({
      cacheDir: tmpDir,
      httpsGet: fakeGet as any,
      platform: 'win32',
      onProgress: () => {},
    });

    const downloadPromise = installer.startDownload(url);
    await new Promise(r => setTimeout(r, 50)); // let chunk arrive
    const jobId = installer.getActiveJobId();
    expect(jobId).toBeTruthy();
    installer.cancelDownload(jobId!);

    await expect(downloadPromise).rejects.toThrow();
    expect(fs.existsSync(path.join(tmpDir, 'YouCoded.exe.partial'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'YouCoded.exe'))).toBe(false);
  });

  it('surfaces network errors as network-failed', async () => {
    const url = 'https://github.com/itsdestin/youcoded/releases/download/v1/YouCoded.exe';
    const installer = createUpdateInstaller({
      cacheDir: tmpDir,
      httpsGet: makeFakeHttpsGet(new Map([[url, new Error('ENETUNREACH')]])),
      platform: 'win32',
      onProgress: () => {},
    });
    await expect(installer.startDownload(url)).rejects.toThrow(/network-failed/);
  });

  it('rejects url-rejected URLs before opening any file', async () => {
    const installer = createUpdateInstaller({
      cacheDir: tmpDir,
      httpsGet: makeFakeHttpsGet(new Map()),
      platform: 'win32',
      onProgress: () => {},
    });
    await expect(installer.startDownload('http://github.com/foo.exe')).rejects.toThrow(/url-rejected/);
    expect(fs.readdirSync(tmpDir).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run:
```bash
cd desktop && npx vitest run tests/update-installer.test.ts
```
Expected: The new `createUpdateInstaller` tests fail with "createUpdateInstaller is not defined" (Task 2 tests still pass).

- [ ] **Step 3: Implement the download engine**

Append to `desktop/src/main/update-installer.ts`:

```ts
import fs from 'fs';
import path from 'path';
import https from 'https';
import { randomUUID } from 'crypto';
import type {
  UpdateDownloadResult,
  UpdateProgressEvent,
} from '../shared/update-install-types';

// Tunables. These are module-level so tests can't accidentally override them;
// the values are chosen to keep IPC traffic reasonable for a ~150 MB download
// (roughly 20 progress events per download).
const PROGRESS_THROTTLE_MS = 250;
const PROGRESS_PERCENT_STEP = 5;
const MAX_REDIRECTS = 5;

type HttpsGet = (url: string, cb: (res: any) => void) => any;

export interface UpdateInstallerOptions {
  cacheDir: string;
  // Indirection so tests can inject a scripted response.
  httpsGet?: HttpsGet;
  platform?: NodeJS.Platform;
  // Fired as bytes arrive. Consumer (IPC layer) is responsible for shipping
  // these to the renderer. Throttled by the engine — consumers do not need to debounce.
  onProgress: (ev: UpdateProgressEvent) => void;
}

interface ActiveJob {
  jobId: string;
  url: string;
  filePath: string;
  partialPath: string;
  bytesReceived: number;
  bytesTotal: number;
  lastEmitTime: number;
  lastEmitPercent: number;
  req: any; // the underlying request (so we can destroy on cancel)
  writeStream: fs.WriteStream;
  deferred: { resolve: (r: UpdateDownloadResult) => void; reject: (e: Error) => void };
}

export function createUpdateInstaller(options: UpdateInstallerOptions) {
  const { cacheDir, platform = process.platform, onProgress } = options;
  const httpsGet: HttpsGet = options.httpsGet ?? (https.get.bind(https) as HttpsGet);
  let active: ActiveJob | null = null;

  function emitProgress(job: ActiveJob, force = false) {
    const now = Date.now();
    const percent = job.bytesTotal > 0 ? Math.floor((job.bytesReceived / job.bytesTotal) * 100) : -1;
    const timeOk = now - job.lastEmitTime >= PROGRESS_THROTTLE_MS;
    const percentOk = percent === -1 ? false : percent - job.lastEmitPercent >= PROGRESS_PERCENT_STEP;
    if (!force && !timeOk && !percentOk) return;
    job.lastEmitTime = now;
    if (percent !== -1) job.lastEmitPercent = percent;
    onProgress({
      jobId: job.jobId,
      bytesReceived: job.bytesReceived,
      bytesTotal: job.bytesTotal,
      percent,
    });
  }

  function cleanupActive(job: ActiveJob, unlinkPartial: boolean) {
    try { job.writeStream.destroy(); } catch { /* ignore */ }
    if (unlinkPartial) {
      try { fs.unlinkSync(job.partialPath); } catch { /* ignore */ }
    }
    if (active?.jobId === job.jobId) active = null;
  }

  async function startDownload(rawUrl: string): Promise<UpdateDownloadResult> {
    // Single-job invariant: coalesce to the existing job if the URL matches.
    if (active && active.url === rawUrl) {
      return new Promise<UpdateDownloadResult>((resolve, reject) => {
        const prior = active!.deferred;
        active!.deferred = {
          resolve: (r) => { prior.resolve(r); resolve(r); },
          reject: (e) => { prior.reject(e); reject(e); },
        };
      });
    }
    if (active) {
      // Different URL while another is in flight — reject; the caller (IPC layer)
      // should have cancelled first. Keeping this strict avoids racy cache files.
      throw new UpdateInstallError('url-rejected', 'another download is already active');
    }

    // Validate + derive filename BEFORE opening any file or making any request.
    validateDownloadUrl(rawUrl); // throws UpdateInstallError on reject
    const filename = deriveDownloadFilename(rawUrl, platform);

    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const filePath = path.join(cacheDir, filename);
    const partialPath = filePath + '.partial';
    // If a .partial from a previous crashed attempt is still here, wipe it so we start fresh.
    try { fs.unlinkSync(partialPath); } catch { /* ignore */ }

    return new Promise<UpdateDownloadResult>((resolve, reject) => {
      const writeStream = fs.createWriteStream(partialPath);
      const job: ActiveJob = {
        jobId: randomUUID(),
        url: rawUrl,
        filePath,
        partialPath,
        bytesReceived: 0,
        bytesTotal: 0,
        lastEmitTime: 0,
        lastEmitPercent: -PROGRESS_PERCENT_STEP, // so the first tick qualifies
        req: null,
        writeStream,
        deferred: { resolve, reject },
      };
      active = job;

      writeStream.on('error', (err) => {
        const code = (err as NodeJS.ErrnoException).code === 'ENOSPC' ? 'disk-full' : 'network-failed';
        cleanupActive(job, true);
        job.deferred.reject(new UpdateInstallError(code, err.message));
      });

      followRequest(rawUrl, 0, (err, res) => {
        if (err || !res) {
          cleanupActive(job, true);
          job.deferred.reject(new UpdateInstallError('network-failed', err?.message ?? 'no response'));
          return;
        }
        const contentLength = Number(res.headers?.['content-length'] ?? 0);
        job.bytesTotal = Number.isFinite(contentLength) ? contentLength : 0;
        res.on('data', (chunk: Buffer) => {
          job.bytesReceived += chunk.length;
          writeStream.write(chunk);
          emitProgress(job);
        });
        res.on('end', () => {
          writeStream.end(() => {
            try {
              fs.renameSync(partialPath, filePath);
            } catch (renameErr) {
              cleanupActive(job, true);
              job.deferred.reject(new UpdateInstallError('network-failed', `rename failed: ${(renameErr as Error).message}`));
              return;
            }
            emitProgress(job, true); // final 100% emit
            const result: UpdateDownloadResult = {
              jobId: job.jobId,
              filePath,
              bytesTotal: job.bytesTotal || job.bytesReceived,
            };
            if (active?.jobId === job.jobId) active = null;
            job.deferred.resolve(result);
          });
        });
        res.on('error', (streamErr: Error) => {
          cleanupActive(job, true);
          job.deferred.reject(new UpdateInstallError('network-failed', streamErr.message));
        });
      }, (req) => { job.req = req; });
    });
  }

  function followRequest(
    url: string,
    redirectCount: number,
    onResponse: (err: Error | null, res: any) => void,
    captureReq: (req: any) => void,
  ) {
    if (redirectCount > MAX_REDIRECTS) {
      onResponse(new Error('too many redirects'), null);
      return;
    }
    let parsed: URL;
    try {
      parsed = validateDownloadUrl(url); // each hop re-validated
    } catch (e) {
      onResponse(e as Error, null);
      return;
    }
    const req = httpsGet(parsed.toString(), (res: any) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers?.location) {
        // Drain + follow redirect.
        res.resume?.();
        followRequest(new URL(res.headers.location, parsed).toString(), redirectCount + 1, onResponse, captureReq);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        onResponse(new Error(`http ${res.statusCode}`), null);
        return;
      }
      onResponse(null, res);
    });
    req.on?.('error', (err: Error) => onResponse(err, null));
    captureReq(req);
  }

  function cancelDownload(jobId: string): void {
    if (!active || active.jobId !== jobId) return;
    const job = active;
    try { job.req?.destroy(); } catch { /* ignore */ }
    cleanupActive(job, true);
    job.deferred.reject(new UpdateInstallError('network-failed', 'cancelled'));
  }

  function getActiveJobId(): string | null {
    return active?.jobId ?? null;
  }

  return {
    startDownload,
    cancelDownload,
    getActiveJobId,
  };
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run:
```bash
cd desktop && npx vitest run tests/update-installer.test.ts
```
Expected: All download-engine tests pass. Task 2's tests still pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/desti/youcoded-worktrees/update-installer
git add desktop/src/main/update-installer.ts desktop/tests/update-installer.test.ts
git commit -m "feat(update-installer): download engine with throttled progress + cancel"
```

---

## Task 4: Stale-download cleanup + cached-download lookup

**Responsibility:** Two functions called from the IPC layer — `cleanupStaleDownloads(cacheDir)` (sweep `.partial` and anything older than 24 h at app start) and `findCachedDownload(cacheDir, expectedVersion, platform)` (support the "reopen popup, download already done" edge case).

**Files:**
- Modify: `desktop/src/main/update-installer.ts`
- Modify: `desktop/tests/update-installer.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `desktop/tests/update-installer.test.ts`:

```ts
import { cleanupStaleDownloads, findCachedDownload } from '../src/main/update-installer';

describe('cleanupStaleDownloads', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-installer-cleanup-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the cacheDir if missing', () => {
    const dir = path.join(tmpDir, 'does-not-exist');
    cleanupStaleDownloads(dir);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('deletes .partial files unconditionally', () => {
    fs.writeFileSync(path.join(tmpDir, 'YouCoded.exe.partial'), 'x');
    cleanupStaleDownloads(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, 'YouCoded.exe.partial'))).toBe(false);
  });

  it('deletes non-.partial files older than 24h', () => {
    const old = path.join(tmpDir, 'YouCoded.exe');
    fs.writeFileSync(old, 'x');
    const twentyFiveHoursAgo = Date.now() / 1000 - (25 * 3600);
    fs.utimesSync(old, twentyFiveHoursAgo, twentyFiveHoursAgo);
    cleanupStaleDownloads(tmpDir);
    expect(fs.existsSync(old)).toBe(false);
  });

  it('keeps non-.partial files newer than 24h', () => {
    const fresh = path.join(tmpDir, 'YouCoded.exe');
    fs.writeFileSync(fresh, 'x');
    cleanupStaleDownloads(tmpDir);
    expect(fs.existsSync(fresh)).toBe(true);
  });
});

describe('findCachedDownload', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-installer-cache-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no file matches the version', () => {
    expect(findCachedDownload(tmpDir, '1.2.3', 'win32')).toBeNull();
  });

  it('returns null when cacheDir does not exist', () => {
    expect(findCachedDownload(path.join(tmpDir, 'missing'), '1.2.3', 'win32')).toBeNull();
  });

  it('finds a matching .exe by version substring on Windows', () => {
    const filePath = path.join(tmpDir, 'YouCoded-Setup-1.2.3.exe');
    fs.writeFileSync(filePath, 'x');
    const hit = findCachedDownload(tmpDir, '1.2.3', 'win32');
    expect(hit).toEqual({ filePath, version: '1.2.3' });
  });

  it('finds a matching .dmg by version substring on macOS', () => {
    const filePath = path.join(tmpDir, 'YouCoded-1.2.3-arm64.dmg');
    fs.writeFileSync(filePath, 'x');
    const hit = findCachedDownload(tmpDir, '1.2.3', 'darwin');
    expect(hit).toEqual({ filePath, version: '1.2.3' });
  });

  it('ignores .partial files', () => {
    fs.writeFileSync(path.join(tmpDir, 'YouCoded-Setup-1.2.3.exe.partial'), 'x');
    expect(findCachedDownload(tmpDir, '1.2.3', 'win32')).toBeNull();
  });

  it('ignores files for a different version', () => {
    fs.writeFileSync(path.join(tmpDir, 'YouCoded-Setup-1.2.2.exe'), 'x');
    expect(findCachedDownload(tmpDir, '1.2.3', 'win32')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run:
```bash
cd desktop && npx vitest run tests/update-installer.test.ts
```
Expected: New tests fail with `cleanupStaleDownloads is not defined` / `findCachedDownload is not defined`.

- [ ] **Step 3: Implement both helpers**

Append to `desktop/src/main/update-installer.ts`:

```ts
const STALE_DOWNLOAD_AGE_MS = 24 * 3600 * 1000;

/**
 * Swept at app startup. Removes abandoned .partial files unconditionally and
 * any non-partial download older than 24h (likely already installed).
 * Safe to call when the directory doesn't exist — creates it.
 */
export function cleanupStaleDownloads(cacheDir: string): void {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    return;
  }
  const now = Date.now();
  for (const entry of fs.readdirSync(cacheDir)) {
    const entryPath = path.join(cacheDir, entry);
    try {
      if (entry.endsWith('.partial')) {
        fs.unlinkSync(entryPath);
        continue;
      }
      const stat = fs.statSync(entryPath);
      if (!stat.isFile()) continue;
      if (now - stat.mtimeMs > STALE_DOWNLOAD_AGE_MS) fs.unlinkSync(entryPath);
    } catch {
      // Best-effort cleanup; don't block app startup on a stuck file.
    }
  }
}

/**
 * Looks for an already-downloaded installer matching `expectedVersion` for the
 * current platform. Used when the user reopens the update popup and a prior
 * download completed — skips the re-download.
 *
 * Heuristic: the downloaded filename (set by electron-builder release naming)
 * always contains the version string; we require both a platform-valid
 * extension AND the version substring to match.
 */
export function findCachedDownload(
  cacheDir: string,
  expectedVersion: string,
  platform: NodeJS.Platform,
): import('../shared/update-install-types').UpdateCachedDownload | null {
  if (!fs.existsSync(cacheDir)) return null;
  const allowed = ALLOWED_EXTENSIONS_BY_PLATFORM[platform] ?? [];
  for (const entry of fs.readdirSync(cacheDir)) {
    if (entry.endsWith('.partial')) continue;
    if (!allowed.some(ext => entry.endsWith(ext))) continue;
    if (!entry.includes(expectedVersion)) continue;
    const filePath = path.join(cacheDir, entry);
    try {
      if (fs.statSync(filePath).isFile()) return { filePath, version: expectedVersion };
    } catch { /* ignore */ }
  }
  return null;
}
```

- [ ] **Step 4: Run — verify pass**

Run:
```bash
cd desktop && npx vitest run tests/update-installer.test.ts
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/desti/youcoded-worktrees/update-installer
git add desktop/src/main/update-installer.ts desktop/tests/update-installer.test.ts
git commit -m "feat(update-installer): stale-download sweep + cached-download lookup"
```

---

## Task 5: Platform `launchInstaller` branches

**Responsibility:** Spawn the right thing per platform and return `UpdateLaunchResult`. The module does NOT call `app.quit()` directly — it returns `quitPending: true` and lets the IPC layer call `app.quit()` after a 500 ms delay. This keeps the module pure-ish and testable.

**Files:**
- Modify: `desktop/src/main/update-installer.ts`
- Modify: `desktop/tests/update-installer.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `desktop/tests/update-installer.test.ts`:

```ts
import { makeLaunchInstaller } from '../src/main/update-installer';
import type { UpdateLaunchResult } from '../src/shared/update-install-types';

describe('launchInstaller', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-launch-test-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  function fakeChild(overrides: Partial<{ exitCode: number | null; exitDelay: number; errorOnSpawn: boolean }> = {}) {
    const emitter: any = new EventEmitter();
    emitter.unref = () => {};
    if (overrides.errorOnSpawn) {
      setImmediate(() => emitter.emit('error', new Error('ENOENT')));
    } else if (overrides.exitCode !== undefined) {
      setTimeout(() => emitter.emit('exit', overrides.exitCode), overrides.exitDelay ?? 10);
    }
    return emitter;
  }

  it('Windows: spawns the .exe detached and returns quitPending=true', async () => {
    const filePath = path.join(tmpDir, 'YouCoded.exe');
    fs.writeFileSync(filePath, 'x');
    const spawnCalls: any[] = [];
    const launch = makeLaunchInstaller({
      platform: 'win32',
      spawn: (cmd: string, args: string[], opts: any) => {
        spawnCalls.push({ cmd, args, opts });
        return fakeChild({ exitCode: 0, exitDelay: 5000 }); // NSIS won't exit quickly
      },
      shellOpenExternal: async () => {},
      appRelaunch: () => {},
      fallbackDownloadUrl: () => 'https://github.com/...', // not used on happy path
    });
    const r = await launch({ jobId: 'j', filePath });
    expect(r).toEqual({ success: true, quitPending: true });
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0].cmd).toBe(filePath);
    expect(spawnCalls[0].opts.detached).toBe(true);
    expect(spawnCalls[0].opts.stdio).toBe('ignore');
  });

  it('macOS: spawns `open -W <dmg>` and waits up to 2s for a quick failure', async () => {
    const filePath = path.join(tmpDir, 'YouCoded.dmg');
    fs.writeFileSync(filePath, 'x');
    const spawnCalls: any[] = [];
    const launch = makeLaunchInstaller({
      platform: 'darwin',
      spawn: (cmd: string, args: string[], opts: any) => {
        spawnCalls.push({ cmd, args, opts });
        return fakeChild({ exitCode: 0, exitDelay: 10_000 }); // healthy — stays mounted
      },
      shellOpenExternal: async () => {},
      appRelaunch: () => {},
      fallbackDownloadUrl: () => 'https://github.com/...',
    });
    const r = await launch({ jobId: 'j', filePath });
    expect(r).toEqual({ success: true, quitPending: true });
    expect(spawnCalls[0].cmd).toBe('open');
    expect(spawnCalls[0].args).toEqual(['-W', filePath]);
  });

  it('macOS: if `open -W` exits non-zero within 2s, returns dmg-corrupt error', async () => {
    const filePath = path.join(tmpDir, 'YouCoded.dmg');
    fs.writeFileSync(filePath, 'x');
    const launch = makeLaunchInstaller({
      platform: 'darwin',
      spawn: () => fakeChild({ exitCode: 1, exitDelay: 10 }),
      shellOpenExternal: async () => {},
      appRelaunch: () => {},
      fallbackDownloadUrl: () => '',
    });
    const r = await launch({ jobId: 'j', filePath });
    expect(r).toEqual({ success: false, error: 'dmg-corrupt' });
  });

  it('returns file-missing if the downloaded file is gone', async () => {
    const launch = makeLaunchInstaller({
      platform: 'win32',
      spawn: () => fakeChild(),
      shellOpenExternal: async () => {},
      appRelaunch: () => {},
      fallbackDownloadUrl: () => '',
    });
    const r = await launch({ jobId: 'j', filePath: path.join(tmpDir, 'missing.exe') });
    expect(r).toEqual({ success: false, error: 'file-missing' });
  });

  it('returns spawn-failed on spawn error', async () => {
    const filePath = path.join(tmpDir, 'YouCoded.exe');
    fs.writeFileSync(filePath, 'x');
    const launch = makeLaunchInstaller({
      platform: 'win32',
      spawn: () => fakeChild({ errorOnSpawn: true }),
      shellOpenExternal: async () => {},
      appRelaunch: () => {},
      fallbackDownloadUrl: () => '',
    });
    const r = await launch({ jobId: 'j', filePath });
    expect(r).toEqual({ success: false, error: 'spawn-failed' });
  });

  it('Linux AppImage: replaces APPIMAGE and calls app.relaunch, returns quitPending=true', async () => {
    const running = path.join(tmpDir, 'YouCoded-1.2.2.AppImage');
    const downloaded = path.join(tmpDir, 'YouCoded-1.2.3.AppImage');
    fs.writeFileSync(running, 'old');
    fs.writeFileSync(downloaded, 'new');
    let relaunched = false;
    const launch = makeLaunchInstaller({
      platform: 'linux',
      spawn: () => fakeChild({ exitCode: 0, exitDelay: 5000 }),
      shellOpenExternal: async () => {},
      appRelaunch: () => { relaunched = true; },
      fallbackDownloadUrl: () => '',
      envAppImage: running,
    });
    const r = await launch({ jobId: 'j', filePath: downloaded });
    expect(r).toEqual({ success: true, quitPending: true });
    expect(fs.readFileSync(running, 'utf8')).toBe('new');
    expect(fs.existsSync(downloaded)).toBe(false);
    expect(relaunched).toBe(true);
  });

  it('Linux AppImage without APPIMAGE env: falls back to browser, app keeps running', async () => {
    const filePath = path.join(tmpDir, 'YouCoded.AppImage');
    fs.writeFileSync(filePath, 'x');
    const opened: string[] = [];
    const launch = makeLaunchInstaller({
      platform: 'linux',
      spawn: () => fakeChild(),
      shellOpenExternal: async (url: string) => { opened.push(url); },
      appRelaunch: () => {},
      fallbackDownloadUrl: () => 'https://github.com/itsdestin/youcoded/releases/download/v1/YouCoded.AppImage',
      envAppImage: undefined,
    });
    const r = await launch({ jobId: 'j', filePath });
    expect(r).toEqual({ success: true, quitPending: false, fallback: 'browser' });
    expect(opened).toEqual(['https://github.com/itsdestin/youcoded/releases/download/v1/YouCoded.AppImage']);
  });

  it('Linux .deb: shells out to browser, app keeps running', async () => {
    const filePath = path.join(tmpDir, 'youcoded.deb');
    fs.writeFileSync(filePath, 'x');
    const opened: string[] = [];
    const launch = makeLaunchInstaller({
      platform: 'linux',
      spawn: () => fakeChild(),
      shellOpenExternal: async (url: string) => { opened.push(url); },
      appRelaunch: () => {},
      fallbackDownloadUrl: () => 'https://github.com/...deb',
      envAppImage: '/does/not/matter.AppImage',
    });
    const r = await launch({ jobId: 'j', filePath });
    expect(r).toEqual({ success: true, quitPending: false, fallback: 'browser' });
    expect(opened).toEqual(['https://github.com/...deb']);
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run:
```bash
cd desktop && npx vitest run tests/update-installer.test.ts
```
Expected: New tests fail.

- [ ] **Step 3: Implement `makeLaunchInstaller`**

Append to `desktop/src/main/update-installer.ts`:

```ts
import { spawn as nodeSpawn, type SpawnOptions } from 'child_process';
import type { UpdateLaunchResult } from '../shared/update-install-types';

// Quick-exit window: on macOS we spawn `open -W`, which stays alive until the
// mounted DMG is ejected — for a healthy DMG that could be an hour. We only
// listen for a FAST failure: if the child exits non-zero within this window
// we treat it as a bad DMG; beyond it, we assume success.
const QUICK_EXIT_WINDOW_MS = 2000;

export interface LaunchInstallerDeps {
  platform?: NodeJS.Platform;
  // Inject for testability. Production passes node-child-process.spawn + Electron shell/app.
  spawn?: (cmd: string, args: string[], opts: SpawnOptions) => any;
  shellOpenExternal: (url: string) => Promise<void>;
  appRelaunch: () => void;
  // Lazily read so the module doesn't care where the URL lives (main caches it).
  fallbackDownloadUrl: () => string;
  // Override for Linux AppImage detection — prod reads process.env.APPIMAGE.
  envAppImage?: string;
}

export interface LaunchInstallerInput {
  jobId: string;
  filePath: string;
}

export function makeLaunchInstaller(deps: LaunchInstallerDeps) {
  const platform = deps.platform ?? process.platform;
  const spawn = deps.spawn ?? (nodeSpawn as any);

  async function launch(input: LaunchInstallerInput): Promise<UpdateLaunchResult> {
    if (!fs.existsSync(input.filePath)) {
      return { success: false, error: 'file-missing' };
    }

    if (platform === 'win32') return spawnDetached(input.filePath, [], /*requireQuickExitOk*/ false);

    if (platform === 'darwin') return spawnDetached('open', ['-W', input.filePath], /*requireQuickExitOk*/ true, 'dmg-corrupt');

    if (platform === 'linux') {
      if (input.filePath.endsWith('.deb')) {
        await deps.shellOpenExternal(deps.fallbackDownloadUrl());
        return { success: true, quitPending: false, fallback: 'browser' };
      }
      if (input.filePath.endsWith('.AppImage')) {
        const running = deps.envAppImage;
        if (!running || !fs.existsSync(running)) {
          // Graceful fallback — not an error. User installs manually from browser.
          await deps.shellOpenExternal(deps.fallbackDownloadUrl());
          return { success: true, quitPending: false, fallback: 'browser' };
        }
        try {
          fs.chmodSync(input.filePath, 0o755);
          try {
            fs.renameSync(input.filePath, running);
          } catch (e: any) {
            if (e.code === 'EXDEV') {
              fs.copyFileSync(input.filePath, running);
              fs.unlinkSync(input.filePath);
            } else if (e.code === 'EACCES' || e.code === 'EPERM') {
              return { success: false, error: 'appimage-not-writable' };
            } else {
              return { success: false, error: 'spawn-failed' };
            }
          }
        } catch {
          return { success: false, error: 'spawn-failed' };
        }
        deps.appRelaunch();
        return { success: true, quitPending: true };
      }
    }
    return { success: false, error: 'unsupported-platform' };
  }

  function spawnDetached(
    cmd: string,
    args: string[],
    requireQuickExitOk: boolean,
    quickExitErrorCode: 'dmg-corrupt' | 'spawn-failed' = 'spawn-failed',
  ): Promise<UpdateLaunchResult> {
    return new Promise(resolve => {
      let settled = false;
      let child: any;
      try {
        child = spawn(cmd, args, {
          detached: true,
          stdio: 'ignore',
          // Windows NSIS installer needs its own window; elsewhere hiding it is harmless.
          ...(platform === 'win32' ? { windowsHide: false } : {}),
        });
      } catch {
        resolve({ success: false, error: 'spawn-failed' });
        return;
      }

      child.on?.('error', () => {
        if (settled) return;
        settled = true;
        resolve({ success: false, error: 'spawn-failed' });
      });

      if (requireQuickExitOk) {
        // macOS `open -W`: fast non-zero exit indicates a broken path/DMG.
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          try { child.unref?.(); } catch { /* ignore */ }
          resolve({ success: true, quitPending: true });
        }, QUICK_EXIT_WINDOW_MS);

        child.on?.('exit', (code: number | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (code !== null && code !== 0) {
            resolve({ success: false, error: quickExitErrorCode });
          } else {
            // Exited 0 within the window (unusual but fine).
            resolve({ success: true, quitPending: true });
          }
        });
      } else {
        // Windows: detach immediately — NSIS owns its own lifetime.
        setImmediate(() => {
          if (settled) return;
          settled = true;
          try { child.unref?.(); } catch { /* ignore */ }
          resolve({ success: true, quitPending: true });
        });
      }
    });
  }

  return launch;
}
```

- [ ] **Step 4: Run — verify pass**

Run:
```bash
cd desktop && npx vitest run tests/update-installer.test.ts
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/desti/youcoded-worktrees/update-installer
git add desktop/src/main/update-installer.ts desktop/tests/update-installer.test.ts
git commit -m "feat(update-installer): platform-specific launchInstaller branches"
```

---

## Task 6: Wire IPC handlers in main process

**Responsibility:** Register the five new IPC channels on `ipcMain`, wire them to the `update-installer` module, read `cachedUpdateStatus.download_url` from the existing updater, broadcast `update:progress` to all renderer windows, and call `app.quit()` 500 ms after a successful launch.

**Files:**
- Modify: `desktop/src/main/ipc-handlers.ts`
- Modify: `desktop/src/main/main.ts`
- Modify: `desktop/src/shared/types.ts` (add IPC channel constants if the file uses an `IPC` object)

- [ ] **Step 1: Check the existing IPC channel constant convention**

Run:
```bash
cd /c/Users/desti/youcoded-worktrees/update-installer
grep -n "'update:changelog'" desktop/src/shared/types.ts desktop/src/main/preload.ts
```
Note the pattern used for the existing `update:changelog` channel. Follow that same pattern for the five new channels — both `types.ts` and `preload.ts` should reference them.

- [ ] **Step 2: Add channel constants to `shared/types.ts`**

Find the `IPC` constant object in `desktop/src/shared/types.ts` (near the top of the file). Add these five entries next to the existing `'update:changelog'` entry, preserving the file's existing formatting:

```ts
UPDATE_DOWNLOAD: 'update:download',
UPDATE_CANCEL: 'update:cancel',
UPDATE_LAUNCH: 'update:launch',
UPDATE_PROGRESS: 'update:progress',
UPDATE_GET_CACHED_DOWNLOAD: 'update:get-cached-download',
```

- [ ] **Step 3: Register handlers in `ipc-handlers.ts`**

Near the bottom of the "YouCoded app update checker" block (search for `// --- YouCoded app update checker`, around `ipc-handlers.ts:1153`), but BEFORE the `function getUpdateStatus()` declaration, add the import at the top of the file and the handler-registration block:

Top of file, alongside other imports:

```ts
import { app, ipcMain, BrowserWindow, shell, type WebContents } from 'electron';
import { createUpdateInstaller, cleanupStaleDownloads, findCachedDownload, makeLaunchInstaller, UpdateInstallError } from './update-installer';
import type { UpdateProgressEvent } from '../shared/update-install-types';
import path from 'path';
```

(If `app`, `shell`, and `BrowserWindow` are already imported, leave the existing import line and merge the new names into it. Don't duplicate imports.)

Inside the IPC registration function, after the existing `getUpdateStatus()` definition, add:

```ts
  // -----------------------------------------------------------------------
  // In-app update installer — download + launch the platform installer.
  // Spec: docs/superpowers/specs/2026-04-22-in-app-update-installer-design.md
  // -----------------------------------------------------------------------
  const updateCacheDir = path.join(app.getPath('userData'), 'update-cache');

  const installer = createUpdateInstaller({
    cacheDir: updateCacheDir,
    onProgress: (ev: UpdateProgressEvent) => {
      // Broadcast to every live renderer. Renderers filter by jobId.
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('update:progress', ev);
      }
    },
  });

  const launchInstaller = makeLaunchInstaller({
    shellOpenExternal: (url: string) => shell.openExternal(url),
    appRelaunch: () => app.relaunch(),
    fallbackDownloadUrl: () => cachedUpdateStatus?.download_url ?? '',
    envAppImage: process.env.APPIMAGE,
  });

  ipcMain.handle('update:download', async () => {
    // Renderer never passes a URL — we resolve main-side from the trusted cache
    // populated by the GitHub Releases check. Prevents renderer from spoofing
    // the download target.
    const status = getUpdateStatus();
    const url = status?.download_url;
    if (!url) throw new UpdateInstallError('url-rejected', 'no download URL available');
    return await installer.startDownload(url);
  });

  ipcMain.handle('update:cancel', async (_event, payload: { jobId: string }) => {
    installer.cancelDownload(payload.jobId);
    return { success: true };
  });

  ipcMain.handle('update:launch', async (_event, payload: { jobId: string; filePath: string }) => {
    const result = await launchInstaller({ jobId: payload.jobId, filePath: payload.filePath });
    if (result.success && result.quitPending) {
      // 500ms grace so the child process has detached cleanly before we exit.
      setTimeout(() => app.quit(), 500);
    }
    return result;
  });

  ipcMain.handle('update:get-cached-download', async (_event, payload: { version: string }) => {
    return findCachedDownload(updateCacheDir, payload.version, process.platform);
  });
```

- [ ] **Step 4: Call `cleanupStaleDownloads` at app start**

In `desktop/src/main/main.ts`, find the `app.whenReady()` block (or the equivalent `app.on('ready', ...)`) and add this call near where other startup cleanups happen:

```ts
import path from 'path';
import { cleanupStaleDownloads } from './update-installer';

// ...inside app.whenReady() or the startup function, near other cleanups...
cleanupStaleDownloads(path.join(app.getPath('userData'), 'update-cache'));
```

(If `path` and `app` are already imported at the top of the file, merge into the existing imports.)

- [ ] **Step 5: Run the test suite to confirm nothing is broken**

Run:
```bash
cd desktop && npx vitest run tests/update-installer.test.ts tests/shim-parity.test.ts tests/ipc-channels.test.ts
```
Expected: All tests pass. No regressions from the wiring changes.

- [ ] **Step 6: Typecheck**

Run:
```bash
cd desktop && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "update-installer|ipc-handlers\.ts|main\.ts" | head -20
```
Expected: No errors in the files you edited.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/desti/youcoded-worktrees/update-installer
git add desktop/src/main/ipc-handlers.ts desktop/src/main/main.ts desktop/src/shared/types.ts
git commit -m "feat(update-installer): wire IPC handlers + startup cleanup"
```

---

## Task 7: Preload surface (`window.claude.update.*`)

**Responsibility:** Expose the five channels on `window.claude.update` in `preload.ts`. Preload is sandboxed — no imports, IPC channel names are inlined as string literals.

**Files:**
- Modify: `desktop/src/main/preload.ts`

- [ ] **Step 1: Find the existing `update` namespace in preload**

Run:
```bash
cd /c/Users/desti/youcoded-worktrees/update-installer
grep -n "update:" desktop/src/main/preload.ts | head -20
```
Note where `update:changelog` is exposed (`window.claude.update.getChangelog` or similar). Add the five new methods into the same `update` namespace object.

- [ ] **Step 2: Add the five new methods**

In `desktop/src/main/preload.ts`, inside the `update` namespace under `contextBridge.exposeInMainWorld('claude', ...)`, add these methods alongside the existing `getChangelog` (keep existing entries; do not remove anything):

```ts
  update: {
    // ...existing getChangelog (and any other entries) unchanged...
    download: () => ipcRenderer.invoke('update:download'),
    cancel: (jobId: string) => ipcRenderer.invoke('update:cancel', { jobId }),
    launch: (jobId: string, filePath: string) => ipcRenderer.invoke('update:launch', { jobId, filePath }),
    getCachedDownload: (version: string) => ipcRenderer.invoke('update:get-cached-download', { version }),
    onProgress: (handler: (ev: { jobId: string; bytesReceived: number; bytesTotal: number; percent: number }) => void) => {
      const wrap = (_event: unknown, ev: any) => handler(ev);
      ipcRenderer.on('update:progress', wrap);
      return () => ipcRenderer.removeListener('update:progress', wrap);
    },
  },
```

- [ ] **Step 3: Update the preload type in shared types if it exists**

Check whether there's a typed declaration of `window.claude` (e.g. in `desktop/src/shared/types.ts` or a `.d.ts` file) that mirrors preload's shape:

```bash
grep -n "update:" desktop/src/shared/types.ts desktop/src/renderer/*.d.ts 2>/dev/null
```

If there is a `WindowClaude` / `ClaudeAPI` interface with an `update` namespace, add the new method signatures alongside `getChangelog`:

```ts
update: {
  getChangelog: (...) => ...; // existing
  download: () => Promise<{ jobId: string; filePath: string; bytesTotal: number }>;
  cancel: (jobId: string) => Promise<{ success: boolean }>;
  launch: (jobId: string, filePath: string) => Promise<import('./update-install-types').UpdateLaunchResult>;
  getCachedDownload: (version: string) => Promise<import('./update-install-types').UpdateCachedDownload | null>;
  onProgress: (handler: (ev: import('./update-install-types').UpdateProgressEvent) => void) => () => void;
};
```

If no typed declaration exists, skip — the renderer will type-check against whatever pattern `UpdatePanel.tsx` already uses to reach `window.claude.update.getChangelog`.

- [ ] **Step 4: Typecheck**

Run:
```bash
cd desktop && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "preload\.ts|types\.ts" | head -20
```
Expected: No errors referencing the preload or types changes.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/desti/youcoded-worktrees/update-installer
git add desktop/src/main/preload.ts desktop/src/shared/types.ts
git commit -m "feat(update-installer): expose window.claude.update.{download,cancel,launch,onProgress,getCachedDownload}"
```

---

## Task 8: Remote-shim parity

**Responsibility:** Add the same five methods to `remote-shim.ts`. Remote browsers can't install desktop binaries into the desktop session — they return `{ success: false, error: 'remote-unsupported' }` stubs.

**Files:**
- Modify: `desktop/src/renderer/remote-shim.ts`

- [ ] **Step 1: Find the existing `update` namespace in remote-shim**

Run:
```bash
grep -n "update:" desktop/src/renderer/remote-shim.ts | head -20
```
Note where `update:changelog` is wired (probably a `getChangelog` property).

- [ ] **Step 2: Add stub methods in the same namespace**

In `desktop/src/renderer/remote-shim.ts`, inside the `update` namespace of the `claude` object, add these methods (keep existing `getChangelog`):

```ts
  update: {
    // ...existing getChangelog unchanged...
    download: async () => {
      throw new Error('remote-unsupported');
    },
    cancel: async (_jobId: string) => ({ success: false }),
    launch: async (_jobId: string, _filePath: string) => ({
      success: false as const,
      error: 'remote-unsupported' as const,
    }),
    getCachedDownload: async (_version: string) => null,
    onProgress: (_handler: (ev: any) => void) => {
      // No-op on remote browsers — they never emit progress.
      return () => {};
    },
  },
```

- [ ] **Step 3: Typecheck**

Run:
```bash
cd desktop && npx tsc --noEmit -p tsconfig.json 2>&1 | grep remote-shim | head -10
```
Expected: No errors in remote-shim.ts.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/desti/youcoded-worktrees/update-installer
git add desktop/src/renderer/remote-shim.ts
git commit -m "feat(update-installer): remote-shim stubs that reject with remote-unsupported"
```

---

## Task 9: Android stub

**Responsibility:** Android has no use case for this feature (updates via Play Store / sideload). But `SessionService.handleBridgeMessage()` logs "unknown type" for any message not in its `when` block — we add stub handlers so that noise doesn't appear on Android when a desktop-tree remote client accidentally tries to invoke these.

**Files:**
- Create: `app/src/main/kotlin/com/youcoded/app/runtime/UpdateInstallerStub.kt`
- Modify: `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt`

- [ ] **Step 1: Create the stub file**

Create `app/src/main/kotlin/com/youcoded/app/runtime/UpdateInstallerStub.kt`:

```kotlin
package com.youcoded.app.runtime

import org.json.JSONObject

// Android stub for the desktop in-app update installer.
// Mirrors the five IPC message types declared in
// desktop/src/shared/update-install-types.ts. Android updates via Play Store or
// direct APK sideload; this feature is desktop-only.
//
// Keep message type strings in sync with:
//   desktop/src/main/preload.ts (exposeInMainWorld: 'claude')
//   desktop/src/renderer/remote-shim.ts (claude.update.*)
//   desktop/src/main/ipc-handlers.ts (ipcMain.handle)
//   desktop/tests/update-install-ipc.test.ts (parity assertion)
object UpdateInstallerStub {
    fun unsupported(): JSONObject {
        return JSONObject().apply {
            put("success", false)
            put("error", "not-supported")
        }
    }
}
```

- [ ] **Step 2: Wire the five `when` cases in `SessionService.handleBridgeMessage`**

Find the large `when (msg.type)` block inside `handleBridgeMessage` in `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` (search for `"update:changelog"` to find the neighbourhood). Add these five cases near the existing update entry:

```kotlin
"update:download",
"update:cancel",
"update:launch",
"update:get-cached-download" -> {
    bridgeServer.respond(ws, msg.type, msg.id, UpdateInstallerStub.unsupported())
}
"update:progress" -> {
    // Push-event channel — no-op on Android. Desktop pushes these; Android
    // never subscribes because it never downloads desktop installers.
}
```

(Note: `update:progress` is a push event, so it does NOT use `bridgeServer.respond` — it's only a no-op consumer.)

- [ ] **Step 3: Verify Kotlin compiles**

Run the Android build's Kotlin syntax check (full Gradle compile is slow — a syntax check suffices here):

```bash
cd /c/Users/desti/youcoded-worktrees/update-installer
# Quick heuristic: ensure the file has no obvious syntax errors by grepping for common issues.
grep -n "UpdateInstallerStub" app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
```

Expected: finds the reference in `SessionService.kt`. If Destin wants to run a full `./gradlew assembleDebug`, that's optional at this stage — we'll do it in Task 12.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/desti/youcoded-worktrees/update-installer
git add app/src/main/kotlin/com/youcoded/app/runtime/UpdateInstallerStub.kt app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt
git commit -m "feat(update-installer): Android parity stubs (not-supported)"
```

---

## Task 10: IPC parity test

**Responsibility:** Extend the existing parity-test pattern so the five new channel strings must appear in `preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, and `SessionService.kt`. Catches drift before it ships.

**Files:**
- Create: `desktop/tests/update-install-ipc.test.ts`

- [ ] **Step 1: Write the parity test**

Create `desktop/tests/update-install-ipc.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// These five strings are the entire in-app-update IPC surface. If you add a
// sixth, add it here first and the test will tell you which files haven't
// been updated yet.
const CHANNELS = [
  'update:download',
  'update:cancel',
  'update:launch',
  'update:progress',
  'update:get-cached-download',
];

const ROOT = path.join(__dirname, '..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('in-app update installer IPC parity', () => {
  const preload = read('src/main/preload.ts');
  const shim    = read('src/renderer/remote-shim.ts');
  const handler = read('src/main/ipc-handlers.ts');
  const android = read('../app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt');

  for (const channel of CHANNELS) {
    it(`preload.ts references "${channel}"`, () => {
      expect(preload).toContain(channel);
    });
    it(`remote-shim.ts references "${channel}"`, () => {
      expect(shim).toContain(channel);
    });
    it(`ipc-handlers.ts references "${channel}"`, () => {
      expect(handler).toContain(channel);
    });
    it(`SessionService.kt references "${channel}"`, () => {
      expect(android).toContain(channel);
    });
  }
});
```

- [ ] **Step 2: Run the test — verify it passes**

Run:
```bash
cd desktop && npx vitest run tests/update-install-ipc.test.ts
```
Expected: All 20 assertions (5 channels × 4 files) pass.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/desti/youcoded-worktrees/update-installer
git add desktop/tests/update-install-ipc.test.ts
git commit -m "test(update-installer): IPC channel parity across preload/shim/handlers/android"
```

---

## Task 11: Rewrite `UpdatePanel.tsx` — state machine + morphing button

**Responsibility:** Replace `handleUpdate` with a local state machine that drives the button through `idle → downloading → ready → launching | error`. Subscribe to `onProgress` on mount and unsubscribe on unmount. Trigger `update:cancel` when the popup is closed mid-download.

**Files:**
- Modify: `desktop/src/renderer/components/UpdatePanel.tsx`

- [ ] **Step 1: Read the current file to understand the surrounding context**

Open `desktop/src/renderer/components/UpdatePanel.tsx`. Confirm:

- There's a `handleUpdate` function at roughly lines 64-69 that calls `shell.openExternal` and `onClose()`.
- The component has an `open: boolean` prop and an `onClose` callback.
- The "Update Now" `<button>` lives inside a `<footer>` block at roughly lines 140-150 with an `onClick={handleUpdate}` and label `Update Now: v{current} → v{latest}`.
- The props include `updateStatus: { current: string; latest: string; update_available: boolean; download_url: string | null }`.

- [ ] **Step 2: Add imports at the top of the file**

At the top of `UpdatePanel.tsx`, add (merging into existing React / hook imports):

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UpdateLaunchResult } from '../../shared/update-install-types';
```

(Adjust the relative path to `update-install-types` to match the actual depth — `UpdatePanel.tsx` is in `desktop/src/renderer/components/`, the types file is in `desktop/src/shared/`, so `../../shared/update-install-types` is correct.)

- [ ] **Step 3: Define the state machine inside the component**

Inside the `UpdatePanel` component body (above `handleUpdate`), add:

```tsx
type InstallState =
  | { kind: 'idle' }
  | { kind: 'downloading'; jobId: string | null; percent: number }
  | { kind: 'ready'; jobId: string; filePath: string }
  | { kind: 'launching' }
  | { kind: 'error'; code: string };

const [installState, setInstallState] = useState<InstallState>({ kind: 'idle' });
// Ref rather than state because the progress handler fires asynchronously and
// we want the freshest jobId without re-subscribing.
const activeJobIdRef = useRef<string | null>(null);

// Subscribe to download progress. Main broadcasts progress to every window;
// we rely on the main-side single-job invariant (only one download in flight
// at a time) so any progress event during `downloading` state is ours.
// The jobId is captured lazily from the first progress event, since
// `window.claude.update.download()` doesn't return its jobId until it resolves.
useEffect(() => {
  const unsub = window.claude.update.onProgress((ev) => {
    setInstallState(prev => {
      if (prev.kind !== 'downloading') return prev;
      if (!activeJobIdRef.current) activeJobIdRef.current = ev.jobId;
      return { kind: 'downloading', jobId: ev.jobId, percent: Math.max(0, ev.percent) };
    });
  });
  return unsub;
}, []);

// When the popup opens and a completed download is already cached for this
// version, jump straight to ready state (skip the re-download).
// Guard: only overwrite state if we're still in `idle` — don't race against
// a user-initiated download that already started.
useEffect(() => {
  if (!open) return;
  if (!updateStatus.update_available) return;
  let cancelled = false;
  (async () => {
    const cached = await window.claude.update.getCachedDownload(updateStatus.latest);
    if (cancelled || !cached) return;
    setInstallState(prev => prev.kind === 'idle'
      ? { kind: 'ready', jobId: 'cached', filePath: cached.filePath }
      : prev);
  })();
  return () => { cancelled = true; };
}, [open, updateStatus.update_available, updateStatus.latest]);

// When the popup closes, cancel any in-flight download and reset.
// Main's cancelDownload is a no-op if the job isn't active, so we don't need
// to check installState — keeping this effect's deps to [open] only.
useEffect(() => {
  if (open) return;
  if (activeJobIdRef.current) {
    window.claude.update.cancel(activeJobIdRef.current);
    activeJobIdRef.current = null;
  }
  setInstallState({ kind: 'idle' });
}, [open]);
```

- [ ] **Step 4: Rewrite `handleUpdate`**

Replace the existing `handleUpdate` function body with:

```tsx
const handleUpdate = useCallback(async () => {
  // If we already have a ready job, skip straight to launch.
  if (installState.kind === 'ready') {
    await runLaunch(installState.jobId, installState.filePath);
    return;
  }
  // Otherwise kick off a download.
  try {
    setInstallState({ kind: 'downloading', jobId: null, percent: 0 });
    const result = await window.claude.update.download();
    activeJobIdRef.current = result.jobId;
    setInstallState({ kind: 'ready', jobId: result.jobId, filePath: result.filePath });
  } catch (e: any) {
    const code = typeof e?.message === 'string' ? (e.message.split(':')[0] || 'network-failed') : 'network-failed';
    setInstallState({ kind: 'error', code });
  }
}, [installState]);

const runLaunch = useCallback(async (jobId: string, filePath: string) => {
  setInstallState({ kind: 'launching' });
  const result: UpdateLaunchResult = await window.claude.update.launch(jobId, filePath);
  if (!result.success) {
    setInstallState({ kind: 'error', code: result.error });
    return;
  }
  if ('fallback' in result && result.fallback === 'browser') {
    // .deb or missing-APPIMAGE — browser opened; close the popup.
    onClose();
    return;
  }
  // Happy path: main process will app.quit() in ~500ms. Leave the button in
  // "launching" state — the app is about to disappear.
}, [onClose]);

const handleFallbackBrowser = useCallback(async () => {
  if (updateStatus.download_url) {
    await window.claude.shell.openExternal(updateStatus.download_url);
  }
  onClose();
}, [onClose, updateStatus.download_url]);
```

- [ ] **Step 5: Replace the footer button block with the morphing button**

Find the existing footer button block (around `<button onClick={handleUpdate}` near lines 140-150). Replace just that `<button>` (and the `Update Now: v...` label) with this block, keeping whatever `<footer>` wrapper / secondary buttons exist around it:

```tsx
<button
  onClick={handleUpdate}
  disabled={installState.kind === 'downloading' || installState.kind === 'launching'}
  className="px-4 py-2 rounded-sm bg-accent text-on-accent font-medium hover:opacity-90 disabled:opacity-60"
>
  {installState.kind === 'idle' && `Update Now: v${updateStatus.current} → v${updateStatus.latest}`}
  {installState.kind === 'downloading' && (
    installState.percent >= 0 ? `Downloading ${installState.percent}%…` : 'Downloading…'
  )}
  {installState.kind === 'ready' && 'Launch Installer'}
  {installState.kind === 'launching' && 'Launching…'}
  {installState.kind === 'error' && 'Launch failed — Retry'}
</button>
{installState.kind === 'error' && (
  <div className="text-xs text-fg-dim mt-2">
    <button
      onClick={handleFallbackBrowser}
      className="underline hover:text-fg"
    >
      Open in browser instead
    </button>
  </div>
)}
```

- [ ] **Step 6: Typecheck + existing component tests**

Run:
```bash
cd desktop && npx tsc --noEmit -p tsconfig.json 2>&1 | grep UpdatePanel | head -10
```
Expected: no errors in UpdatePanel.tsx.

```bash
cd desktop && npx vitest run tests/update-panel.test.tsx
```
Expected: Existing UpdatePanel component tests still pass. If the test file mocks `window.claude.update.getChangelog` but NOT the new methods we call (`onProgress`, `getCachedDownload`, `download`, `cancel`, `launch`), it may fail with "window.claude.update.onProgress is not a function." If so, extend the test's mock with no-op versions of the new methods (return `() => {}` for `onProgress`, `null` for `getCachedDownload`, etc.). Do NOT delete any existing assertions.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/desti/youcoded-worktrees/update-installer
git add desktop/src/renderer/components/UpdatePanel.tsx desktop/tests/update-panel.test.tsx
git commit -m "feat(update-installer): UpdatePanel state machine + morphing Update Now button"
```

---

## Task 12: Dev fake-update extension

**Responsibility:** When `YOUCODED_DEV_FAKE_UPDATE` is set (and `!app.isPackaged`), the download handler serves a bundled ~1 MB dummy installer instead of fetching from GitHub, and the launch handler calls `shell.showItemInFolder` instead of actually spawning the installer. Lets Destin exercise the full flow in dev without a real release or accidentally launching installers.

**Files:**
- Create: `desktop/dev-assets/fake-installer.exe` (~1 MB of zeros, placeholder)
- Create: `desktop/dev-assets/fake-installer.dmg`
- Create: `desktop/dev-assets/fake-installer.AppImage`
- Create: `desktop/dev-assets/README.md`
- Modify: `desktop/src/main/ipc-handlers.ts`

- [ ] **Step 1: Create the dev-assets directory with a small dummy per platform**

Run:
```bash
cd /c/Users/desti/youcoded-worktrees/update-installer
mkdir -p desktop/dev-assets
# 1 MB of zeros works as a plausible installer-sized payload without bloating the repo.
node -e "require('fs').writeFileSync('desktop/dev-assets/fake-installer.exe', Buffer.alloc(1024*1024))"
node -e "require('fs').writeFileSync('desktop/dev-assets/fake-installer.dmg', Buffer.alloc(1024*1024))"
node -e "require('fs').writeFileSync('desktop/dev-assets/fake-installer.AppImage', Buffer.alloc(1024*1024))"
```

Expected: three 1 MB files under `desktop/dev-assets/`.

- [ ] **Step 2: Document the dev-assets dir**

Create `desktop/dev-assets/README.md`:

```markdown
# Dev-only fake installers

These 1 MB zero-filled files are used by the `YOUCODED_DEV_FAKE_UPDATE` dev flag to exercise the in-app update download+launch flow without fetching from GitHub or actually launching a real installer.

The dev-mode launch handler calls `shell.showItemInFolder` on these files instead of spawning them — so setting the flag is safe.

Flag is gated on `!app.isPackaged`, so these files are never touched in a packaged build.
```

- [ ] **Step 3: Wire the dev flag into the IPC handlers**

In `desktop/src/main/ipc-handlers.ts`, find the `ipcMain.handle('update:download', ...)` block you added in Task 6. Replace it with this dev-aware version:

```ts
  const devFakeUpdate = !app.isPackaged && process.env.YOUCODED_DEV_FAKE_UPDATE === '1';

  ipcMain.handle('update:download', async () => {
    if (devFakeUpdate) {
      // Copy the bundled dummy installer into the cache dir so the real
      // launch-handler code path exercises the same file-move logic it would
      // hit in prod. Emits one 100% progress event for the renderer's benefit.
      const ext = process.platform === 'win32' ? '.exe'
               : process.platform === 'darwin' ? '.dmg'
               : '.AppImage';
      // app.getAppPath() resolves to the desktop/ root (where package.json lives),
      // which is where the dev-assets/ directory sits. More robust than __dirname
      // across dev build variations (tsc watch vs esbuild).
      const srcPath = path.join(app.getAppPath(), 'dev-assets', `fake-installer${ext}`);
      if (!fs.existsSync(updateCacheDir)) fs.mkdirSync(updateCacheDir, { recursive: true });
      const dstPath = path.join(updateCacheDir, `YouCoded-fake-dev${ext}`);
      fs.copyFileSync(srcPath, dstPath);
      const bytesTotal = fs.statSync(dstPath).size;
      const jobId = `dev-${Date.now()}`;
      // One synchronous 100% progress event so the renderer sees the full arc.
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('update:progress', { jobId, bytesReceived: bytesTotal, bytesTotal, percent: 100 });
      }
      return { jobId, filePath: dstPath, bytesTotal };
    }
    const status = getUpdateStatus();
    const url = status?.download_url;
    if (!url) throw new UpdateInstallError('url-rejected', 'no download URL available');
    return await installer.startDownload(url);
  });
```

Also add a top-of-file import for `fs`:

```ts
import fs from 'fs';
```

(Merge with any existing `fs` import; don't duplicate.)

- [ ] **Step 4: Wrap the launch handler similarly**

Replace the `ipcMain.handle('update:launch', ...)` block with:

```ts
  ipcMain.handle('update:launch', async (_event, payload: { jobId: string; filePath: string }) => {
    if (devFakeUpdate) {
      // Never actually launch anything in dev — just surface the cached file
      // in the OS file manager so Destin can confirm it exists.
      shell.showItemInFolder(payload.filePath);
      // Return the happy-path shape so the renderer flips to "launching" state,
      // but we do NOT schedule app.quit() — that would kill the dev session.
      return { success: true, quitPending: false, fallback: 'browser' as const };
    }
    const result = await launchInstaller({ jobId: payload.jobId, filePath: payload.filePath });
    if (result.success && result.quitPending) {
      setTimeout(() => app.quit(), 500);
    }
    return result;
  });
```

- [ ] **Step 5: Smoke-test the dev flag manually**

Run:
```bash
cd /c/Users/desti/youcoded-dev
# Launch dev instance with fake-update flag set
YOUCODED_DEV_FAKE_UPDATE=1 bash scripts/run-dev.sh
```

In the running YouCoded Dev window:
- Click the version pill → UpdatePanel should open.
- Click "Update Now" → button should flash "Downloading 100%…" briefly then "Launch Installer".
- Click "Launch Installer" → an OS file-manager window should open showing the copied dummy installer in `{userData}/update-cache/YouCoded-fake-dev.<ext>`.
- The dev app should NOT quit.

Expected: All three steps work. Close the dev app when done.

- [ ] **Step 6: Typecheck**

Run:
```bash
cd desktop && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "ipc-handlers\.ts" | head -10
```
Expected: no errors in ipc-handlers.ts.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/desti/youcoded-worktrees/update-installer
git add desktop/dev-assets/ desktop/src/main/ipc-handlers.ts
git commit -m "feat(update-installer): YOUCODED_DEV_FAKE_UPDATE extension with bundled dummy installers"
```

---

## Task 13: Add entry to cc-dependencies.md (if applicable)

**Responsibility:** Per `docs/PITFALLS.md` → "Cross-Platform" section: when you add CC-coupled code, add an entry to `youcoded/docs/cc-dependencies.md`. The update installer itself is NOT CC-coupled (it reads GitHub Releases, not anything from Claude Code). Skip this task unless the implementation surfaced a CC coupling I didn't anticipate — in which case add an entry documenting it.

**Files:**
- Potentially: `youcoded/docs/cc-dependencies.md`

- [ ] **Step 1: Confirm nothing CC-coupled was added**

Run:
```bash
cd /c/Users/desti/youcoded-worktrees/update-installer
grep -R -l "\.claude\|transcript\|hook-relay\|installed_plugins\|claude -p" desktop/src/main/update-installer.ts desktop/src/main/ipc-handlers.ts 2>/dev/null
```
Expected: no matches inside `update-installer.ts`. `ipc-handlers.ts` has many pre-existing matches but none should be inside the handler blocks you added in Task 6 and Task 12.

- [ ] **Step 2: Skip if nothing CC-coupled was added**

If the grep is clean, skip this task with no commit.

If somehow a coupling was added (unexpected), read `desktop/docs/cc-dependencies.md` (if present) or `youcoded/docs/cc-dependencies.md` and add a single entry describing the touchpoint.

---

## Task 14: Final verification — full test suite, typecheck, manual per-platform smoke

**Responsibility:** Confirm nothing broke, then do the manual test-matrix walk from the spec before pushing.

**Files:** none new.

- [ ] **Step 1: Run all desktop tests**

Run:
```bash
cd /c/Users/desti/youcoded-worktrees/update-installer/desktop && npx vitest run
```
Expected: All tests pass. If `update-panel.test.tsx` or `shim-parity.test.ts` fail due to mocks not covering new methods, extend those test files' mocks with no-op defaults for the new methods.

- [ ] **Step 2: Full typecheck**

Run:
```bash
cd /c/Users/desti/youcoded-worktrees/update-installer/desktop && npx tsc --noEmit -p tsconfig.json
```
Expected: exit 0. Pre-existing errors in files you didn't modify are acceptable; errors in files you touched are not.

- [ ] **Step 3: Manual test — Windows happy path (`YOUCODED_DEV_FAKE_UPDATE=1`)**

With the dev fake-update flag set, click-through the popup and verify the button morph: `Update Now` → `Downloading 100 %` → `Launch Installer` → file-manager opens on the dummy installer, app stays running.

- [ ] **Step 4: Manual test — error path**

Temporarily comment out the dev-fake branch so the real download code runs, then point it at a bogus URL to trigger `network-failed`. Verify the button flips to "Launch failed — Retry" with an "Open in browser instead" secondary link. Un-comment the dev branch when done.

- [ ] **Step 5: Manual test — cached-download path**

With `YOUCODED_DEV_FAKE_UPDATE=1`, click Update Now → wait for Ready → close the popup (DO NOT click Launch). Reopen the popup: button should read "Launch Installer" immediately (cache hit), no re-download.

- [ ] **Step 6: Manual test — cancel mid-download**

Temporarily remove the dev-fake fast-path so the real download flow runs. Start a download of the actual latest release, close the popup mid-download. Check `{userData}/update-cache/` — no `.partial` file should remain.

- [ ] **Step 7: Push branch + open PR**

```bash
cd /c/Users/desti/youcoded-worktrees/update-installer
git push -u origin feat/update-installer
gh pr create --title "In-app update installer (download + launch)" --body "$(cat <<'EOF'
## Summary
- Replaces `UpdatePanel.tsx`'s `shell.openExternal(download_url)` with an in-app download-and-launch flow
- New main-process module `update-installer.ts` owns download/cancel/launch + 250ms/5% progress throttling
- Five new IPC channels, with parity across preload/remote-shim/ipc-handlers/android stub (enforced by a new parity test)
- Morphing button: idle → downloading % → ready → launching; error state shows Retry + "Open in browser" fallback
- `.deb` and missing-APPIMAGE cases fall back to `shell.openExternal`, app keeps running
- Startup sweep: `.partial` deleted unconditionally, stale downloads > 24 h deleted
- `YOUCODED_DEV_FAKE_UPDATE=1` gives a safe dev loop via bundled dummy installers + `shell.showItemInFolder`

Spec: `docs/superpowers/specs/2026-04-22-in-app-update-installer-design.md`

## Test plan
- [x] Vitest suite green (new tests + no regressions)
- [x] Typecheck green on modified files
- [x] Manual: Windows dev-fake happy path, error → browser fallback, cache-hit re-open, cancel mid-download
- [ ] Manual: Windows real installer (run installed-build signing check)
- [ ] Manual: macOS arm64 real installer
- [ ] Manual: Linux AppImage self-replace

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 8: Clean up worktree after PR merges**

Per workspace CLAUDE.md:

```bash
cd /c/Users/desti/youcoded-dev/youcoded
# Verify the commit landed on master first
git branch --contains $(git rev-parse feat/update-installer)
# Expected: list includes master
git worktree remove /c/Users/desti/youcoded-worktrees/update-installer
git branch -D feat/update-installer
```

---

## Summary

Tasks 1-14 ship a working in-app update installer:

- **Pure functions (Tasks 2, 4)** — URL validation, filename derivation, cache sweep, cached-download lookup. 100 % TDD; easy to audit.
- **Download engine (Task 3)** — Stream + throttled progress + single-job + cancellation. Tested via injected fake HTTPS.
- **Launch engine (Task 5)** — Per-platform spawn/relaunch branches with a 2 s quick-exit window for macOS. Tested via injected fake spawn.
- **IPC wiring (Tasks 6-9)** — Main registers five handlers, preload exposes them, remote-shim stubs them, Android stubs them — with a parity test (Task 10).
- **Renderer (Task 11)** — `UpdatePanel.tsx` gains the state machine and morphing button; closes cancel when popup dismissed mid-download; cached-download detected on reopen.
- **Dev tooling (Task 12)** — `YOUCODED_DEV_FAKE_UPDATE=1` gives a safe, end-to-end exercise path without real releases or real installers.
- **Verification (Task 14)** — Test matrix before push; worktree cleanup after merge.
