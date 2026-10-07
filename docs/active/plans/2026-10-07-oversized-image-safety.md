---
title: Oversized images — admission gate, shrink-once preparation, bounded recovery
status: active
date: 2026-10-07
---

# Oversized Image Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A picture that is too big for the current model can never enter, re-enter or stay in a native conversation's model memory — on first read, on reopen, after a model switch or before a summary — and a conversation already blocked by one recovers with one bounded retry instead of `/clear`.

**Architecture:** Safety is a property of what is *admitted* to canonical history, decided once per picture: the Read tool and the composer shrink an over-budget picture to a real cached file before it is promised (the persisted path *is* the derivative; a composer message keeps its original paths for the UI in `attachments` and records the model-facing ones in a new `modelAttachments`), the ONE shared disk reader refuses anything over the session's provider limits by reading the image header (so the live driver, reopen, the portable checkpoint and the private checkpoint all agree, byte for byte, on one note), the harness re-applies those limits to history whenever the provider changes and before any summary, and the step loop recognises OpenAI's exact "patches" rejection as a last-resort safety net: collapse the offending parts to that same note, retry once. Nothing is transformed at request-build time and the original file on disk is never modified.

**Tech Stack:** TypeScript, Node `worker_threads` (decode/resize off the main thread; Electron's `nativeImage` is NOT available in a utility process — `namespace Utility` in `electron.d.ts` lines 25467+ exports only `net`, `parentPort`, `systemPreferences`), two pure-JS, install-script-free dependencies `pngjs` and `jpeg-js` (so `allowScripts` in `package.json` is untouched), an own area-average (box) downscale over RGBA, vitest, AI SDK v7 message shapes as used by `harness-session.ts`.

## Why this shape (read before changing the design)

- **Three resume paths re-read pictures by path:** `rebuildHistoryWithOrigins`, `restorePortableHistory` (both via `readImageFromDisk`) and the private checkpoint (`accepted-history-store.ts` `restoreImage`, which re-reads the file and compares a digest of the bytes the model saw). A request-time shrink would be undone by every one of them, or would make checkpoints unpublishable (`unreferenced-history`). So the derivative is a real file and the persisted model-facing path *is* the derivative.
- **The main process never blocks** (`.claude/rules/performance.md` rule 1; `tests/main-blocking-calls.test.ts` ratchet). Decoding a 2,904×17,528 PNG is ~200 MB of pixels (`pngjs` holds width×height×4 bytes): it happens in a worker thread that is terminated after each job so that memory returns. The sync reader keeps exactly its current one `statSync` + one `readFileSync` (allowlist counts for `readImageFromDisk` must not grow); dimensions are parsed from the bytes it already read.
- **Limits are provider-type facts, never model-name facts** (`.claude/rules/native-runtime.md`). Only ONE number is verified: OpenAI/ChatGPT rejected 49,868 patches with "limit of 30000" (session `e45bcfaf…`, 2026-10-06). Every other number below is a conservative placeholder and says so.
- **One label everywhere:** every note names the picture by its file BASENAME, at every site (live driver, rebuild, portable restore, collapse, the store's recompute), so live and resumed histories are identical and a checkpoint can describe either.
- **Honesty:** every refusal/shrink is disclosed in the text the model sees (`docs/error-message-standards.md`); a refused picture is never replaced by the oversized original; an attachment that cannot be delivered gets a note, never silence.

## Global Constraints

- Branches: workspace worktree `/home/destin/youcoded-dev/worktrees/sessions/image-patch-recovery` is on `session/image-patch-recovery`; app worktree `/home/destin/youcoded-dev/worktrees/sessions/image-patch-recovery/youcoded` is on `session/image-patch-recovery`. App code commits go to the app worktree; this plan and workspace docs (`docs/MAP.md`) to the workspace worktree. Push each branch after its first commit (`git push -u origin session/image-patch-recovery`).
- All app paths below are relative to `/home/destin/youcoded-dev/worktrees/sessions/image-patch-recovery/youcoded/desktop/`. Run tests from that directory: `npx vitest run tests/<file>.test.ts`. Node here is v26.4.0.
- Stage by explicit path. Never `git add -A`. Never touch Destin's running app, the live transcript `~/.youcoded/sessions/-home-destin-youcoded-dev/e45bcfaf-cedc-44e6-bc55-856e6e1f9de9.jsonl` or its `.bak-before-image-removal` sibling, or the original contact sheet.
- `tests/main-blocking-calls.allowlist.json` may only shrink. New disk work is `fs.promises` or inside the worker thread.
- Dependencies: `pngjs` and `jpeg-js` are added to `dependencies` (runtime, packaged), `@types/pngjs` to `devDependencies`. Both are pure JS with no install scripts, so `allowScripts` stays as it is. Install in the worktree only; the worktree's `node_modules` is a hardlink farm of the shared checkout's (`docs/PITFALLS.md` → Worktrees), so after `npm install` confirm nothing was edited in place: `stat -c %h node_modules/.package-lock.json` must print `1`. Commit `package.json` and `package-lock.json`.
- Every non-trivial edit carries a WHY comment. No new UI screens or controls; the only user-visible copy is tool-result/model-facing note text and the existing session-error card.
- Test hygiene (`.claude/rules/test-suite-hygiene.md`): titles state behaviour, never a date or task id; no fixed sleeps — gate with a deferred promise; teardown `rmSync` carries `maxRetries`; a heavy fixture gets a named budget constant.
- Constants (one owner each): `IMAGE_PATCH_PX = 32` (`image-support.ts`); `MAX_DECODE_PIXELS = 80_000_000`, `HEADER_READ_BYTES = 256 * 1024`, `PREPARE_MARGIN = 0.9` (`image-prepare.ts`); `IMAGE_LIMITS_OPENAI = { maxEdgePx: 8192, maxPatches: 30_000 }`, `IMAGE_LIMITS_DEFAULT = { maxEdgePx: 4096, maxPatches: 16_384 }` (`capability-profile.ts`). There is NO flat preparation target: a picture is shrunk only when it fails `withinImageLimits` for the session's limits, to the largest size fitting BOTH limits with a 10% margin.
- Note wording (one owner, `image-support.ts` `imageNote`/`parseImageNote`; the store parses it back exactly):
  - `[image not attached: <basename> is <W>×<H> px, above this model's image size limit]`
  - `[image not attached: <basename> could not be read]` / `… exceeds the 10 MB per-image size limit]` / `… is not a deliverable image format]` / `… could not be downscaled for the model]` or `… could not be downscaled for the model: <reason>]`
- Notes are for PICTURES only: a non-image attachment (PDF, text, anything without a deliverable or known-undeliverable image extension) is skipped silently exactly as today, so ordinary attachments keep today's prompt text and checkpoint shape.
- Test fixtures (PNG/JPEG/GIF/WebP header builders, one real pngjs writer) live ONLY in `tests/helpers/image-fixtures.ts`; no test imports another `.test.ts` file.
- Finish with `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/image-patch-recovery/youcoded` from the workspace worktree, plus `npm run knip`, `npm run lint`, `npm run typecheck` in `desktop/`. Android needs nothing: the native runtime runs only on the computer (no image reader under `app/`, verified 2026-10-07).

## File structure

| File | Responsibility |
|---|---|
| `src/main/harness/capability-profile.ts` (modify) | `ImageLimits`, `imageLimitsFor(providerType)`, `imageLimits` profile field |
| `src/main/harness/image-support.ts` (modify) | header parsing, `patchCount`, `withinImageLimits`, `ImageNote` writer/parser, gated `readImageFromDisk` returning a result union |
| `src/main/harness/image-prepare.ts` (new) | `prepareTarget(w,h,limits)`, `derivativeName`, `ImagePreparer` (cache dir, in-flight map, injected resize) |
| `src/main/image-resize-worker.ts` (new) | worker-thread body: pngjs/jpeg-js decode → box downscale → encode; `runResizeJob` exported for in-process tests |
| `src/main/image-resize-service.ts` (new) | spawns one `worker_threads` Worker per job, terminates it after, timeout → null; returns a `ResizeFn` |
| `src/shared/transcript-event-types.ts` (modify) | `UserMessageData.modelAttachments?: string[]` |
| `src/main/harness/busy-message-boundary.ts` (modify) | `appendUserHistory` takes model-facing paths and note parts |
| `src/main/harness/harness-session.ts` (modify) | reader call sites with basename notes; `send(text, attachments, modelAttachments)`; `enforceImageLimits()`; `collapseOversizedImages()`; the bounded retry; `ctx.imageLimits` |
| `src/main/harness/history-rebuild.ts` (modify) | reader type; `modelAttachments`; basename notes; attachment note parts |
| `src/main/harness/native-session-host.ts` (modify) | threads limits into every resume path; carries `modelAttachments` through send/queue; `imageLimitsFor(sessionId)` |
| `src/main/harness/accepted-history-store.ts` (modify) | `image-oversized`; `pruned.oversized` for text AND mixed `content` results; `note` part descriptor; `modelAttachments` in `findAttachment` |
| `src/main/harness/tools/types.ts`, `tools/read.ts` (modify) | `ToolServices.images`, `ToolContext.imageLimits`; prepare-before-promise + disclosure |
| `src/main/create-runtime.ts`, `src/main/ipc/native.ts` (modify) | construct the preparer; per-session serialised preparation before `send` |
| `src/main/providers/image-too-large.ts` (new) | the narrow classifier (three body shapes) |
| `tests/helpers/image-fixtures.ts` (new) | header builders + a real pngjs fixture writer |

---

### Task 1: Provider-type image limits on the capability profile

**Files:**
- Modify: `src/main/harness/capability-profile.ts` (`CapabilityProfile` interface starts at line 13; `nativeImageToolResults` at 48; `ProfileProviderType` 90; `CLOUD_DEFAULT` 163-191; `localFallback` 340-375; `resolveProfile` 427-487)
- Test: `tests/capability-profile.test.ts`

**Interfaces:**
- Produces: `export interface ImageLimits { maxEdgePx: number; maxPatches: number }`, `export const IMAGE_LIMITS_OPENAI`, `export const IMAGE_LIMITS_DEFAULT`, `export function imageLimitsFor(t: ProfileProviderType): ImageLimits`, `CapabilityProfile.imageLimits: ImageLimits` (required).

- [ ] **Step 1: Write the failing test** — append to `tests/capability-profile.test.ts`:

```ts
describe('resolveProfile — imageLimits is a provider-type fact', () => {
  it('OpenAI and Sign-in-with-ChatGPT share the one verified patch budget', () => {
    for (const providerType of ['openai', 'chatgpt'] as const) {
      expect(resolveProfile({ providerType, modelId: 'x', contextLength: null }).imageLimits).toEqual({ maxEdgePx: 8192, maxPatches: 30_000 });
    }
  });
  it('every other provider type gets the conservative default, local and registry-matched included', () => {
    for (const providerType of ['anthropic', 'google', 'openrouter', 'openai-compatible'] as const) {
      expect(resolveProfile({ providerType, modelId: 'x', contextLength: null }).imageLimits).toEqual({ maxEdgePx: 4096, maxPatches: 16_384 });
    }
    expect(resolveProfile(local('mystery-3b', 8_192)).imageLimits).toEqual({ maxEdgePx: 4096, maxPatches: 16_384 });
    expect(resolveProfile(local('qwen2.5-7b-instruct', 32_768)).imageLimits).toEqual({ maxEdgePx: 4096, maxPatches: 16_384 });
  });
  it('CLOUD_DEFAULT carries the conservative default, never the OpenAI budget', () => {
    expect(CLOUD_DEFAULT.imageLimits).toEqual({ maxEdgePx: 4096, maxPatches: 16_384 });
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/capability-profile.test.ts` → FAIL (`imageLimits` undefined).

- [ ] **Step 3: Implement** — below `ProfileProviderType` (line 90):

```ts
/** How big a picture this provider type accepts in ONE request. Patches are
 *  32-px tiles, rounded UP per axis (image-support.ts patchCount). PROVIDER-
 *  TYPE fact like nativeImageToolResults: computed in resolveProfile, spread
 *  over every base, never read off a registry entry.
 *  WHY two rows: the only number ever measured is OpenAI's "requires 49868
 *  patches after processing, exceeding the limit of 30000" (ChatGPT route,
 *  2026-10-06). Every other value is a deliberately conservative placeholder —
 *  wrong-high fails the whole turn with a provider error, wrong-low only means
 *  a picture is downscaled further than needed. Raise a row only with a
 *  captured provider response. */
export interface ImageLimits { maxEdgePx: number; maxPatches: number }
/** OpenAI's wire (direct key and Sign in with ChatGPT). maxPatches VERIFIED.
 *  maxEdgePx is NOT: no edge-length rejection was ever captured; 8192 is an
 *  explicit, conservative guess kept above 30,000 patches' natural reach
 *  (a 30,000-patch picture of any aspect ratio up to about 1:7 is already
 *  patch-bound first), so the one verified limit stays the binding one. */
export const IMAGE_LIMITS_OPENAI: ImageLimits = { maxEdgePx: 8192, maxPatches: 30_000 };
/** Everyone else. 4096² = 16,384 patches, below every published limit we know
 *  of (Anthropic documents 8000 px per side); unverified against a live reply. */
export const IMAGE_LIMITS_DEFAULT: ImageLimits = { maxEdgePx: 4096, maxPatches: 16_384 };
export function imageLimitsFor(t: ProfileProviderType): ImageLimits {
  return t === 'openai' || t === 'chatgpt' ? IMAGE_LIMITS_OPENAI : IMAGE_LIMITS_DEFAULT;
}
```

In the `CapabilityProfile` interface, right after `nativeImageToolResults: boolean;` (line 48): `/** Admission limits for pictures (see ImageLimits). Provider-type fact. */ imageLimits: ImageLimits;`. Add `imageLimits: IMAGE_LIMITS_DEFAULT,` to `CLOUD_DEFAULT` and to `localFallback`'s object (each with `// Placeholder like nativeImageToolResults: resolveProfile spreads imageLimitsFor() over this.`). In `resolveProfile`, after `const nativeImageToolResults = …` add `const imageLimits = imageLimitsFor(d.providerType);` and add `imageLimits` to all three return sites (454, 458, and the object at 485).

- [ ] **Step 4: Run** — PASS; `npm run typecheck` clean (only `capability-profile.ts` builds full profile literals; `tests/wire-adapter.test.ts` builds `WireImageCaps`).

- [ ] **Step 5: Commit** (app worktree):

```bash
git add src/main/harness/capability-profile.ts tests/capability-profile.test.ts
git commit -m "harness: per-provider-type image limits on the capability profile"
git push -u origin session/image-patch-recovery
```

---

### Task 2: Fixtures, header parsing, the note family, the gated reader

**Files:**
- Create: `tests/helpers/image-fixtures.ts`
- Modify: `src/main/harness/image-support.ts` (whole file, 46 lines)
- Test: `tests/image-support.test.ts` (its `mkTmpDir`/`tmpDirs` live INSIDE the top-level `describe('image-support', …)` at line 14 — every new `describe` below goes inside that block, after the existing `it`s)

**Interfaces:**
- Fixtures (`tests/helpers/image-fixtures.ts`): `pngHeader(w,h): Buffer` (33 bytes), `jpegHeader(w,h,leadingSegments=0)`, `gifHeader(w,h)`, `webpVp8Header(w,h)`, `webpVp8lHeader(w,h)`, `webpVp8xHeader(w,h)`, and `writeRealPng(file: string, w: number, h: number): void` (a genuine pngjs-encoded gradient, used by Task 6).
- `image-support.ts` produces:
  - `export const IMAGE_PATCH_PX = 32`; `patchCount(width, height)`; `withinImageLimits(dims, limits)`; `imageDimensions(buf): {width,height} | null`
  - `export type ImageNote = { kind: 'oversized'; label: string; width: number; height: number } | { kind: 'unavailable'; label: string; reason: 'missing' | 'too-many-bytes' | 'undeliverable' | 'prepare-failed'; detail?: string }` (`detail` only for `prepare-failed`: the preparer's reason)
  - `export function imageNote(n: ImageNote): string`; `export function parseImageNote(line: string): ImageNote | null`
  - `export type ImageReadResult = { ok: true; mediaType: string; data: Buffer; width?: number; height?: number } | { ok: false; reason: 'undeliverable' | 'missing' | 'too-many-bytes' | 'oversized'; width?: number; height?: number }`
  - `export function readImageFromDisk(absPath: string, limits?: ImageLimits): ImageReadResult` (same one stat + one read)
- Consumes: `ImageLimits` (Task 1).

- [ ] **Step 1: Fixtures** — `tests/helpers/image-fixtures.ts`:

```ts
// Header-only image fixtures: a few dozen bytes that CLAIM a size, so tests can
// prove the gate judges pixels, not file bytes. writeRealPng is the one real
// encoder, for the resize path.
import * as fs from 'fs';
import { PNG } from 'pngjs';

/** PNG signature + IHDR claiming w×h — 33 bytes, no pixels. */
export function pngHeader(w: number, h: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
/** SOI, `leadingSegments` 102-byte APP1 segments, then SOF0 — SOF must be found past them. */
export function jpegHeader(w: number, h: number, leadingSegments = 0): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];
  for (let i = 0; i < leadingSegments; i++) { const seg = Buffer.alloc(102); seg[0] = 0xff; seg[1] = 0xe1; seg.writeUInt16BE(100, 2); parts.push(seg); }
  parts.push(Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03]));
  return Buffer.concat(parts);
}
export function gifHeader(w: number, h: number): Buffer {
  const b = Buffer.alloc(13); b.write('GIF89a', 0); b.writeUInt16LE(w, 6); b.writeUInt16LE(h, 8); return b;
}
export function webpVp8Header(w: number, h: number): Buffer {
  const b = Buffer.alloc(30); b.write('RIFF', 0); b.writeUInt32LE(22, 4); b.write('WEBP', 8); b.write('VP8 ', 12); b.writeUInt32LE(10, 16);
  b[23] = 0x9d; b[24] = 0x01; b[25] = 0x2a; b.writeUInt16LE(w, 26); b.writeUInt16LE(h, 28); return b;
}
export function webpVp8lHeader(w: number, h: number): Buffer {
  const b = Buffer.alloc(30); b.write('RIFF', 0); b.write('WEBP', 8); b.write('VP8L', 12); b[20] = 0x2f;
  b.writeUInt32LE(((h - 1) << 14) | (w - 1), 21); return b;
}
export function webpVp8xHeader(w: number, h: number): Buffer {
  const b = Buffer.alloc(30); b.write('RIFF', 0); b.write('WEBP', 8); b.write('VP8X', 12); b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b;
}
/** A real, decodable PNG (diagonal gradient) — the only fixture with pixels. */
export function writeRealPng(file: string, w: number, h: number): void {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    png.data[i] = (x * 255) / w; png.data[i + 1] = (y * 255) / h; png.data[i + 2] = 128; png.data[i + 3] = 255;
  }
  fs.writeFileSync(file, PNG.sync.write(png));
}
```

Add the dependencies now (Task 6 needs them too): `npm install --no-audit --no-fund pngjs@^7.0.0 jpeg-js@^0.4.4 && npm install --no-audit --no-fund -D @types/pngjs@^6.0.5`, then `stat -c %h node_modules/.package-lock.json` → `1`. Neither package has install scripts; `allowScripts` is unchanged.

- [ ] **Step 2: Write the failing tests** — inside the existing top-level `describe('image-support', …)` of `tests/image-support.test.ts`, after its last `it`. Imports at the top of the file: add `imageDimensions, patchCount, withinImageLimits, imageNote, parseImageNote, IMAGE_PATCH_PX, type ImageNote` to the existing `image-support` import; `import { IMAGE_LIMITS_OPENAI } from '../src/main/harness/capability-profile';`; `import { pngHeader, jpegHeader, gifHeader, webpVp8Header, webpVp8lHeader, webpVp8xHeader } from './helpers/image-fixtures';`.

```ts
  describe('imageDimensions reads the header of every deliverable format', () => {
    it('PNG', () => expect(imageDimensions(pngHeader(2904, 17528))).toEqual({ width: 2904, height: 17528 }));
    it('JPEG, with SOF past leading APP segments', () => {
      expect(imageDimensions(jpegHeader(640, 480))).toEqual({ width: 640, height: 480 });
      expect(imageDimensions(jpegHeader(640, 480, 3))).toEqual({ width: 640, height: 480 });
    });
    it('GIF', () => expect(imageDimensions(gifHeader(320, 200))).toEqual({ width: 320, height: 200 }));
    it('WebP VP8 / VP8L / VP8X', () => {
      expect(imageDimensions(webpVp8Header(1000, 700))).toEqual({ width: 1000, height: 700 });
      expect(imageDimensions(webpVp8lHeader(1000, 700))).toEqual({ width: 1000, height: 700 });
      expect(imageDimensions(webpVp8xHeader(5000, 3000))).toEqual({ width: 5000, height: 3000 });
    });
    it('returns null for junk and truncated input — never throws', () => {
      expect(imageDimensions(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
      expect(imageDimensions(Buffer.from('hello'))).toBeNull();
      expect(imageDimensions(Buffer.alloc(0))).toBeNull();
    });
  });

  describe('patch budget and the note family', () => {
    it('rounds UP per axis — the real contact sheet is 49,868 patches', () => {
      expect(IMAGE_PATCH_PX).toBe(32);
      expect(patchCount(2904, 17528)).toBe(49_868);
      expect(patchCount(32, 32)).toBe(1);
      expect(patchCount(33, 33)).toBe(4);
    });
    it('withinImageLimits checks both the edge and the patch product', () => {
      expect(withinImageLimits({ width: 2904, height: 17528 }, IMAGE_LIMITS_OPENAI)).toBe(false);
      expect(withinImageLimits({ width: 9000, height: 10 }, IMAGE_LIMITS_OPENAI)).toBe(false);
      expect(withinImageLimits({ width: 4096, height: 4096 }, IMAGE_LIMITS_OPENAI)).toBe(true);
    });
    it('every note is one line the store can parse back exactly', () => {
      const notes: ImageNote[] = [
        { kind: 'oversized', label: 'contact.png', width: 2904, height: 17528 },
        { kind: 'unavailable', label: 'a b.png', reason: 'missing' },
        { kind: 'unavailable', label: 'x.png', reason: 'too-many-bytes' },
        { kind: 'unavailable', label: 'x.svg', reason: 'undeliverable' },
        { kind: 'unavailable', label: 'x.gif', reason: 'prepare-failed' },
        { kind: 'unavailable', label: 'x.gif', reason: 'prepare-failed', detail: 'is 5000×5000 px and could not be downscaled for the model (the image decoder declined it)' },
      ];
      for (const n of notes) expect(parseImageNote(imageNote(n))).toEqual(n);
      expect(imageNote(notes[0])).toBe("[image not attached: contact.png is 2904×17528 px, above this model's image size limit]");
      expect(parseImageNote('[image no longer available: /tmp/x.png]')).toBeNull();
      expect(parseImageNote(imageNote(notes[0]) + ' trailing')).toBeNull();
    });
  });

  describe('readImageFromDisk is gated by the header, never by file bytes alone', () => {
    it('a 70-byte PNG that CLAIMS 2904×17528 is refused with its dimensions', () => {
      const p = path.join(mkTmpDir('imgsup-'), 'huge.png');
      fs.writeFileSync(p, Buffer.concat([pngHeader(2904, 17528), Buffer.alloc(37)]));
      expect(readImageFromDisk(p, IMAGE_LIMITS_OPENAI)).toEqual({ ok: false, reason: 'oversized', width: 2904, height: 17528 });
      expect(readImageFromDisk(p).ok).toBe(true);   // no limits (legacy/pure callers): the GATE is the caller's limits
    });
    it('a fitting image is delivered with its dimensions; unparseable headers pass through unmeasured', () => {
      const d = mkTmpDir('imgsup-');
      const ok = path.join(d, 'ok.png'); fs.writeFileSync(ok, pngHeader(640, 480));
      expect(readImageFromDisk(ok, IMAGE_LIMITS_OPENAI)).toEqual({ ok: true, mediaType: 'image/png', data: pngHeader(640, 480), width: 640, height: 480 });
      const junk = path.join(d, 'junk.png'); fs.writeFileSync(junk, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      expect(readImageFromDisk(junk, IMAGE_LIMITS_OPENAI)).toEqual({ ok: true, mediaType: 'image/png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) });
    });
  });
```

Update the existing `readImageFromDisk reads a real file…` test to the new shape: `{ ok: true, mediaType: 'image/png', data: … }`, missing → `{ ok: false, reason: 'missing' }`, 11 MB → `{ ok: false, reason: 'too-many-bytes' }`, `.svg` → `{ ok: false, reason: 'undeliverable' }` — keep every existing case.

- [ ] **Step 3: Run** — FAIL (missing exports).

- [ ] **Step 4: Implement** — `image-support.ts`: `import type { ImageLimits } from './capability-profile';` then:

```ts
/** OpenAI bills and limits pictures in 32-px tiles ("patches"); the one
 *  rejection ever captured named exactly ceil(w/32)*ceil(h/32). */
export const IMAGE_PATCH_PX = 32;
export function patchCount(width: number, height: number): number {
  return Math.ceil(width / IMAGE_PATCH_PX) * Math.ceil(height / IMAGE_PATCH_PX);
}
export function withinImageLimits(dims: { width: number; height: number }, limits: ImageLimits): boolean {
  return Math.max(dims.width, dims.height) <= limits.maxEdgePx && patchCount(dims.width, dims.height) <= limits.maxPatches;
}

/** Width/height from the first bytes of a deliverable image, or null. Pure and
 *  total: junk, truncation and unknown layouts yield null, never a throw.
 *  WHY a hand parser instead of decoding: judge a 50-megapixel file without
 *  ever allocating its pixels on the main thread. */
export function imageDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.toString('ascii', 12, 16) === 'IHDR') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 10 && buf.toString('ascii', 0, 4) === 'GIF8') {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') { const bits = buf.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }; }
    if (chunk === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
    return null;
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      if (marker === 0xd9 || marker === 0xda) return null;
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return null;
  }
  return null;
}

// The ONE wording family for a picture the model did not get. Every site —
// live driver, rebuild, portable restore, collapse — labels by BASENAME, so
// live and resumed histories are byte-identical and the accepted-history
// store (which recomputes a note from fields on restore) can describe either.
// parseImageNote must stay the exact inverse of imageNote.
export type ImageNote =
  | { kind: 'oversized'; label: string; width: number; height: number }
  | { kind: 'unavailable'; label: string; reason: 'missing' | 'too-many-bytes' | 'undeliverable' | 'prepare-failed'; detail?: string };
const UNAVAILABLE_TEXT = {
  'missing': 'could not be read',
  'too-many-bytes': `exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB per-image size limit`,
  'undeliverable': 'is not a deliverable image format',
  'prepare-failed': 'could not be downscaled for the model',
} as const;
export function imageNote(n: ImageNote): string {
  if (n.kind === 'oversized') return `[image not attached: ${n.label} is ${n.width}×${n.height} px, above this model's image size limit]`;
  // `detail` (prepare-failed only) carries the preparer's own reason so the model
  // learns WHY (decoder declined it, over the decode bound) and what to do.
  const detail = n.reason === 'prepare-failed' && n.detail ? `: ${n.detail}` : '';
  return `[image not attached: ${n.label} ${UNAVAILABLE_TEXT[n.reason]}${detail}]`;
}
const OVERSIZED_RE = /^\[image not attached: (.+) is (\d+)×(\d+) px, above this model's image size limit\]$/;
const PREPARE_FAILED_RE = /^\[image not attached: (.+?) could not be downscaled for the model(?:: (.+))?\]$/;
export function parseImageNote(line: string): ImageNote | null {
  const m = OVERSIZED_RE.exec(line);
  if (m) return { kind: 'oversized', label: m[1], width: Number(m[2]), height: Number(m[3]) };
  const f = PREPARE_FAILED_RE.exec(line);
  if (f) return { kind: 'unavailable', label: f[1], reason: 'prepare-failed', ...(f[2] !== undefined ? { detail: f[2] } : {}) };
  for (const reason of ['missing', 'too-many-bytes', 'undeliverable'] as const) {
    const suffix = ` ${UNAVAILABLE_TEXT[reason]}]`;
    if (line.startsWith('[image not attached: ') && line.endsWith(suffix)) {
      const label = line.slice('[image not attached: '.length, line.length - suffix.length);
      if (label.length) return { kind: 'unavailable', label, reason };
    }
  }
  return null;
}

export type ImageReadResult =
  | { ok: true; mediaType: string; data: Buffer; width?: number; height?: number }
  | { ok: false; reason: 'undeliverable' | 'missing' | 'too-many-bytes' | 'oversized'; width?: number; height?: number };
```

`readImageFromDisk` (keep its doc comment; extend it): "Since 2026-10-07 the result says WHY it declined, and `limits` (the session profile's imageLimits) turns on the pixel gate — a 6.8 MB, 2904×17528 PNG was 49,868 patches against 30,000 and poisoned a conversation (2026-10-06). Dimensions come from the bytes already read; still exactly one stat and one read (tests/main-blocking-calls.allowlist.json counts them). An unparseable header passes through unmeasured."

```ts
export function readImageFromDisk(absPath: string, limits?: ImageLimits): ImageReadResult {
  const mediaType = deliverableImageMediaType(absPath);
  if (!mediaType) return { ok: false, reason: 'undeliverable' };
  try {
    const st = fs.statSync(absPath);
    if (st.size > MAX_ATTACHMENT_BYTES) return { ok: false, reason: 'too-many-bytes' };
    const data = fs.readFileSync(absPath);
    const dims = imageDimensions(data);
    if (dims && limits && !withinImageLimits(dims, limits)) return { ok: false, reason: 'oversized', ...dims };
    return { ok: true, mediaType, data, ...(dims ?? {}) };
  } catch { return { ok: false, reason: 'missing' }; }
}
```

- [ ] **Step 5: Run** — `npx vitest run tests/image-support.test.ts` → PASS. `npm run typecheck` now fails at the callers; Task 3 fixes them — do not commit until Task 3 is green.

---

### Task 3: Every reader call site uses the gate, labels by basename, and attachments ride `modelAttachments`

**Files:**
- Modify: `src/shared/transcript-event-types.ts` (`UserMessageData`, lines 120-127)
- Modify: `src/main/harness/busy-message-boundary.ts` (`appendUserHistory`, lines 32-46)
- Modify: `src/main/harness/harness-session.ts` (`takeReadyBusyMessage` opts type at line 231; `imagePartsFor` 2476-2484; `resolveToolImages` 2500-2556; `send` 2413-2416; `acceptUserMessage` 2562-2566; `acceptReadyBusyMessage` 2568-2572; `beginTurn` 2572-2580; the tool-result event at 3103-3108; the tool ctx build at 4159)
- Modify: `src/main/harness/history-rebuild.ts` (`RebuildImageReader` 40; user-message branch 178-192; tool images 225-254)
- Modify: `src/main/harness/native-session-host.ts` (import 28; `SendUnit` 105; queue entry type 331; `startingSends` 3074-3090; drain call 3364; `send()` 4094-4135; `takeReadyBusyMessage` return type 4211; the busy drain `entry.session.send(next.text, next.attachments)` at 4264; `seedResumedHistory` 3255-3256; add `imageLimitsFor`)
- Modify: `src/main/harness/tools/types.ts` (`ToolContext`, near `supportsVision` 289-291; `ToolResultPayload.imageLabels` at 342-356)
- Test: `tests/harness-history-rebuild.test.ts`, `tests/native-image-attachments.test.ts`, `tests/harness-session-loop.test.ts`, `tests/native-session-host.test.ts`

**Interfaces:**
- `UserMessageData.modelAttachments?: string[]` — same length and order as `attachments`; present only when at least one entry differs (a prepared derivative). `attachments` stays the original picker path for the UI (`UserMessage.tsx` strips it from the bubble text by prefix).
- `export type RebuildImageReader = (absPath: string) => ImageReadResult`.
- `export type ModelAttachment = string | { path: string; prepareFailed: string }` (`busy-message-boundary.ts`): what the model is handed per attachment — a path (the original or a prepared derivative), or the original path plus the preparer's refusal reason. Persisted as `modelAttachments: string[]` (the `path` of a failed entry), so a reopen re-gates the original and writes the oversized note.
- `appendUserHistory(text, modelPaths: ModelAttachment[], emit, appGenerated, imageParts: (paths: ModelAttachment[]) => UserPart[], …)` where `UserPart = { type: 'file'; mediaType: string; data: Buffer } | { type: 'text'; text: string }`; content is `[{type:'text', text}, ...files, ...noteTextParts]` and only a message with no parts at all stays a plain string.
- `HarnessSession.send(text, attachments = [], modelAttachments?: ModelAttachment[])`; `NativeSessionHost.send(sessionId, text, attachments = [], modelAttachments?: ModelAttachment[])`; `NativeSessionHost.imageLimitsFor(sessionId): ImageLimits` (the live session's `profileSnapshot.imageLimits`, else `IMAGE_LIMITS_DEFAULT`).
- `ToolResultPayload.imageLabels?: string[]` (parallel to `images`): the model-facing name of each promised file. Read sets it to the ORIGINAL basename for a prepared derivative; `resolveToolImages` uses it as the part's `filename`; the tool-result event persists it as `imageLabels` and the rebuild reads it — so a shrunk `contact.png` is called `contact.png` live, on reopen and in the checkpoint (`ImageDescriptor.filename`), never `<hash>-contact.png`.
- `ToolContext.imageLimits?: ImageLimits` (set from `this.profile.imageLimits` beside `supportsVision`).

- [ ] **Step 1: Write the failing tests**

`tests/harness-history-rebuild.test.ts` — in the `image tool-result resume` suite (line 698) and the `attachment resume` suite (line 666) change `fakeReader` to:

```ts
  const fakeReader = (p: string): ImageReadResult =>
    p.endsWith('ok.png') ? { ok: true, mediaType: 'image/png', data: Buffer.from('png!') }
    : p.endsWith('huge.png') ? { ok: false, reason: 'oversized', width: 2904, height: 17528 }
    : { ok: false, reason: 'missing' };
```

and add (imports: `type ImageReadResult`, `imageNote` from `../src/main/harness/image-support`):

```ts
  it('an oversized tool image becomes the basename note the live driver writes — reopen cannot smuggle it back', () => {
    const out = rebuildHistory(pair(['/tmp/shots/huge.png']), fakeReader);
    const toolMsg = out.find((m: any) => m.role === 'tool') as any;
    expect(toolMsg.content[0].output).toEqual({ type: 'text', value: 'Read image\n' + imageNote({ kind: 'oversized', label: 'huge.png', width: 2904, height: 17528 }) });
  });
```

and in the attachment suite:

```ts
  it('reads modelAttachments (the prepared copies) when present, attachments otherwise', () => {
    const out = rebuildHistory([ev('user-message', { text: 'see /tmp/huge.png', attachments: ['/tmp/huge.png'], modelAttachments: ['/tmp/cache/ok.png'] })], fakeReader);
    expect(out).toEqual([{ role: 'user', content: [{ type: 'text', text: 'see /tmp/huge.png' }, { type: 'file', mediaType: 'image/png', data: Buffer.from('png!') }] }]);
  });
  it('an attachment the gate drops gets a visible basename note as a trailing text part — never silence', () => {
    const out = rebuildHistory([ev('user-message', { text: 'see', attachments: ['/tmp/huge.png', '/tmp/ok.png', '/tmp/gone.png'] })], fakeReader);
    expect(out).toEqual([{ role: 'user', content: [
      { type: 'text', text: 'see' },
      { type: 'file', mediaType: 'image/png', data: Buffer.from('png!') },
      { type: 'text', text: imageNote({ kind: 'oversized', label: 'huge.png', width: 2904, height: 17528 }) },
      { type: 'text', text: imageNote({ kind: 'unavailable', label: 'gone.png', reason: 'missing' }) },
    ] }]);
  });
```

Also:

```ts
  it('non-image attachments never get a note — a PDF or text file is skipped silently, as today', () => {
    const out = rebuildHistory([ev('user-message', { text: 'see', attachments: ['/tmp/notes.pdf', '/tmp/a.txt'] })], fakeReader);
    expect(out).toEqual([{ role: 'user', content: 'see' }]);
  });
  it('a persisted imageLabels entry names a prepared derivative by its ORIGINAL basename', () => {
    const out = rebuildHistory([
      ev('tool-use', { toolUseId: 't1', toolName: 'Read', toolInput: { file_path: '/tmp/contact.png' } }),
      ev('tool-result', { toolUseId: 't1', toolName: 'Read', toolResult: 'Read image', images: ['/cache/0123456789abcdef-ok.png'], imageLabels: ['contact.png'] }),
      ev('turn-complete', {}),
    ], fakeReader);
    const toolMsg = out.find((m: any) => m.role === 'tool') as any;
    expect(toolMsg.content[0].output.value[1]).toMatchObject({ type: 'file', filename: 'contact.png' });
  });
```

Update the existing `a vanished attachment degrades to the plain-string shape` and `mixed attachments` cases: a vanished IMAGE attachment now yields the `missing` note part (array content, text first, files, then notes); rewrite their expectations accordingly.

`tests/native-image-attachments.test.ts` — give `capturePrompt(supportsVision, attachments)` (line 166) three optional trailing parameters: `profile?: CapabilityProfile` (used instead of the `CLOUD_DEFAULT` spread), `toolServices?: ToolServices`, `modelAttachments?: ModelAttachment[]` (passed as `send`'s third argument). Import `pngHeader` from `./helpers/image-fixtures`, `imageNote` from image-support and `type ModelAttachment` from busy-message-boundary. Add:

```ts
  it('an attachment over the provider limit is NOT delivered, and the model is told so by basename', async () => {
    const huge = path.join(dir, 'huge.png'); fs.writeFileSync(huge, pngHeader(2904, 17528));
    const user = await capturePrompt(true, [huge], resolveProfile({ providerType: 'chatgpt', modelId: 'gpt-x', contextLength: null }));
    expect(user.content.some((p: any) => p.type === 'file')).toBe(false);
    expect(user.content.at(-1)).toMatchObject({ type: 'text', text: imageNote({ kind: 'oversized', label: 'huge.png', width: 2904, height: 17528 }) });
  });
  it('modelAttachments is read in place of attachments', async () => {
    const huge = path.join(dir, 'huge.png'); fs.writeFileSync(huge, pngHeader(2904, 17528));
    const small = path.join(dir, 'small.png'); fs.writeFileSync(small, pngHeader(610, 3686));
    const user = await capturePrompt(true, [huge], resolveProfile({ providerType: 'chatgpt', modelId: 'gpt-x', contextLength: null }), undefined, [small]);
    const file = user.content.find((p: any) => p.type === 'file');
    const bytes = typeof file.data === 'string' ? Buffer.from(file.data, 'base64') : Buffer.from(file.data);
    expect(bytes).toEqual(pngHeader(610, 3686));
  });
  it('a message whose only attachments are non-images keeps today’s plain-string shape — no note, no parts', async () => {
    const notes = path.join(dir, 'notes.txt'); fs.writeFileSync(notes, 'hello');
    const user = await capturePrompt(true, [notes], resolveProfile({ providerType: 'chatgpt', modelId: 'gpt-x', contextLength: null }));
    expect(user.content).toBe('look at this');
  });
  it('a preparation failure is told to the model as such, with the preparer’s reason — never as "above size limit"', async () => {
    const huge = path.join(dir, 'huge.png'); fs.writeFileSync(huge, pngHeader(2904, 17528));
    const user = await capturePrompt(true, [huge], resolveProfile({ providerType: 'chatgpt', modelId: 'gpt-x', contextLength: null }), undefined,
      [{ path: huge, prepareFailed: 'is 2904×17528 px and could not be downscaled for the model (the image decoder declined it)' }]);
    expect(user.content.some((p: any) => p.type === 'file')).toBe(false);
    expect(user.content.at(-1)).toEqual({ type: 'text', text: imageNote({ kind: 'unavailable', label: 'huge.png', reason: 'prepare-failed', detail: 'is 2904×17528 px and could not be downscaled for the model (the image decoder declined it)' }) });
  });
```

For "persisted only when it differs", extend the suite's existing event-capturing test at line 217-226 (`attachments: [p]`): assert `event.data.modelAttachments` is `undefined` when the two arrays are equal, and equals `[small]` when `send` was given `[small]`.

`tests/harness-session-loop.test.ts` — in the suite that owns `tmpImage`/`mkTmpDir` at line 2241-2258, add a live-gate test (imports: `pngHeader` from `./helpers/image-fixtures`, `imageNote`, `resolveProfile`):

```ts
  it('live gate: a tiny file whose header claims 2904×17528 is refused by the driver with the basename note', async () => {
    const dir = mkTmpDir();
    const imgPath = path.join(dir, 'contact.png');
    fs.writeFileSync(imgPath, pngHeader(2904, 17528));
    const read = fakeTool('Read', { onExecute: () => ({ text: 'Read image', images: [imgPath] }) });
    const model = scriptedModel([
      stream(toolCallChunk('c1', 'Read', { file_path: imgPath }), finishChunk('tool-calls')),
      stream(...textChunks('b', 'done'), finishChunk('stop')),
    ]);
    const session = new HarnessSession(makeOpts({ tools: [read], decide: async () => ALLOW,
      profile: resolveProfile({ providerType: 'chatgpt', modelId: 'gpt-x', contextLength: null }) }), async () => model as any);
    const events = collect(session);
    await session.send('go');
    const toolMsg = ((session as any).history as any[]).filter((m) => m.role === 'tool').pop();
    expect(toolMsg.content[0].output).toEqual({ type: 'text', value: 'Read image\n' + imageNote({ kind: 'oversized', label: 'contact.png', width: 2904, height: 17528 }) });
    expect(events.find((e) => e.type === 'tool-result')!.data.images).toBeUndefined();
  });
```

`tests/native-session-host.test.ts` — next to `overlapping send queues FIFO and both turns complete in order` (line 2027), mirroring its setup exactly:

```ts
    it('an over-limit picture queued behind a running turn still arrives as its prepared derivative', async () => {
      // …same host/session construction and the same way of holding the first turn open as the FIFO test above…
      const huge = path.join(dir, 'huge.png'); fs.writeFileSync(huge, pngHeader(2904, 17528));
      const small = path.join(dir, 'small.png'); fs.writeFileSync(small, pngHeader(610, 3686));
      // first send starts a turn and is held open; the second is queued with the derivative as its model-facing path
      expect(host.send(id, 'picture', [huge], [small]).status).toBe('queued');
      // …release the first turn, drain both…
      const event = events.find((e) => e.type === 'user-message' && e.data.attachments?.[0] === huge)!;
      expect(event.data.modelAttachments).toEqual([small]);
      const prompt = prompts.at(-1);                                           // the queued turn's request
      const user = prompt.prompt.filter((m: any) => m.role === 'user').at(-1);
      const file = user.content.find((p: any) => p.type === 'file');
      const bytes = typeof file.data === 'string' ? Buffer.from(file.data, 'base64') : Buffer.from(file.data);
      expect(bytes).toEqual(pngHeader(610, 3686));
    });
```

(Fill the elided lines from the FIFO test's own code; `host.send`'s fourth argument is the new `modelAttachments`. This proves the queue entry, `takeReadyBusyMessage` and the busy drain at 4264 all carry it.)

- [ ] **Step 2: Run** — all four files → FAIL.

- [ ] **Step 3: Implement**

`transcript-event-types.ts`, after `attachments?: string[];`:
```ts
  /** Native (2026-10-07): the paths the MODEL was given, parallel to
   *  `attachments` — a prepared, downscaled copy where the original was over
   *  the provider's image limits, the original elsewhere (including a picture
   *  whose preparation failed: reopen re-gates it and writes the oversized note).
   *  Present only when at least one entry differs. `attachments` stays the
   *  picker path for the UI. */
  modelAttachments?: string[];
```
and in `ToolResultData` (same file), beside `images?: string[]`: `/** Model-facing name per `images` entry — the ORIGINAL basename for a prepared derivative. */ imageLabels?: string[];`.

`busy-message-boundary.ts`:
```ts
export type UserPart = { type: 'file'; mediaType: string; data: Buffer } | { type: 'text'; text: string };
/** What the model is handed per attachment: a path (original or prepared
 *  derivative), or the original plus the preparer's refusal reason. */
export type ModelAttachment = string | { path: string; prepareFailed: string };
export function appendUserHistory(
  text: string, modelPaths: ModelAttachment[], emit: () => string, appGenerated: boolean,
  imageParts: (paths: ModelAttachment[]) => UserPart[],
  markAppGenerated: (message: ModelMessage) => ModelMessage,
  history: ModelMessage[], origins: Array<string[] | null>, record: (uuid: string) => void,
): void {
  const parts = imageParts(modelPaths);
  const uuid = emit();
  // WHY parts may be notes: an attachment the gate refused is a trailing text
  // part naming it, so the model is told rather than left to assume it saw it.
  const message = (parts.length
    ? { role: 'user', content: [{ type: 'text', text }, ...parts] } as ModelMessage
    : { role: 'user', content: text } as ModelMessage);
  history.push(appGenerated ? markAppGenerated(message) : message);
  origins.push([uuid]);
  record(uuid);
}
```

`harness-session.ts`:
- `imagePartsFor(entries)` returns `UserPart[]`: files first, then notes — and ONLY pictures get a note:
```ts
  private imagePartsFor(entries: ModelAttachment[]): UserPart[] {
    if (!entries.length || !this.profile.supportsVision) return [];
    const files: UserPart[] = []; const notes: UserPart[] = [];
    for (const entry of entries) {
      if (typeof entry !== 'string') {
        // Preparation refused this picture: say so, with the preparer's reason —
        // never "above size limit", which would send the model to crop a file
        // the app itself could not decode.
        notes.push({ type: 'text', text: imageNote({ kind: 'unavailable', label: path.basename(entry.path), reason: 'prepare-failed', detail: entry.prepareFailed }) });
        continue;
      }
      const p = entry;
      // WHY only image-shaped paths get a note: a PDF or text attachment was never
      // a picture to deliver — it keeps today's silent skip (its path is in the
      // text), so ordinary attachments keep today's prompt text and checkpoint shape.
      if (!deliverableImageMediaType(p) && !UNDELIVERABLE_IMAGE_EXTENSIONS.has(path.extname(p).toLowerCase())) continue;
      const img = readImageFromDisk(p, this.profile.imageLimits);   // shared reader — one table, one cap, one pixel gate
      if (img.ok) files.push({ type: 'file', mediaType: img.mediaType, data: img.data });
      else if (img.reason === 'oversized') notes.push({ type: 'text', text: imageNote({ kind: 'oversized', label: path.basename(p), width: img.width ?? 0, height: img.height ?? 0 }) });
      else notes.push({ type: 'text', text: imageNote({ kind: 'unavailable', label: path.basename(p), reason: img.reason }) });
    }
    return [...files, ...notes];
  }
```
- `send(text, attachments = [], modelAttachments?: ModelAttachment[])`: `const persisted = modelAttachments?.map((m) => typeof m === 'string' ? m : m.path);` the event is `{ text, attachments, ...(persisted && persisted.some((p, i) => p !== attachments[i]) ? { modelAttachments: persisted } : {}) }` when `attachments.length`, else `{ text }`; pass `modelAttachments ?? attachments` as `beginTurn`'s third argument (typed `ModelAttachment[]`). `beginTurn`/`acceptUserMessage` keep their shape (the third argument is now "what the model reads"). The busy path gains `modelAttachments?: ModelAttachment[]` alongside `attachments` in THREE typed places — the `takeReadyBusyMessage` option type at `harness-session.ts:231`, `acceptReadyBusyMessage`/`claimBusyMessage`'s item, and the host's `takeReadyBusyMessage` return type at `native-session-host.ts:4211` — with the same event rule.
- The tool-result event (3103-3108) persists `...(delivered.labels ? { imageLabels: delivered.labels } : {})` beside `images`, where `resolveToolImages` returns `labels` (the `filename` it used per delivered image) whenever the payload supplied `imageLabels`.
- `resolveToolImages`: replace from `const img = readImageFromDisk(p);` through the end of its `if (!img)` block:
```ts
      const label = payload.imageLabels?.[paths.indexOf(p)] ?? path.basename(p);   // N9: a derivative keeps its ORIGINAL name
      const img = readImageFromDisk(p, this.profile.imageLimits);
      if (!img.ok) {
        // Name the real cause (error-message-standards.md). The oversized note is
        // the shared basename form so reopen rebuilds the identical text.
        if (img.reason === 'oversized') text += `\n${imageNote({ kind: 'oversized', label, width: img.width ?? 0, height: img.height ?? 0 })}`;
        else if (img.reason === 'undeliverable') text += `\n[image not attached: ${p} is not a deliverable image format]`;
        else if (img.reason === 'too-many-bytes') text += `\n[image not attached: ${p} exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB per-image size limit]`;
        else text += `\n[image not attached: ${p} could not be read]`;
        continue;
      }
```
(the three pre-existing wordings are unchanged on purpose: their tests pin them.) The later `images.push({ path: p, …, filename: path.basename(p) })` becomes `filename: label`. Add `imageNote, UNDELIVERABLE_IMAGE_EXTENSIONS` to the `image-support` import (line 41; `deliverableImageMediaType` is already there) and `type UserPart, type ModelAttachment` to the `busy-message-boundary` import. In `tools/types.ts`, add to `ToolResultPayload` after `images?`: `/** Model-facing name per `images` entry (same order). Read sets the ORIGINAL basename for a prepared derivative. */ imageLabels?: string[];`.
- Tool ctx (4159): add `imageLimits: this.profile.imageLimits,` beside `supportsVision`.

`tools/types.ts`: in `ToolContext` after `supportsVision?`: `/** The session's picture limits (profile.imageLimits); Read prepares against them. Absent → prepare uses IMAGE_LIMITS_DEFAULT. */ imageLimits?: ImageLimits;` (`import type { ImageLimits } from '../capability-profile';`).

`history-rebuild.ts`: `import { imageNote, deliverableImageMediaType, UNDELIVERABLE_IMAGE_EXTENSIONS, type ImageReadResult } from './image-support';` (pure string helpers keep the module's injected-reader rule); `export type RebuildImageReader = (absPath: string) => ImageReadResult;`. User-message branch:
```ts
        const paths = Array.isArray(e.data?.modelAttachments) ? (e.data.modelAttachments as string[])
          : Array.isArray(e.data?.attachments) ? (e.data.attachments as string[]) : [];
        const files: Array<{ type: 'file'; mediaType: string; data: Buffer }> = [];
        const notes: Array<{ type: 'text'; text: string }> = [];
        if (readImage) for (const p of paths) {
          // Pictures only (same rule as imagePartsFor): a PDF/text attachment is skipped silently, as today.
          if (!deliverableImageMediaType(p) && !UNDELIVERABLE_IMAGE_EXTENSIONS.has(path.extname(p).toLowerCase())) continue;
          const img = readImage(p);
          if (img.ok) files.push({ type: 'file', mediaType: img.mediaType, data: img.data });
          else if (img.reason === 'oversized') notes.push({ type: 'text', text: imageNote({ kind: 'oversized', label: path.basename(p), width: img.width ?? 0, height: img.height ?? 0 }) });
          else notes.push({ type: 'text', text: imageNote({ kind: 'unavailable', label: path.basename(p), reason: img.reason }) });
        }
        const message = files.length || notes.length
          ? ({ role: 'user', content: [{ type: 'text', text }, ...files, ...notes] } as ModelMessage)
          : { role: 'user', content: text } as ModelMessage;
```
Tool-image loop (`const labels = Array.isArray(e.data?.imageLabels) ? (e.data.imageLabels as string[]) : [];` above it):
```ts
          const label = labels[imagePaths.indexOf(p)] ?? path.basename(p);
          const img = readImage(p);
          if (img.ok) files.push({ type: 'file', mediaType: img.mediaType, data: { type: 'data', data: img.data }, filename: label });
          else if (img.reason === 'oversized') text += `\n${imageNote({ kind: 'oversized', label, width: img.width ?? 0, height: img.height ?? 0 })}`;
          else text += `\n[image no longer available: ${p}]`;
```

`native-session-host.ts`: thread `modelAttachments?: ModelAttachment[]` through every place `attachments` travels (`SendUnit` 105, the queue entry type 331, `startingSends` 3074/3085, the drain call 3364 → `this.send(sessionId, first.text, first.attachments, first.modelAttachments)`, `send()` 4094 → `session.send(text, attachments, modelAttachments)` and the queued/held entries, the `takeReadyBusyMessage` return type at 4211, and the busy drain at 4264 → `entry.session.send(next.text, next.attachments, next.modelAttachments)`), keeping the arrays parallel. Add:
```ts
  /** The live session's picture limits, for the send handler's preparation step.
   *  A session still starting gets the conservative default. */
  imageLimitsFor(sessionId: string): ImageLimits {
    return this.live.get(sessionId)?.session.profileSnapshot.imageLimits ?? IMAGE_LIMITS_DEFAULT;
  }
```
and at 3255-3256:
```ts
    // WHY the closure: the pixel gate is the SESSION's provider limits, and the
    // reader is the one place every resume path agrees on what is too big.
    const readImage = (p: string) => readImageFromDisk(p, session.profileSnapshot.imageLimits);
    const rebuilt = rebuildHistoryWithOrigins(persisted, readImage);
    const portable = restorePortableHistory(persisted, readImage,
```

- [ ] **Step 4: Run** — `npm run typecheck` clean; `npx vitest run tests/image-support.test.ts tests/harness-history-rebuild.test.ts tests/native-image-attachments.test.ts tests/harness-session-loop.test.ts tests/harness-tools-core.test.ts tests/wire-adapter.test.ts tests/native-send.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/shared/transcript-event-types.ts src/main/harness/image-support.ts src/main/harness/busy-message-boundary.ts src/main/harness/harness-session.ts src/main/harness/history-rebuild.ts src/main/harness/native-session-host.ts src/main/harness/tools/types.ts tests/helpers/image-fixtures.ts tests/image-support.test.ts tests/harness-history-rebuild.test.ts tests/native-image-attachments.test.ts tests/harness-session-loop.test.ts tests/native-session-host.test.ts
git commit -m "harness: gate every image read on the provider's limits; basename notes; modelAttachments"
```

---

### Task 4: The private checkpoint cannot bring an oversized picture back, and can describe every collapsed shape

**Files:**
- Modify: `src/main/harness/accepted-history-store.ts` (`FailureReason` 25-26; `PrunedDescriptor`/`PartDescriptor` 72-82; `replayableOrigin` 101-118; `AcceptedHistoryProposal` 147-156; `findAttachment` 462-472; `restore()` 630 / `restoreNow` 634; `describeToolResult` 786-822; the text-part branch of `describeParts` 844-868; attachment description 905-912; `restoreImage` 1008-1012; `restorePart` 1014-1061)
- Modify: `src/main/harness/native-session-host.ts` (restore call 3262-3265)
- Test: `tests/accepted-history-store.test.ts`

**Interfaces:**
- `restore(input: { …; imageLimits?: ImageLimits })` → may return `{ ok: false, reason: 'image-oversized' }`.
- `PrunedDescriptor` gains `{ oversized: ImageNote[] }` (used for a text output AND for a mixed `content` output beside `images`).
- `PartDescriptor` gains `{ kind: 'note'; note: ImageNote }` (a trailing note text part in a user message).
- `findAttachment` scans `modelAttachments` when present, else `attachments`.

- [ ] **Step 1: Write the failing tests** — in `tests/accepted-history-store.test.ts` (imports: `pngHeader` from `./helpers/image-fixtures`; `imageNote` from image-support; `IMAGE_LIMITS_OPENAI` from capability-profile):

```ts
  it('restore refuses an image the session limits now call oversized — the host falls back to the gated rebuild', async () => {
    const image = path.join(root, 'huge.png');
    fs.writeFileSync(image, pngHeader(2904, 17528));
    const events: Fixture[] = [{ type: 'tool-result', sessionId, uuid: 't2', data: { toolUseId: 'call_1', toolName: 'Read', toolResult: 'here it is', images: [image] } }];
    writeTranscript(events);
    const messages = [{ role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call_1', toolName: 'Read', output: { type: 'content', value: [
      { type: 'text', text: 'here it is' },
      { type: 'file', mediaType: 'image/png', data: { type: 'data', data: fs.readFileSync(image) }, filename: 'huge.png' },
    ] } }] }];
    const revision = await store.invalidate(sessionId, 'history-mutation');
    await expect(store.publish(proposal({ references: events.map(refFor), messages: messages as any, revision }))).resolves.toEqual({ ok: true });
    expect((await store.restore({ sessionId, transcriptPath: transcript, binding, assemblyDigest })).ok).toBe(true);
    expect(await store.restore({ sessionId, transcriptPath: transcript, binding, assemblyDigest, imageLimits: IMAGE_LIMITS_OPENAI })).toEqual({ ok: false, reason: 'image-oversized' });
  });

  it('describes and restores a text result whose oversized image collapsed to the note', async () => {
    const events: Fixture[] = [{ type: 'tool-result', sessionId, uuid: 't3', data: { toolUseId: 'call_2', toolName: 'Read', toolResult: 'Read image', images: ['/tmp/contact.png'] } }];
    writeTranscript(events);
    const value = 'Read image\n' + imageNote({ kind: 'oversized', label: 'contact.png', width: 2904, height: 17528 });
    const messages = [{ role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call_2', toolName: 'Read', output: { type: 'text', value } }] }];
    const restored = await roundTrip({ references: events.map(refFor), messages: messages as any });
    // A pruned part is never a replayable portable origin (replayableOrigin), same as keepChars.
    expect(restored).toEqual({ ok: true, messages, messageOrigins: [null], eventUuids: ['t3'], revision: store.currentRevision(sessionId) });
    expect(sidecar()).toContain('"oversized"');
    expect(sidecar()).not.toContain('above this model');   // fields, never the sentence
  });

  it('describes and restores a MIXED result: a fitting sibling kept, one image collapsed', async () => {
    const ok = path.join(root, 'ok.png'); fs.writeFileSync(ok, pngHeader(640, 480));
    const events: Fixture[] = [{ type: 'tool-result', sessionId, uuid: 't5', data: { toolUseId: 'call_5', toolName: 'Read', toolResult: 'Read images', images: ['/tmp/contact.png', ok] } }];
    writeTranscript(events);
    const text = 'Read images\n' + imageNote({ kind: 'oversized', label: 'contact.png', width: 2904, height: 17528 });
    const messages = [{ role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call_5', toolName: 'Read', output: { type: 'content', value: [
      { type: 'text', text },
      { type: 'file', mediaType: 'image/png', data: { type: 'data', data: fs.readFileSync(ok) }, filename: 'ok.png' },
    ] } }] }];
    const restored = await roundTrip({ references: events.map(refFor), messages: messages as any });
    expect(restored).toEqual({ ok: true, messages, messageOrigins: [null], eventUuids: ['t5'], revision: store.currentRevision(sessionId) });
  });

  it('a user message with a trailing attachment note round-trips; modelAttachments is where its bytes are found', async () => {
    const small = path.join(root, 'small.png'); fs.writeFileSync(small, pngHeader(610, 3686));
    const events: Fixture[] = [{ type: 'user-message', sessionId, uuid: 'u9', data: { text: 'look', attachments: ['/tmp/huge.png', '/tmp/gone.png'], modelAttachments: [small, '/tmp/gone.png'] } }];
    writeTranscript(events);
    const messages = [{ role: 'user', content: [
      { type: 'text', text: 'look' },
      { type: 'file', mediaType: 'image/png', data: fs.readFileSync(small) },
      { type: 'text', text: imageNote({ kind: 'unavailable', label: 'gone.png', reason: 'missing' }) },
    ] }];
    const restored = await roundTrip({ references: events.map(refFor), messages: messages as any });
    expect(restored).toEqual({ ok: true, messages, messageOrigins: [null], eventUuids: ['u9'], revision: store.currentRevision(sessionId) });
  });

  it('a note that does not recompute exactly is not describable (no silent drift)', async () => {
    const events: Fixture[] = [{ type: 'tool-result', sessionId, uuid: 't4', data: { toolUseId: 'call_3', toolName: 'Read', toolResult: 'Read image', images: ['/tmp/a.png'] } }];
    writeTranscript(events);
    const value = "Read image\n[image not attached: a.png is 2904×17528 px, above this model's image size limit] trailing";
    const messages = [{ role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call_3', toolName: 'Read', output: { type: 'text', value } }] }];
    const revision = await store.invalidate(sessionId, 'history-mutation');
    await expect(store.publish(proposal({ references: events.map(refFor), messages: messages as any, revision }))).resolves.toEqual({ ok: false, reason: 'unreferenced-history' });
  });
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

```ts
import { imageDimensions, withinImageLimits, imageNote, parseImageNote, type ImageNote } from './image-support';
import type { ImageLimits } from './capability-profile';
```
- `FailureReason`: add `| 'image-oversized'`.
- `type PrunedDescriptor = { keepChars: number } | { imageCollapsed: true } | { oversized: ImageNote[] };` with the WHY: "`oversized` (2026-10-07): the live part carries one or more image notes (image-support.imageNote). Fields only — restore RECOMPUTES the sentence, so the manifest never holds prose that could drift from the writer. May coexist with `images` on a mixed content result."
- `PartDescriptor`: add `| { kind: 'note'; note: ImageNote }` — "a trailing text part a user message carries for an attachment the model did not get".
- `replayableOrigin`: add `part.kind === 'note'` to the `return null` condition (a note is private reconstruction, like a pruned part).
- `restore`/`restoreNow`: add `imageLimits?: ImageLimits` to both inputs, thread it to `restorePart(raw, events, accepted, limits?)` and `restoreImage(image, limits?)`.
- `restoreImage`:
```ts
async function restoreImage(image: ImageDescriptor, limits?: ImageLimits): Promise<Buffer | 'oversized' | null> {
  let data: Buffer;
  try { data = await fs.promises.readFile(image.path); } catch { return null; }
  if (digest(data) !== image.digest) return null;
  // WHY: a checkpoint published before the pixel gate existed can cite a picture
  // the session's provider rejects. Refusing (not silently dropping) makes the
  // host fall back to the gated rebuild, which writes the honest note instead —
  // the deliberate durability path for old sessions.
  const dims = imageDimensions(data);
  if (limits && dims && !withinImageLimits(dims, limits)) return 'oversized';
  return data;
}
```
At both callers: `if (data === 'oversized') return { reason: 'image-oversized' }; if (!data) return { reason: 'image-mismatch' };`.
- A shared helper beside `prunedKeepChars`:
```ts
/** `value` must be `text` followed by '\n'-separated notes that recompute to it exactly. */
function describeImageNotes(text: string, value: string): ImageNote[] | null {
  if (!value.startsWith(text) || value.length <= text.length) return null;
  const lines = value.slice(text.length).split('\n');
  if (lines[0] !== '') return null;
  const notes = lines.slice(1).map(parseImageNote);
  if (!notes.length || notes.some(n => n === null)) return null;
  const recomputed = text + notes.map(n => `\n${imageNote(n!)}`).join('');
  return recomputed === value ? (notes as ImageNote[]) : null;
}
```
- `describeToolResult` — text branch, after the `imageCollapsed` line: `const oversized = describeImageNotes(text, output.value); if (oversized) return { pruned: { oversized } }; return null;`. Content branch: replace `if (!record(first) || first.type !== 'text' || first.text !== text || …) return null;` with: accept `first.text === text` (no notes) OR `describeImageNotes(text, first.text)` non-null (notes); keep the images loop; return `{ images, ...(oversized ? { pruned: { oversized } } : {}) }` whenever `images.length || oversized`, else null.
- `describeParts` text branch (`field === 'user-text'`): if `anchors.matchText(field, part.text, 1)` returns null, try `const note = parseImageNote(part.text); if (note) { parts.push({ kind: 'note', note }); continue; }` before returning null.
- `findAttachment` (462-472): scan `looseData(event).modelAttachments` when it is an array, else `attachments`. The attachment descriptor (905-912) is unchanged: the path it stores is whatever `findAttachment` found, so a derivative restores by its own path.
- `restorePart`: `if (part.kind === 'note') return { value: { type: 'text', text: imageNote(part.note) } };` (validate `note.kind`, `label` non-empty string, safe-integer `width`/`height` or an allowed `reason`, else `malformed`). Tool-result branch: before the generic `else if (part.pruned)` (imageCollapsed): `else if (part.pruned && 'oversized' in part.pruned && !part.images?.length) output = { type: 'text', value: text + notesText }`; and in the `part.images?.length` branch use `{ type: 'text', text: text + (part.pruned && 'oversized' in part.pruned ? notesText : '') }` as the first value, where `notesText = part.pruned.oversized.map(n => `\n${imageNote(n)}`).join('')` after validating each note like the `note` part.
- `native-session-host.ts` 3262: add `imageLimits: session.profileSnapshot.imageLimits,` to the restore input.

- [ ] **Step 4: Run** — `npx vitest run tests/accepted-history-store.test.ts tests/accepted-history-privacy.test.ts tests/harness-accepted-history.test.ts tests/native-session-host-continuation.test.ts` → PASS, including the B8 no-sync-read test.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/accepted-history-store.ts src/main/harness/native-session-host.ts tests/accepted-history-store.test.ts
git commit -m "accepted-history: refuse oversized checkpoint images; describe collapsed results and attachment notes"
```

---

### Task 5: Shrink once — the pure preparer, against the session's limits

**Files:**
- Create: `src/main/harness/image-prepare.ts`
- Test: `tests/image-prepare.test.ts`

**Interfaces:**
```ts
export const MAX_DECODE_PIXELS = 80_000_000;
export const HEADER_READ_BYTES = 256 * 1024;
export const PREPARE_MARGIN = 0.9;
export function prepareTarget(width: number, height: number, limits: ImageLimits, margin?: number): { width: number; height: number } | null;  // null = fits, nothing to do
export function derivativeName(absPath: string, size: number, mtimeMs: number, target: { width: number; height: number }, ext: 'png' | 'jpg'): string;
export type ResizeFormat = 'png' | 'jpeg';
export type ResizeFn = (req: { bytes: Buffer; width: number; height: number; format: ResizeFormat }) => Promise<Buffer | null>;
export type PreparedImage =
  | { kind: 'unchanged'; width?: number; height?: number }
  | { kind: 'prepared'; path: string; mediaType: 'image/png' | 'image/jpeg'; width: number; height: number; preparedWidth: number; preparedHeight: number }
  | { kind: 'refused'; reason: string; width?: number; height?: number };
export interface ImagePreparerLike { prepare(absPath: string, limits: ImageLimits): Promise<PreparedImage>; preparedPathFor(absPath: string): string | null }
export class ImagePreparer implements ImagePreparerLike { constructor(cacheDir: string, resize: ResizeFn) }
```
- Consumes: `imageDimensions`, `withinImageLimits`, `patchCount`, `IMAGE_PATCH_PX`, `MAX_ATTACHMENT_BYTES` (image-support); `ImageLimits` (Task 1).

**Worked example (pin it):** 2904×17528 against `IMAGE_LIMITS_OPENAI` with a 10% margin → edge cap 7372.8, patch cap 27,000 → scale = min(7372.8/17528 = 0.42063, √(27,000·1024 / 50,901,312) = 0.73700) = 0.42063 → floor → **1221×7372**, 39×231 = 9,009 patches (42% of the original). Against `IMAGE_LIMITS_DEFAULT`: **610×3686**, 2,320 patches. A patch-bound square, 6000×6000 on OpenAI: first guess 5258² is 27,225 patches (over the margin), one 1% step → **5205×5205**, 26,569 patches.

- [ ] **Step 1: Write the failing tests** — `tests/image-prepare.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ImagePreparer, prepareTarget, derivativeName, MAX_DECODE_PIXELS, type ResizeFn } from '../src/main/harness/image-prepare';
import { IMAGE_LIMITS_OPENAI, IMAGE_LIMITS_DEFAULT } from '../src/main/harness/capability-profile';
import { patchCount } from '../src/main/harness/image-support';
import { pngHeader, gifHeader } from './helpers/image-fixtures';

describe('prepareTarget shrinks only when the limits fail, to the largest size under both with a 10% margin', () => {
  it('leaves an in-budget picture alone, even a big one', () => {
    expect(prepareTarget(4096, 4096, IMAGE_LIMITS_OPENAI)).toBeNull();
    expect(prepareTarget(2048, 2048, IMAGE_LIMITS_DEFAULT)).toBeNull();
  });
  it('the contact sheet: edge-bound on OpenAI, 1221×7372', () => {
    expect(prepareTarget(2904, 17528, IMAGE_LIMITS_OPENAI)).toEqual({ width: 1221, height: 7372 });
    expect(patchCount(1221, 7372)).toBe(9_009);
  });
  it('the contact sheet on the conservative default: 610×3686', () => {
    expect(prepareTarget(2904, 17528, IMAGE_LIMITS_DEFAULT)).toEqual({ width: 610, height: 3686 });
  });
  it('a patch-bound square steps down until the rounded-up count fits the margin', () => {
    const t = prepareTarget(6000, 6000, IMAGE_LIMITS_OPENAI)!;
    expect(t).toEqual({ width: 5205, height: 5205 });
    expect(patchCount(t.width, t.height)).toBeLessThanOrEqual(27_000);
  });
  it('never enlarges and never yields a zero edge', () => {
    expect(prepareTarget(100000, 1, IMAGE_LIMITS_OPENAI)).toEqual({ width: 7372, height: 1 });
  });
});

describe('derivativeName is deterministic and keeps the original basename for a human reading the cache', () => {
  it('same inputs → same name; any input change → different name', () => {
    const a = derivativeName('/x/contact.png', 100, 5.9, { width: 1221, height: 7372 }, 'png');
    expect(a).toBe(derivativeName('/x/contact.png', 100, 5.9, { width: 1221, height: 7372 }, 'png'));
    expect(a).toMatch(/^[0-9a-f]{16}-contact\.png$/);
    expect(derivativeName('/x/contact.png', 101, 5.9, { width: 1221, height: 7372 }, 'png')).not.toBe(a);
    expect(derivativeName('/x/contact.png', 100, 5.9, { width: 610, height: 3686 }, 'jpg')).toMatch(/-contact\.jpg$/);
  });
});

describe('ImagePreparer', () => {
  let dir: string; let cache: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'imgprep-')); cache = path.join(dir, 'cache'); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  const calls: any[] = [];
  const resize: ResizeFn = async (req) => { calls.push(req); return req.format === 'png' ? Buffer.concat([pngHeader(req.width, req.height), Buffer.from('small')]) : Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 0x11, 8, req.height >> 8, req.height & 255, req.width >> 8, req.width & 255, 3]); };

  it('an in-budget picture is unchanged and the resizer is never called', async () => {
    const p = path.join(dir, 'ok.png'); fs.writeFileSync(p, pngHeader(4000, 4000));
    calls.length = 0;
    expect(await new ImagePreparer(cache, resize).prepare(p, IMAGE_LIMITS_OPENAI)).toEqual({ kind: 'unchanged', width: 4000, height: 4000 });
    expect(calls).toHaveLength(0);
  });

  it('an over-budget picture is shrunk ONCE into a real cached file; the original is untouched; the second call reuses the file', async () => {
    const p = path.join(dir, 'contact.png'); fs.writeFileSync(p, Buffer.concat([pngHeader(2904, 17528), Buffer.alloc(100)]));
    const before = fs.readFileSync(p);
    calls.length = 0;
    const prep = new ImagePreparer(cache, resize);
    const r = await prep.prepare(p, IMAGE_LIMITS_OPENAI);
    expect(r).toMatchObject({ kind: 'prepared', width: 2904, height: 17528, preparedWidth: 1221, preparedHeight: 7372, mediaType: 'image/png' });
    if (r.kind !== 'prepared') return;
    expect(r.path.startsWith(cache)).toBe(true);
    expect(path.basename(r.path)).toMatch(/-contact\.png$/);
    expect(fs.existsSync(r.path)).toBe(true);
    expect(fs.readFileSync(p)).toEqual(before);
    expect(prep.preparedPathFor(p)).toBe(r.path);
    expect(calls).toHaveLength(1);
    expect(await prep.prepare(p, IMAGE_LIMITS_OPENAI)).toEqual(r);
    expect(calls).toHaveLength(1);
  });

  it('the same picture is prepared differently for different limits (two cache files, two names)', async () => {
    const p = path.join(dir, 'contact.png'); fs.writeFileSync(p, pngHeader(2904, 17528));
    const prep = new ImagePreparer(cache, resize);
    const a = await prep.prepare(p, IMAGE_LIMITS_OPENAI);
    const b = await prep.prepare(p, IMAGE_LIMITS_DEFAULT);
    expect(a).toMatchObject({ kind: 'prepared', preparedWidth: 1221 });
    expect(b).toMatchObject({ kind: 'prepared', preparedWidth: 610 });
    if (a.kind === 'prepared' && b.kind === 'prepared') expect(a.path).not.toBe(b.path);
    expect(prep.preparedPathFor(p)).toBe((b as any).path);   // the latest preparation wins
  });

  it('stale entries: an unchanged or refused result forgets any earlier derivative for that path', async () => {
    const p = path.join(dir, 'x.png'); fs.writeFileSync(p, pngHeader(2904, 17528));
    const prep = new ImagePreparer(cache, resize);
    await prep.prepare(p, IMAGE_LIMITS_OPENAI);
    expect(prep.preparedPathFor(p)).toBeTruthy();
    fs.writeFileSync(p, pngHeader(640, 480));
    expect(await prep.prepare(p, IMAGE_LIMITS_OPENAI)).toEqual({ kind: 'unchanged', width: 640, height: 480 });
    expect(prep.preparedPathFor(p)).toBeNull();
  });

  it('concurrent prepares of one path share one job', async () => {
    const p = path.join(dir, 'c.png'); fs.writeFileSync(p, pngHeader(2904, 17528));
    let n = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const gated: ResizeFn = async (req) => { n++; await gate; return pngHeader(req.width, req.height); };
    const prep = new ImagePreparer(cache, gated);
    const a = prep.prepare(p, IMAGE_LIMITS_OPENAI);
    const b = prep.prepare(p, IMAGE_LIMITS_OPENAI);
    release();
    expect(await a).toEqual(await b);
    expect(n).toBe(1);
  });

  it('falls back to JPEG only when the PNG is still over the byte cap', async () => {
    const p = path.join(dir, 'big.png'); fs.writeFileSync(p, Buffer.concat([pngHeader(9000, 9000), Buffer.alloc(10)]));
    const fatPng: ResizeFn = async (req) => req.format === 'png' ? Buffer.alloc(11 * 1024 * 1024) : Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 0x11, 8, 8, 0, 8, 0, 3]);
    const r = await new ImagePreparer(cache, fatPng).prepare(p, IMAGE_LIMITS_OPENAI);
    expect(r.kind).toBe('prepared');
    if (r.kind === 'prepared') { expect(r.mediaType).toBe('image/jpeg'); expect(r.path).toMatch(/\.jpg$/); }
  });

  it('refuses honestly when decode is impossible or the picture is beyond the decode bound — never the original bytes', async () => {
    const p = path.join(dir, 'anim.gif'); fs.writeFileSync(p, gifHeader(5000, 5000));   // 25 MP: under the bound, so only the resizer can refuse
    const cannot: ResizeFn = async () => null;
    const r = await new ImagePreparer(cache, cannot).prepare(p, IMAGE_LIMITS_OPENAI);
    expect(r).toMatchObject({ kind: 'refused', width: 5000, height: 5000 });
    if (r.kind === 'refused') expect(r.reason).toMatch(/could not be downscaled/);
    const q = path.join(dir, 'vast.png'); fs.writeFileSync(q, pngHeader(20000, 20000));
    const v = await new ImagePreparer(cache, resize).prepare(q, IMAGE_LIMITS_OPENAI);
    expect(v).toMatchObject({ kind: 'refused', width: 20000, height: 20000 });
    if (v.kind === 'refused') expect(v.reason).toContain(`${MAX_DECODE_PIXELS / 1_000_000} megapixels`);
    expect(fs.existsSync(cache) ? fs.readdirSync(cache) : []).toEqual([]);
  });

  it('a read error is a refusal, not a throw', async () => {
    const r = await new ImagePreparer(cache, resize).prepare(path.join(dir, 'nope.png'), IMAGE_LIMITS_OPENAI);
    expect(r.kind).toBe('refused');
  });
});
```

- [ ] **Step 2: Run** — FAIL (module missing).

- [ ] **Step 3: Implement** — `src/main/harness/image-prepare.ts`:

```ts
// Shrink-once preparation of pictures over a provider's limits (2026-10-07).
//
// WHY a cached FILE, not a request-time transform: every resume path re-reads
// pictures BY PATH and the private checkpoint fingerprints the bytes the model
// saw. A derivative that is a real file, promised under its own path, needs
// none of them to know it exists. The original is never modified.
// WHY only when the limits fail: an in-budget picture is sent as-is — nothing
// is ever downscaled "just in case", so a 4096² screenshot on OpenAI keeps
// every pixel. The target is the LARGEST size under both limits with a 10%
// margin, aspect preserved, never enlarged.
// WHY pure + injected resize: decoding runs in a worker thread
// (image-resize-service.ts); this module only decides and stores.
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { imageDimensions, withinImageLimits, patchCount, IMAGE_PATCH_PX, MAX_ATTACHMENT_BYTES } from './image-support';
import type { ImageLimits } from './capability-profile';

