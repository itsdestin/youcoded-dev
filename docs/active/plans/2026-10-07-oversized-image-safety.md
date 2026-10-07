---
title: Oversized images — admission gate, shrink-once preparation, bounded recovery
status: active
date: 2026-10-07
---

# Oversized Image Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A picture that is too big for the current model can never enter, re-enter or stay in a native conversation's model memory, and a conversation that is already blocked by one recovers with one bounded retry instead of `/clear`.

**Architecture:** Safety becomes a property of what is *admitted* to canonical history, decided once: the Read tool and the composer shrink an oversized picture to a real cached file before it is promised (Pi/Codex style), the ONE shared disk reader refuses anything over the provider's limits by reading the image header (so reopen, the portable checkpoint and the private checkpoint all agree), and the step loop recognises OpenAI's exact "patches" rejection, collapses the offending image parts in memory to the same note the reader would produce, and retries once (Hermes style). Nothing is transformed at request-build time, nothing re-encodes per request, and the original file on disk is never modified.

**Tech Stack:** TypeScript, Electron (`nativeImage` in a `utilityProcess`, same pattern as `src/main/voice/voice-handlers.ts`), vitest, the AI SDK v7 message shapes already used by `harness-session.ts`.

## Why this shape (read before changing the design)

- **Three resume paths re-read pictures by path:** `rebuildHistoryWithOrigins`, `restorePortableHistory` (both through `readImageFromDisk`) and the private checkpoint (`accepted-history-store.ts` `restoreImage`, which re-reads the file and compares a digest of the bytes the model saw). A request-time shrink would be undone by every one of them, or would make checkpoints unpublishable (`unreferenced-history`). So the derivative is a real file and the persisted `images` path *is* the derivative.
- **The main process never blocks** (`.claude/rules/performance.md` rule 1; `tests/main-blocking-calls.test.ts` ratchet). Decoding a 2,904×17,528 PNG is ~200 MB of pixels: it happens in a utility process. The sync reader keeps exactly its current one `statSync` + one `readFileSync` (allowlist entries for `readImageFromDisk` are counts; they must not grow). Dimensions are parsed from the bytes it already read.
- **Limits are provider-type facts, never model-name facts** (`.claude/rules/native-runtime.md`: CapabilityProfile never branches on a model name). Only ONE number is verified: OpenAI/ChatGPT rejected 49,868 patches with "limit of 30000" (session `e45bcfaf…`, 2026-10-06). Every other number below is a conservative placeholder and says so.
- **Honesty:** every refusal/shrink is disclosed in the text the model sees (`docs/error-message-standards.md`), and a refused image is never replaced by the oversized original.

## Global Constraints

- Branches: workspace worktree `/home/destin/youcoded-dev/worktrees/sessions/image-patch-recovery` is on `session/image-patch-recovery`; app worktree `/home/destin/youcoded-dev/worktrees/sessions/image-patch-recovery/youcoded` is on `session/image-patch-recovery`. App code commits go to the app worktree; this plan and workspace docs (`docs/MAP.md`, roadmap) to the workspace worktree. Push each branch after its first commit (`git push -u origin session/image-patch-recovery`).
- All app paths below are relative to `/home/destin/youcoded-dev/worktrees/sessions/image-patch-recovery/youcoded/desktop/`. Run tests from that directory: `npx vitest run tests/<file>.test.ts`.
- Stage by explicit path. Never `git add -A`. Never touch Destin's running app, the live transcript `~/.youcoded/sessions/-home-destin-youcoded-dev/e45bcfaf-cedc-44e6-bc55-856e6e1f9de9.jsonl` or its `.bak-before-image-removal` sibling, or the original contact sheet.
- `tests/main-blocking-calls.allowlist.json` may only shrink. The only sync IO this plan adds is none: new disk work is `fs.promises` or in the utility process.
- Every non-trivial edit carries a WHY comment. No new UI screens or controls; the only user-visible copy is tool-result text and the existing session-error card.
- Constants (one owner each): `PREPARE_MAX_EDGE_PX = 2048` (`image-prepare.ts`), `MAX_DECODE_PIXELS = 80_000_000` (`image-prepare.ts`), `IMAGE_PATCH_PX = 32` (`image-support.ts`), `IMAGE_LIMITS_OPENAI = { maxEdgePx: 8192, maxPatches: 30_000 }` and `IMAGE_LIMITS_DEFAULT = { maxEdgePx: 4096, maxPatches: 16_384 }` (`capability-profile.ts`).
- Note wording (one owner, `image-support.ts`): `[image not attached: <label> is <W>×<H> px, above this model's image size limit]`. The accepted-history store parses this exact form back; change it in one place only.
- Finish with `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/image-patch-recovery/youcoded` from the workspace worktree, plus `npm run knip` and `npm run lint` in `desktop/`. Android needs nothing: the native runtime runs only on the computer (no image reader exists under `app/`, verified 2026-10-07).

## File structure

| File | Responsibility |
|---|---|
| `src/main/harness/capability-profile.ts` (modify) | `ImageLimits`, `imageLimitsFor(providerType)`, new `imageLimits` profile field |
| `src/main/harness/image-support.ts` (modify) | header parsing (`imageDimensions`), `patchCount`, `withinImageLimits`, `oversizedImageNote` + parser, gated `readImageFromDisk` returning a result union |
| `src/main/harness/harness-session.ts` (modify) | callers of the reader; `collapseOversizedImages`; the one bounded retry |
| `src/main/harness/history-rebuild.ts` (modify) | reader type + the oversized note on reopen |
| `src/main/harness/native-session-host.ts` (modify) | threads the session's limits into rebuild/portable/private restore |
| `src/main/harness/accepted-history-store.ts` (modify) | `image-oversized` restore failure; `oversized` pruned descriptor (publish + restore) |
| `src/main/harness/image-prepare.ts` (new) | pure decision (`prepareTarget`, `derivativeName`) and `ImagePreparer` (cache dir, one job at a time, injected resize) |
| `src/main/image-resize-worker.ts` (new) | utility-process body: `nativeImage` decode → resize → PNG/JPEG |
| `src/main/image-resize-service.ts` (new) | forks the worker lazily, one request at a time, idle kill, returns a `ResizeFn` |
| `src/main/harness/tools/types.ts` (modify) | `ToolServices.images` |
| `src/main/harness/tools/read.ts` (modify) | prepare before promising; disclosure text |
| `src/main/create-runtime.ts`, `src/main/ipc/native.ts` (modify) | construct the preparer; prepare composer attachments before `send` |
| `src/main/providers/image-too-large.ts` (new) | the narrow error classifier |
| tests | listed per task |

---

### Task 1: Provider-type image limits on the capability profile

**Files:**
- Modify: `src/main/harness/capability-profile.ts` (interface at lines 36-70, `CLOUD_DEFAULT` 163-191, `localFallback` 340-375, `resolveProfile` 427-487)
- Test: `tests/capability-profile.test.ts`

**Interfaces:**
- Produces: `export interface ImageLimits { maxEdgePx: number; maxPatches: number }`, `export const IMAGE_LIMITS_OPENAI`, `export const IMAGE_LIMITS_DEFAULT`, `export function imageLimitsFor(t: ProfileProviderType): ImageLimits`, and `CapabilityProfile.imageLimits: ImageLimits` (required). Later tasks read `profile.imageLimits`.

- [ ] **Step 1: Write the failing test** — append to `tests/capability-profile.test.ts`:

```ts
describe('resolveProfile — imageLimits is a provider-type fact', () => {
  it('OpenAI and Sign-in-with-ChatGPT share the one verified patch budget', () => {
    for (const providerType of ['openai', 'chatgpt'] as const) {
      const p = resolveProfile({ providerType, modelId: 'x', contextLength: null });
      expect(p.imageLimits).toEqual({ maxEdgePx: 8192, maxPatches: 30_000 });
    }
  });
  it('every other provider type gets the conservative default, local included', () => {
    for (const providerType of ['anthropic', 'google', 'openrouter', 'openai-compatible'] as const) {
      expect(resolveProfile({ providerType, modelId: 'x', contextLength: null }).imageLimits).toEqual({ maxEdgePx: 4096, maxPatches: 16_384 });
    }
    expect(resolveProfile(local('mystery-3b', 8_192)).imageLimits).toEqual({ maxEdgePx: 4096, maxPatches: 16_384 });
    // A registry match must not override it either (same posture as nativeImageToolResults).
    expect(resolveProfile(local('qwen2.5-7b-instruct', 32_768)).imageLimits).toEqual({ maxEdgePx: 4096, maxPatches: 16_384 });
  });
  it('CLOUD_DEFAULT carries the conservative default, never the OpenAI budget', () => {
    expect(CLOUD_DEFAULT.imageLimits).toEqual({ maxEdgePx: 4096, maxPatches: 16_384 });
  });
});
```

- [ ] **Step 2: Run it** — `npx vitest run tests/capability-profile.test.ts` → FAIL (`imageLimits` undefined).

- [ ] **Step 3: Implement** — in `capability-profile.ts`, below the `ProfileProviderType` type (line 90):

```ts
/** How big a picture this provider type accepts in ONE request. Patches are
 *  32-px tiles, rounded UP per axis (image-support.ts patchCount). PROVIDER-
 *  TYPE fact like nativeImageToolResults: computed in resolveProfile, spread
 *  over every base, never read off a registry entry.
 *  WHY two rows, not one per model: the only number ever measured is OpenAI's
 *  "requires 49868 patches after processing, exceeding the limit of 30000"
 *  (ChatGPT route, 2026-10-06). Every other value here is a deliberately
 *  conservative placeholder — a wrong-high value fails the whole turn with a
 *  provider error, a wrong-low value only means a picture is downscaled or
 *  declined with a note. Raise a row only with a captured provider response. */
export interface ImageLimits { maxEdgePx: number; maxPatches: number }
/** OpenAI's wire (direct key and Sign in with ChatGPT). maxPatches VERIFIED;
 *  maxEdgePx unverified, kept generous because patches is the binding limit. */
export const IMAGE_LIMITS_OPENAI: ImageLimits = { maxEdgePx: 8192, maxPatches: 30_000 };
/** Everyone else. 4096² = 16,384 patches, below every published limit we know
 *  of (Anthropic documents 8000 px per side); unverified against a live reply. */
export const IMAGE_LIMITS_DEFAULT: ImageLimits = { maxEdgePx: 4096, maxPatches: 16_384 };
export function imageLimitsFor(t: ProfileProviderType): ImageLimits {
  return t === 'openai' || t === 'chatgpt' ? IMAGE_LIMITS_OPENAI : IMAGE_LIMITS_DEFAULT;
}
```

Add to the `CapabilityProfile` interface right after `nativeImageToolResults: boolean;`:

```ts
  /** Admission limits for pictures (see ImageLimits). Provider-type fact. */
  imageLimits: ImageLimits;
```

Add `imageLimits: IMAGE_LIMITS_DEFAULT,` to `CLOUD_DEFAULT` (after `nativeImageToolResults: false,`) and to `localFallback`'s returned object (after its `nativeImageToolResults: false,`), each with a one-line comment: `// Placeholder like nativeImageToolResults: resolveProfile spreads imageLimitsFor() over this.` In `resolveProfile`, after `const nativeImageToolResults = d.providerType === 'anthropic';` add `const imageLimits = imageLimitsFor(d.providerType);` and add `imageLimits` to all three return sites (the cloud return at line 454, the unknown-local return at 458, and the known-local object at 485 beside `nativeImageToolResults,`).

- [ ] **Step 4: Run** — `npx vitest run tests/capability-profile.test.ts` → PASS. `npm run typecheck` → clean (only `capability-profile.ts` builds full profile literals; `tests/wire-adapter.test.ts` builds `WireImageCaps`, not profiles).

- [ ] **Step 5: Commit** (app worktree):

```bash
git add src/main/harness/capability-profile.ts tests/capability-profile.test.ts
git commit -m "harness: per-provider-type image limits on the capability profile"
git push -u origin session/image-patch-recovery
```

---

### Task 2: Header dimension parsing and the gated shared reader

**Files:**
- Modify: `src/main/harness/image-support.ts` (whole file, 46 lines)
- Test: `tests/image-support.test.ts`