/** Decoded pixels we are willing to hold at once: pngjs keeps width×height×4
 *  bytes (320 MB at this bound) in the worker. The 2026-10-06 incident image
 *  was 50.9 MP and must prepare; anything larger is declined with a hint. */
export const MAX_DECODE_PIXELS = 80_000_000;
/** Enough to reach a JPEG SOF past large EXIF/ICC segments; PNG/GIF/WebP need
 *  under 64 bytes. */
export const HEADER_READ_BYTES = 256 * 1024;
/** Provider limits are "at most": aim 10% under both so rounding, "after
 *  processing" and an off-by-one tile can never push a prepared picture over. */
export const PREPARE_MARGIN = 0.9;

export type ResizeFormat = 'png' | 'jpeg';
export type ResizeFn = (req: { bytes: Buffer; width: number; height: number; format: ResizeFormat }) => Promise<Buffer | null>;

export type PreparedImage =
  | { kind: 'unchanged'; width?: number; height?: number }
  | { kind: 'prepared'; path: string; mediaType: 'image/png' | 'image/jpeg'; width: number; height: number; preparedWidth: number; preparedHeight: number }
  | { kind: 'refused'; reason: string; width?: number; height?: number };

export interface ImagePreparerLike {
  prepare(absPath: string, limits: ImageLimits): Promise<PreparedImage>;
  /** Sync, IO-free: the derivative the LAST prepare() produced for `absPath`,
   *  if it produced one. The send path reads it; it must not await. */
  preparedPathFor(absPath: string): string | null;
}

/** null = fits, leave it alone. Otherwise the largest floor-scaled size whose
 *  long edge and rounded-up patch count both sit under limits×margin. The
 *  area estimate can land a tile over (ceil per axis), so step down 1% until
 *  it fits — two steps at most in practice; 64 is a hard stop. */
export function prepareTarget(width: number, height: number, limits: ImageLimits, margin = PREPARE_MARGIN): { width: number; height: number } | null {
  if (withinImageLimits({ width, height }, limits)) return null;
  const edgeCap = limits.maxEdgePx * margin;
  const patchCap = limits.maxPatches * margin;
  let scale = Math.min(1, edgeCap / Math.max(width, height), Math.sqrt((patchCap * IMAGE_PATCH_PX * IMAGE_PATCH_PX) / (width * height)));
  let target = { width: 1, height: 1 };
  for (let i = 0; i < 64; i++) {
    target = { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
    if (Math.max(target.width, target.height) <= edgeCap && patchCount(target.width, target.height) <= patchCap) return target;
    scale *= 0.99;
  }
  return target;
}

/** `<16 hex>-<original basename>.<ext>`: the hash keys the cache (path, size,
 *  mtime AND target — a different provider's limits give a different file);
 *  the basename is for a human browsing the cache folder. The MODEL-facing
 *  label is never derived from this file name: Read passes the original
 *  basename explicitly (ToolResultPayload.imageLabels), so a shrunk contact.png
 *  is still called contact.png on the wire, on reopen and in the checkpoint. */
export function derivativeName(absPath: string, size: number, mtimeMs: number, target: { width: number; height: number }, ext: 'png' | 'jpg'): string {
  const key = createHash('sha1').update(`${absPath}|${size}|${Math.floor(mtimeMs)}|${target.width}x${target.height}`).digest('hex').slice(0, 16);
  return `${key}-${path.basename(absPath, path.extname(absPath))}.${ext}`;
}

async function readHeader(absPath: string): Promise<Buffer> {
  const fh = await fs.promises.open(absPath, 'r');
  try {
    const buf = Buffer.alloc(HEADER_READ_BYTES);
    const { bytesRead } = await fh.read(buf, 0, HEADER_READ_BYTES, 0);
    return buf.subarray(0, bytesRead);
  } finally { await fh.close(); }
}

export class ImagePreparer implements ImagePreparerLike {
  private readonly prepared = new Map<string, string>();
  /** One job per (path, limits) at a time: concurrent callers share it. */
  private readonly inFlight = new Map<string, Promise<PreparedImage>>();
  /** One resize at a time overall: two 50-MP decodes side by side would double
   *  peak memory for no latency win. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly cacheDir: string, private readonly resize: ResizeFn) {}

  preparedPathFor(absPath: string): string | null { return this.prepared.get(absPath) ?? null; }

  prepare(absPath: string, limits: ImageLimits): Promise<PreparedImage> {
    const key = `${absPath}|${limits.maxEdgePx}|${limits.maxPatches}`;
    const running = this.inFlight.get(key);
    if (running) return running;
    // WHY never throw: Read awaits this; a thrown IO error would surface as a
    // generic "Read failed" instead of the named refusal the standard asks for.
    const job = this.prepareUnguarded(absPath, limits)
      .catch((err: any): PreparedImage => ({ kind: 'refused', reason: `could not be prepared for the model (${err?.code ?? err?.message ?? 'unknown error'})` }))
      .then((result) => {
        // Stale-map rule: only a 'prepared' result may vouch for a derivative.
        if (result.kind === 'prepared') this.prepared.set(absPath, result.path); else this.prepared.delete(absPath);
        return result;
      })
      .finally(() => { this.inFlight.delete(key); });
    this.inFlight.set(key, job);
    return job;
  }

  private async prepareUnguarded(absPath: string, limits: ImageLimits): Promise<PreparedImage> {
    const st = await fs.promises.stat(absPath);
    const dims = imageDimensions(await readHeader(absPath));
    if (!dims) return { kind: 'unchanged' };   // unmeasurable: not this module's class; the reader/provider decide
    if (dims.width * dims.height > MAX_DECODE_PIXELS) {
      return { kind: 'refused', ...dims, reason: `is ${dims.width}×${dims.height} px — too large to downscale for the model (over ${MAX_DECODE_PIXELS / 1_000_000} megapixels). Crop or shrink it with Bash (e.g. magick in.png -resize 4000x4000 out.png) and Read the copy.` };
    }
    const target = prepareTarget(dims.width, dims.height, limits);
    if (!target) return { kind: 'unchanged', ...dims };
    const file = (ext: 'png' | 'jpg') => path.join(this.cacheDir, derivativeName(absPath, st.size, st.mtimeMs, target, ext));
    const done = (p: string, mediaType: 'image/png' | 'image/jpeg'): PreparedImage =>
      ({ kind: 'prepared', path: p, mediaType, ...dims, preparedWidth: target.width, preparedHeight: target.height });
    for (const [p, mediaType] of [[file('png'), 'image/png'], [file('jpg'), 'image/jpeg']] as const) {
      try { await fs.promises.access(p); return done(p, mediaType); } catch { /* not cached yet */ }
    }
    const run = this.chain.then(async (): Promise<PreparedImage> => {
      const bytes = await fs.promises.readFile(absPath);
      let out = await this.resize({ bytes, width: target.width, height: target.height, format: 'png' });
      let p = file('png'); let mediaType: 'image/png' | 'image/jpeg' = 'image/png';
      // WHY JPEG second: screenshots are text; PNG keeps it crisp. Only a PNG
      // that still breaks the byte cap trades sharpness for size.
      if (out && out.length > MAX_ATTACHMENT_BYTES) { out = await this.resize({ bytes, width: target.width, height: target.height, format: 'jpeg' }); p = file('jpg'); mediaType = 'image/jpeg'; }
      if (!out || out.length > MAX_ATTACHMENT_BYTES) {
        return { kind: 'refused', ...dims, reason: `is ${dims.width}×${dims.height} px and could not be downscaled for the model (the image decoder declined it — only PNG and JPEG can be shrunk here). Convert or shrink it with Bash (e.g. magick in.gif[0] -resize 4000x4000 out.png) and Read the copy.` };
      }
      await fs.promises.mkdir(this.cacheDir, { recursive: true });
      const tmp = `${p}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, out);
      await fs.promises.rename(tmp, p);   // atomic: a crash never leaves a half-written derivative under the final name
      return done(p, mediaType);
    });
    this.chain = run.catch(() => undefined);
    return run;
  }
}
```

- [ ] **Step 4: Run** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/image-prepare.ts tests/image-prepare.test.ts
git commit -m "harness: shrink-once image preparation against the session's limits"
```

---

### Task 6: The resize worker (worker thread, pngjs + jpeg-js + box downscale) and its service

**Files:**
- Create: `src/main/image-resize-worker.ts`
- Create: `src/main/image-resize-service.ts`
- Test: `tests/image-resize.test.ts`

**Interfaces:**
- Worker: `export interface ResizeJob { bytes: Uint8Array; width: number; height: number; format: 'png' | 'jpeg' }`, `export interface Decoded { data: Uint8Array; width: number; height: number }`, `export function decodeImage(bytes: Buffer): Decoded | null` (PNG via `PNG.sync.read`, JPEG via `jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 80, maxMemoryUsageInMB: 512 })`, anything else null), `export function boxDownscale(src: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array`, `export function encodeImage(rgba: Uint8Array, w: number, h: number, format: 'png' | 'jpeg'): Buffer`, `export function runResizeJob(job: ResizeJob, decoder?: typeof decodeImage): Buffer | null`.
- Service: `export interface WorkerLike { on(event: 'message', cb: (bytes: Uint8Array | null) => void): void; on(event: 'error' | 'exit', cb: (...a: any[]) => void): void; terminate(): Promise<unknown> | void }`, `export function createResizeService(opts?: { spawn?: (job: ResizeJob) => WorkerLike; jobTimeoutMs?: number }): { resize: ResizeFn }`.
- Consumes: `ResizeFn` (Task 5).

- [ ] **Step 1: Write the failing tests** — `tests/image-resize.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PNG } from 'pngjs';
import { runResizeJob, boxDownscale, decodeImage } from '../src/main/image-resize-worker';
import { createResizeService, type WorkerLike } from '../src/main/image-resize-service';
import { ImagePreparer } from '../src/main/harness/image-prepare';
import { imageDimensions } from '../src/main/harness/image-support';
import { IMAGE_LIMITS_DEFAULT } from '../src/main/harness/capability-profile';
import { writeRealPng } from './helpers/image-fixtures';