**Interfaces:**
- Produces:
  - `export const IMAGE_PATCH_PX = 32`
  - `export function imageDimensions(buf: Buffer): { width: number; height: number } | null` (PNG, JPEG, GIF, WebP VP8/VP8L/VP8X; null for anything unparseable)
  - `export function patchCount(width: number, height: number): number`
  - `export function withinImageLimits(dims: { width: number; height: number }, limits: ImageLimits): boolean`
  - `export function oversizedImageNote(label: string, width: number, height: number): string`
  - `export function parseOversizedImageNote(line: string): { label: string; width: number; height: number } | null`
  - `export type ImageReadResult = { ok: true; mediaType: string; data: Buffer; width?: number; height?: number } | { ok: false; reason: 'undeliverable' | 'missing' | 'too-many-bytes' | 'oversized'; width?: number; height?: number }`
  - `export function readImageFromDisk(absPath: string, limits?: ImageLimits): ImageReadResult` — SAME sync body shape as today (one `statSync`, one `readFileSync`); without `limits` it never refuses for size in pixels.
- Consumes: `ImageLimits` from Task 1.

- [ ] **Step 1: Write the failing tests** — replace the body of the existing `readImageFromDisk reads a real file…` test and add a header suite. Add these helpers at the top of `tests/image-support.test.ts` (after the imports):

```ts
import { imageDimensions, patchCount, withinImageLimits, oversizedImageNote, parseOversizedImageNote, IMAGE_PATCH_PX } from '../src/main/harness/image-support';
import { IMAGE_LIMITS_OPENAI } from '../src/main/harness/capability-profile';

/** A PNG signature + IHDR claiming w×h — 33 bytes, no pixels. */
export function pngHeader(w: number, h: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
function jpegHeader(w: number, h: number, leadingSegments = 0): Buffer {
  // SOI, then `leadingSegments` APP1 segments of 100 bytes (SOF must be found past them), then SOF0.
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];
  for (let i = 0; i < leadingSegments; i++) { const seg = Buffer.alloc(102); seg[0] = 0xff; seg[1] = 0xe1; seg.writeUInt16BE(100, 2); parts.push(seg); }
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03]);
  return Buffer.concat([...parts, sof]);
}
function gifHeader(w: number, h: number): Buffer {
  const b = Buffer.alloc(13); b.write('GIF89a', 0); b.writeUInt16LE(w, 6); b.writeUInt16LE(h, 8); return b;
}
function webpVp8Header(w: number, h: number): Buffer {
  const b = Buffer.alloc(30); b.write('RIFF', 0); b.writeUInt32LE(22, 4); b.write('WEBP', 8); b.write('VP8 ', 12); b.writeUInt32LE(10, 16);
  b[23] = 0x9d; b[24] = 0x01; b[25] = 0x2a; b.writeUInt16LE(w, 26); b.writeUInt16LE(h, 28); return b;
}
function webpVp8lHeader(w: number, h: number): Buffer {
  const b = Buffer.alloc(30); b.write('RIFF', 0); b.write('WEBP', 8); b.write('VP8L', 12); b[20] = 0x2f;
  b.writeUInt32LE(((h - 1) << 14) | (w - 1), 21); return b;
}
function webpVp8xHeader(w: number, h: number): Buffer {
  const b = Buffer.alloc(30); b.write('RIFF', 0); b.write('WEBP', 8); b.write('VP8X', 12); b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b;
}
```

Then the tests:

```ts
describe('imageDimensions — header only, every deliverable format', () => {
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

describe('patch budget', () => {
  it('rounds UP per axis — the real contact sheet is 49,868 patches', () => {
    expect(IMAGE_PATCH_PX).toBe(32);
    expect(patchCount(2904, 17528)).toBe(49_868);
    expect(patchCount(32, 32)).toBe(1);
    expect(patchCount(33, 33)).toBe(4);
  });
  it('withinImageLimits checks both the edge and the patch product', () => {
    expect(withinImageLimits({ width: 2904, height: 17528 }, IMAGE_LIMITS_OPENAI)).toBe(false);   // patches
    expect(withinImageLimits({ width: 9000, height: 10 }, IMAGE_LIMITS_OPENAI)).toBe(false);      // edge
    expect(withinImageLimits({ width: 4096, height: 4096 }, IMAGE_LIMITS_OPENAI)).toBe(true);
  });
  it('the note is one line the store can parse back exactly', () => {
    const note = oversizedImageNote('/tmp/contact.png', 2904, 17528);
    expect(note).toBe("[image not attached: /tmp/contact.png is 2904×17528 px, above this model's image size limit]");
    expect(parseOversizedImageNote(note)).toEqual({ label: '/tmp/contact.png', width: 2904, height: 17528 });
    expect(parseOversizedImageNote('[image no longer available: /tmp/x.png]')).toBeNull();
  });
});

describe('readImageFromDisk — gated by header, never by bytes alone', () => {
  it('a 70-byte PNG that CLAIMS 2904×17528 is refused with its dimensions', () => {
    const p = path.join(mkTmpDir('imgsup-'), 'huge.png');
    fs.writeFileSync(p, Buffer.concat([pngHeader(2904, 17528), Buffer.alloc(37)]));
    expect(readImageFromDisk(p, IMAGE_LIMITS_OPENAI)).toEqual({ ok: false, reason: 'oversized', width: 2904, height: 17528 });
    // Without limits (legacy/pure callers) the same file is delivered — the GATE is the caller's limits.
    expect(readImageFromDisk(p).ok).toBe(true);
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

And update the existing assertions in the `readImageFromDisk reads a real file…` test to the new shape: `{ ok: true, mediaType: 'image/png', data: … }`, missing → `{ ok: false, reason: 'missing' }`, an 11 MB file → `{ ok: false, reason: 'too-many-bytes' }`, `.svg` → `{ ok: false, reason: 'undeliverable' }` (read the rest of that test first; keep every existing case, only the shape changes).

- [ ] **Step 2: Run** — `npx vitest run tests/image-support.test.ts` → FAIL (missing exports).

- [ ] **Step 3: Implement** — in `image-support.ts` add `import type { ImageLimits } from './capability-profile';` (type-only: no runtime cycle) and:

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
 *  total: junk, truncation and unknown layouts all yield null, never a throw.
 *  WHY a hand parser instead of decoding: the whole point is to judge a
 *  50-megapixel file without ever allocating its pixels on the main thread. */
export function imageDimensions(buf: Buffer): { width: number; height: number } | null {
  // PNG: signature + IHDR (always the first chunk).
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.toString('ascii', 12, 16) === 'IHDR') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // GIF: logical screen size right after "GIF87a"/"GIF89a".
  if (buf.length >= 10 && buf.toString('ascii', 0, 4) === 'GIF8') {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  // WebP: RIFF container, three first-chunk layouts.
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') { const bits = buf.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }; }
    if (chunk === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
    return null;
  }
  // JPEG: walk segments to the first SOFn (C0–CF except C4/C8/CC).
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xff) { i++; continue; }                                   // fill byte
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }   // standalone markers
      if (marker === 0xd9 || marker === 0xda) return null;                        // EOI / SOS before any SOF
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

// The ONE wording for a picture declined for its pixel size. The accepted-
// history store recomputes it from (label, width, height) on restore, so the
// parser below must stay the exact inverse of the writer.
const OVERSIZED_NOTE_RE = /^\[image not attached: (.+) is (\d+)×(\d+) px, above this model's image size limit\]$/;
export function oversizedImageNote(label: string, width: number, height: number): string {
  return `[image not attached: ${label} is ${width}×${height} px, above this model's image size limit]`;
}
export function parseOversizedImageNote(line: string): { label: string; width: number; height: number } | null {
  const m = OVERSIZED_NOTE_RE.exec(line);
  return m ? { label: m[1], width: Number(m[2]), height: Number(m[3]) } : null;
}

export type ImageReadResult =
  | { ok: true; mediaType: string; data: Buffer; width?: number; height?: number }
  | { ok: false; reason: 'undeliverable' | 'missing' | 'too-many-bytes' | 'oversized'; width?: number; height?: number };
```

Replace `readImageFromDisk` with (keep its doc comment, extend it with the WHY below):

```ts
/** … (existing comment) …
 *  Since 2026-10-07 the result says WHY it declined, and `limits` (the
 *  session profile's imageLimits) turns on the pixel gate: a picture over the
 *  provider's patch/edge budget is `oversized` even when its FILE is tiny —
 *  a 6.8 MB, 2904×17528 PNG was 49,868 patches against a limit of 30,000 and
 *  poisoned a conversation (2026-10-06). Dimensions come from the bytes we
 *  already read; this function still makes exactly one stat and one read
 *  (tests/main-blocking-calls.allowlist.json counts them). An unparseable
 *  header passes through unmeasured: that is not the oversized class, and the
 *  provider will name a corrupt file itself. */
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

- [ ] **Step 4: Run** — `npx vitest run tests/image-support.test.ts` → PASS. `npm run typecheck` will now FAIL at the four callers (`harness-session.ts` 2480/2526, `history-rebuild.ts` 189/241, `native-session-host.ts` 3255-3256) — Task 3 fixes them; do not commit until Task 3's typecheck is green.

---

### Task 3: Every reader call site uses the gate and names the reason

**Files:**
- Modify: `src/main/harness/harness-session.ts` (`imagePartsFor` 2476-2484, `resolveToolImages` 2500-2556)
- Modify: `src/main/harness/history-rebuild.ts` (`RebuildImageReader` line 40, attachments 187-189, tool images 239-250)
- Modify: `src/main/harness/native-session-host.ts` (import line 28; `seedResumedHistory` 3255-3256)
- Test: `tests/harness-history-rebuild.test.ts` (`image tool-result resume` suite, lines 698-760), `tests/native-image-attachments.test.ts`

**Interfaces:**
- Produces: `export type RebuildImageReader = (absPath: string) => ImageReadResult` (history-rebuild.ts). Host builds `(p) => readImageFromDisk(p, session.profileSnapshot.imageLimits)`.
- Consumes: Task 2's `ImageReadResult`, `oversizedImageNote`.

- [ ] **Step 1: Write the failing tests** — in `tests/harness-history-rebuild.test.ts`, change the suite's `fakeReader` to the new shape and add one case:

```ts
  const fakeReader = (p: string): ImageReadResult =>
    p.endsWith('ok.png') ? { ok: true, mediaType: 'image/png', data: Buffer.from('png!') }
    : p.endsWith('huge.png') ? { ok: false, reason: 'oversized', width: 2904, height: 17528 }
    : { ok: false, reason: 'missing' };
```

(import `type ImageReadResult` from `../src/main/harness/image-support`) and:

```ts
  it('an oversized image becomes the SAME note the live driver writes — reopen cannot smuggle it back', () => {
    const out = rebuildHistory(pair(['/tmp/huge.png']), fakeReader);
    const toolMsg = out.find((m: any) => m.role === 'tool') as any;
    expect(toolMsg.content[0].output).toEqual({ type: 'text', value: "Read image\n[image not attached: /tmp/huge.png is 2904×17528 px, above this model's image size limit]" });
  });
```

In `tests/native-image-attachments.test.ts`, the `HarnessSession.send — attachments become image parts` suite (line 165) has `capturePrompt(supportsVision, attachments)`, which builds a session with `profile: { ...CLOUD_DEFAULT, supportsVision }` and returns the user message the model saw. Give it two optional trailing parameters — `profile?: CapabilityProfile` (used instead of the CLOUD_DEFAULT spread when given) and `toolServices?: ToolServices` (passed through as `toolServices` in the opts) — defaults unchanged, then add:

```ts
  it('an attachment over the provider limit is NOT delivered — a tiny file with a huge header cannot bypass the gate', async () => {
    const huge = path.join(dir, 'huge.png'); fs.writeFileSync(huge, pngHeader(2904, 17528));
    const user = await capturePrompt(true, [huge], resolveProfile({ providerType: 'chatgpt', modelId: 'gpt-x', contextLength: null }));
    // No file part; the message is the plain string the text-only path produces.
    expect(typeof user.content === 'string' || !user.content.some((p: any) => p.type === 'file')).toBe(true);
  });
```

(`pngHeader` is exported from `tests/image-support.test.ts` in Task 2; `resolveProfile` is already imported by this file.)

- [ ] **Step 2: Run** — `npx vitest run tests/harness-history-rebuild.test.ts tests/native-image-attachments.test.ts` → FAIL (type/shape).

- [ ] **Step 3: Implement**