/** Writing, decoding, box-filtering and re-encoding an 18-MP PNG in pure JS.
 *  EXECUTOR: replace with 3× the wall time you measure in Task 11 step 2b
 *  (never below 15 s; Windows CI is slower). */
const REAL_PNG_BUDGET_MS = 30_000;

describe('boxDownscale averages the source block of every destination pixel, channel by channel', () => {
  it('a 2×2 → 1×1 averages the four pixels', () => {
    const src = new Uint8Array([0, 0, 0, 255, 100, 0, 0, 255, 0, 200, 0, 255, 0, 0, 40, 255]);
    expect(Array.from(boxDownscale(src, 2, 2, 1, 1))).toEqual([25, 50, 10, 255]);
  });
  it('keeps every pixel when asked for the same size', () => {
    const src = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(Array.from(boxDownscale(src, 2, 1, 2, 1))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('runResizeJob (the worker body) decodes, shrinks and encodes real pictures', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'imgresize-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));

  it('end to end: a 3000×6000 PNG becomes a 1843×3686 PNG derivative; the original is byte-identical afterwards', async () => {
    const p = path.join(dir, 'tall.png');
    writeRealPng(p, 3000, 6000);
    const before = fs.readFileSync(p);
    const prep = new ImagePreparer(path.join(dir, 'cache'), async (req) => runResizeJob({ bytes: req.bytes, width: req.width, height: req.height, format: req.format }));
    const r = await prep.prepare(p, IMAGE_LIMITS_DEFAULT);   // 3000×6000 is over 4096 on the long edge
    expect(r.kind).toBe('prepared');
    if (r.kind !== 'prepared') return;
    expect({ width: r.preparedWidth, height: r.preparedHeight }).toEqual({ width: 1843, height: 3686 });
    expect(imageDimensions(fs.readFileSync(r.path))).toEqual({ width: 1843, height: 3686 });
    expect(PNG.sync.read(fs.readFileSync(r.path)).width).toBe(1843);
    expect(fs.readFileSync(p)).toEqual(before);
  }, REAL_PNG_BUDGET_MS);

  it('JPEG in, JPEG out at the requested size', () => {
    const png = new PNG({ width: 64, height: 32 }); png.data.fill(90);
    const jpegIn = runResizeJob({ bytes: new Uint8Array(PNG.sync.write(png)), width: 64, height: 32, format: 'jpeg' })!;
    expect(decodeImage(Buffer.from(jpegIn))).toMatchObject({ width: 64, height: 32 });
    const out = runResizeJob({ bytes: jpegIn, width: 16, height: 8, format: 'jpeg' })!;
    expect(imageDimensions(Buffer.from(out))).toEqual({ width: 16, height: 8 });
  });

  it('GIF/WebP/junk cannot be decoded → null, never a throw', () => {
    expect(runResizeJob({ bytes: new Uint8Array(Buffer.from('GIF89a\x10\x00\x10\x00', 'latin1')), width: 8, height: 8, format: 'png' })).toBeNull();
    expect(runResizeJob({ bytes: new Uint8Array([1, 2, 3]), width: 8, height: 8, format: 'png' })).toBeNull();
  });
});

describe('createResizeService runs one worker per job, terminates it after, and turns a timeout into null', () => {
  function fakeWorker() {
    const handlers: Record<string, Function[]> = { message: [], error: [], exit: [] };
    const w = {
      terminated: 0,
      on: (ev: string, cb: Function) => { handlers[ev].push(cb); },
      terminate: async () => { w.terminated++; },
      emit: (ev: string, ...a: any[]) => handlers[ev].forEach(h => h(...a)),
    };
    return w as typeof w & WorkerLike;
  }
  it('spawns per job, resolves the reply bytes, terminates the worker', async () => {
    const workers: ReturnType<typeof fakeWorker>[] = [];
    const svc = createResizeService({ spawn: () => { const w = fakeWorker(); workers.push(w); return w; } });
    const p = svc.resize({ bytes: Buffer.from('in'), width: 1, height: 2, format: 'png' });
    expect(workers).toHaveLength(1);
    workers[0].emit('message', new Uint8Array([1, 2]));
    expect(await p).toEqual(Buffer.from([1, 2]));
    expect(workers[0].terminated).toBe(1);
    const q = svc.resize({ bytes: Buffer.from('in'), width: 1, height: 2, format: 'png' });
    expect(workers).toHaveLength(2);
    workers[1].emit('message', null);
    expect(await q).toBeNull();
  });
  it('a worker that errors or exits mid-job resolves null', async () => {
    const w = fakeWorker();
    const svc = createResizeService({ spawn: () => w });
    const p = svc.resize({ bytes: Buffer.from('in'), width: 1, height: 1, format: 'png' });
    w.emit('error', new Error('boom'));
    expect(await p).toBeNull();
  });
  it('a job over its time limit resolves null and the worker is terminated', async () => {
    vi.useFakeTimers();
    const w = fakeWorker();
    const svc = createResizeService({ spawn: () => w, jobTimeoutMs: 500 });
    const p = svc.resize({ bytes: Buffer.from('in'), width: 1, height: 1, format: 'png' });
    vi.advanceTimersByTime(501);
    expect(await p).toBeNull();
    expect(w.terminated).toBe(1);
    vi.useRealTimers();
  });
});
```

(The end-to-end case: 3000×6000 on the default limits → edge cap 3686.4 → scale 0.61440 → 1843×3686.)

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement** — `src/main/image-resize-worker.ts`:

```ts
// The picture-shrinking program (2026-10-07). Run by image-resize-service.ts
// as a Node worker_threads Worker, one per job, so a 50-megapixel decode never
// runs on the main thread (performance rule 1) and its memory is released when
// the thread ends. Pure JS on purpose: Electron's nativeImage is NOT available
// off the main/renderer threads (electron.d.ts `namespace Utility` exports only
// net, parentPort, systemPreferences), and a native image library would add an
// install script. pngjs and jpeg-js have none, so allowScripts stays untouched.
// Self-contained (no project imports) so the compiled file runs standalone.
import { parentPort, workerData, isMainThread } from 'worker_threads';
import { PNG } from 'pngjs';
import * as jpeg from 'jpeg-js';

export interface ResizeJob { bytes: Uint8Array; width: number; height: number; format: 'png' | 'jpeg' }
export interface Decoded { data: Uint8Array; width: number; height: number }

/** PNG or JPEG → RGBA. Anything else (GIF, WebP, junk) is null: those formats
 *  are declined upstream with a convert hint rather than guessed at. The 80 MP
 *  guard is enforced by the caller before dispatch; jpeg-js gets it again as a
 *  belt-and-braces option. */
export function decodeImage(bytes: Buffer): Decoded | null {
  try {
    if (bytes.length >= 8 && bytes.readUInt32BE(0) === 0x89504e47) {
      const png = PNG.sync.read(bytes);
      return { data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength), width: png.width, height: png.height };
    }
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      const out = jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 80, maxMemoryUsageInMB: 512 });
      return { data: out.data, width: out.width, height: out.height };
    }
  } catch { /* undecodable → null */ }
  return null;
}