`history-rebuild.ts`: `import type { ImageReadResult } from './image-support'; import { oversizedImageNote } from './image-support';` (the import keeps the module's "reader is injected" rule: the note is a pure string function). Change the type to `export type RebuildImageReader = (absPath: string) => ImageReadResult;`. Attachments branch: `const img = readImage(p); if (img.ok) parts.push({ type: 'file', mediaType: img.mediaType, data: img.data });`. Tool-image loop:

```ts
          const img = readImage(p);
          if (img.ok) files.push({ type: 'file', mediaType: img.mediaType, data: { type: 'data', data: img.data }, filename: path.basename(p) });
          // WHY the split: an oversized picture must carry the SAME note the live
          // driver wrote (resolveToolImages) so live and resumed histories agree
          // byte-for-byte and the accepted-history store can describe either.
          else if (img.reason === 'oversized' && img.width !== undefined && img.height !== undefined) text += `\n${oversizedImageNote(p, img.width, img.height)}`;
          else text += `\n[image no longer available: ${p}]`;
```

`harness-session.ts` `imagePartsFor`:

```ts
    for (const p of attachments) {
      const img = readImageFromDisk(p, this.profile.imageLimits);   // shared reader — one table, one cap, one pixel gate
      if (img.ok) parts.push({ type: 'file', mediaType: img.mediaType, data: img.data });
    }
```

`resolveToolImages`: replace from `const img = readImageFromDisk(p);` through the end of its `if (!img)` block with:

```ts
      const img = readImageFromDisk(p, this.profile.imageLimits);
      if (!img.ok) {
        // Name the real cause (error-message-standards.md) — the reader now
        // says which; the stat above is why 'missing' is the rare case here.
        if (img.reason === 'undeliverable') text += `\n[image not attached: ${p} is not a deliverable image format]`;
        else if (img.reason === 'too-many-bytes') text += `\n[image not attached: ${p} exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB per-image size limit]`;
        else if (img.reason === 'oversized') text += `\n${oversizedImageNote(p, img.width ?? 0, img.height ?? 0)}`;
        else text += `\n[image not attached: ${p} could not be read]`;
        continue;
      }
```

Add `oversizedImageNote` to the existing `image-support` import on line 41. The later `budget.bytes + img.data.length` and `images.push({ … data: img.data …})` lines are unchanged.

`native-session-host.ts` 3255-3256:

```ts
    // WHY the closure: the pixel gate is the SESSION's provider limits, and the
    // reader is the one place every resume path (rebuild, portable, private
    // checkpoint — Task 4) agrees on what is too big.
    const readImage = (p: string) => readImageFromDisk(p, session.profileSnapshot.imageLimits);
    const rebuilt = rebuildHistoryWithOrigins(persisted, readImage);
    const portable = restorePortableHistory(persisted, readImage,
```

Search the host for any OTHER `readImageFromDisk` use (`rg -n readImageFromDisk src/main`) and convert it the same way; the comment at line 997 and 4050 only mention it.

- [ ] **Step 4: Run** — `npm run typecheck` → clean; `npx vitest run tests/image-support.test.ts tests/harness-history-rebuild.test.ts tests/native-image-attachments.test.ts tests/harness-tools-core.test.ts tests/wire-adapter.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/image-support.ts src/main/harness/harness-session.ts src/main/harness/history-rebuild.ts src/main/harness/native-session-host.ts tests/image-support.test.ts tests/harness-history-rebuild.test.ts tests/native-image-attachments.test.ts
git commit -m "harness: gate every image read on the provider's pixel limits, from the header"
```

---

### Task 4: The private checkpoint cannot bring an oversized picture back, and can describe a collapsed one

**Files:**
- Modify: `src/main/harness/accepted-history-store.ts` (`FailureReason` 25-26, `PrunedDescriptor` 72, `AcceptedHistoryProposal` 147-156, `restore()` 630, `restoreNow` 634, `describeToolResult` 786-822, `restoreImage` 1008-1012, `restorePart` 1014-1061)
- Modify: `src/main/harness/native-session-host.ts` (restore call 3262-3265)
- Test: `tests/accepted-history-store.test.ts`

**Interfaces:**
- Produces: `restore(input: { …; imageLimits?: ImageLimits })` → may return `{ ok: false, reason: 'image-oversized' }`; `PrunedDescriptor` gains `{ oversized: Array<{ label: string; width: number; height: number }> }`.
- Consumes: `imageDimensions`, `withinImageLimits`, `oversizedImageNote`, `parseOversizedImageNote` (Task 2), `ImageLimits` (Task 1).

- [ ] **Step 1: Write the failing tests** — append to the `describe('AcceptedHistoryStore'…)` block (uses `pngHeader` from `tests/image-support.test.ts` and `IMAGE_LIMITS_OPENAI`):

```ts
  it('restore refuses an image the session limits now call oversized — the host falls back to the gated rebuild', async () => {
    const image = path.join(root, 'huge.png');
    fs.writeFileSync(image, pngHeader(2904, 17528));
    const events: Fixture[] = [
      { type: 'tool-result', sessionId, uuid: 't2', data: { toolUseId: 'call_1', toolName: 'Read', toolResult: 'here it is', images: [image] } },
    ];
    writeTranscript(events);
    const messages = [{ role: 'tool', content: [{
      type: 'tool-result', toolCallId: 'call_1', toolName: 'Read',
      output: { type: 'content', value: [
        { type: 'text', text: 'here it is' },
        { type: 'file', mediaType: 'image/png', data: { type: 'data', data: fs.readFileSync(image) }, filename: 'huge.png' },
      ] },
    }] }];
    const revision = await store.invalidate(sessionId, 'history-mutation');
    await expect(store.publish(proposal({ references: events.map(refFor), messages: messages as any, revision }))).resolves.toEqual({ ok: true });
    // No limits (a caller that predates the gate) still restores — the bytes match.
    expect((await store.restore({ sessionId, transcriptPath: transcript, binding, assemblyDigest })).ok).toBe(true);
    expect(await store.restore({ sessionId, transcriptPath: transcript, binding, assemblyDigest, imageLimits: IMAGE_LIMITS_OPENAI }))
      .toEqual({ ok: false, reason: 'image-oversized' });
  });

  it('describes and restores a tool result whose oversized image was collapsed to the note', async () => {
    const events: Fixture[] = [
      { type: 'tool-result', sessionId, uuid: 't3', data: { toolUseId: 'call_2', toolName: 'Read', toolResult: 'Read image /tmp/contact.png', images: ['/tmp/contact.png'] } },
    ];
    writeTranscript(events);
    const value = "Read image /tmp/contact.png\n" + oversizedImageNote('contact.png', 2904, 17528);
    const messages = [{ role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call_2', toolName: 'Read', output: { type: 'text', value } }] }];
    const restored = await roundTrip({ references: events.map(refFor), messages: messages as any });
    // A pruned part is never a replayable portable origin (replayableOrigin), same as keepChars.
    expect(restored).toEqual({ ok: true, messages, messageOrigins: [null], eventUuids: ['t3'], revision: store.currentRevision(sessionId) });
    expect(sidecar()).toContain('"oversized"');
    expect(sidecar()).not.toContain('above this model');   // the manifest holds fields, never the sentence
  });

  it('a note that does not recompute exactly is not describable (no silent drift)', async () => {
    const events: Fixture[] = [
      { type: 'tool-result', sessionId, uuid: 't4', data: { toolUseId: 'call_3', toolName: 'Read', toolResult: 'Read image', images: ['/tmp/a.png'] } },
    ];
    writeTranscript(events);
    const value = "Read image\n[image not attached: a.png is 2904×17528 px, above this model's image size limit] trailing";
    const messages = [{ role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call_3', toolName: 'Read', output: { type: 'text', value } }] }];
    const revision = await store.invalidate(sessionId, 'history-mutation');
    await expect(store.publish(proposal({ references: events.map(refFor), messages: messages as any, revision }))).resolves.toEqual({ ok: false, reason: 'unreferenced-history' });
  });
```

Add imports at the top of the test: `import { pngHeader } from './image-support.test'; import { oversizedImageNote } from '../src/main/harness/image-support'; import { IMAGE_LIMITS_OPENAI } from '../src/main/harness/capability-profile';`. (If importing from a test file trips vitest's collector, move `pngHeader` to `tests/helpers/image-fixtures.ts` and import it from there in both tests — do that in Task 2 if you prefer; the helper must exist exactly once.)

- [ ] **Step 2: Run** — `npx vitest run tests/accepted-history-store.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `accepted-history-store.ts`:

```ts
import { imageDimensions, withinImageLimits, oversizedImageNote, parseOversizedImageNote } from './image-support';
import type { ImageLimits } from './capability-profile';
```

`FailureReason`: add `| 'image-oversized'`.

`PrunedDescriptor`:
```ts
/** `oversized` (2026-10-07): the live part collapsed one or more oversized
 *  images to the note image-support.oversizedImageNote writes. Fields only —
 *  restore RECOMPUTES the sentence, so the manifest never holds prose that
 *  could drift from the writer. */
type PrunedDescriptor = { keepChars: number } | { imageCollapsed: true } | { oversized: Array<{ label: string; width: number; height: number }> };
```

`restore` / `restoreNow` input: add `imageLimits?: ImageLimits` to both signatures and pass it down: `restoreNow` → wherever it calls `restorePart`/`restoreContent` for messages (follow the call chain from `restoreNow`; add a trailing `limits?: ImageLimits` parameter to `restorePart` and to `restoreImage`).

`restoreImage`:
```ts
async function restoreImage(image: ImageDescriptor, limits?: ImageLimits): Promise<Buffer | 'oversized' | null> {
  let data: Buffer;
  try { data = await fs.promises.readFile(image.path); } catch { return null; }
  if (digest(data) !== image.digest) return null;
  // WHY: a checkpoint published before the pixel gate existed can cite a
  // picture the session's provider rejects. Refusing here (not silently
  // dropping) makes the host fall back to the gated rebuild, which writes the
  // honest note instead — the deliberate durability path for old sessions.
  const dims = imageDimensions(data);
  if (limits && dims && !withinImageLimits(dims, limits)) return 'oversized';
  return data;
}
```
At both callers (`part.kind === 'image'` at ~1017 and the tool-result `part.images` loop at ~1054): `if (data === 'oversized') return { reason: 'image-oversized' }; if (!data) return { reason: 'image-mismatch' };`.

`describeToolResult` text branch, after the `imageCollapsed` line:
```ts
    const oversized = describeOversizedNotes(text, output.value);
    if (oversized) return { pruned: { oversized } };
    return null;
```
with the helper next to `prunedKeepChars`:
```ts
/** The live value must be the event text followed by one parsable note per
 *  line, and the notes must recompute to exactly that remainder. */
function describeOversizedNotes(text: string, value: string): Array<{ label: string; width: number; height: number }> | null {
  if (!value.startsWith(text) || value.length <= text.length) return null;
  const lines = value.slice(text.length).split('\n');
  if (lines[0] !== '') return null;                                 // remainder must begin with '\n'
  const notes = lines.slice(1).map(parseOversizedImageNote);
  if (!notes.length || notes.some(n => n === null)) return null;
  const recomputed = text + notes.map(n => `\n${oversizedImageNote(n!.label, n!.width, n!.height)}`).join('');
  return recomputed === value ? notes as Array<{ label: string; width: number; height: number }> : null;
}
```
`restorePart` tool-result branch: before `else if (part.pruned) output = …imageCollapsed…`:
```ts
    } else if (part.pruned && 'oversized' in part.pruned) {
      const notes = part.pruned.oversized;
      if (!Array.isArray(notes) || !notes.length || notes.some(n => typeof n?.label !== 'string' || !Number.isSafeInteger(n.width) || !Number.isSafeInteger(n.height))) return { reason: 'malformed' };
      output = { type: 'text', value: text + notes.map(n => `\n${oversizedImageNote(n.label, n.width, n.height)}`).join('') };
    }
```
`replayableOrigin` (lines ~101-118) already treats any truthy `pruned` as non-replayable, so an `oversized` part restores with a `null` origin exactly like `keepChars` — no validator change; the round-trip test pins `messageOrigins: [null]`.

`native-session-host.ts` restore call (3262): add `imageLimits: session.profileSnapshot.imageLimits,`.

- [ ] **Step 4: Run** — `npx vitest run tests/accepted-history-store.test.ts tests/accepted-history-privacy.test.ts tests/harness-accepted-history.test.ts tests/native-session-host-continuation.test.ts` → PASS; the B8 no-sync-read test must still pass (the only new IO is inside the existing async `restoreImage`).

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/accepted-history-store.ts src/main/harness/native-session-host.ts tests/accepted-history-store.test.ts
git commit -m "accepted-history: refuse oversized checkpoint images; describe collapsed-image results"
```

---

### Task 5: Shrink once — the pure preparer

**Files:**
- Create: `src/main/harness/image-prepare.ts`
- Test: `tests/image-prepare.test.ts`

**Interfaces:**
- Produces:
```ts
export const PREPARE_MAX_EDGE_PX = 2048;
export const MAX_DECODE_PIXELS = 80_000_000;
export const HEADER_READ_BYTES = 256 * 1024;
export function prepareTarget(width: number, height: number, maxEdge?: number): { width: number; height: number } | null;
export function derivativeName(absPath: string, size: number, mtimeMs: number, target: { width: number; height: number }, ext: 'png' | 'jpg'): string;
export type ResizeFormat = 'png' | 'jpeg';
export type ResizeFn = (req: { bytes: Buffer; width: number; height: number; format: ResizeFormat }) => Promise<Buffer | null>;
export type PreparedImage =
  | { kind: 'unchanged'; width?: number; height?: number }
  | { kind: 'prepared'; path: string; mediaType: 'image/png' | 'image/jpeg'; width: number; height: number; preparedWidth: number; preparedHeight: number }
  | { kind: 'refused'; reason: string; width?: number; height?: number };
export interface ImagePreparerLike { prepare(absPath: string): Promise<PreparedImage>; preparedPathFor(absPath: string): string | null }
export class ImagePreparer implements ImagePreparerLike { constructor(cacheDir: string, resize: ResizeFn) }
```
- Consumes: `imageDimensions`, `MAX_ATTACHMENT_BYTES` (image-support).

- [ ] **Step 1: Write the failing tests** — `tests/image-prepare.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ImagePreparer, prepareTarget, derivativeName, PREPARE_MAX_EDGE_PX, MAX_DECODE_PIXELS, type ResizeFn } from '../src/main/harness/image-prepare';
import { pngHeader } from './image-support.test';

describe('prepareTarget — fit the long edge, keep aspect, never enlarge', () => {
  it('leaves a fitting picture alone', () => expect(prepareTarget(2048, 1000)).toBeNull());
  it('scales the contact sheet to 2048 tall', () => expect(prepareTarget(2904, 17528)).toEqual({ width: 339, height: 2048 }));
  it('scales a wide picture to 2048 wide', () => expect(prepareTarget(10000, 500)).toEqual({ width: 2048, height: 102 }));
  it('never yields a zero edge', () => expect(prepareTarget(100000, 1)).toEqual({ width: 2048, height: 1 }));
  it('the default is the shared constant', () => expect(PREPARE_MAX_EDGE_PX).toBe(2048));
});

describe('derivativeName — deterministic, keeps the original basename for the model-facing label', () => {
  it('same inputs → same name; any input change → different name', () => {
    const a = derivativeName('/x/contact.png', 100, 5.9, { width: 339, height: 2048 }, 'png');
    expect(a).toBe(derivativeName('/x/contact.png', 100, 5.9, { width: 339, height: 2048 }, 'png'));
    expect(a).toMatch(/^[0-9a-f]{16}-contact\.png$/);
    expect(derivativeName('/x/contact.png', 101, 5.9, { width: 339, height: 2048 }, 'png')).not.toBe(a);
    expect(derivativeName('/x/contact.png', 100, 6.1, { width: 339, height: 2048 }, 'jpg')).toMatch(/-contact\.jpg$/);
  });
});

describe('ImagePreparer', () => {
  let dir: string; let cache: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'imgprep-')); cache = path.join(dir, 'cache'); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const calls: any[] = [];
  const resize: ResizeFn = async (req) => { calls.push(req); return req.format === 'png' ? Buffer.concat([pngHeader(req.width, req.height), Buffer.from('small')]) : Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 0x11, 8, req.height >> 8, req.height & 255, req.width >> 8, req.width & 255, 3]); };

  it('a fitting picture is unchanged and the resizer is never called', async () => {
    const p = path.join(dir, 'ok.png'); fs.writeFileSync(p, pngHeader(640, 480));
    calls.length = 0;
    expect(await new ImagePreparer(cache, resize).prepare(p)).toEqual({ kind: 'unchanged', width: 640, height: 480 });
    expect(calls).toHaveLength(0);
  });

  it('an oversized picture is shrunk ONCE into a real cached file; the original is untouched; the second call reuses the file', async () => {
    const p = path.join(dir, 'contact.png'); fs.writeFileSync(p, Buffer.concat([pngHeader(2904, 17528), Buffer.alloc(100)]));
    const before = fs.readFileSync(p);
    calls.length = 0;
    const prep = new ImagePreparer(cache, resize);
    const r = await prep.prepare(p);
    expect(r.kind).toBe('prepared');
    if (r.kind !== 'prepared') return;
    expect(r).toMatchObject({ width: 2904, height: 17528, preparedWidth: 339, preparedHeight: 2048, mediaType: 'image/png' });
    expect(r.path.startsWith(cache)).toBe(true);
    expect(path.basename(r.path)).toMatch(/-contact\.png$/);
    expect(fs.existsSync(r.path)).toBe(true);
    expect(fs.readFileSync(p)).toEqual(before);
    expect(prep.preparedPathFor(p)).toBe(r.path);
    expect(calls).toHaveLength(1);
    expect(await prep.prepare(p)).toEqual(r);
    expect(calls).toHaveLength(1);                       // cache hit: no second resize
  });

  it('falls back to JPEG only when the PNG is still over the byte cap', async () => {
    const p = path.join(dir, 'big.png'); fs.writeFileSync(p, Buffer.concat([pngHeader(5000, 5000), Buffer.alloc(10)]));
    const fatPng: ResizeFn = async (req) => req.format === 'png' ? Buffer.alloc(11 * 1024 * 1024) : Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 0x11, 8, 8, 0, 8, 0, 3]);
    const r = await new ImagePreparer(cache, fatPng).prepare(p);
    expect(r.kind).toBe('prepared');
    if (r.kind === 'prepared') { expect(r.mediaType).toBe('image/jpeg'); expect(r.path).toMatch(/\.jpg$/); }
  });

  it('refuses honestly when decode is impossible or the picture is beyond the decode bound — never the original bytes', async () => {
    const p = path.join(dir, 'anim.gif'); fs.writeFileSync(p, Buffer.concat([Buffer.from('GIF89a'), Buffer.from([0x88, 0x13, 0x88, 0x13])]));   // 5000×5000 GIF header: 25 MP, under the decode bound, so only the resizer can refuse it
    const cannot: ResizeFn = async () => null;
    const r = await new ImagePreparer(cache, cannot).prepare(p);
    expect(r).toMatchObject({ kind: 'refused', width: 5000, height: 5000 });
    if (r.kind === 'refused') expect(r.reason).toMatch(/could not be downscaled/);
    const q = path.join(dir, 'vast.png'); fs.writeFileSync(q, pngHeader(20000, 20000));
    const v = await new ImagePreparer(cache, resize).prepare(q);
    expect(v).toMatchObject({ kind: 'refused', width: 20000, height: 20000 });
    if (v.kind === 'refused') expect(v.reason).toContain(`${MAX_DECODE_PIXELS / 1_000_000} megapixels`);
    expect(fs.existsSync(cache) ? fs.readdirSync(cache) : []).toEqual([]);
  });

  it('serialises resizes: two prepares overlap on the preparer, not on the resizer', async () => {
    let inFlight = 0, peak = 0;
    const slow: ResizeFn = async (req) => { inFlight++; peak = Math.max(peak, inFlight); await new Promise(r => setTimeout(r, 5)); inFlight--; return pngHeader(req.width, req.height); };
    const a = path.join(dir, 'a.png'); fs.writeFileSync(a, pngHeader(3000, 3000));
    const b = path.join(dir, 'b.png'); fs.writeFileSync(b, pngHeader(4000, 3000));
    const prep = new ImagePreparer(cache, slow);
    await Promise.all([prep.prepare(a), prep.prepare(b)]);
    expect(peak).toBe(1);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/image-prepare.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/main/harness/image-prepare.ts`:

```ts
// Shrink-once preparation of pictures that are too big for a model (2026-10-07).
//
// WHY a cached FILE and not a request-time transform: every resume path
// (history-rebuild, the portable checkpoint, the private checkpoint) re-reads
// pictures BY PATH and the private one fingerprints the bytes the model saw.
// A derivative that is a real file, promised under its own path, needs none
// of them to know it exists. The original is never modified.
// WHY pure + injected resize: decoding happens in a utility process
// (image-resize-service.ts); this module only decides and stores, so it is
// unit-testable with a fake resizer and never blocks the main thread.
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { imageDimensions, MAX_ATTACHMENT_BYTES } from './image-support';

/** Long-edge target shared by every provider. Codex high-detail uses 2048,
 *  Pi and Claude Code 2000; 2048² is 4,096 patches, far under every limit in
 *  capability-profile.ts, so a prepared picture always passes the gate. */
export const PREPARE_MAX_EDGE_PX = 2048;
/** Decoded pixels we are willing to hold at once (×4 bytes RGBA = 320 MB in
 *  the utility process). The 2026-10-06 contact sheet was 50.9 MP. */
export const MAX_DECODE_PIXELS = 80_000_000;
/** Enough to reach a JPEG SOF past large EXIF/ICC segments; PNG/GIF/WebP need
 *  under 64 bytes. */
export const HEADER_READ_BYTES = 256 * 1024;

export type ResizeFormat = 'png' | 'jpeg';
export type ResizeFn = (req: { bytes: Buffer; width: number; height: number; format: ResizeFormat }) => Promise<Buffer | null>;

export type PreparedImage =
  | { kind: 'unchanged'; width?: number; height?: number }
  | { kind: 'prepared'; path: string; mediaType: 'image/png' | 'image/jpeg'; width: number; height: number; preparedWidth: number; preparedHeight: number }
  | { kind: 'refused'; reason: string; width?: number; height?: number };

export interface ImagePreparerLike {
  prepare(absPath: string): Promise<PreparedImage>;
  /** Sync, IO-free: the derivative this process prepared for `absPath`, if any.
   *  The harness reads it on the send path, which must not await. */
  preparedPathFor(absPath: string): string | null;
}

export function prepareTarget(width: number, height: number, maxEdge = PREPARE_MAX_EDGE_PX): { width: number; height: number } | null {
  const long = Math.max(width, height);
  if (long <= maxEdge) return null;   // never enlarge; never touch a fitting picture
  const scale = maxEdge / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** `<16 hex>-<original basename>.<ext>`: the hash keys the cache, the basename
 *  rides into the model-facing "Image: <label>" (wire-adapter.ts labels by
 *  filename) so a shrunk contact.png is still called contact.png. */
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
  // One resize at a time: a second 50-MP decode alongside the first would
  // double the utility process's peak memory for no latency win.
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly cacheDir: string, private readonly resize: ResizeFn) {}

  preparedPathFor(absPath: string): string | null { return this.prepared.get(absPath) ?? null; }

  async prepare(absPath: string): Promise<PreparedImage> {
    // WHY never throw: Read awaits this; a thrown IO error would surface as a
    // generic "Read failed" instead of the named refusal the standard asks for.
    try { return await this.prepareUnguarded(absPath); }
    catch (err: any) { return { kind: 'refused', reason: `could not be prepared for the model (${err?.code ?? err?.message ?? 'unknown error'})` }; }
  }

  private async prepareUnguarded(absPath: string): Promise<PreparedImage> {
    let st: fs.Stats;
    try { st = await fs.promises.stat(absPath); } catch { return { kind: 'refused', reason: 'could not be read' }; }
    const dims = imageDimensions(await readHeader(absPath));
    if (!dims) return { kind: 'unchanged' };   // unmeasurable: not this module's class; the reader/provider decide
    if (dims.width * dims.height > MAX_DECODE_PIXELS) {
      return { kind: 'refused', ...dims, reason: `is ${dims.width}×${dims.height} px — too large to downscale for the model (over ${MAX_DECODE_PIXELS / 1_000_000} megapixels). Crop or shrink it with Bash (e.g. magick in.png -resize 2048x2048 out.png) and Read the copy.` };
    }
    const target = prepareTarget(dims.width, dims.height);
    if (!target) return { kind: 'unchanged', ...dims };
    const names = { png: path.join(this.cacheDir, derivativeName(absPath, st.size, st.mtimeMs, target, 'png')), jpg: path.join(this.cacheDir, derivativeName(absPath, st.size, st.mtimeMs, target, 'jpg')) };
    const done = (file: string, mediaType: 'image/png' | 'image/jpeg'): PreparedImage => {
      this.prepared.set(absPath, file);
      return { kind: 'prepared', path: file, mediaType, ...dims, preparedWidth: target.width, preparedHeight: target.height };
    };
    for (const [file, mediaType] of [[names.png, 'image/png'], [names.jpg, 'image/jpeg']] as const) {
      try { await fs.promises.access(file); return done(file, mediaType); } catch { /* not cached yet */ }
    }
    const run = this.chain.then(async (): Promise<PreparedImage> => {
      const bytes = await fs.promises.readFile(absPath);
      let out = await this.resize({ bytes, width: target.width, height: target.height, format: 'png' });
      let file = names.png; let mediaType: 'image/png' | 'image/jpeg' = 'image/png';
      // WHY JPEG second, not first: screenshots are text; PNG keeps it crisp.
      // Only a PNG that still breaks the byte cap trades sharpness for size.
      if (out && out.length > MAX_ATTACHMENT_BYTES) { out = await this.resize({ bytes, width: target.width, height: target.height, format: 'jpeg' }); file = names.jpg; mediaType = 'image/jpeg'; }
      if (!out || out.length > MAX_ATTACHMENT_BYTES) {
        return { kind: 'refused', ...dims, reason: `is ${dims.width}×${dims.height} px and could not be downscaled for the model (the image decoder declined it). Convert or shrink it with Bash (e.g. magick in.gif[0] -resize 2048x2048 out.png) and Read the copy.` };
      }
      await fs.promises.mkdir(this.cacheDir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, out);
      await fs.promises.rename(tmp, file);   // atomic: a crash never leaves a half-written derivative under the final name
      return done(file, mediaType);
    });
    this.chain = run.catch(() => undefined);
    return run;
  }
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/image-prepare.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/image-prepare.ts tests/image-prepare.test.ts
git commit -m "harness: shrink-once image preparation into a cached derivative file"
```

---

### Task 6: The resize worker (utility process) and its service

**Files:**
- Create: `src/main/image-resize-worker.ts`
- Create: `src/main/image-resize-service.ts`
- Test: `tests/image-resize.test.ts`

**Interfaces:**
- Produces (worker): `export interface ResizeWorkerRequest { id: number; bytes: Uint8Array; width: number; height: number; format: 'png' | 'jpeg' }`, `export interface ResizeWorkerReply { id: number; bytes: Uint8Array | null }`, `export function resizeImageBytes(bytes: Buffer, width: number, height: number, format: 'png' | 'jpeg', decoder?: Pick<typeof nativeImage, 'createFromBuffer'>): Buffer | null`.
- Produces (service): `export function createResizeService(opts?: { fork?: () => ForkedWorker; idleMs?: number; jobTimeoutMs?: number }): { resize: ResizeFn; shutdown(): void }` where `export interface ForkedWorker { postMessage(msg: ResizeWorkerRequest): void; on(event: 'message', cb: (reply: ResizeWorkerReply) => void): void; on(event: 'exit', cb: (code: number) => void): void; kill(): void }`.
- Consumes: `ResizeFn` (Task 5).

- [ ] **Step 1: Write the failing tests** — `tests/image-resize.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { resizeImageBytes } from '../src/main/image-resize-worker';
import { createResizeService, type ForkedWorker } from '../src/main/image-resize-service';

function fakeNativeImage(empty = false) {
  const made: any[] = [];
  const img = { isEmpty: () => empty, resize: vi.fn((o: any) => { made.push(o); return img; }), toPNG: vi.fn(() => Buffer.from('PNG')), toJPEG: vi.fn((q: number) => Buffer.from(`JPEG${q}`)) };
  return { decoder: { createFromBuffer: vi.fn(() => img) }, img, made };
}

describe('resizeImageBytes (runs inside the utility process)', () => {
  it('decodes, resizes to the exact target with best quality, encodes PNG', () => {
    const { decoder, img, made } = fakeNativeImage();
    expect(resizeImageBytes(Buffer.from('in'), 339, 2048, 'png', decoder as any)).toEqual(Buffer.from('PNG'));
    expect(made).toEqual([{ width: 339, height: 2048, quality: 'best' }]);
    expect(img.toJPEG).not.toHaveBeenCalled();
  });
  it('JPEG at quality 85 when asked', () => {
    const { decoder } = fakeNativeImage();
    expect(resizeImageBytes(Buffer.from('in'), 10, 10, 'jpeg', decoder as any)).toEqual(Buffer.from('JPEG85'));
  });
  it('an undecodable buffer yields null, never a throw', () => {
    const { decoder } = fakeNativeImage(true);
    expect(resizeImageBytes(Buffer.from('gif?'), 10, 10, 'png', decoder as any)).toBeNull();
  });
});

describe('createResizeService — one worker, forked on demand, killed when idle', () => {
  function fakeFork() {
    const handlers: Record<string, Function[]> = { message: [], exit: [] };
    const posted: any[] = [];
    const worker: ForkedWorker & { posted: any[]; reply: (r: any) => void; exit: (c: number) => void; killed: boolean } = {
      posted, killed: false,
      postMessage: (m) => posted.push(m),
      on: (ev: any, cb: any) => { handlers[ev].push(cb); },
      kill: () => { worker.killed = true; },
      reply: (r) => handlers.message.forEach(h => h(r)),
      exit: (c) => handlers.exit.forEach(h => h(c)),
    } as any;
    return worker;
  }
  it('forks lazily, answers by id, and kills the worker after the idle period', async () => {
    vi.useFakeTimers();
    const workers: ReturnType<typeof fakeFork>[] = [];
    const svc = createResizeService({ fork: () => { const w = fakeFork(); workers.push(w); return w; }, idleMs: 1000 });
    expect(workers).toHaveLength(0);
    const p = svc.resize({ bytes: Buffer.from('in'), width: 1, height: 2, format: 'png' });
    expect(workers).toHaveLength(1);
    expect(workers[0].posted[0]).toMatchObject({ width: 1, height: 2, format: 'png' });
    workers[0].reply({ id: workers[0].posted[0].id, bytes: new Uint8Array([1, 2]) });
    expect(await p).toEqual(Buffer.from([1, 2]));
    vi.advanceTimersByTime(1001);
    expect(workers[0].killed).toBe(true);
    const q = svc.resize({ bytes: Buffer.from('in'), width: 1, height: 2, format: 'png' });
    expect(workers).toHaveLength(2);                       // a fresh fork after the idle kill
    workers[1].reply({ id: workers[1].posted[0].id, bytes: null });
    expect(await q).toBeNull();
    vi.useRealTimers();
  });
  it('a worker that dies mid-job resolves the job null (a refusal), not a hang', async () => {
    const w = fakeFork();
    const svc = createResizeService({ fork: () => w });
    const p = svc.resize({ bytes: Buffer.from('in'), width: 1, height: 1, format: 'png' });
    w.exit(1);
    expect(await p).toBeNull();
  });
  it('a job that exceeds its time limit resolves null and the worker is killed', async () => {
    vi.useFakeTimers();
    const w = fakeFork();
    const svc = createResizeService({ fork: () => w, jobTimeoutMs: 500 });
    const p = svc.resize({ bytes: Buffer.from('in'), width: 1, height: 1, format: 'png' });
    vi.advanceTimersByTime(501);
    expect(await p).toBeNull();
    expect(w.killed).toBe(true);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/image-resize.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/main/image-resize-worker.ts`:

```ts
// The picture-shrinking program (2026-10-07). Forked by image-resize-service.ts
// as an Electron utilityProcess so a 50-megapixel decode never runs on the
// main thread (performance rule 1) and its memory dies with the process.
// Electron's nativeImage lives in the Common namespace (electron.d.ts, next to
// `const nativeImage` under `namespace Common`), so it is available here.
import { nativeImage } from 'electron';

export interface ResizeWorkerRequest { id: number; bytes: Uint8Array; width: number; height: number; format: 'png' | 'jpeg' }
export interface ResizeWorkerReply { id: number; bytes: Uint8Array | null }

/** Decode → resize → encode. `decoder` is injectable so the unit test needs no
 *  Electron. null means "cannot" (nativeImage decodes PNG and JPEG; a GIF or
 *  WebP that it cannot read comes back empty) — the caller turns that into an
 *  honest refusal, never into the oversized original. */
export function resizeImageBytes(bytes: Buffer, width: number, height: number, format: 'png' | 'jpeg', decoder: Pick<typeof nativeImage, 'createFromBuffer'> = nativeImage): Buffer | null {
  const img = decoder.createFromBuffer(bytes);
  if (img.isEmpty()) return null;
  const out = img.resize({ width, height, quality: 'best' });
  return format === 'png' ? out.toPNG() : out.toJPEG(85);
}

// Electron's utilityProcess gives the forked file a `parentPort` (same test
// voice-worker.ts uses to know it is really the worker).
const parentPort = (process as unknown as { parentPort?: { on(ev: 'message', cb: (e: { data: ResizeWorkerRequest }) => void): void; postMessage(m: ResizeWorkerReply): void } }).parentPort;
if (parentPort) {
  parentPort.on('message', ({ data }) => {
    let bytes: Buffer | null = null;
    try { bytes = resizeImageBytes(Buffer.from(data.bytes), data.width, data.height, data.format); } catch { bytes = null; }
    parentPort.postMessage({ id: data.id, bytes: bytes ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : null });
  });
}
```

`src/main/image-resize-service.ts`:

```ts
// Owns the ONE resize utility process: forked on first use, one job at a time
// (image-prepare.ts already serialises), killed after idle so an app that
// never sees a big picture never pays for the process. Mirrors
// voice/voice-handlers.ts's spawnVoiceWorker shape.
import * as path from 'path';
import { utilityProcess } from 'electron';
import type { ResizeFn } from './harness/image-prepare';
import type { ResizeWorkerRequest, ResizeWorkerReply } from './image-resize-worker';

export interface ForkedWorker {
  postMessage(msg: ResizeWorkerRequest): void;
  on(event: 'message', cb: (reply: ResizeWorkerReply) => void): void;
  on(event: 'exit', cb: (code: number) => void): void;
  kill(): void;
}

/** Where the compiled worker sits next to this file, in dev and packaged alike
 *  (`tsc` emits both into dist/main/). */
function workerPath(): string { return path.join(__dirname, 'image-resize-worker.js'); }

function electronFork(): ForkedWorker {
  const child = utilityProcess.fork(workerPath(), [], { serviceName: 'youcoded-image-resize', stdio: 'ignore' });
  return {
    postMessage: (m) => child.postMessage(m),
    on: (ev: any, cb: any) => { child.on(ev, cb); },
    kill: () => { child.kill(); },
  };
}

export function createResizeService(opts: { fork?: () => ForkedWorker; idleMs?: number; jobTimeoutMs?: number } = {}): { resize: ResizeFn; shutdown(): void } {
  const fork = opts.fork ?? electronFork;
  const idleMs = opts.idleMs ?? 60_000;
  const jobTimeoutMs = opts.jobTimeoutMs ?? 60_000;
  let worker: ForkedWorker | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let nextId = 1;
  const pending = new Map<number, (bytes: Buffer | null) => void>();

  const stop = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = null; worker?.kill(); worker = null; for (const done of pending.values()) done(null); pending.clear(); };
  const armIdle = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = setTimeout(stop, idleMs); };
  const ensure = (): ForkedWorker => {
    if (worker) return worker;
    const w = fork();
    w.on('message', (reply) => { const done = pending.get(reply.id); if (!done) return; pending.delete(reply.id); done(reply.bytes ? Buffer.from(reply.bytes) : null); armIdle(); });
    // WHY resolve null, not reject: a dead worker is "could not downscale", which
    // the preparer already turns into an honest refusal.
    w.on('exit', () => { if (worker === w) { worker = null; for (const done of pending.values()) done(null); pending.clear(); } });
    worker = w;
    return w;
  };

  const resize: ResizeFn = (req) => new Promise((resolve) => {
    const id = nextId++;
    const w = ensure();
    const timer = setTimeout(() => { if (pending.delete(id)) { resolve(null); stop(); } }, jobTimeoutMs);
    pending.set(id, (bytes) => { clearTimeout(timer); resolve(bytes); });
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    w.postMessage({ id, bytes: new Uint8Array(req.bytes.buffer, req.bytes.byteOffset, req.bytes.byteLength), width: req.width, height: req.height, format: req.format });
  });

  return { resize, shutdown: stop };
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/image-resize.test.ts` → PASS. `npm run knip` must not list the new files as unused (`image-resize-service.ts` is imported by Task 7; the worker is reached through the service's type import — same as `voice-service.ts` → `voice-worker.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/main/image-resize-worker.ts src/main/image-resize-service.ts tests/image-resize.test.ts
git commit -m "main: picture resize in a utility process, forked on demand"
```

---

### Task 7: Wire the preparer in — tool services, composer attachments, the send path

**Files:**
- Modify: `src/main/harness/tools/types.ts` (`ToolServices` at 100-108)
- Modify: `src/main/create-runtime.ts` (`NativeRuntime` 89-125; the host construction 258-392; runtime quit)
- Modify: `src/main/ipc/native.ts` (`NATIVE_SEND` handler 76-89)
- Modify: `src/main/harness/harness-session.ts` (`imagePartsFor`)
- Test: `tests/native-image-attachments.test.ts`, `tests/ipc-native-send.test.ts` (new, small — read `tests/ipc-channels.test.ts` for how channel handlers are invoked with a fake ctx and mirror it)

**Interfaces:**
- Produces: `ToolServices.images?: ImagePreparerLike`; `NativeRuntime.imagePreparer: ImagePreparer`; the `NATIVE_SEND` handler becomes `async` and awaits `prepare` for every attachment before `nativeHost.send`.
- Consumes: `ImagePreparer`, `ImagePreparerLike` (Task 5), `createResizeService` (Task 6).

- [ ] **Step 1: Write the failing tests** — in `tests/native-image-attachments.test.ts` add (next to the Task 3 attachment case):

```ts
  it('a prepared derivative is what the model gets for an oversized attachment; the typed text is untouched', async () => {
    const huge = path.join(dir, 'shot.png'); fs.writeFileSync(huge, pngHeader(2904, 17528));
    const small = path.join(dir, 'small.png'); fs.writeFileSync(small, pngHeader(339, 2048));
    const images = { prepare: async () => ({ kind: 'prepared' as const, path: small, mediaType: 'image/png' as const, width: 2904, height: 17528, preparedWidth: 339, preparedHeight: 2048 }), preparedPathFor: (p: string) => (p === huge ? small : null) };
    const user = await capturePrompt(true, [huge], resolveProfile({ providerType: 'chatgpt', modelId: 'gpt-x', contextLength: null }), { images });
    const file = user.content.find((p: any) => p.type === 'file');
    expect(file).toBeTruthy();
    // The SDK hands the model either raw bytes or base64; accept both, compare bytes.
    const bytes = typeof file.data === 'string' ? Buffer.from(file.data, 'base64') : Buffer.from(file.data);
    expect(bytes).toEqual(pngHeader(339, 2048));
    expect(user.content.find((p: any) => p.type === 'text').text).toBe('look at this');
  });
```

`tests/ipc-native-send.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { nativeChannels } from '../src/main/ipc/native';
import { IPC } from '../src/main/preload';   // if preload cannot be imported in tests, compare by the literal 'native:send' instead

describe('native:send prepares picture attachments before the host sees them', () => {
  it('awaits prepare() for every attachment and still hands the ORIGINAL paths to send()', async () => {
    const send = vi.fn(() => ({ status: 'sent' as const }));
    const prepare = vi.fn(async () => ({ kind: 'unchanged' as const }));
    const def = nativeChannels.find((d) => d.name === 'native:send')!;
    const ctx = { runtime: { nativeHost: { send }, records: { noteSend: vi.fn() }, imagePreparer: { prepare, preparedPathFor: () => null } } } as any;
    const result = await def.handler({ sessionId: 's', text: 'hi', attachments: ['/a.png', 7, '/b.txt'] }, ctx);
    expect(result).toEqual({ status: 'sent' });
    expect(prepare.mock.calls.map((c: any[]) => c[0])).toEqual(['/a.png']);     // only deliverable image paths are prepared
    expect(send).toHaveBeenCalledWith('s', 'hi', ['/a.png', '/b.txt']);
  });
  it('a preparer failure never blocks the send', async () => {
    const send = vi.fn(() => ({ status: 'sent' as const }));
    const def = nativeChannels.find((d) => d.name === 'native:send')!;
    const ctx = { runtime: { nativeHost: { send }, records: { noteSend: vi.fn() }, imagePreparer: { prepare: async () => { throw new Error('boom'); }, preparedPathFor: () => null } } } as any;
    expect(await def.handler({ sessionId: 's', text: 'hi', attachments: ['/a.png'] }, ctx)).toEqual({ status: 'sent' });
  });
});
```

- [ ] **Step 2: Run** — both files → FAIL.

- [ ] **Step 3: Implement**

`tools/types.ts`, inside `ToolServices` after `search?`:
```ts
  /** Picture preparation (image-prepare.ts): Read calls prepare() before it
   *  promises an oversized image; the send path reads preparedPathFor(). Absent
   *  in tests and one-off contexts — the reader's pixel gate still holds. */
  images?: ImagePreparerLike;
```
with `import type { ImagePreparerLike } from '../image-prepare';`.

`harness-session.ts` `imagePartsFor`:
```ts
    for (const p of attachments) {
      // WHY: the composer's send handler prepared any oversized attachment
      // before this synchronous path ran (ipc/native.ts); the derivative is a
      // real file, so the same gated reader delivers it. The message TEXT still
      // names the original path — what the user typed is never rewritten.
      const source = this.opts.toolServices?.images?.preparedPathFor(p) ?? p;
      const img = readImageFromDisk(source, this.profile.imageLimits);
      if (img.ok) parts.push({ type: 'file', mediaType: img.mediaType, data: img.data });
    }
```

`create-runtime.ts`: `import { ImagePreparer } from './harness/image-prepare'; import { createResizeService } from './image-resize-service';` Add `imagePreparer: ImagePreparer;` to `NativeRuntime`. Near the store construction (line 256):
```ts
  // Shrunk copies of pictures too big for a model (image-prepare.ts). Profile-
  // private like the continuation store: userData, never NativeHome.
  const resizeService = createResizeService();
  const imagePreparer = new ImagePreparer(path.join(userDataDir, 'image-cache'), resizeService.resize);
```
Add `images: imagePreparer,` to the tool-services object passed to `NativeSessionHost` (beside `search: searchService,`), add `imagePreparer` to the returned runtime object, and call `resizeService.shutdown()` in the runtime's quit path (find where `engineManager`/host are stopped at quit in this file and add it there).

`ipc/native.ts` `NATIVE_SEND`:
```ts
    handler: async ({ sessionId, text, attachments, sendId }, ctx) => {
      const files = (Array.isArray(attachments) ? attachments : []).filter((a): a is string => typeof a === 'string');
      if (!ctx.runtime) return NOT_LIVE_SEND;
      // WHY here: send() is synchronous by contract (native-runtime.md), so the
      // one async step a big picture needs — shrinking it to a cached file —
      // runs before the host sees the message. The paths handed on are the
      // ORIGINALS; imagePartsFor swaps in the derivative when reading.
      await Promise.all(files.filter((f) => deliverableImageMediaType(f)).map((f) => ctx.runtime!.imagePreparer.prepare(f).catch(() => undefined)));
      const result = ctx.runtime.nativeHost.send(sessionId, text, files);
      …unchanged…
    },
```
with `import { deliverableImageMediaType } from '../harness/image-support';`. The phone's door goes through the same table, so remote sends are covered.

- [ ] **Step 4: Run** — `npx vitest run tests/native-image-attachments.test.ts tests/ipc-native-send.test.ts tests/ipc-channels.test.ts` → PASS; `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/tools/types.ts src/main/create-runtime.ts src/main/ipc/native.ts src/main/harness/harness-session.ts tests/native-image-attachments.test.ts tests/ipc-native-send.test.ts
git commit -m "native send + tool services: prepare oversized pictures before they are promised"
```

---

### Task 8: The Read tool shrinks before it promises, and says so

**Files:**
- Modify: `src/main/harness/tools/read.ts` (image branch, lines 168-187)
- Test: `tests/harness-tools-core.test.ts` (`Read: image delivery` suite, 224-268)

**Interfaces:**
- Consumes: `ctx.services?.images` (Task 7), `imageDimensions` (Task 2).
- Produces: result text forms (pinned by tests):
  - unchanged: `Read image <path> (<KB> KB, <mediaType>).` (today's text)
  - prepared: `Read image <path> (<W>×<H> px, shown downscaled to <w>×<h>, <pct>% of original; small text may be unreadable — Read individual screenshots or crops for detail).`
  - refused: `Read rejected: <path> <reason>` with `isError: true`, no `images`.

- [ ] **Step 1: Write the failing tests** — append to the `Read: image delivery` suite:

```ts
  it('promises the PREPARED file for an oversized picture and discloses the downscale', async () => {
    const p = path.join(dir, 'contact.png');
    fs.writeFileSync(p, pngHeader(2904, 17528));
    const small = path.join(dir, 'cache', 'abc-contact.png');
    fs.mkdirSync(path.dirname(small)); fs.writeFileSync(small, pngHeader(339, 2048));
    const prepare = vi.fn(async () => ({ kind: 'prepared' as const, path: small, mediaType: 'image/png' as const, width: 2904, height: 17528, preparedWidth: 339, preparedHeight: 2048 }));
    const r = await ReadTool.execute({ file_path: p }, { ...makeCtx(dir), supportsVision: true, services: { images: { prepare, preparedPathFor: () => null } } });
    expect(r.isError).toBeFalsy();
    expect(prepare).toHaveBeenCalledWith(p);
    expect(r.images).toEqual([small]);
    expect(r.text).toBe(`Read image ${p} (2904×17528 px, shown downscaled to 339×2048, 12% of original; small text may be unreadable — Read individual screenshots or crops for detail).`);
  });

  it('a fitting picture is promised as-is with today’s text, and prepare() is still consulted once', async () => {
    const p = path.join(dir, 'ok.png');
    fs.writeFileSync(p, pngHeader(640, 480));
    const prepare = vi.fn(async () => ({ kind: 'unchanged' as const, width: 640, height: 480 }));
    const r = await ReadTool.execute({ file_path: p }, { ...makeCtx(dir), supportsVision: true, services: { images: { prepare, preparedPathFor: () => null } } });
    expect(r.images).toEqual([p]);
    expect(r.text).toContain('Read image');
    expect(r.text).toContain('image/png');
  });

  it('a refusal from the preparer is an honest Read rejection that promises nothing', async () => {
    const p = path.join(dir, 'vast.png');
    fs.writeFileSync(p, pngHeader(20000, 20000));
    const prepare = vi.fn(async () => ({ kind: 'refused' as const, reason: 'is 20000×20000 px — too large to downscale for the model (over 80 megapixels). Crop or shrink it with Bash (e.g. magick in.png -resize 2048x2048 out.png) and Read the copy.', width: 20000, height: 20000 }));
    const r = await ReadTool.execute({ file_path: p }, { ...makeCtx(dir), supportsVision: true, services: { images: { prepare, preparedPathFor: () => null } } });
    expect(r.isError).toBe(true);
    expect(r.images).toBeUndefined();
    expect(r.text).toBe(`Read rejected: ${p} is 20000×20000 px — too large to downscale for the model (over 80 megapixels). Crop or shrink it with Bash (e.g. magick in.png -resize 2048x2048 out.png) and Read the copy.`);
  });

  it('with no preparer wired (tests, one-off contexts) the path is promised and the DRIVER’s gate decides', async () => {
    const p = path.join(dir, 'contact2.png');
    fs.writeFileSync(p, pngHeader(2904, 17528));
    const r = await ReadTool.execute({ file_path: p }, { ...makeCtx(dir), supportsVision: true });
    expect(r.images).toEqual([p]);
  });
```

Import `pngHeader` from `./image-support.test` (or the shared helper you created in Task 4).

- [ ] **Step 2: Run** — `npx vitest run tests/harness-tools-core.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `read.ts`, replace the `if (imageMediaType) { … }` block:

```ts
    if (imageMediaType) {
      if (st.size > MAX_ATTACHMENT_BYTES) {
        return { text: `Read rejected: ${args.file_path} is a ${(st.size / (1024 * 1024)).toFixed(1)} MB image (limit ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB).`, isError: true };
      }
      ctx.readRegistry.set(canonicalize(args.file_path, ctx.cwd), await fingerprintFile(abs));
      // Shrink-once (2026-10-07, image-prepare.ts): a picture over the long-edge
      // target is downscaled into a cached file BEFORE it is promised, so the
      // driver, the transcript and every resume path see a size the provider
      // accepts. The text keeps the user's path and says what changed — the
      // model must know small text may be unreadable at this size. Absent
      // service → promise the path; resolveToolImages' gate still refuses.
      const prepared = ctx.services?.images ? await ctx.services.images.prepare(abs) : null;
      if (prepared?.kind === 'refused') return { text: `Read rejected: ${args.file_path} ${prepared.reason}`, isError: true };
      if (prepared?.kind === 'prepared') {
        const pct = Math.max(1, Math.round((100 * prepared.preparedWidth) / prepared.width));
        return {
          text: `Read image ${args.file_path} (${prepared.width}×${prepared.height} px, shown downscaled to ${prepared.preparedWidth}×${prepared.preparedHeight}, ${pct}% of original; small text may be unreadable — Read individual screenshots or crops for detail).`,
          images: [prepared.path],
        };
      }
      return { text: `Read image ${args.file_path} (${Math.max(1, Math.round(st.size / 1024))} KB, ${imageMediaType}).`, images: [abs] };
    }
```

No new sync call is added to `read.ts` (its allowlist entry — one `fs.statSync` in `execute` — is unchanged; `tests/main-blocking-calls.test.ts` protects this file).

- [ ] **Step 4: Run** — `npx vitest run tests/harness-tools-core.test.ts tests/main-blocking-calls.test.ts tests/native-tools-polish.test.ts tests/tool-registry-manifest.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/tools/read.ts tests/harness-tools-core.test.ts
git commit -m "Read: downscale an oversized picture once and disclose it before promising"
```

---

### Task 9: Recognise the exact provider rejection

**Files:**
- Create: `src/main/providers/image-too-large.ts`
- Test: `tests/image-too-large.test.ts`

**Interfaces:**
- Produces: `export interface ImageTooLarge { requiredPatches: number; limitPatches: number }`, `export function imageTooLarge(error: unknown): ImageTooLarge | null`.

- [ ] **Step 1: Write the failing test** — `tests/image-too-large.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { imageTooLarge } from '../src/main/providers/image-too-large';

const MESSAGE = 'The image you provided requires 49868 patches after processing, exceeding the limit of 30000.';
const body = (message: string) => JSON.stringify({ error: { message, type: 'invalid_request_error', code: null } });

describe('imageTooLarge — the one wording ever captured, nothing broader', () => {
  it('recognises the real 400 and reports both numbers', () => {
    expect(imageTooLarge({ statusCode: 400, responseBody: body(MESSAGE) })).toEqual({ requiredPatches: 49_868, limitPatches: 30_000 });
    // Wrapped by the step retry (describeProviderError unwraps lastError the same way).
    expect(imageTooLarge({ lastError: { statusCode: 400, responseBody: body(MESSAGE) } })).toEqual({ requiredPatches: 49_868, limitPatches: 30_000 });
    // Pre-parsed body (some adapters keep .data).
    expect(imageTooLarge({ status: 400, data: { error: { message: MESSAGE } } })).toEqual({ requiredPatches: 49_868, limitPatches: 30_000 });
  });
  it('is null for every other 400, any other status, prose-only matches and junk', () => {
    expect(imageTooLarge({ statusCode: 400, responseBody: body('messages: text content blocks must be non-empty') })).toBeNull();
    expect(imageTooLarge({ statusCode: 413, responseBody: body(MESSAGE) })).toBeNull();
    expect(imageTooLarge({ statusCode: 400, responseBody: body('patches after processing') })).toBeNull();
    expect(imageTooLarge({ statusCode: 400, responseBody: 'not json' })).toBeNull();
    expect(imageTooLarge(new Error(MESSAGE))).toBeNull();     // no status → not a provider rejection
    expect(imageTooLarge(null)).toBeNull();
    expect(imageTooLarge('rate limited')).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — FAIL (module missing).

- [ ] **Step 3: Implement** — `src/main/providers/image-too-large.ts`:

```ts
// Intentionally narrow, like context-overflow.ts: the ONE structured rejection
// an oversized picture produces on OpenAI's wire (seen 2026-10-06 through the
// ChatGPT route), matched by status AND exact wording. Never infer from a bare
// 400 or from prose that merely mentions images. Provider-agnostic on purpose:
// OpenRouter relays OpenAI's message verbatim, so the body, not the provider
// id, is the evidence.
export interface ImageTooLarge { requiredPatches: number; limitPatches: number }

const PATCHES_RE = /requires (\d+) patches after processing, exceeding the limit of (\d+)/;

export function imageTooLarge(error: unknown): ImageTooLarge | null {
  const e = (error as any)?.lastError ?? error as any;
  if (!e || typeof e !== 'object') return null;
  if ((e.statusCode ?? e.status) !== 400) return null;
  let body: any;
  try { body = typeof e.responseBody === 'string' ? JSON.parse(e.responseBody) : e.data; } catch { return null; }
  const message = body?.error?.message ?? body?.message;
  const m = typeof message === 'string' ? PATCHES_RE.exec(message) : null;
  if (!m) return null;
  return { requiredPatches: Number(m[1]), limitPatches: Number(m[2]) };
}
```

- [ ] **Step 4: Run** — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/providers/image-too-large.ts tests/image-too-large.test.ts
git commit -m "providers: classify OpenAI's image-patch rejection, narrowly"
```

---

### Task 10: One bounded recovery in the step loop

**Files:**
- Modify: `src/main/harness/harness-session.ts` (import block near line 16; the step `while (true)` at 2766-2781; a new private method near `commitPrune` at 1979)
- Test: `tests/harness-session-loop.test.ts`

**Interfaces:**
- Produces: `private collapseOversizedImages(maxPatches: number): boolean` — rewrites `this.history` in place (same length, same order, same tool pairing), bumps the capture revision, clears `shownImages`, returns whether anything changed.
- Consumes: `imageTooLarge` (Task 9), `imageDimensions`, `patchCount`, `oversizedImageNote` (Task 2).

- [ ] **Step 1: Write the failing tests** — add to `tests/harness-session-loop.test.ts` (imports: `pngHeader` from `./image-support.test`; `oversizedImageNote` from `../src/main/harness/image-support`):

```ts
describe('HarnessSession — oversized-image recovery (2026-10-07)', () => {
  const PATCH_400 = () => Object.assign(new Error('rejected'), { statusCode: 400,
    responseBody: JSON.stringify({ error: { message: 'The image you provided requires 49868 patches after processing, exceeding the limit of 30000.' } }) });
  const huge = Buffer.concat([pngHeader(2904, 17528), Buffer.alloc(40)]);
  const fine = pngHeader(640, 480);
  /** A finished turn: the model asked Read for a picture and got two files back — one over budget. */
  const blockedHistory = () => ([
    { role: 'user', content: 'look at the sheet' },
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c0', toolName: 'Read', input: { file_path: '/tmp/contact.png' } }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c0', toolName: 'Read', output: { type: 'content', value: [
      { type: 'text', text: 'Read image /tmp/contact.png (6659 KB, image/png).' },
      { type: 'file', mediaType: 'image/png', data: { type: 'data', data: huge }, filename: 'contact.png' },
      { type: 'file', mediaType: 'image/png', data: { type: 'data', data: fine }, filename: 'ok.png' },
    ] } }] },
    { role: 'assistant', content: 'I see it.' },
  ] as any);

  it('collapses the offending image to the note, retries ONCE, and the turn completes with no tool rerun', async () => {
    const read = fakeTool('Read');
    const prompts: any[] = [];
    const scripts = [stream({ type: 'error', error: PATCH_400() }), stream(...textChunks('a', 'done'), finishChunk('stop'))];
    let index = 0;
    const model = new MockLanguageModelV4({ doStream: async (o: any) => { prompts.push(o); return { stream: simulateReadableStream({ chunks: scripts[index++] ?? stream(finishChunk('stop')) }) }; } });
    const session = new HarnessSession(makeOpts({ tools: [read], decide: async () => ALLOW, contextLength: 128_000 }), async () => model as any);
    session.seedHistory(blockedHistory());
    const events = collect(session);
    await session.send('uh');
    expect(prompts).toHaveLength(2);
    expect((read as any).calls).toHaveLength(0);
    expect(events.some(e => e.type === 'turn-complete')).toBe(true);
    expect(events.some(e => e.type === 'session-error')).toBe(false);
    const toolMsg = session.acceptedHistory().messages.find((m: any) => m.role === 'tool') as any;
    const out = toolMsg.content[0].output;
    expect(out.type).toBe('content');                                                   // the fitting image survives
    expect(out.value.filter((v: any) => v.type === 'file')).toHaveLength(1);
    expect(out.value[0].text).toBe('Read image /tmp/contact.png (6659 KB, image/png).\n' + oversizedImageNote('contact.png', 2904, 17528));
    // The second request carried the note instead of the oversized picture.
    expect(JSON.stringify(prompts[1].prompt)).toContain("above this model's image size limit");
  });

  it('an oversized composer attachment is dropped from the user message on recovery; the text stays', async () => {
    const prompts: any[] = [];
    const scripts = [stream({ type: 'error', error: PATCH_400() }), stream(...textChunks('a', 'done'), finishChunk('stop'))];
    let index = 0;
    const model = new MockLanguageModelV4({ doStream: async (o: any) => { prompts.push(o); return { stream: simulateReadableStream({ chunks: scripts[index++] ?? stream(finishChunk('stop')) }) }; } });
    const session = new HarnessSession(makeOpts({ tools: [], contextLength: 128_000 }), async () => model as any);
    session.seedHistory([{ role: 'user', content: [{ type: 'text', text: '/tmp/huge.png what' }, { type: 'file', mediaType: 'image/png', data: huge }] }, { role: 'assistant', content: 'hm' }] as any);
    await session.send('again');
    expect(prompts).toHaveLength(2);
    expect(session.acceptedHistory().messages[0]).toEqual({ role: 'user', content: '/tmp/huge.png what' });
  });

  it('does not retry when nothing in history is over the reported limit — the provider error surfaces unchanged', async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({ doStream: async () => { calls++; return { stream: simulateReadableStream({ chunks: stream({ type: 'error', error: PATCH_400() }) }) }; } });
    const session = new HarnessSession(makeOpts({ tools: [], contextLength: 128_000 }), async () => model as any);
    const events = collect(session);
    await session.send('plain text');
    expect(calls).toBe(1);
    const err = events.find(e => e.type === 'session-error')!;
    expect(err.data.text).toContain('requires 49868 patches');
  });

  it('retries at most once: a second rejection surfaces', async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({ doStream: async () => { calls++; return { stream: simulateReadableStream({ chunks: stream({ type: 'error', error: PATCH_400() }) }) }; } });
    const session = new HarnessSession(makeOpts({ tools: [], contextLength: 128_000 }), async () => model as any);
    session.seedHistory(blockedHistory());
    const events = collect(session);
    await session.send('uh');
    expect(calls).toBe(2);
    expect(events.some(e => e.type === 'session-error')).toBe(true);
  });

  it('never retries after output began', async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({ doStream: async () => { calls++; return { stream: simulateReadableStream({ chunks: stream(...textChunks('p', 'partial'), { type: 'error', error: PATCH_400() }) }) }; } });
    const session = new HarnessSession(makeOpts({ tools: [], contextLength: 128_000 }), async () => model as any);
    session.seedHistory(blockedHistory());
    await session.send('uh');
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/harness-session-loop.test.ts -t oversized` → FAIL.

- [ ] **Step 3: Implement** — imports: `import { imageTooLarge } from '../providers/image-too-large';` and add `imageDimensions, patchCount, oversizedImageNote` to the `image-support` import. In the step loop, change `let overflowRetried = false;` to:

```ts
        let overflowRetried = false;
        let imageRetried = false;
```

and the `catch`:

```ts
          } catch (err) {
            // Only a rejected request with no emitted output is safe to replay.
            // Completed tools were already appended before this step and are never rerun.
            const replayable = !partialAssistantText && !this.overflowOutputStarted;
            // Oversized picture (2026-10-07): the provider named the budget; collapse
            // every image part over it to the same note the reader writes, then
            // retry ONCE. Nothing is retried unchanged: collapse must report a change.
            const tooLarge = replayable && !imageRetried ? imageTooLarge(err) : null;
            if (tooLarge && this.collapseOversizedImages(tooLarge.limitPatches)) {
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

New method, placed after `commitPrune`:

```ts
  /** Rewrite history so no image part exceeds `maxPatches`: a tool-result file
   *  part becomes the oversized note appended to that result's text (the
   *  fitting siblings stay); a user-message file part is dropped (its path is
   *  still in the text, like an unreadable attachment). Same length, same
   *  order, same tool pairing. Returns whether anything changed.
   *  WHY in-memory only: the reader now writes this exact note on every
   *  rebuild, so reopen reproduces it without a new persisted event; the
   *  accepted-history store describes it (`pruned.oversized`). shownImages is
   *  cleared like commitPrune does, so a later Read re-delivers — prepared. */
  private collapseOversizedImages(maxPatches: number): boolean {
    let changed = false;
    const over = (buf: unknown): { width: number; height: number } | null => {
      if (!Buffer.isBuffer(buf)) return null;
      const dims = imageDimensions(buf);
      return dims && patchCount(dims.width, dims.height) > maxPatches ? dims : null;
    };
    this.history = this.history.map((m) => {
      const content = (m as any).content;
      if (!Array.isArray(content)) return m;
      let touched = false;
      if (m.role === 'tool') {
        const next = content.map((part: any) => {
          if (part?.type !== 'tool-result' || part.output?.type !== 'content' || !Array.isArray(part.output.value)) return part;
          const kept: any[] = []; const notes: string[] = [];
          for (const v of part.output.value) {
            const dims = v?.type === 'file' && v.data?.type === 'data' ? over(v.data.data) : null;
            if (dims) notes.push(oversizedImageNote(v.filename ?? part.toolName ?? 'image', dims.width, dims.height));
            else kept.push(v);
          }
          if (!notes.length) return part;
          touched = true;
          const text = kept.filter((v) => v?.type === 'text').map((v) => v.text).join('\n') + notes.map((n) => `\n${n}`).join('');
          const files = kept.filter((v) => v?.type !== 'text');
          return { ...part, output: files.length ? { type: 'content', value: [{ type: 'text', text }, ...files] } : { type: 'text', value: text } };
        });
        if (!touched) return m;
        changed = true;
        return { ...(m as object), content: next } as ModelMessage;
      }
      if (m.role === 'user') {
        const kept = content.filter((p: any) => !(p?.type === 'file' && over(p.data)));
        if (kept.length === content.length) return m;
        changed = true;
        const onlyText = kept.length === 1 && kept[0]?.type === 'text';
        return { ...(m as object), content: onlyText ? kept[0].text : kept } as ModelMessage;
      }
      return m;
    });
    if (changed) { this.capture.mutated(); this.shownImages.clear(); }
    return changed;
  }
```

Check `this.historyOrigins` needs no change (indices unchanged). If `reconcileTriggerVisibility()` is what `commitPrune` calls on a changed history, call it here too under `if (changed)` — read `commitPrune` (line 1979) and mirror what it does for a changed history except `markPruned` (this is a `mutated()` rewrite, not a prune transformation).

- [ ] **Step 4: Run** — `npx vitest run tests/harness-session-loop.test.ts tests/harness-accepted-history.test.ts tests/harness-stall-watchdog.test.ts tests/harness-session.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/harness/harness-session.ts tests/harness-session-loop.test.ts
git commit -m "harness: collapse oversized images and retry once on the provider's patch rejection"
```

---

### Task 11: Whole-branch verification

**Files:** none new.

- [ ] **Step 1:** From the workspace worktree: `bash scripts/verify.sh /home/destin/youcoded-dev/worktrees/sessions/image-patch-recovery/youcoded`. Read the whole output; a green exit does not erase warnings.
- [ ] **Step 2:** In `desktop/`: `npm run knip` (new files must not be listed), `npm run lint`, `npm run typecheck`, and `npx vitest run tests/main-blocking-calls.test.ts` (allowlist unchanged: `readImageFromDisk` still 1 stat + 1 read; `read.ts` `execute` still 1 stat).
- [ ] **Step 3:** Run the two suites the handoff's earlier session ran, so the baseline it recorded is still green: `npx vitest run tests/image-support.test.ts tests/native-image-attachments.test.ts tests/wire-adapter.test.ts tests/native-clear-barrier.test.ts tests/clear-preserves-timeline.test.ts`.
- [ ] **Step 4:** Fix anything red here, now (CLAUDE.md: a failing test is fixed when found). Commit fixes by explicit path.

---

### Task 12: Docs, MAP, roadmap, evaluator offer

**Files:**
- Modify (app worktree): `docs/native-runtime.md` (append a section at the end, after line 1153)
- Modify (workspace worktree): `docs/MAP.md` (the Native runtime row, line 55: entry points + guard tests), `docs/roadmap/native-harness.md` (one follow-up)

- [ ] **Step 1: `youcoded/docs/native-runtime.md`** — append:

```markdown
## Pictures: admission gate, shrink-once, bounded recovery (2026-10-07)

What broke: Read handed a 2,904×17,528 px contact sheet (6.8 MB, under the 10 MB byte cap) to a ChatGPT session; OpenAI rejected it — "requires 49868 patches after processing, exceeding the limit of 30000" — and because failed turns keep history, every later message resent it. Three resume paths re-read pictures by path, so nothing short of `/clear` recovered.

- **Limits are provider-type facts** on the capability profile (`imageLimits`, `capability-profile.ts`): OpenAI/ChatGPT `30,000` patches (the one verified number); everyone else a conservative `4096 px / 16,384` placeholder. 32-px patches, rounded up per axis (`image-support.ts` `patchCount`).
- **The ONE reader gates by header** (`readImageFromDisk(path, limits)`): dimensions parsed from the bytes already read (PNG/JPEG/GIF/WebP), still one stat + one read. Over budget → `[image not attached: <label> is W×H px, above this model's image size limit]`, written identically by the live driver, the reopen rebuild and the portable checkpoint. The private checkpoint refuses such an image (`image-oversized`) so the host falls back to the gated rebuild.
- **Shrink once, as a real file** (`image-prepare.ts`, `image-resize-worker.ts` in a utility process, cache `<userData>/image-cache/<hash>-<basename>.png`): Read prepares before it promises and discloses the downscale; `native:send` prepares composer attachments before the synchronous `send()`, and `imagePartsFor` reads the derivative while the message text keeps the original path. Long edge 2048, never enlarged; decode bound 80 MP; PNG first, JPEG only if still over 10 MB; preparation failure is a named refusal, never the original bytes.
- **Recovery** (`providers/image-too-large.ts`, `HarnessSession.collapseOversizedImages`): on that exact 400 with no output started, image parts over the reported limit collapse to the note (tool results keep fitting siblings; a user attachment part is dropped), the capture revision bumps, and the step is retried once. A second rejection surfaces the provider's own words.

Accepted limitations: a composer attachment's derivative is remembered only for this app run — after a restart, an oversized attachment in an old message is declined on reopen (its path stays in the text; Read on it prepares a fresh copy). GIF/WebP that `nativeImage` cannot decode are refused with a convert hint. The image cache is never swept (roadmap). Guards: `tests/image-support.test.ts`, `image-prepare.test.ts`, `image-resize.test.ts`, `image-too-large.test.ts`, the `oversized-image recovery` suite in `harness-session-loop.test.ts`, and the oversized cases in `accepted-history-store.test.ts`, `harness-history-rebuild.test.ts`, `harness-tools-core.test.ts`, `native-image-attachments.test.ts`, `ipc-native-send.test.ts`.
```

- [ ] **Step 2: `docs/MAP.md`** (workspace) — in the Native runtime row (line 55) add to **Entry points**: `youcoded/desktop/src/main/harness/image-support.ts` (the one image reader + pixel gate), `youcoded/desktop/src/main/harness/image-prepare.ts` + `youcoded/desktop/src/main/image-resize-service.ts` (shrink-once, utility process), `youcoded/desktop/src/main/providers/image-too-large.ts`; to **Guard tests**: `youcoded/desktop/tests/image-support.test.ts`, `image-prepare.test.ts`, `image-resize.test.ts`, `image-too-large.test.ts`. In the on-disk state table (line ~186) add a row: `<userData>/image-cache/<hash>-<basename>.png|jpg` | shrunk copies of pictures too big for a model; safe to delete (a missing one becomes an "image no longer available" note on reopen) | `youcoded/desktop/src/main/harness/image-prepare.ts`. Then run `node scripts/audit-anchors.mjs` from the workspace worktree and fix what it reports.

- [ ] **Step 3: roadmap** — in `docs/roadmap/native-harness.md`, following its Filing test and the `ROADMAP.md` grammar, add ONE P3 entry (or extend an existing images/attachments entry if one exists — check first): "Image cache sweep and durable attachment derivatives — the shrunk copies in `<userData>/image-cache` are never removed, and a composer attachment's shrunk copy is only remembered for the current app run (Read-delivered ones are durable). Symptoms in Destin's words: none yet; filed from the 2026-10-07 oversized-image plan." Run `node scripts/roadmap-check.mjs --fix`.

- [ ] **Step 4: Commit** — app worktree: `git add docs/native-runtime.md && git commit -m "docs: pictures — gate, shrink-once, recovery"`; workspace worktree: `git add docs/MAP.md docs/roadmap/native-harness.md && git commit -m "map/roadmap: oversized-image safety"`; push both.

- [ ] **Step 5: Offer the harness evaluator, do not run it.** The Read tool's behaviour changed, so the rule applies: tell Destin `youcoded/desktop/test-engine/harness-eval.mjs --plan <file> --dry-run` is free and a real run costs ~$0.25 a cell and needs `--key-file`; let him decide. Do not create a plan file or spend anything unasked.

- [ ] **Step 6: Close out.** Report in chat: what shipped, what verify.sh said verbatim where it matters, the accepted limitations above, and that the `.bak-before-image-removal` file beside the rescued conversation was deliberately left alone. End with "ready to merge?" — never merge or suggest merging.

---

## Self-review (done while writing; re-run after executing)

- **Spec coverage:** limits → T1; header gate on every reader path → T2/T3; private checkpoint durability + collapsed descriptor → T4; shrink-once file cache → T5; off-main-thread decode → T6; composer attachments and tool services → T7; Read disclosure → T8; narrow classifier → T9; bounded one-retry, no tool rerun, no unchanged retry, second failure surfaces → T10; error copy = the provider's own words through `describeProviderError` (asserted in T10); verification → T11; docs/MAP/roadmap/evaluator offer → T12. Android: nothing to do (verified no reader under `app/`).
- **Known gaps, stated:** attachment derivatives are per-run (roadmap); mixed results that collapse one of several images are describable (`pruned.oversized` is only for all-text output) — a tool result that keeps a fitting sibling AND gains a note stays `content` and is NOT describable by the store, so that checkpoint publish logs `unreferenced-history` until the next compaction. If a reviewer wants that closed, extend `describeToolResult`'s `content` branch to accept `text + notes` as `first.text` with an `oversized` descriptor alongside `images` — same parser, one more branch.
- **Type consistency:** `ImageReadResult` (T2) is what `RebuildImageReader` (T3), `imagePartsFor`/`resolveToolImages` (T3/T7) and the host closure (T3) use; `ImageLimits` (T1) is the type threaded through `readImageFromDisk`, `restore({ imageLimits })` and `profileSnapshot.imageLimits`; `PreparedImage`/`ImagePreparerLike` (T5) are what `ToolServices.images` (T7) and Read (T8) consume; `ResizeFn` (T5) is what `createResizeService` (T6) returns; `imageTooLarge` (T9) feeds `collapseOversizedImages(limitPatches)` (T10).