/** Area-average (box) downscale over RGBA. Each destination pixel is the mean
 *  of the source block it covers — the right filter for shrinking screenshots
 *  (no ringing, thin text stays legible for as long as any filter keeps it). */
export function boxDownscale(src: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const out = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor((y * sh) / dh), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / dh));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor((x * sw) / dw), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / dw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * sw + x0) * 4;
        for (let xx = x0; xx < x1; xx++, i += 4) { r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]; n++; }
      }
      const o = (y * dw + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return out;
}

export function encodeImage(rgba: Uint8Array, w: number, h: number, format: 'png' | 'jpeg'): Buffer {
  if (format === 'png') {
    const png = new PNG({ width: w, height: h });
    png.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
    return PNG.sync.write(png);
  }
  return jpeg.encode({ data: Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), width: w, height: h }, 85).data;
}

/** The whole job, in one call — exported so tests run it in-process. */
export function runResizeJob(job: ResizeJob, decoder: typeof decodeImage = decodeImage): Buffer | null {
  const decoded = decoder(Buffer.from(job.bytes.buffer, job.bytes.byteOffset, job.bytes.byteLength));
  if (!decoded) return null;
  const rgba = decoded.width === job.width && decoded.height === job.height ? decoded.data : boxDownscale(decoded.data, decoded.width, decoded.height, job.width, job.height);
  return encodeImage(rgba, job.width, job.height, job.format);
}

if (!isMainThread && parentPort) {
  const out = runResizeJob(workerData as ResizeJob);
  // Peak RSS of THIS thread's process is what the Task 11 smoke reads back.
  if (process.env.YOUCODED_RESIZE_SMOKE) console.error(`resize-worker rss=${Math.round(process.memoryUsage().rss / 1048576)} MB`);
  parentPort.postMessage(out ? new Uint8Array(out.buffer, out.byteOffset, out.byteLength) : null);
}
```

`src/main/image-resize-service.ts`:

```ts
// Owns the resize worker threads: one Worker per job, terminated the moment it
// answers (or errors, or exceeds its time limit) so the decoded bitmap's
// memory goes back with the thread. image-prepare.ts already serialises jobs.
import * as path from 'path';
import { Worker } from 'worker_threads';
import type { ResizeFn } from './harness/image-prepare';
import type { ResizeJob } from './image-resize-worker';

export interface WorkerLike {
  on(event: 'message', cb: (bytes: Uint8Array | null) => void): void;
  on(event: 'error' | 'exit', cb: (...a: any[]) => void): void;
  terminate(): Promise<unknown> | void;
}

/** Where the compiled worker sits next to this file, in dev and packaged alike
 *  (`tsc` emits both into dist/main/) — the same way voice-service.ts's
 *  voiceWorkerPath() finds voice-worker.js. */
function workerPath(): string { return path.join(__dirname, 'image-resize-worker.js'); }

function nodeSpawn(job: ResizeJob): WorkerLike {
  return new Worker(workerPath(), { workerData: job });
}

/** Per-job time limit. EXECUTOR: set this to 3× the wall time measured for the
 *  real 2904×17528 incident size in Task 11 step 2b (never below 15 s) and
 *  record the measurement here; 60 s is a placeholder, not a measurement. */
export const RESIZE_JOB_TIMEOUT_MS = 60_000;

export function createResizeService(opts: { spawn?: (job: ResizeJob) => WorkerLike; jobTimeoutMs?: number } = {}): { resize: ResizeFn } {
  const spawn = opts.spawn ?? nodeSpawn;
  const jobTimeoutMs = opts.jobTimeoutMs ?? RESIZE_JOB_TIMEOUT_MS;
  const resize: ResizeFn = (req) => new Promise((resolve) => {
    let settled = false;
    const job: ResizeJob = { bytes: new Uint8Array(req.bytes.buffer, req.bytes.byteOffset, req.bytes.byteLength), width: req.width, height: req.height, format: req.format };
    const worker = spawn(job);
    const finish = (bytes: Buffer | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(bytes);
    };
    // WHY resolve null, not reject: a dead or slow worker is "could not
    // downscale", which the preparer already turns into an honest refusal.
    const timer = setTimeout(() => finish(null), jobTimeoutMs);
    worker.on('message', (bytes) => finish(bytes ? Buffer.from(bytes) : null));
    worker.on('error', () => finish(null));
    worker.on('exit', () => finish(null));
  });
  return { resize };
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/image-resize.test.ts` → PASS. `npm run knip`: the worker is reached through the service's type import plus the tests (same as `voice-service.ts` → `voice-worker.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/main/image-resize-worker.ts src/main/image-resize-service.ts tests/image-resize.test.ts
git commit -m "main: picture resize in a worker thread with pngjs/jpeg-js and a box filter"
```

---

### Task 7: Wire the preparer in — tool services, composer attachments, serialised send

**Files:**
- Modify: `src/main/harness/tools/types.ts` (`ToolServices` 100-108)
- Modify: `src/main/create-runtime.ts` (`NativeRuntime` 89-125; the store construction at 256; the host's tool-services object 372-382)
- Modify: `src/main/ipc/native.ts` (`NATIVE_SEND` handler 76-89)
- Test: `tests/native-channels.test.ts` (the existing `describe('native:send')` at line 74)

**Interfaces:**
- `ToolServices.images?: ImagePreparerLike`; `NativeRuntime.imagePreparer: ImagePreparer`.
- `NATIVE_SEND` handler: async; per session, serialised through a module-level `Map<sessionId, Promise<unknown>>` chain so a later send cannot overtake an earlier one's preparation (an entry is deleted once its tail settles and is still the latest); for every deliverable image attachment, `prepare(path, nativeHost.imageLimitsFor(sessionId))`; then `nativeHost.send(sessionId, text, files, modelFiles)` where `modelFiles[i]` is the derivative path when `kind === 'prepared'`, `{ path: files[i], prepareFailed: reason }` when `kind === 'refused'`, else `files[i]`. A runtime without `imagePreparer` (older tests) sends unchanged.

- [ ] **Step 1: Write the failing tests** — add to `describe('native:send')` in `tests/native-channels.test.ts`:

```ts
  it('prepares every picture attachment against the session limits and hands the host the model-facing paths', async () => {
    const send = vi.fn(() => ({ status: 'sent' }));
    const prepare = vi.fn(async (p: string) => p.endsWith('huge.png') ? { kind: 'prepared', path: '/cache/abc-huge.png' } : { kind: 'unchanged' });
    const limits = { maxEdgePx: 8192, maxPatches: 30_000 };
    const rt: any = { nativeHost: { send, imageLimitsFor: () => limits }, records: { noteSend: vi.fn() }, imagePreparer: { prepare, preparedPathFor: () => null } };
    expect(await call('native:send', { sessionId: 's', text: 'hi', attachments: ['/a/huge.png', 7, '/b.txt', '/c/ok.png'] }, desktopCtx(rt))).toEqual({ status: 'sent' });
    expect(prepare.mock.calls.map((c: any[]) => c[0])).toEqual(['/a/huge.png', '/c/ok.png']);   // only deliverable images are prepared
    expect(prepare.mock.calls[0][1]).toBe(limits);
    expect(send).toHaveBeenCalledWith('s', 'hi', ['/a/huge.png', '/b.txt', '/c/ok.png'], ['/cache/abc-huge.png', '/b.txt', '/c/ok.png']);
  });
  it('a refused preparation reaches the host as a marker carrying the reason, so the note says what really happened', async () => {
    const send = vi.fn(() => ({ status: 'sent' }));
    const reason = 'is 20000×20000 px — too large to downscale for the model (over 80 megapixels). Crop or shrink it with Bash (e.g. magick in.png -resize 4000x4000 out.png) and Read the copy.';
    const rt: any = { nativeHost: { send, imageLimitsFor: () => ({ maxEdgePx: 8192, maxPatches: 30_000 }) }, records: { noteSend: vi.fn() },
      imagePreparer: { prepare: async () => ({ kind: 'refused', reason, width: 20000, height: 20000 }), preparedPathFor: () => null } };
    await call('native:send', { sessionId: 's', text: 'hi', attachments: ['/vast.png'] }, desktopCtx(rt));
    expect(send).toHaveBeenCalledWith('s', 'hi', ['/vast.png'], [{ path: '/vast.png', prepareFailed: reason }]);
  });
  it('a preparer that throws never blocks the send; the original path is used', async () => {
    const send = vi.fn(() => ({ status: 'sent' }));
    const rt: any = { nativeHost: { send, imageLimitsFor: () => ({ maxEdgePx: 1, maxPatches: 1 }) }, records: { noteSend: vi.fn() }, imagePreparer: { prepare: async () => { throw new Error('boom'); }, preparedPathFor: () => null } };
    expect(await call('native:send', { sessionId: 's', text: 'hi', attachments: ['/a.png'] }, desktopCtx(rt))).toEqual({ status: 'sent' });
    expect(send).toHaveBeenCalledWith('s', 'hi', ['/a.png'], ['/a.png']);
  });
  it('sends to one session are serialised: a plain follow-up waits behind a message whose picture is still being prepared', async () => {
    const order: string[] = [];
    const send = vi.fn((_s: string, text: string) => { order.push(text); return { status: 'sent' }; });
    let release!: () => void; let entered!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const preparing = new Promise<void>((r) => { entered = r; });   // resolved the moment the preparer is entered — no microtask guessing
    const rt: any = { nativeHost: { send, imageLimitsFor: () => ({ maxEdgePx: 8192, maxPatches: 30_000 }) }, records: { noteSend: vi.fn() },
      imagePreparer: { prepare: async () => { entered(); await gate; return { kind: 'prepared', path: '/cache/x.png' }; }, preparedPathFor: () => null } };
    const first = call('native:send', { sessionId: 's', text: 'with picture', attachments: ['/a.png'] }, desktopCtx(rt));
    const second = call('native:send', { sessionId: 's', text: 'plain follow-up' }, desktopCtx(rt));
    const other = call('native:send', { sessionId: 'other', text: 'another session' }, desktopCtx(rt));
    await preparing;
    await other;
    expect(order).toEqual(['another session']);          // the picture is still being prepared; the follow-up waits; another session is not held back
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['another session', 'with picture', 'plain follow-up']);
  });
```

The existing first case (`hands the host only text paths`) passes a runtime without `imagePreparer`; update its expectation to `send` receiving the files twice (`['/a.png', '/b.txt'], ['/a.png', '/b.txt']`) and `[], []`.

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**

`tools/types.ts`, in `ToolServices` after `search?`:
```ts
  /** Picture preparation (image-prepare.ts): Read calls prepare() before it
   *  promises an over-limit image. Absent in tests and one-off contexts — the
   *  reader's pixel gate still holds. */
  images?: ImagePreparerLike;
```

`create-runtime.ts`: `import { ImagePreparer } from './harness/image-prepare'; import { createResizeService } from './image-resize-service';` Add `imagePreparer: ImagePreparer;` to `NativeRuntime`. Beside the store construction (256):
```ts
  // Shrunk copies of pictures too big for a model (image-prepare.ts). Profile-
  // private like the continuation store: userData, never NativeHome.
  const imagePreparer = new ImagePreparer(path.join(userDataDir, 'image-cache'), createResizeService().resize);
```
Add `images: imagePreparer,` to the host's tool-services object (beside `search: searchService,`) and `imagePreparer` to the returned runtime. (Workers are per-job; nothing to stop at quit.)

`ipc/native.ts`:
```ts
import { deliverableImageMediaType } from '../harness/image-support';

// WHY a per-session chain: send() is synchronous by contract (native-runtime.md),
// so the one async step a big picture needs — shrinking it to a cached file —
// runs here first. Chaining per session keeps order: a plain follow-up typed
// while a picture is still being prepared must not reach the host first.
const sendChains = new Map<string, Promise<unknown>>();

async function modelPathsFor(runtime: NativeRuntime, sessionId: string, files: string[]): Promise<ModelAttachment[]> {
  const preparer = runtime.imagePreparer;
  if (!preparer) return files;
  const limits = runtime.nativeHost.imageLimitsFor(sessionId);
  return Promise.all(files.map(async (f): Promise<ModelAttachment> => {
    if (!deliverableImageMediaType(f)) return f;
    try {
      const r = await preparer.prepare(f, limits);
      if (r.kind === 'prepared') return r.path;
      // A refusal travels WITH its reason so the model is told preparation failed
      // (and why), not that the picture is merely over a size limit.
      if (r.kind === 'refused') return { path: f, prepareFailed: r.reason };
      return f;
    } catch { return f; }   // the gate still refuses an unprepared oversized file, with a note
  }));
}
```
and the handler:
```ts
    handler: async ({ sessionId, text, attachments, sendId }, ctx) => {
      const files = (Array.isArray(attachments) ? attachments : []).filter((a): a is string => typeof a === 'string');
      if (!ctx.runtime) return NOT_LIVE_SEND;
      const runtime = ctx.runtime;
      const previous = sendChains.get(sessionId) ?? Promise.resolve();
      const turn = previous.then(async () => {
        const modelFiles = await modelPathsFor(runtime, sessionId, files);
        const result = runtime.nativeHost.send(sessionId, text, files, modelFiles);
        if (sendId !== undefined && result && result.status !== 'failed') runtime.records.noteSend(sessionId, sendId);
        return result;
      });
      const tail = turn.catch(() => undefined);
      sendChains.set(sessionId, tail);
      // Forget a settled chain that nothing newer replaced, so idle sessions hold no entry.
      void tail.then(() => { if (sendChains.get(sessionId) === tail) sendChains.delete(sessionId); });
      return turn;
    },
```
(`NativeRuntime` type import from `../create-runtime`; `type ModelAttachment` from `../harness/busy-message-boundary`; keep the existing comments about text-only paths and `noteSend`.)

- [ ] **Step 4: Run** — `npx vitest run tests/native-channels.test.ts tests/channel-table-families.test.ts tests/ipc-channels.test.ts` → PASS; `npm run typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/tools/types.ts src/main/create-runtime.ts src/main/ipc/native.ts tests/native-channels.test.ts
git commit -m "native send + tool services: prepare over-limit pictures, serialised per session"
```

---

### Task 8: The Read tool shrinks before it promises, and says so

**Files:**
- Modify: `src/main/harness/tools/read.ts` (image branch 168-187)
- Test: `tests/harness-tools-core.test.ts` (`Read: image delivery` suite 224-268)

**Interfaces:**
- Consumes: `ctx.services?.images`, `ctx.imageLimits` (Task 3), `IMAGE_LIMITS_DEFAULT`.
- Produces text forms (pinned):
  - unchanged: `Read image <path> (<KB> KB, <mediaType>).` (today's)
  - prepared: `Read image <path> (<W>×<H> px, shown downscaled to <w>×<h>, <pct>% of original; small text may be unreadable — Read individual screenshots or crops for detail).`
  - refused: `Read rejected: <path> <reason>` with `isError: true`, no `images`.

- [ ] **Step 1: Write the failing tests** — append to the suite (import `pngHeader` from `./helpers/image-fixtures`, `IMAGE_LIMITS_OPENAI` from capability-profile):

```ts
  it('promises the PREPARED file for an over-limit picture and discloses the downscale', async () => {
    const p = path.join(dir, 'contact.png');
    fs.writeFileSync(p, pngHeader(2904, 17528));
    const small = path.join(dir, 'cache', 'abc-contact.png');
    fs.mkdirSync(path.dirname(small)); fs.writeFileSync(small, pngHeader(1221, 7372));
    const prepare = vi.fn(async () => ({ kind: 'prepared' as const, path: small, mediaType: 'image/png' as const, width: 2904, height: 17528, preparedWidth: 1221, preparedHeight: 7372 }));
    const r = await ReadTool.execute({ file_path: p }, { ...makeCtx(dir), supportsVision: true, imageLimits: IMAGE_LIMITS_OPENAI, services: { images: { prepare, preparedPathFor: () => null } } });
    expect(r.isError).toBeFalsy();
    expect(prepare).toHaveBeenCalledWith(p, IMAGE_LIMITS_OPENAI);
    expect(r.images).toEqual([small]);
    expect(r.imageLabels).toEqual(['contact.png']);
    expect(r.text).toBe(`Read image ${p} (2904×17528 px, shown downscaled to 1221×7372, 42% of original; small text may be unreadable — Read individual screenshots or crops for detail).`);
  });

  it('an in-budget picture is promised as-is with today’s text; prepare() is consulted once and says unchanged', async () => {
    const p = path.join(dir, 'ok.png');
    fs.writeFileSync(p, pngHeader(640, 480));
    const prepare = vi.fn(async () => ({ kind: 'unchanged' as const, width: 640, height: 480 }));
    const r = await ReadTool.execute({ file_path: p }, { ...makeCtx(dir), supportsVision: true, services: { images: { prepare, preparedPathFor: () => null } } });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(r.images).toEqual([p]);
    expect(r.text).toContain('Read image');
    expect(r.text).toContain('image/png');
  });

  it('a refusal from the preparer is an honest Read rejection that promises nothing', async () => {
    const p = path.join(dir, 'vast.png');
    fs.writeFileSync(p, pngHeader(20000, 20000));
    const reason = 'is 20000×20000 px — too large to downscale for the model (over 80 megapixels). Crop or shrink it with Bash (e.g. magick in.png -resize 4000x4000 out.png) and Read the copy.';
    const prepare = vi.fn(async () => ({ kind: 'refused' as const, reason, width: 20000, height: 20000 }));
    const r = await ReadTool.execute({ file_path: p }, { ...makeCtx(dir), supportsVision: true, services: { images: { prepare, preparedPathFor: () => null } } });
    expect(r.isError).toBe(true);
    expect(r.images).toBeUndefined();
    expect(r.text).toBe(`Read rejected: ${p} ${reason}`);
  });

  it('with no preparer wired (tests, one-off contexts) the path is promised and the DRIVER’s gate decides', async () => {
    const p = path.join(dir, 'contact2.png');
    fs.writeFileSync(p, pngHeader(2904, 17528));
    const r = await ReadTool.execute({ file_path: p }, { ...makeCtx(dir), supportsVision: true });
    expect(r.images).toEqual([p]);
  });
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement** — replace the `if (imageMediaType) { … }` block in `read.ts`:

```ts
    if (imageMediaType) {
      if (st.size > MAX_ATTACHMENT_BYTES) {
        return { text: `Read rejected: ${args.file_path} is a ${(st.size / (1024 * 1024)).toFixed(1)} MB image (limit ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB).`, isError: true };
      }
      ctx.readRegistry.set(canonicalize(args.file_path, ctx.cwd), await fingerprintFile(abs));
      // Shrink-once (2026-10-07, image-prepare.ts): a picture over THIS session's
      // provider limits is downscaled into a cached file BEFORE it is promised, so
      // the driver, the transcript and every resume path see a size the provider
      // accepts. The text keeps the user's path and says what changed — the model
      // must know small text may be unreadable. Absent service → promise the
      // path; resolveToolImages' gate still refuses with a note.
      const prepared = ctx.services?.images ? await ctx.services.images.prepare(abs, ctx.imageLimits ?? IMAGE_LIMITS_DEFAULT) : null;
      if (prepared?.kind === 'refused') return { text: `Read rejected: ${args.file_path} ${prepared.reason}`, isError: true };
      if (prepared?.kind === 'prepared') {
        const pct = Math.max(1, Math.round((100 * prepared.preparedWidth) / prepared.width));
        return {
          text: `Read image ${args.file_path} (${prepared.width}×${prepared.height} px, shown downscaled to ${prepared.preparedWidth}×${prepared.preparedHeight}, ${pct}% of original; small text may be unreadable — Read individual screenshots or crops for detail).`,
          images: [prepared.path],
          imageLabels: [path.basename(abs)],   // the model-facing name stays the ORIGINAL file's
        };
      }
      return { text: `Read image ${args.file_path} (${Math.max(1, Math.round(st.size / 1024))} KB, ${imageMediaType}).`, images: [abs] };
    }
```

(`import { IMAGE_LIMITS_DEFAULT } from '../capability-profile';`.) No new sync call in `read.ts` (its allowlist entry — one `fs.statSync` in `execute` — is unchanged; the file is PROTECTED in `tests/main-blocking-calls.test.ts`).

- [ ] **Step 4: Run** — `npx vitest run tests/harness-tools-core.test.ts tests/main-blocking-calls.test.ts tests/native-tools-polish.test.ts tests/tool-registry-manifest.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/tools/read.ts tests/harness-tools-core.test.ts
git commit -m "Read: downscale an over-limit picture once and disclose it before promising"
```

---

### Task 9: Recognise the provider rejection — three body shapes, one sentence

**Files:**
- Create: `src/main/providers/image-too-large.ts`
- Test: `tests/image-too-large.test.ts`

**Interfaces:**
- `export interface ImageTooLarge { requiredPatches: number; limitPatches: number }`, `export function imageTooLarge(error: unknown): ImageTooLarge | null`.

- [ ] **Step 1: Write the failing test** — `tests/image-too-large.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { imageTooLarge } from '../src/main/providers/image-too-large';

const MESSAGE = 'The image you provided requires 49868 patches after processing, exceeding the limit of 30000.';
const HIT = { requiredPatches: 49_868, limitPatches: 30_000 };

describe('imageTooLarge recognises the one captured sentence in any of three envelopes, status 400 only', () => {
  it('error.message (OpenAI JSON error envelope)', () => {
    expect(imageTooLarge({ statusCode: 400, responseBody: JSON.stringify({ error: { message: MESSAGE, type: 'invalid_request_error', code: null } }) })).toEqual(HIT);
  });
  it('detail (the Codex route answers refusals with a `detail` field — chatgpt-oauth.ts)', () => {
    expect(imageTooLarge({ statusCode: 400, responseBody: JSON.stringify({ detail: MESSAGE }) })).toEqual(HIT);
  });
  it('top-level message', () => {
    expect(imageTooLarge({ status: 400, data: { message: MESSAGE } })).toEqual(HIT);
  });
  it('unwraps the step-retry wrapper like describeProviderError', () => {
    expect(imageTooLarge({ lastError: { statusCode: 400, responseBody: JSON.stringify({ error: { message: MESSAGE } }) } })).toEqual(HIT);
  });
  it('is null for every other 400, any other status, prose-only partial matches and junk', () => {
    expect(imageTooLarge({ statusCode: 400, responseBody: JSON.stringify({ error: { message: 'messages: text content blocks must be non-empty' } }) })).toBeNull();
    expect(imageTooLarge({ statusCode: 413, responseBody: JSON.stringify({ error: { message: MESSAGE } }) })).toBeNull();
    expect(imageTooLarge({ statusCode: 400, responseBody: JSON.stringify({ error: { message: 'patches after processing' } }) })).toBeNull();
    expect(imageTooLarge({ statusCode: 400, responseBody: 'not json' })).toBeNull();
    expect(imageTooLarge(new Error(MESSAGE))).toBeNull();
    expect(imageTooLarge(null)).toBeNull();
    expect(imageTooLarge('rate limited')).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**:

```ts
// Intentionally narrow, like context-overflow.ts: the ONE structured rejection
// an oversized picture produces on OpenAI's wire, matched by status AND exact
// wording. Never infer from a bare 400 or from prose that merely mentions
// images. Provider-agnostic on purpose: OpenRouter relays OpenAI's message
// verbatim, so the body, not the provider id, is the evidence.
// WHY three envelopes: the sentence was read off a screenshot of the ChatGPT
// route (2026-10-06); the live error OBJECT was never captured. OpenAI's JSON
// API puts it in error.message; the Codex route answers refusals with a
// `detail` field (chatgpt-oauth.ts ~661 reads json.detail); a proxy may flatten
// it to a top-level message. All three are accepted; any other shape is not.
export interface ImageTooLarge { requiredPatches: number; limitPatches: number }

const PATCHES_RE = /requires (\d+) patches after processing, exceeding the limit of (\d+)/;

export function imageTooLarge(error: unknown): ImageTooLarge | null {
  const e = (error as any)?.lastError ?? error as any;
  if (!e || typeof e !== 'object') return null;
  if ((e.statusCode ?? e.status) !== 400) return null;
  let body: any;
  try { body = typeof e.responseBody === 'string' ? JSON.parse(e.responseBody) : e.data; } catch { return null; }
  if (!body || typeof body !== 'object') return null;
  for (const candidate of [body.error?.message, body.detail, body.message]) {
    const m = typeof candidate === 'string' ? PATCHES_RE.exec(candidate) : null;
    if (m) return { requiredPatches: Number(m[1]), limitPatches: Number(m[2]) };
  }
  return null;
}
```

- [ ] **Step 4: Run** — PASS. **Step 5: Commit** — `git add src/main/providers/image-too-large.ts tests/image-too-large.test.ts && git commit -m "providers: classify OpenAI's image-patch rejection, narrowly, in three envelopes"`.

---

### Task 10: Enforce limits on every provider change and before every summary; one bounded recovery

**Files:**
- Modify: `src/main/harness/harness-session.ts` (imports ~16-41; `setBinding` 1090-1128; `maybeCompact` 1883; `compactNow` 2127; the step `while (true)` 2766-2781; new private methods near `commitPrune` 1979)
- Test: `tests/harness-session-loop.test.ts`

**Interfaces:**
- `private collapseOversizedImages(limits: ImageLimits): boolean` — rewrites `this.history` in place (same length, order, tool pairing); every tool-result file part over `limits` becomes an oversized note (basename label; fitting siblings stay; text first, files, then notes) and every user-message file part over `limits` becomes a trailing note text part; bumps the capture revision; clears `shownImages`; returns whether anything changed.
- `private enforceImageLimits(): boolean` = `collapseOversizedImages(this.profile.imageLimits)`, called (a) at the end of `setBinding` when `profile` was provided, (b) at the top of `maybeCompact` and `compactNow` (before any cut is chosen, so neither the summariser nor the kept tail can carry an over-limit picture).
- The step loop: on `imageTooLarge(err)` with no output started and not yet retried, `collapseOversizedImages({ maxEdgePx: this.profile.imageLimits.maxEdgePx, maxPatches: Math.min(this.profile.imageLimits.maxPatches, limitPatches) })`; if it changed anything, retry once.
- Consumes: `imageTooLarge` (Task 9); `imageDimensions`, `withinImageLimits`, `imageNote` (Task 2); `ImageLimits`.

- [ ] **Step 1: Write the failing tests** — add to `tests/harness-session-loop.test.ts` (imports: `pngHeader` from `./helpers/image-fixtures`; `imageNote`, `readImageFromDisk` from image-support; `rebuildHistory` from history-rebuild; `resolveProfile, IMAGE_LIMITS_OPENAI` from capability-profile; `crypto` from 'crypto'):

```ts
describe('HarnessSession keeps over-limit pictures out of model memory and recovers from the provider rejection', () => {
  const PATCH_400 = () => Object.assign(new Error('rejected'), { statusCode: 400,
    responseBody: JSON.stringify({ error: { message: 'The image you provided requires 49868 patches after processing, exceeding the limit of 30000.' } }) });
  const huge = Buffer.concat([pngHeader(2904, 17528), Buffer.alloc(40)]);
  const fine = pngHeader(640, 480);
  const NOTE = imageNote({ kind: 'oversized', label: 'contact.png', width: 2904, height: 17528 });
  /** A finished turn: the model asked Read for pictures and got two back — one over budget. */
  const blockedHistory = () => ([
    { role: 'user', content: 'look at the sheet' },
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c0', toolName: 'Read', input: { file_path: '/tmp/contact.png' } }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c0', toolName: 'Read', output: { type: 'content', value: [
      { type: 'text', text: 'Read images' },
      { type: 'file', mediaType: 'image/png', data: { type: 'data', data: huge }, filename: 'contact.png' },
      { type: 'file', mediaType: 'image/png', data: { type: 'data', data: fine }, filename: 'ok.png' },
    ] } }] },
    { role: 'assistant', content: 'I see them.' },
  ] as any);
  const chatgpt = () => resolveProfile({ providerType: 'chatgpt', modelId: 'gpt-x', contextLength: null });
  /** Limits that ACCEPT the sheet: only the provider's rejection can trigger a collapse — the safety-net scenario (a wrong-high placeholder). */
  const lax = () => ({ ...chatgpt(), imageLimits: { maxEdgePx: 100_000, maxPatches: 1_000_000 } });
  const twoStep = (prompts: any[]) => {
    const scripts = [stream({ type: 'error', error: PATCH_400() }), stream(...textChunks('a', 'done'), finishChunk('stop'))];
    let index = 0;
    return new MockLanguageModelV4({ doStream: async (o: any) => { prompts.push(o); return { stream: simulateReadableStream({ chunks: scripts[index++] ?? stream(finishChunk('stop')) }) }; } });
  };

  it('safety net: collapses the offending image to the note, retries ONCE, the turn completes, no tool rerun', async () => {
    const read = fakeTool('Read');
    const prompts: any[] = [];
    const session = new HarnessSession(makeOpts({ tools: [read], decide: async () => ALLOW, contextLength: 128_000, profile: lax() }), async () => twoStep(prompts) as any);
    session.seedHistory(blockedHistory());
    const events = collect(session);
    await session.send('uh');
    expect(prompts).toHaveLength(2);
    expect((read as any).calls).toHaveLength(0);
    expect(events.some(e => e.type === 'turn-complete')).toBe(true);
    expect(events.some(e => e.type === 'session-error')).toBe(false);
    const out = (session.acceptedHistory().messages.find((m: any) => m.role === 'tool') as any).content[0].output;
    expect(out).toEqual({ type: 'content', value: [
      { type: 'text', text: 'Read images\n' + NOTE },
      { type: 'file', mediaType: 'image/png', data: { type: 'data', data: fine }, filename: 'ok.png' },
    ] });
    expect(JSON.stringify(prompts[1].prompt)).toContain("above this model's image size limit");
  });

  it('collapse output equals rebuildHistory output for the same persisted tool events (one label, one shape)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-collapse-'));
    const contact = path.join(dir, 'contact.png'); fs.writeFileSync(contact, huge);
    const ok = path.join(dir, 'ok.png'); fs.writeFileSync(ok, fine);
    const ev = (type: string, data: any) => ({ type, sessionId: 's', uuid: crypto.randomUUID(), timestamp: 1, data }) as any;
    // Tool events only: a collapsed bare user part is labelled 'image' (no path in memory), the rebuild knows the basename.
    const events = [
      ev('user-message', { text: 'see' }),
      ev('tool-use', { toolUseId: 't1', toolName: 'Read', toolInput: { file_path: contact } }),
      ev('tool-result', { toolUseId: 't1', toolName: 'Read', toolResult: 'Read images', images: [contact, ok] }),
      ev('turn-complete', {}),
    ];
    const permissive = rebuildHistory(events, (p) => readImageFromDisk(p));             // pre-gate shape: both pictures in
    const gated = rebuildHistory(events, (p) => readImageFromDisk(p, IMAGE_LIMITS_OPENAI));
    const session = new HarnessSession(makeOpts({ tools: [], profile: chatgpt() }), async () => scriptedModel([]) as any);
    session.seedHistory(permissive);
    expect((session as any).collapseOversizedImages(IMAGE_LIMITS_OPENAI)).toBe(true);
    expect((session as any).history).toEqual(gated);
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  });

  it('a provider switch to stricter limits collapses history before the next request', async () => {
    const prompts: any[] = [];
    const model = new MockLanguageModelV4({ doStream: async (o: any) => { prompts.push(o); return { stream: simulateReadableStream({ chunks: stream(...textChunks('a', 'ok'), finishChunk('stop')) }) }; } });
    const session = new HarnessSession(makeOpts({ tools: [], contextLength: 128_000, profile: lax() }), async () => model as any);
    session.seedHistory(blockedHistory());
    const before = session.acceptedHistory().revision;
    session.setBinding({ providerId: 'chatgpt', modelId: 'gpt-y' }, null, chatgpt());
    expect(session.acceptedHistory().revision).toBeGreaterThan(before);
    await session.send('now?');
    expect(JSON.stringify(prompts[0].prompt)).toContain(NOTE);
    expect(JSON.stringify(prompts[0].prompt)).not.toContain(huge.toString('base64'));
  });

  it('a summary never receives an over-limit picture: compaction enforces the limits first', async () => {
    const prompts: any[] = [];
    const model = new MockLanguageModelV4({ doStream: async (o: any) => { prompts.push(o); return { stream: simulateReadableStream({ chunks: stream(...textChunks('s', 'summary'), finishChunk('stop')) }) }; } });
    const session = new HarnessSession(makeOpts({ tools: [], contextLength: 128_000, profile: chatgpt() }), async () => model as any);
    session.seedHistory(blockedHistory());                     // seeded past the gate on purpose
    await session.compactNow();
    expect(prompts.length).toBeGreaterThan(0);
    for (const p of prompts) expect(JSON.stringify(p.prompt)).not.toContain(huge.toString('base64'));
  });

  it('an oversized composer attachment becomes a trailing note on recovery; the text stays', async () => {
    const prompts: any[] = [];
    const session = new HarnessSession(makeOpts({ tools: [], contextLength: 128_000, profile: lax() }), async () => twoStep(prompts) as any);
    session.seedHistory([{ role: 'user', content: [{ type: 'text', text: '/tmp/huge.png what' }, { type: 'file', mediaType: 'image/png', data: huge }] }, { role: 'assistant', content: 'hm' }] as any);
    await session.send('again');
    expect(prompts).toHaveLength(2);
    expect(session.acceptedHistory().messages[0]).toEqual({ role: 'user', content: [{ type: 'text', text: '/tmp/huge.png what' }, { type: 'text', text: imageNote({ kind: 'oversized', label: 'image', width: 2904, height: 17528 }) }] });
  });

  it('does not retry when nothing in history is over the reported limit — the provider error surfaces unchanged', async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({ doStream: async () => { calls++; return { stream: simulateReadableStream({ chunks: stream({ type: 'error', error: PATCH_400() }) }) }; } });
    const session = new HarnessSession(makeOpts({ tools: [], contextLength: 128_000, profile: chatgpt() }), async () => model as any);
    const events = collect(session);
    await session.send('plain text');
    expect(calls).toBe(1);
    expect(events.find(e => e.type === 'session-error')!.data.text).toContain('requires 49868 patches');
  });

  it('retries at most once: a second rejection surfaces', async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({ doStream: async () => { calls++; return { stream: simulateReadableStream({ chunks: stream({ type: 'error', error: PATCH_400() }) }) }; } });
    const session = new HarnessSession(makeOpts({ tools: [], contextLength: 128_000, profile: lax() }), async () => model as any);
    session.seedHistory(blockedHistory());
    const events = collect(session);
    await session.send('uh');
    expect(calls).toBe(2);
    expect(events.some(e => e.type === 'session-error')).toBe(true);
  });

  it('never retries after output began', async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({ doStream: async () => { calls++; return { stream: simulateReadableStream({ chunks: stream(...textChunks('p', 'partial'), { type: 'error', error: PATCH_400() }) }) }; } });
    const session = new HarnessSession(makeOpts({ tools: [], contextLength: 128_000, profile: lax() }), async () => model as any);
    session.seedHistory(blockedHistory());
    await session.send('uh');
    expect(calls).toBe(1);
  });

  it('prepared bytes are stable across requests: the same file part object is sent twice', async () => {
    const prompts: any[] = [];
    const model = new MockLanguageModelV4({ doStream: async (o: any) => { prompts.push(o); return { stream: simulateReadableStream({ chunks: stream(...textChunks('a', 'ok'), finishChunk('stop')) }) }; } });
    const session = new HarnessSession(makeOpts({ tools: [], contextLength: 128_000, profile: chatgpt() }), async () => model as any);
    session.seedHistory([{ role: 'user', content: [{ type: 'text', text: 'pic' }, { type: 'file', mediaType: 'image/png', data: fine }] }, { role: 'assistant', content: 'ok' }] as any);
    const first = (session as any).history[0];
    await session.send('one'); await session.send('two');
    expect((session as any).history[0]).toBe(first);            // same message object, never rebuilt
    expect((session as any).history[0].content[1].data).toBe(fine);   // never re-encoded, never copied
    expect(prompts).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/harness-session-loop.test.ts -t "over-limit pictures"` → FAIL.

- [ ] **Step 3: Implement**

Imports: `import { imageTooLarge } from '../providers/image-too-large';`; add `imageDimensions, withinImageLimits, imageNote` to the image-support import; add `type ImageLimits` to the existing capability-profile import.

`setBinding` — after `if (profile) this.profile = profile;` add:
```ts
    // WHY: a history that fit the old provider must never reach a stricter one.
    // Re-applying the gate here (not only on the error path) means the first
    // request after a switch already carries the note, not the picture.
    if (profile) this.enforceImageLimits();
```
`maybeCompact` and `compactNow` — first statement of each: `this.enforceImageLimits();` with the comment `// Neither the summariser nor the kept tail may carry an over-limit picture (2026-10-07).`

Step loop (`let overflowRetried = false;` → add `let imageRetried = false;`) and the `catch`:
```ts
          } catch (err) {
            // Only a rejected request with no emitted output is safe to replay.
            // Completed tools were already appended before this step and are never rerun.
            const replayable = !partialAssistantText && !this.overflowOutputStarted;
            // Oversized picture (2026-10-07): the provider named the budget; collapse
            // every image part over it to the shared note, then retry ONCE. Nothing
            // is retried unchanged — collapse must report a change. This is the
            // safety net behind enforceImageLimits (a wrong-high placeholder limit).
            const tooLarge = replayable && !imageRetried ? imageTooLarge(err) : null;
            if (tooLarge && this.collapseOversizedImages({ maxEdgePx: this.profile.imageLimits.maxEdgePx, maxPatches: Math.min(this.profile.imageLimits.maxPatches, tooLarge.limitPatches) })) {
              imageRetried = true;
              this.prefixMoved = true;
              turnUsage.expectedRebuild = true;
              continue;
            }
            if (overflowRetried || !replayable || !isContextOverflow(err, this.binding.providerId)
              || !await this.maybeCompact(model, aiTools, true)) throw err;
            overflowRetried = true;
            this.prefixMoved = true;
            turnUsage.expectedRebuild = true;
          }
```

New methods after `commitPrune`:
```ts
  /** The gate, re-applied to what is already in memory: the session's current
   *  limits. Returns whether history changed. */
  private enforceImageLimits(): boolean { return this.collapseOversizedImages(this.profile.imageLimits); }

  /** Rewrite history so no image part exceeds `limits`: a tool-result file part
   *  becomes the shared oversized note appended to that result's text (fitting
   *  siblings stay; text first, files, then notes); a user-message file part
   *  becomes a trailing note text part. Same length, same order, same tool
   *  pairing. Labels are BASENAMES (a user part has no name → 'image').
   *  WHY in-memory only: the reader writes this exact shape on every rebuild,
   *  so reopen reproduces it without a new persisted event, and the accepted-
   *  history store describes it (`pruned.oversized`, `note`). shownImages is
   *  cleared like commitPrune does, so a later Read re-delivers — prepared. */
  private collapseOversizedImages(limits: ImageLimits): boolean {
    let changed = false;
    const over = (buf: unknown): { width: number; height: number } | null => {
      if (!Buffer.isBuffer(buf)) return null;
      const dims = imageDimensions(buf);
      return dims && !withinImageLimits(dims, limits) ? dims : null;
    };
    const next = this.history.map((m) => {
      const content = (m as any).content;
      if (!Array.isArray(content)) return m;
      let touched = false;
      if (m.role === 'tool') {
        const next = content.map((part: any) => {
          if (part?.type !== 'tool-result' || part.output?.type !== 'content' || !Array.isArray(part.output.value)) return part;
          const texts: string[] = []; const files: any[] = []; const notes: string[] = [];
          for (const v of part.output.value) {
            const dims = v?.type === 'file' && v.data?.type === 'data' ? over(v.data.data) : null;
            if (dims) notes.push(imageNote({ kind: 'oversized', label: v.filename ?? part.toolName ?? 'image', width: dims.width, height: dims.height }));
            else if (v?.type === 'text') texts.push(v.text);
            else files.push(v);
          }
          if (!notes.length) return part;
          touched = true;
          const text = texts.join('\n') + notes.map((n) => `\n${n}`).join('');
          return { ...part, output: files.length ? { type: 'content', value: [{ type: 'text', text }, ...files] } : { type: 'text', value: text } };
        });
        if (!touched) return m;
        changed = true;
        return { ...(m as object), content: next } as ModelMessage;
      }
      if (m.role === 'user') {
        const kept: any[] = []; const notes: any[] = [];
        for (const p of content) {
          const dims = p?.type === 'file' ? over(p.data) : null;
          if (dims) notes.push({ type: 'text', text: imageNote({ kind: 'oversized', label: 'image', width: dims.width, height: dims.height }) });
          else kept.push(p);
        }
        if (!notes.length) return m;
        changed = true;
        return { ...(m as object), content: [...kept, ...notes] } as ModelMessage;
      }
      return m;
    });
    if (!changed) return false;   // never swap the array for a no-op: untouched messages keep their identity
    this.history = next;
    this.capture.mutated(); this.shownImages.clear(); this.reconcileTriggerVisibility();
    return true;
  }
```
(`reconcileTriggerVisibility` is what `commitPrune` calls on a changed history — read it at line 1979 and keep the same call; do NOT call `markPruned`, this is a `mutated()` rewrite, not a prune transformation. `historyOrigins` needs no change: indices are unchanged. An untouched message keeps its identity — the "stable bytes" test depends on it.)

- [ ] **Step 4: Run** — `npx vitest run tests/harness-session-loop.test.ts tests/harness-accepted-history.test.ts tests/harness-stall-watchdog.test.ts tests/harness-session.test.ts tests/native-session-host-continuation.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/harness-session.ts tests/harness-session-loop.test.ts
git commit -m "harness: enforce image limits on provider change and before summaries; collapse and retry once on the patch rejection"
```

---

### Task 11: Host-level reopen, built-worker smoke, whole-branch verification

**Files:**
- Test: `tests/native-session-host-continuation.test.ts`

- [ ] **Step 1: Host-level reopen keeps the repair** — add, using the file's `makeHost`, `turn`, `scriptedFetch`, `textStep`, `BINDING` helpers (read them first; `vision: true` is accepted by `makeHost`; imports: `pngHeader` from `./helpers/image-fixtures`, `imageNote` from image-support, `crypto`):

```ts
  it('reopen after a collapse keeps the repair, through the private checkpoint too', async () => {
    const first = makeHost({ home, userData, vision: true, fetchImpl: scriptedFetch([], [textStep('one', 'first answer')]) });
    await first.host.create({ sessionId: 'collapsed-reopen', cwd, binding: BINDING });
    await turn(first.host, 'collapsed-reopen', 'hello');
    await first.host.destroyAll();
    // Splice a pre-gate Read of an over-limit picture into the transcript (a session from before this fix).
    const huge = path.join(home, 'contact.png'); fs.writeFileSync(huge, pngHeader(2904, 17528));
    const transcriptPath = first.sessionStore.transcriptPath('collapsed-reopen', cwd);
    const stamp = (type: string, data: any) => JSON.stringify({ type, sessionId: 'collapsed-reopen', uuid: crypto.randomUUID(), timestamp: Date.now(), data });
    fs.appendFileSync(transcriptPath, [
      stamp('user-message', { text: 'look' }),
      stamp('tool-use', { toolUseId: 'call_h', toolName: 'Read', toolInput: { file_path: huge } }),
      stamp('tool-result', { toolUseId: 'call_h', toolName: 'Read', toolResult: 'Read image', images: [huge] }),
      stamp('turn-complete', {}), '',
    ].join('\n'));
    const second = makeHost({ home, userData, vision: true, fetchImpl: scriptedFetch([], [textStep('two', 'second answer')]) });
    const secondLog = vi.spyOn(second.host as any, 'logContinuation');
    expect(await second.host.resume('collapsed-reopen', cwd)).toBe(true);
    // WHICH path restored: the appended lines moved the transcript past the first
    // host's checkpoint, so the private restore fails 'transcript-advanced' and the
    // GATED REBUILD is what wrote the note.
    expect(secondLog).toHaveBeenCalledWith('collapsed-reopen', 'transcript-advanced', 'restore');
    const note = imageNote({ kind: 'oversized', label: 'contact.png', width: 2904, height: 17528 });
    const resumed = (second.host as any).live.get('collapsed-reopen').session;
    expect(JSON.stringify(resumed.acceptedHistory().messages)).toContain(note);
    expect(JSON.stringify(resumed.acceptedHistory().messages)).not.toContain(pngHeader(2904, 17528).toString('base64'));
    await turn(second.host, 'collapsed-reopen', 'and now');       // publishes a checkpoint describing the collapsed result
    await second.host.destroyAll();
    const third = makeHost({ home, userData, vision: true, fetchImpl: scriptedFetch([], []) });
    const thirdLog = vi.spyOn(third.host as any, 'logContinuation');
    expect(await third.host.resume('collapsed-reopen', cwd)).toBe(true);
    // This time the PRIVATE CHECKPOINT (published after the second host's turn,
    // describing the collapsed result as `pruned.oversized`) is what restored:
    // no restore-phase fallback was logged.
    expect(thirdLog.mock.calls.filter((c: any[]) => c[2] === 'restore')).toEqual([]);
    const again = (third.host as any).live.get('collapsed-reopen').session;
    expect(JSON.stringify(again.acceptedHistory().messages)).toContain(note);
    expect(JSON.stringify(again.acceptedHistory().messages)).not.toContain('"type":"file"');
    await third.host.destroyAll();
  });
```

(If `logContinuation`'s restore-phase call for the second host turns out to carry a different reason because the store's prefix fence ran first, assert on that exact reason — but the claim "rebuild wrote it" must match what the log says.)

(`BINDING` is the ChatGPT binding, so the resumed profile carries `IMAGE_LIMITS_OPENAI`.) Run it: `npx vitest run tests/native-session-host-continuation.test.ts -t "collapse"` → PASS. Commit: `git add tests/native-session-host-continuation.test.ts && git commit -m "host: reopen after an oversized-image collapse keeps the repair"`.

- [ ] **Step 2: Built-worker smoke** — `npm run build:main`, then from `desktop/`:

```bash
node -e "
const { Worker } = require('worker_threads'); const { PNG } = require('pngjs');
const png = new PNG({ width: 3000, height: 6000 }); png.data.fill(120);
const bytes = new Uint8Array(PNG.sync.write(png));
const w = new Worker('./dist/main/image-resize-worker.js', { workerData: { bytes, width: 1843, height: 3686, format: 'png' } });
w.on('message', (out) => { const r = PNG.sync.read(Buffer.from(out)); console.log(r.width, r.height); });
w.on('error', (e) => { console.error('worker error', e); process.exit(1); });"
```
Expected output: `1843 3686`. This proves the compiled worker file loads standalone (no project imports) and answers over `parentPort`.

- [ ] **Step 2b: Measure the incident size** — same shape at the real 2904×17528 (target 1221×7372), under `/usr/bin/time -v` and with the worker's own RSS line enabled:

```bash
YOUCODED_RESIZE_SMOKE=1 /usr/bin/time -v node -e "
const { Worker } = require('worker_threads'); const { PNG } = require('pngjs');
const png = new PNG({ width: 2904, height: 17528 }); png.data.fill(120);
const bytes = new Uint8Array(PNG.sync.write(png));
const t0 = Date.now();
const w = new Worker('./dist/main/image-resize-worker.js', { workerData: { bytes, width: 1221, height: 7372, format: 'png' } });
w.on('message', (out) => { const r = PNG.sync.read(Buffer.from(out)); console.log(r.width, r.height, 'wall ms', Date.now() - t0); });
w.on('error', (e) => { console.error('worker error', e); process.exit(1); });" 2>&1 | rg "wall ms|resize-worker rss|Maximum resident set size"
```

Expected: `1221 7372 wall ms <N>`, one `resize-worker rss=<M> MB` line, and `Maximum resident set size (kbytes): <K>`. Record all three in the plan's close-out report, then set `RESIZE_JOB_TIMEOUT_MS` (image-resize-service.ts) to 3× `<N>` (never below 15 s) and `REAL_PNG_BUDGET_MS` (tests/image-resize.test.ts) likewise, each with the measurement in its comment. The numbers are the executor's to fill in from this run — the plan deliberately states none.

- [ ] **Step 2c: Packaged-app layout** — the worker and its two libraries will live inside `app.asar`. Prove the worker thread can load from there before shipping, with this repo's own `@electron/asar` and electron binary (the method `electron-builder.yml`'s koffi comment used):

```bash
T=$(mktemp -d) && mkdir -p "$T/src/dist/main" "$T/src/node_modules" \
  && cp dist/main/image-resize-worker.js "$T/src/dist/main/" \
  && cp -r node_modules/pngjs node_modules/jpeg-js "$T/src/node_modules/" \
  && npx @electron/asar pack "$T/src" "$T/app.asar" \
  && cat > "$T/probe.js" <<'EOF'
const { app } = require('electron'); const { Worker } = require('worker_threads'); const { PNG } = require('pngjs');
app.whenReady().then(() => {
  const png = new PNG({ width: 300, height: 600 }); png.data.fill(120);
  const bytes = new Uint8Array(PNG.sync.write(png));
  const w = new Worker(process.argv[2] + '/dist/main/image-resize-worker.js', { workerData: { bytes, width: 150, height: 300, format: 'png' } });
  w.on('message', (out) => { const r = PNG.sync.read(Buffer.from(out)); console.log('asar worker ok', r.width, r.height); app.exit(0); });
  w.on('error', (e) => { console.error('asar worker FAILED', e); app.exit(1); });
});
EOF
./node_modules/.bin/electron "$T/probe.js" "$T/app.asar"; echo "exit $?"
```

Expected outcome, one of two — and the plan is written for the first:
  - `asar worker ok 150 300`, exit 0 → everything stays inside `app.asar`; `workerPath()` as written is correct; no `electron-builder.yml` change. Record this in the close-out.
  - `asar worker FAILED …` (a worker thread in Electron does not get the asar `fs` patch, or `Cannot find module 'pngjs'`) → unpack the worker AND both libraries TOGETHER (the koffi lesson: an unpacked file cannot require a packed sibling): add `dist/main/image-resize-worker.js`, `node_modules/pngjs/**`, `node_modules/jpeg-js/**` to `asarUnpack`, and make `workerPath()` swap `app.asar${path.sep}` → `app.asar.unpacked${path.sep}` exactly as `session-manager.ts:354` does for `pty-worker.js`. Re-run the probe with the three paths unpacked beside the asar (`$T/app.asar.unpacked/…`) and the worker path pointed there; expected `asar worker ok 150 300`. Note the choice in the close-out.

- [ ] **Step 3: Verification** — from the workspace worktree: `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/image-patch-recovery/youcoded`; in `desktop/`: `npm run knip`, `npm run lint`, `npm run typecheck`, `npx vitest run tests/main-blocking-calls.test.ts` (allowlist unchanged: `readImageFromDisk` still 1 stat + 1 read; `read.ts` `execute` still 1 stat). Then the baseline suites the earlier session recorded: `npx vitest run tests/image-support.test.ts tests/native-image-attachments.test.ts tests/wire-adapter.test.ts tests/native-clear-barrier.test.ts tests/clear-preserves-timeline.test.ts`. Fix anything red now (CLAUDE.md: a failing test is fixed when found); commit by explicit path.

---

### Task 12: Docs, MAP, evaluator offer

**Files:**
- Modify (app worktree): `docs/native-runtime.md` (append after line 1153)
- Modify (workspace worktree): `docs/MAP.md` (the Native runtime row, line 55; the on-disk state table, ~line 186)

- [ ] **Step 1: `youcoded/docs/native-runtime.md`** — append:

```markdown
## Pictures: admission gate, shrink-once, enforcement, bounded recovery (2026-10-07)

What broke: Read handed a 2,904×17,528 px contact sheet (6.8 MB, under the 10 MB byte cap) to a ChatGPT session; OpenAI rejected it — "requires 49868 patches after processing, exceeding the limit of 30000" — and because failed turns keep history, every later message resent it. Three resume paths re-read pictures by path, so nothing short of `/clear` recovered.

- **Limits are provider-type facts** on the capability profile (`imageLimits`, `capability-profile.ts`): OpenAI/ChatGPT `30,000` patches (the one verified number; its `8192` edge is an explicit, unverified guess); everyone else a conservative `4096 px / 16,384` placeholder. 32-px patches, rounded up per axis (`image-support.ts` `patchCount`).
- **The ONE reader gates by header** (`readImageFromDisk(path, limits)`): dimensions parsed from the bytes already read (PNG/JPEG/GIF/WebP), still one stat + one read. Over budget → `[image not attached: <basename> is W×H px, above this model's image size limit]`, written identically by the live driver, the reopen rebuild, the portable checkpoint and a collapse. The private checkpoint refuses such an image (`image-oversized`) so the host falls back to the gated rebuild; collapsed results and attachment notes are describable (`pruned.oversized`, `note`).
- **Shrink once, as a real file, only when the limits fail** (`image-prepare.ts`; `image-resize-worker.ts` is a `worker_threads` Worker per job using `pngjs`/`jpeg-js` and a box filter — `nativeImage` is not available off the main thread; cache `<userData>/image-cache/<hash>-<basename>.png|jpg`): the target is the largest size under both limits with a 10% margin (the incident sheet → 1221×7372 on OpenAI). Read prepares before it promises and discloses the downscale; `native:send` prepares composer attachments (serialised per session) and the message persists `modelAttachments` beside `attachments` (the UI keeps the original path). Decode bound 80 MP; PNG first, JPEG only if still over 10 MB; GIF/WebP cannot be decoded and are declined with a convert hint; a refused or failed attachment gets a note, never silence.
- **Enforcement** (`HarnessSession.enforceImageLimits`): the gate is re-applied to in-memory history on every provider/profile change (`setBinding`) and before any compaction or summary (`maybeCompact`, `compactNow`).
- **Recovery** (`providers/image-too-large.ts`, `collapseOversizedImages`): on that exact 400 — accepted in `error.message`, `detail` or a top-level `message`; the live object was never captured — with no output started, image parts over the reported limit collapse to the note, the capture revision bumps, and the step is retried once. A second rejection surfaces the provider's own words.

Accepted limitations: the image cache is never swept (a missing derivative becomes an "image no longer available" note on reopen). After a switch to a provider with stricter limits, a derivative that no longer fits is COLLAPSED to the note, not re-prepared for the new limits — a fresh Read of the original prepares a copy for the new provider. A user-message file part collapsed in memory is labelled `image` until a reopen relabels it by basename (the rebuild knows the path). A picture whose preparation failed is told to the model with the preparer's reason live; on reopen the original is re-gated and gets the oversized note instead. The live ChatGPT error object was never captured: the classifier matches the sentence read off a screenshot, in three envelopes. Guards: `tests/image-support.test.ts`, `image-prepare.test.ts`, `image-resize.test.ts`, `image-too-large.test.ts`, the over-limit pictures suite in `harness-session-loop.test.ts`, and the oversized cases in `accepted-history-store.test.ts`, `harness-history-rebuild.test.ts`, `harness-tools-core.test.ts`, `native-image-attachments.test.ts`, `native-channels.test.ts`, `native-session-host-continuation.test.ts`.
```

- [ ] **Step 2: `docs/MAP.md`** (workspace) — in the Native runtime row add to **Entry points**: `youcoded/desktop/src/main/harness/image-support.ts` (the one image reader + pixel gate + note family), `youcoded/desktop/src/main/harness/image-prepare.ts` + `youcoded/desktop/src/main/image-resize-service.ts` (shrink-once, worker thread), `youcoded/desktop/src/main/providers/image-too-large.ts`; to **Guard tests**: `youcoded/desktop/tests/image-support.test.ts`, `image-prepare.test.ts`, `image-resize.test.ts`, `image-too-large.test.ts`. In the on-disk state table add: `<userData>/image-cache/<hash>-<basename>.png|jpg` | shrunk copies of pictures over a provider's limits; safe to delete (a missing one becomes an "image no longer available" note on reopen) | `youcoded/desktop/src/main/harness/image-prepare.ts`. Run `node scripts/audit-anchors.mjs` from the workspace worktree and fix what it reports.

- [ ] **Step 3: Commit** — app worktree: `git add docs/native-runtime.md && git commit -m "docs: pictures — gate, shrink-once, enforcement, recovery"`; workspace worktree: `git add docs/MAP.md && git commit -m "map: oversized-image safety"`; push both.

- [ ] **Step 4: Offer the harness evaluator, do not run it.** The Read tool's behaviour changed: tell Destin `youcoded/desktop/test-engine/harness-eval.mjs --plan <file> --dry-run` is free and a real run costs ~$0.25 a cell and needs `--key-file`; let him decide. Spend nothing unasked.

- [ ] **Step 5: Close out.** Report in chat: what shipped, what verify.sh said verbatim where it matters, the accepted limitations above, and that the `.bak-before-image-removal` file beside the rescued conversation was deliberately left alone. End with "ready to merge?" — never merge or suggest merging.

---

## Self-review (done while writing; re-run after executing)

- **Spec coverage against the reviewer's twelve items:** (1) worker_threads + pngjs/jpeg-js + box filter, per-job termination, injectable decoder, in-process end-to-end on a real 3000×6000 PNG, built-worker smoke, 80 MP WHY → T6, T11; (2) `modelAttachments` persisted and read by rebuild/portable/store, dropped attachments get a note, the per-run limitation and its roadmap item are gone → T3, T4, T7, T12; (3) basename label at every site + collapse==rebuild test → T2, T3, T10; (4) prepare against the session's limits, no flat target, 10% margin, worked example 1221×7372, OpenAI `maxEdgePx` WHY → T1, T5, T8; (5) `enforceImageLimits` on `setBinding`/`maybeCompact`/`compactNow` with tests, error path kept as safety net → T10; (6) three envelopes + WHY → T9; (7) stale-map deletion + in-flight map → T5; (8) attachment refusal/failure notes with tests → T3, T7; (9) mixed-result descriptor required → T4; (10) per-session serialised send with an ordering test → T7; (11) live-gate test, host-level reopen, stable bytes, fixtures in `tests/helpers/image-fixtures.ts`, no `.test.ts` imports, `mkTmpDir` scoping, the send test in `native-channels.test.ts`, no unused imports (re-check after writing each file) → T2, T3, T10, T11; (12) line 13 → T1.
- **Final round (N1–N10 + nit):** pictures-only notes in `imagePartsFor` and the rebuild, with a non-image test on both sides and a plain-string-shape assertion → T2/T3; explicit `modelAttachments` sites (`harness-session.ts:231`, host `:4211`, `:4264`) and a queued-behind-a-turn derivative test → T3; asar probe with both outcomes spelled out → T11 2c; incident-size measurement feeding `RESIZE_JOB_TIMEOUT_MS`/`REAL_PNG_BUDGET_MS` (numbers left to the executor) → T6/T11 2b; `prepare-failed` is live: `modelPathsFor` returns `{ path, prepareFailed }`, the note carries the reason, tested at the handler and the harness → T2/T3/T7; switch-collapses-not-re-prepares limitation and both reviewer caveats → T12; `sendChains` entry deleted when its tail settles and is still latest → T7; reopen test asserts the restoring path by `logContinuation` → T11; derivative labelled by the ORIGINAL basename via `imageLabels` end to end (Read → driver → event → rebuild → checkpoint), comment fixed → T3/T5/T8; ordering test gated on a deferred resolved inside the preparer → T7; `this.history` assigned only when changed → T10.
- **Known gaps, stated:** a collapsed bare user part is labelled `image` until reopen; the equality test therefore compares tool events only (T10). The resize worker cannot decode GIF/WebP (declined with a hint). The image cache is never swept. A derivative is collapsed, not re-prepared, after a stricter switch.
- **Type consistency:** `ImageReadResult`/`ImageNote` (T2) feed `RebuildImageReader`, `imagePartsFor`, `resolveToolImages` (T3), the store (T4) and `collapseOversizedImages` (T10); `ImageLimits` (T1) is threaded through `readImageFromDisk`, `restore({ imageLimits })`, `profileSnapshot.imageLimits`, `ToolContext.imageLimits`, `prepare(path, limits)` and `imageLimitsFor(sessionId)`; `UserPart` (T3) is what `appendUserHistory` and `imagePartsFor` share; `PreparedImage`/`ImagePreparerLike` (T5) are what `ToolServices.images` (T7) and Read (T8) consume; `ResizeFn` (T5) is what `createResizeService` (T6) returns and `runResizeJob` (T6) satisfies; `imageTooLarge` (T9) feeds the step loop (T10).
