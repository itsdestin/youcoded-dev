---
status: active
milestone: M4-followup
spec: docs/active/specs/2026-08-11-native-image-handling.md
---

# Native Image Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a native-session model fetch an image by path through the Read tool — stored natively in the tool result, adapted per provider at request-build time — plus the three #290 follow-up fixes (token sizing, attachment resume, extension table). **Note: PR #290 is already MERGED into `youcoded` master (merge `9a2d8af7`), so the "fixes for #290" land as ordinary commits on this branch, not on a PR branch.**

**Architecture:** The image lives canonically inside the tool-result message (`output: { type: 'content', value: [text, file…] }` — the AI SDK v7 shape `@ai-sdk/anthropic@4.0.18` maps to native `tool_result` image blocks). A pure request-build adapter (`adaptForWire`) runs on every model call: pass-through on direct Anthropic, placeholder-text-plus-synthetic-follow-up-user-message on OpenAI-compatible wires (the Cline/Goose pattern), full image strip for non-vision models. Because history is canonical and the split happens per request, mid-session model swaps can never leak pixels to a blind model, and no synthetic message ever persists.

**Tech Stack:** TypeScript, Electron main process (`youcoded/desktop/src/main/harness/`), AI SDK `ai@7.0.36`, vitest, zod.

## Global Constraints

- All code changes go to the **youcoded** sub-repo in a worktree: `youcoded/worktrees/native-images`, branch `feat/native-image-delivery` (created in Task 1). This plan file lives in the **youcoded-dev** workspace repo.
- **Emit surface is FROZEN** (`.claude/rules/native-runtime.md`): no new `TranscriptEventType` values. New optional *fields* on existing event `data` are allowed (`attachments`, `images`).
- **Pairing invariant:** every assistant tool-call is immediately followed by a tool message covering its `toolCallId`. Synthetic wire messages are inserted only AFTER a complete `role:'tool'` message (the position `injectPathTriggers` already proves safe on every provider).
- **The no-image path stays byte-identical:** a user message with no attachments is a plain string; a tool result with no images keeps `output: { type: 'text', value }`. `tests/harness-history-rebuild.test.ts`'s deep-equal contract is the arbiter.
- Never write misleading model-facing or user-facing text: every skipped image is named with its real reason (`docs/error-message-standards.md` spirit applies to tool results too).
- Annotate non-trivial edits with WHY comments (Destin reads code through them).
- Constants (verbatim, defined in Task 2): `MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024`, `MAX_IMAGES_PER_TURN = 8`, `MAX_IMAGE_BYTES_PER_TURN = 20 * 1024 * 1024`, `IMAGE_PART_TOKEN_ESTIMATE = 1_600`, `APPROX_CHARS_PER_TOKEN = 4`.
- After each task: `bash scripts/verify.sh native-images` from the workspace root must pass (tsc + related vitest + knip + eslint + ast-grep). Run vitest directly from `worktrees/native-images/desktop` for the named test files.
- Android is untouched (native runtime is desktop-only until M8). No IPC channel changes anywhere, so `ipc-channels.test.ts` parity is unaffected.

**Line numbers below are against youcoded master `9a2d8af7`.** Verify with the quoted code before editing; if a quote doesn't match, re-locate with `rg` rather than trusting the number.

---

### Task 1: Worktree + binary-aware token sizing (`message-size.ts`)

The #290 sizing bug: every context-sizing path uses `JSON.stringify(content).length / 4`, and stringifying a Buffer yields `{"type":"Buffer","data":[137,80,...]}` — ~4–5 chars per **byte**, so a 1 MB PNG estimates at ~1.1M tokens and `fitToContext` drops the whole prior conversation on any image turn.

**Files:**
- Create: `desktop/src/main/harness/message-size.ts`
- Test: `desktop/tests/message-size.test.ts`
- Modify: `desktop/src/main/harness/harness-session.ts` (lines ~432-435, ~643-650, ~713), `desktop/src/main/harness/compaction.ts` (lines 10-31)

**Interfaces:**
- Produces: `messageTokens(m: ModelMessage): number`, `messagesTokens(messages: ModelMessage[]): number`, `APPROX_CHARS_PER_TOKEN = 4`, `IMAGE_PART_TOKEN_ESTIMATE = 1_600` — used by Tasks 5, 6, 8.

- [ ] **Step 1: Create the worktree**

```bash
cd /home/destin/youcoded-dev/youcoded && git fetch origin && git pull origin master
git worktree add worktrees/native-images -b feat/native-image-delivery origin/master
cd worktrees/native-images/desktop && npm ci
```

- [ ] **Step 2: Write the failing test**

Create `desktop/tests/message-size.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { messageTokens, messagesTokens, IMAGE_PART_TOKEN_ESTIMATE } from '../src/main/harness/message-size';

describe('message-size', () => {
  it('sizes a plain-string message at chars/4', () => {
    expect(messageTokens({ role: 'user', content: 'a'.repeat(400) } as any)).toBe(100);
  });

  it('charges a flat estimate for a binary part, not stringified bytes', () => {
    // The #290 bug: JSON.stringify(Buffer) is ~4-5 chars/byte, so 1 MB looked
    // like ~1.1M tokens and fitToContext evicted the entire prior conversation.
    const oneMb = Buffer.alloc(1024 * 1024, 0x89);
    const msg = { role: 'user', content: [{ type: 'text', text: 'see attached' }, { type: 'file', mediaType: 'image/png', data: oneMb }] } as any;
    const tokens = messageTokens(msg);
    expect(tokens).toBeGreaterThanOrEqual(IMAGE_PART_TOKEN_ESTIMATE);
    expect(tokens).toBeLessThan(IMAGE_PART_TOKEN_ESTIMATE + 100);
  });

  it('charges the flat estimate for a Buffer nested in a content-type tool output', () => {
    const msg = { role: 'tool', content: [{ type: 'tool-result', toolCallId: 't1', toolName: 'Read', output: { type: 'content', value: [{ type: 'text', text: 'Read image x.png' }, { type: 'file', mediaType: 'image/png', data: { type: 'data', data: Buffer.alloc(500_000) } }] } }] } as any;
    expect(messageTokens(msg)).toBeLessThan(IMAGE_PART_TOKEN_ESTIMATE + 200);
  });

  it('sums across messages', () => {
    const msgs = [{ role: 'user', content: 'a'.repeat(40) }, { role: 'user', content: 'b'.repeat(40) }] as any;
    expect(messagesTokens(msgs)).toBe(messageTokens(msgs[0]) + messageTokens(msgs[1]));
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/message-size.test.ts`
Expected: FAIL — `Cannot find module '../src/main/harness/message-size'`

- [ ] **Step 4: Implement `message-size.ts`**

```ts
// Token sizing that understands binary parts. JSON.stringify on a Node Buffer
// yields {"type":"Buffer","data":[137,80,...]} — roughly 4-5 characters per
// BYTE — so the old chars/4 paths estimated a 1 MB screenshot at ~1.1M "tokens"
// and fitToContext dropped the entire prior conversation on any turn that
// carried an image (#290 follow-up fix 1, 2026-08-11 spec).
import type { ModelMessage } from 'ai';

export const APPROX_CHARS_PER_TOKEN = 4;

// What a provider actually bills for a screenshot-sized image (Anthropic is
// ~1.1-1.6k tokens at its 1092px resize ceiling; OpenAI-compatible data-URL
// paths land in the same range). A flat estimate deliberately beats byte math:
// base64 length wildly overestimates large images the provider downscales anyway.
export const IMAGE_PART_TOKEN_ESTIMATE = 1_600;

// Recursive char-equivalent walk. Buffers (and any typed array) count as one
// image's worth of chars wherever they appear — user-message file parts hold a
// bare Buffer, tool-result content outputs hold { type:'data', data: Buffer } —
// so one rule covers both shapes without knowing message schemas.
function charSize(value: unknown): number {
  if (typeof value === 'string') return value.length;
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return 8;
  if (value instanceof Uint8Array) return IMAGE_PART_TOKEN_ESTIMATE * APPROX_CHARS_PER_TOKEN;
  if (Array.isArray(value)) { let n = 2; for (const v of value) n += charSize(v); return n; }
  if (typeof value === 'object') {
    let n = 2;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) n += k.length + charSize(v);
    return n;
  }
  return 8;
}

export function messageTokens(m: ModelMessage): number {
  return Math.ceil(charSize((m as { content: unknown }).content) / APPROX_CHARS_PER_TOKEN);
}

export function messagesTokens(messages: ModelMessage[]): number {
  let n = 0;
  for (const m of messages) n += messageTokens(m);
  return n;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/message-size.test.ts` — Expected: PASS (4 tests)

- [ ] **Step 6: Route every sizing path through it**

In `harness-session.ts`, add to the imports block: `import { messageTokens, messagesTokens } from './message-size';` (keep the existing local `APPROX_CHARS_PER_TOKEN` usages that size plain strings — only the three `JSON.stringify(...content...)` sites change).

1. `estimateContextTokens` (~line 432):
```ts
private estimateContextTokens(): number {
  return Math.ceil(this.systemText.length / APPROX_CHARS_PER_TOKEN)
    + messagesTokens(this.history);   // binary-aware — see message-size.ts
}
```
2. `fitToContext` size loop (~line 647): replace `const size = Math.ceil(JSON.stringify(messages[i].content).length / APPROX_CHARS_PER_TOKEN);` with `const size = messageTokens(messages[i]);`
3. `salvageOversizedTail` (~line 713): replace `head.reduce((n, m) => n + Math.ceil(JSON.stringify(m.content).length / APPROX_CHARS_PER_TOKEN), 0)` with `head.reduce((n, m) => n + messageTokens(m), 0)`

In `compaction.ts`: delete the local `const APPROX_CHARS_PER_TOKEN = 4;`, add `import { messageTokens, messagesTokens, APPROX_CHARS_PER_TOKEN } from './message-size';`, then:
```ts
export function estimateTokens(messages: ModelMessage[]): number {
  return messagesTokens(messages);   // binary-aware (#290 follow-up fix 1)
}
```
and in `protectedFrom`, replace `acc += Math.ceil(JSON.stringify((messages[i] as any).content).length / APPROX_CHARS_PER_TOKEN);` with `acc += messageTokens(messages[i]);`. (`APPROX_CHARS_PER_TOKEN` stays imported — `PRUNE_TRAILER`/`pruneToChars` math still uses it.)

- [ ] **Step 7: Add a regression test at the fitToContext level**

Append to `desktop/tests/message-size.test.ts` — this is the user-visible symptom pinned:

```ts
import { estimateTokens } from '../src/main/harness/compaction';

describe('sizing regression (#290 image-turn eviction)', () => {
  it('a history with one attached image does not dwarf the text history', () => {
    const history = [
      { role: 'user', content: 'question one' },
      { role: 'assistant', content: 'answer one' },
      { role: 'user', content: [{ type: 'text', text: 'see screenshot' }, { type: 'file', mediaType: 'image/png', data: Buffer.alloc(1024 * 1024) }] },
    ] as any;
    // Before the fix this was ~1.1M tokens; a 32k budget kept ONLY the image
    // message and silently dropped the rest of the conversation.
    expect(estimateTokens(history)).toBeLessThan(3_000);
  });
});
```

- [ ] **Step 8: Verify and commit**

Run: `npx vitest run tests/message-size.test.ts tests/compaction.test.ts tests/harness-compaction.test.ts` then `cd /home/destin/youcoded-dev && bash scripts/verify.sh native-images` — Expected: all PASS.

```bash
cd /home/destin/youcoded-dev/youcoded/worktrees/native-images
git add desktop/src/main/harness/message-size.ts desktop/tests/message-size.test.ts desktop/src/main/harness/harness-session.ts desktop/src/main/harness/compaction.ts
git commit -m "fix(native): size binary message parts by a flat image estimate, not JSON length

A 1 MB attachment stringified to ~4.4M chars and estimated as ~1.1M tokens,
so fitToContext evicted the entire prior conversation on any image turn."
```

---

### Task 2: Shared image module (`image-support.ts`)

One extension→media-type table for the whole harness (#290 follow-up fix 3: Read's list had `.bmp/.svg/.avif` that the attachment pipeline can't deliver), plus the disk reader and budget constants every later task uses.

**Files:**
- Create: `desktop/src/main/harness/image-support.ts`
- Test: `desktop/tests/image-support.test.ts`
- Modify: `desktop/src/main/harness/harness-session.ts` (delete local `IMAGE_MEDIA_TYPES`/`MAX_ATTACHMENT_BYTES` at lines 263-273; rewrite `imagePartsFor` ~line 1004)

**Interfaces:**
- Produces (consumed by Tasks 3-8): `deliverableImageMediaType(p: string): string | null` · `UNDELIVERABLE_IMAGE_EXTENSIONS: Set<string>` (`.bmp .svg .avif`) · `readImageFromDisk(absPath: string): { mediaType: string; data: Buffer } | null` · `MAX_ATTACHMENT_BYTES` · `MAX_IMAGES_PER_TURN = 8` · `MAX_IMAGE_BYTES_PER_TURN = 20 * 1024 * 1024`.

- [ ] **Step 1: Write the failing test**

Create `desktop/tests/image-support.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { deliverableImageMediaType, UNDELIVERABLE_IMAGE_EXTENSIONS, readImageFromDisk } from '../src/main/harness/image-support';

describe('image-support', () => {
  it('maps deliverable extensions and rejects the rest', () => {
    expect(deliverableImageMediaType('/a/shot.PNG')).toBe('image/png');
    expect(deliverableImageMediaType('/a/pic.jpeg')).toBe('image/jpeg');
    expect(deliverableImageMediaType('/a/anim.webp')).toBe('image/webp');
    expect(deliverableImageMediaType('/a/notes.txt')).toBeNull();
    // An image format we CANNOT deliver must never be "deliverable" — the
    // old split table promised these and silently delivered nothing.
    expect(deliverableImageMediaType('/a/logo.svg')).toBeNull();
    expect(UNDELIVERABLE_IMAGE_EXTENSIONS.has('.svg')).toBe(true);
    expect(UNDELIVERABLE_IMAGE_EXTENSIONS.has('.bmp')).toBe(true);
    expect(UNDELIVERABLE_IMAGE_EXTENSIONS.has('.avif')).toBe(true);
  });

  it('readImageFromDisk reads a real file and nulls on missing/oversized/undeliverable', () => {
    const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'imgsup-')), 'x.png');
    fs.writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(readImageFromDisk(p)).toEqual({ mediaType: 'image/png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) });
    expect(readImageFromDisk(path.join(path.dirname(p), 'gone.png'))).toBeNull();
    expect(readImageFromDisk(p.replace('.png', '.svg'))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — `npx vitest run tests/image-support.test.ts` — Expected: FAIL (module not found)

- [ ] **Step 3: Implement `image-support.ts`**

```ts
// The ONE extension table + disk reader for image delivery (spec 2026-08-11).
// #290 shipped two disagreeing tables: Read's IMAGE_EXTENSIONS included
// .bmp/.svg/.avif that imagePartsFor's IMAGE_MEDIA_TYPES could not deliver —
// harmless while the tool only refused images, a silent dead end the moment it
// promises one. Everything image-shaped imports from here now.
import * as fs from 'fs';
import * as path from 'path';

// Only formats every mainstream vision model accepts (moved verbatim from
// harness-session.ts).
const IMAGE_MEDIA_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp',
};

// Real image formats we deliberately do NOT deliver (providers reject or
// mis-handle them). Read names these honestly instead of promising them.
export const UNDELIVERABLE_IMAGE_EXTENSIONS = new Set(['.bmp', '.svg', '.avif']);

// Attachments are base64'd into the request, so a huge one is a request-size
// failure AND a token bill. 10 MB is far above any screenshot (moved from
// harness-session.ts).
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

// Model-initiated fetch budgets (spec "Budgets" — starting numbers, tunable).
// Roo caps 20 MB/task, Cline 8 MiB/request; unlimited is the ecosystem outlier.
export const MAX_IMAGES_PER_TURN = 8;
export const MAX_IMAGE_BYTES_PER_TURN = 20 * 1024 * 1024;

export function deliverableImageMediaType(p: string): string | null {
  return IMAGE_MEDIA_TYPES[path.extname(p).toLowerCase()] ?? null;
}

/** Bytes+mediaType for a deliverable image, or null (missing, unreadable,
 *  oversized, or not a deliverable format). Null — never throw — because every
 *  caller (attachment push, tool delivery, resume rebuild) treats a bad file as
 *  a skip-with-note, not a dead turn. */
export function readImageFromDisk(absPath: string): { mediaType: string; data: Buffer } | null {
  const mediaType = deliverableImageMediaType(absPath);
  if (!mediaType) return null;
  try {
    const st = fs.statSync(absPath);
    if (st.size > MAX_ATTACHMENT_BYTES) return null;
    return { mediaType, data: fs.readFileSync(absPath) };
  } catch { return null; }
}
```

- [ ] **Step 4: Run the test** — `npx vitest run tests/image-support.test.ts` — Expected: PASS

- [ ] **Step 5: Point `harness-session.ts` at it**

Delete the local `IMAGE_MEDIA_TYPES` (lines 266-269) and `MAX_ATTACHMENT_BYTES` (line 273) blocks with their comments; add `import { readImageFromDisk } from './image-support';`. Rewrite `imagePartsFor` (~line 1004) to delegate:

```ts
/** Image parts for a user message, or [] when the model cannot see images / none
 *  were attached. Unreadable or oversized files are SKIPPED rather than thrown:
 *  a turn must not die because one attachment went missing between the composer
 *  and the send, and the path is still in the message text either way. */
private imagePartsFor(attachments: string[]): Array<{ type: 'file'; mediaType: string; data: Buffer }> {
  if (!attachments.length || !this.profile.supportsVision) return [];
  const parts: Array<{ type: 'file'; mediaType: string; data: Buffer }> = [];
  for (const p of attachments) {
    const img = readImageFromDisk(p);   // shared reader — one table, one cap (fix 3)
    if (img) parts.push({ type: 'file', mediaType: img.mediaType, data: img.data });
  }
  return parts;
}
```

- [ ] **Step 6: Verify and commit**

Run: `npx vitest run tests/image-support.test.ts` + the harness suites (`npx vitest run tests/harness-session-loop.test.ts tests/harness-history-rebuild.test.ts`), then `bash scripts/verify.sh native-images` from the workspace root.

```bash
git add desktop/src/main/harness/image-support.ts desktop/tests/image-support.test.ts desktop/src/main/harness/harness-session.ts
git commit -m "refactor(native): one shared image table + disk reader (fix the split extension tables)"
```

---

### Task 3: Attachments survive resume (persist paths on `user-message` events)

#290 follow-up fix 2: `send()` emits `user-message` with `{ text }` only, and `rebuildHistory` coerces every user message to a plain string — so even user-attached images vanish on reopen. Persist the *paths* and re-read the files at rebuild.

**Files:**
- Modify: `desktop/src/shared/types.ts` (TranscriptEvent `data`, ~line 155), `desktop/src/main/harness/harness-session.ts` (`send()`, ~line 996), `desktop/src/main/harness/history-rebuild.ts` (signature + `user-message` case, lines 32-47), `desktop/src/main/harness/native-session-host.ts` (the `seedHistory(rebuildHistory(...))` call, ~line 527)
- Test: `desktop/tests/harness-history-rebuild.test.ts` (extend)

**Interfaces:**
- Produces: `rebuildHistory(events, readImage?: RebuildImageReader)` where `type RebuildImageReader = (absPath: string) => { mediaType: string; data: Buffer } | null` — Task 7 reuses the same reader for tool results.
- `TranscriptEvent.data` gains `attachments?: string[]` (this task) and `images?: string[]` (declared now, written in Task 5).

- [ ] **Step 1: Write the failing tests**

Add to `desktop/tests/harness-history-rebuild.test.ts`:

```ts
import { rebuildHistory } from '../src/main/harness/history-rebuild';

describe('attachment resume (#290 follow-up fix 2)', () => {
  const ev = (type: string, data: any) => ({ type, sessionId: 's', uuid: crypto.randomUUID(), timestamp: 1, data }) as any;
  const fakeReader = (p: string) => p.endsWith('ok.png') ? { mediaType: 'image/png', data: Buffer.from('png!') } : null;

  it('re-reads persisted attachment paths into user-message parts', () => {
    const out = rebuildHistory([ev('user-message', { text: 'see /tmp/ok.png', attachments: ['/tmp/ok.png'] })], fakeReader);
    expect(out).toEqual([{ role: 'user', content: [{ type: 'text', text: 'see /tmp/ok.png' }, { type: 'file', mediaType: 'image/png', data: Buffer.from('png!') }] }]);
  });

  it('a vanished attachment degrades to the plain-string shape (path still in text)', () => {
    const out = rebuildHistory([ev('user-message', { text: 'see /tmp/gone.png', attachments: ['/tmp/gone.png'] })], fakeReader);
    expect(out).toEqual([{ role: 'user', content: 'see /tmp/gone.png' }]);
  });

  it('no reader (pure/legacy call) keeps today"s exact behavior', () => {
    const out = rebuildHistory([ev('user-message', { text: 'hi', attachments: ['/tmp/ok.png'] })]);
    expect(out).toEqual([{ role: 'user', content: 'hi' }]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/harness-history-rebuild.test.ts` — Expected: the three new tests FAIL (extra argument ignored / shape mismatch); pre-existing tests PASS.

- [ ] **Step 3: Implement**

`shared/types.ts`, inside `TranscriptEvent`'s `data` (after `structuredPatch`):
```ts
/** Native user-message events: absolute composer attachment paths, persisted so
 *  resume can re-read the pixels (events carry no binary). #290 follow-up fix 2. */
attachments?: string[];
/** Native tool-result events: absolute paths of images the tool delivered
 *  (Read on an image). Resume re-reads them; the UI may render a chip. */
images?: string[];
```

`harness-session.ts` `send()` (~line 996):
```ts
async send(text: string, attachments: string[] = []): Promise<void> {
  // Attachments ride the persisted event (paths only — events carry no binary)
  // so rebuildHistory can restore the pixels on resume. Emitted only when
  // present to keep the no-attachment event byte-identical to before.
  return this.beginTurn(
    text,
    () => this.emitEvent('user-message', attachments.length ? { text, attachments } : { text }),
    attachments,
  );
}
```

`history-rebuild.ts`: add the reader type + parameter and rewrite the `user-message` case:
```ts
/** Re-reads a persisted image path at rebuild time. Injected (not imported) so
 *  the module stays pure and tests need no filesystem. Production passes
 *  image-support.readImageFromDisk. */
export type RebuildImageReader = (absPath: string) => { mediaType: string; data: Buffer } | null;

export function rebuildHistory(events: TranscriptEvent[], readImage?: RebuildImageReader): ModelMessage[] {
```
```ts
case 'user-message': {
  flushAssistant(); flushResults();
  const text = String(e.data?.text ?? '');
  // Mirror beginTurn's live push exactly: parts array ONLY when an image was
  // actually readable — a vanished file degrades to the plain string, the same
  // skip-with-the-path-still-in-text semantics send() had live.
  const paths = Array.isArray(e.data?.attachments) ? (e.data.attachments as string[]) : [];
  const parts: Array<{ type: 'file'; mediaType: string; data: Buffer }> = [];
  if (readImage) for (const p of paths) { const img = readImage(p); if (img) parts.push({ type: 'file', mediaType: img.mediaType, data: img.data }); }
  out.push(parts.length
    ? ({ role: 'user', content: [{ type: 'text', text }, ...parts] } as any)
    : { role: 'user', content: text });
  break;
}
```

`native-session-host.ts` (~line 527): change `seedHistory(rebuildHistory(store.readEvents(...)))` to pass the disk reader:
```ts
import { readImageFromDisk } from './image-support';
// ...
entry.session.seedHistory(rebuildHistory(events, readImageFromDisk));
```
(Match the actual local variable names at the call site — locate with `rg -n "rebuildHistory" src/main/harness/native-session-host.ts`.)

- [ ] **Step 4: Run tests** — `npx vitest run tests/harness-history-rebuild.test.ts tests/native-session-host.test.ts` — Expected: PASS

- [ ] **Step 5: Verify and commit**

```bash
git add desktop/src/shared/types.ts desktop/src/main/harness/harness-session.ts desktop/src/main/harness/history-rebuild.ts desktop/src/main/harness/native-session-host.ts desktop/tests/harness-history-rebuild.test.ts
git commit -m "fix(native): attached images survive resume — persist paths on the event, re-read at rebuild"
```

---

### Task 4: Read delivers images (vision-gated) + dynamic tool description

The tool returns the image *path* in `ToolResultPayload.images`; the driver (Task 5) turns paths into parts. Resolve-before-promise: Read stats the file and checks caps before writing any promise text. The description must advertise image reading to vision models — Roo shipped without this and models never tried (their #10440); it's core work here because Read is now the only path-based mechanism.

**Files:**
- Modify: `desktop/src/main/harness/tools/types.ts` (`ToolResultPayload`, `ToolContext`, `NativeTool`), `desktop/src/main/harness/tools/read.ts`, `desktop/src/main/harness/harness-session.ts` (`buildAiTools` ~line 612, ToolContext construction ~line 1620)
- Test: `desktop/tests/harness-tools-core.test.ts` (extend — if Read's tests live elsewhere, `rg -ln "Read rejected" desktop/tests` and extend that file)

**Interfaces:**
- Produces: `ToolResultPayload.images?: string[]` (absolute paths) · `ToolContext.supportsVision?: boolean` (undefined = false) · `NativeTool.descriptionFor?(caps: { supportsVision: boolean }): string | undefined`.

- [ ] **Step 1: Write the failing tests** (in the file that already tests ReadTool; `makeCtx` = that file's existing ToolContext helper)

```ts
describe('Read: image delivery (2026-08-11 spec)', () => {
  it('returns the image path in payload.images for a vision model', async () => {
    const p = path.join(tmpDir, 'shot.png');
    fs.writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const r = await ReadTool.execute({ file_path: p }, { ...makeCtx(), supportsVision: true });
    expect(r.isError).toBeFalsy();
    expect(r.images).toEqual([p]);
    expect(r.text).toContain('Read image');
    expect(r.text).toContain('image/png');
  });

  it('refuses honestly for a non-vision model (no images field)', async () => {
    const p = path.join(tmpDir, 'shot2.png');
    fs.writeFileSync(p, Buffer.from([1]));
    const r = await ReadTool.execute({ file_path: p }, { ...makeCtx(), supportsVision: false });
    expect(r.isError).toBe(true);
    expect(r.images).toBeUndefined();
    expect(r.text).toContain('cannot view images');
  });

  it('refuses an undeliverable image format by name, never promising it', async () => {
    const p = path.join(tmpDir, 'vector.svg');
    fs.writeFileSync(p, '<svg/>');
    const r = await ReadTool.execute({ file_path: p }, { ...makeCtx(), supportsVision: true });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('svg');
    expect(r.images).toBeUndefined();
  });

  it('refuses an oversized image with the real size and limit', async () => {
    // statSync is mocked or a sparse file is used — an 11 MB write is fine in tmp.
    const p = path.join(tmpDir, 'huge.png');
    fs.writeFileSync(p, Buffer.alloc(11 * 1024 * 1024));
    const r = await ReadTool.execute({ file_path: p }, { ...makeCtx(), supportsVision: true });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/11(\.\d)? MB.*10 MB/s);
  });

  it('advertises image reading only to vision models', () => {
    expect(ReadTool.descriptionFor!({ supportsVision: true })).toContain('images');
    expect(ReadTool.descriptionFor!({ supportsVision: false })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure** — Expected: FAIL (`supportsVision`/`images`/`descriptionFor` unknown).

- [ ] **Step 3: Extend `tools/types.ts`**

`ToolContext` (after `todos`):
```ts
/** Whether the SESSION's current model can see images (profile.supportsVision).
 *  Optional so test/one-off contexts default to the conservative false. */
supportsVision?: boolean;
```
`ToolResultPayload` (after `bounds`):
```ts
/** Absolute paths of images this result delivers (Read on an image file). The
 *  DRIVER turns paths into content parts, applies per-turn budgets + dedupe,
 *  and amends `text` with a named note for anything it skips — the tool only
 *  ever promises what it has already stat'd (resolve-before-promise). */
images?: string[];
```
`NativeTool` (after `moreHint`):
```ts
/** Capability-dependent description override. Returning undefined falls back to
 *  `description`. WHY: a model is never told about image reading it doesn't
 *  have — and a vision model that isn't told never tries (Roo Code #10440). */
descriptionFor?(caps: { supportsVision: boolean }): string | undefined;
```

- [ ] **Step 4: Rewrite `read.ts`'s image branch**

Imports: `import { deliverableImageMediaType, UNDELIVERABLE_IMAGE_EXTENSIONS, MAX_ATTACHMENT_BYTES } from '../image-support';` — delete the local `IMAGE_EXTENSIONS` set (line 11).

Add after `name`/`description` (keep `description` as the current text-only wording, but replace its last clause with `'Images and other binary files are refused.'` — the "ask the user to attach it" advice moves to the refusal below):
```ts
// Vision models are TOLD Read handles images; text-only models keep the
// refusal-only wording. See NativeTool.descriptionFor.
descriptionFor: (caps) => caps.supportsVision
  ? 'Read a file from the filesystem. Text files return numbered lines; use offset and '
    + 'limit for large files — output is capped at 2000 lines. Image files (png, jpg, '
    + 'gif, webp) are delivered to you as the actual picture alongside the result — '
    + 'Read is how you look at a screenshot or image the user mentions by path.'
  : undefined,
```

In `execute`, insert between the `sizeErr` check (line 78) and `const buf = fs.readFileSync(abs);` (line 79) — the image branch must run BEFORE the full-file read; the driver reads the bytes at delivery time:
```ts
// IMAGES (2026-08-11 spec): a vision model gets the actual picture — the tool
// returns the PATH; the driver builds the parts, so promise and delivery are
// decided against the same stat. Order: deliverable check → vision gate → size
// cap → promise. Every refusal names the real reason (no "binary file" lies).
const imageMediaType = deliverableImageMediaType(args.file_path);
if (imageMediaType) {
  if (!ctx.supportsVision) {
    return { text: `Read rejected: ${args.file_path} is an image and the current model cannot view images. Continue without it, or ask the user to describe it.`, isError: true };
  }
  if (st.size > MAX_ATTACHMENT_BYTES) {
    return { text: `Read rejected: ${args.file_path} is a ${(st.size / (1024 * 1024)).toFixed(1)} MB image (limit ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB).`, isError: true };
  }
  ctx.readRegistry.set(canonicalize(args.file_path, ctx.cwd), st.mtimeMs);
  return { text: `Read image ${args.file_path} (${Math.max(1, Math.round(st.size / 1024))} KB, ${imageMediaType}).`, images: [abs] };
}
if (UNDELIVERABLE_IMAGE_EXTENSIONS.has(path.extname(args.file_path).toLowerCase())) {
  return { text: `Read rejected: ${args.file_path} is a ${path.extname(args.file_path).slice(1)} image — a format that cannot be delivered to the model. Convert it to PNG (e.g. Bash: magick in.svg out.png) and Read the copy.`, isError: true };
}
```
Delete the now-dead old image-refusal block (lines 80-89) and its stale WHY comment about images being Anthropic-only in tool results.

- [ ] **Step 5: Wire capability into `buildAiTools` and ToolContext**

`buildAiTools` (~line 612), replace the `out[t.name] = tool({ ... })` line:
```ts
// descriptionFor lets a tool vary its wording by capability (Read + vision).
// Simplified presentation still wins for small local models — shortDescription
// stays the schema-size escape hatch.
const full = t.descriptionFor?.({ supportsVision: this.profile.supportsVision }) ?? t.description;
out[t.name] = tool({ description: simplified ? (t.shortDescription ?? full) : full, inputSchema: schema });
```
ToolContext construction (~line 1620, next to `readRegistry: this.readRegistry`): add `supportsVision: this.profile.supportsVision,`.

- [ ] **Step 6: Run tests, verify, commit**

`npx vitest run` the tools test file + `tests/tool-registry-manifest.test.ts` + `tests/harness-tool-conformance.test.ts`, then `bash scripts/verify.sh native-images`.

```bash
git add desktop/src/main/harness/tools/types.ts desktop/src/main/harness/tools/read.ts desktop/src/main/harness/harness-session.ts desktop/tests/
git commit -m "feat(native): Read delivers images to vision models and says so in its description"
```

---

### Task 5: Driver — canonical image tool-results, budgets, dedupe

Turn `payload.images` paths into a `content`-type tool-result output in canonical history, charge budgets, dedupe repeat fetches, amend the result text with a named note for every skip, and persist the paths on the `tool-result` event.

**Files:**
- Modify: `desktop/src/main/harness/harness-session.ts` (tool loop lines 1150-1182, `toolResultPart` line 628, `beginTurn` locals ~line 1048, `seedHistory` ~line 391)
- Test: `desktop/tests/harness-session-loop.test.ts` (extend)

**Interfaces:**
- Produces: `toolResultPart(call, text, images?: Array<{ mediaType: string; data: Buffer }>)` — images make the output `{ type: 'content', value: [{type:'text',text}, {type:'file', mediaType, data:{type:'data', data}}…] }` (the exact `ai@7.0.36` `ToolResultOutput` content shape, verified against `@ai-sdk/provider-utils/dist/index.d.ts:365` — `@ai-sdk/anthropic@4.0.18` maps it to native `tool_result` image blocks).
- `resolveToolImages(payload, budget): { text: string; images: Array<{ path: string; mediaType: string; data: Buffer }> }` — private.
- Consumes: `readImageFromDisk`, `MAX_IMAGES_PER_TURN`, `MAX_IMAGE_BYTES_PER_TURN` (Task 2); `ToolResultPayload.images` (Task 4).

- [ ] **Step 1: Write the failing tests**

Add to `desktop/tests/harness-session-loop.test.ts`, using that file's existing fake-model/fake-tool harness (a scripted tool returning `{ text, images: [p] }`):

```ts
describe('image tool-results (2026-08-11 spec)', () => {
  it('a delivered image lands as a content-type output AND its path on the event', async () => {
    // fake tool returns { text: 'Read image x.png', images: [imgPath] }; run one turn
    const toolMsg = session.getHistory().findLast((m: any) => m.role === 'tool');
    const output = toolMsg.content[0].output;
    expect(output.type).toBe('content');
    expect(output.value[0]).toEqual({ type: 'text', text: expect.stringContaining('Read image') });
    expect(output.value[1]).toEqual({ type: 'file', mediaType: 'image/png', data: { type: 'data', data: expect.any(Buffer) } });
    const ev = events.find((e) => e.type === 'tool-result');
    expect(ev.data.images).toEqual([imgPath]);
  });

  it('an unchanged re-fetch is deduped with a named note, no second copy', async () => {
    // second turn, same tool call on the same unchanged file
    const secondToolMsg = /* ... last tool message of turn 2 ... */;
    expect(secondToolMsg.content[0].output.type).toBe('text');
    expect(secondToolMsg.content[0].output.value).toContain('already visible earlier');
  });

  it('the per-turn image count budget skips with a named note', async () => {
    // scripted step with MAX_IMAGES_PER_TURN + 1 image-returning calls
    const lastOutput = /* final call's output */;
    expect(lastOutput.value).toContain('images-per-turn budget');
  });

  it('a file that vanished between promise and delivery gets a named note, not silence', async () => {
    // tool returns images:[goneP] where goneP was deleted after the tool ran
    expect(/* result text */).toContain('no longer readable');
  });
});
```
(Adapt setup to the file's existing scripting helpers — the assertions above are the contract; `findLast` may need a manual reverse-scan depending on the TS lib target.)

- [ ] **Step 2: Run to verify failure** — Expected: FAIL (`output.type` is `'text'`, no `images` on the event).

- [ ] **Step 3: Implement in `harness-session.ts`**

Imports: add `MAX_IMAGES_PER_TURN, MAX_IMAGE_BYTES_PER_TURN` to the `./image-support` import.

Class field (near `injectedTriggerIds`, ~line 353):
```ts
/** Delivered-image dedupe: canonical path → mtimeMs at delivery. A model that
 *  re-Reads the SAME unchanged file gets "already visible" text, not a second
 *  ~1.6k-token copy; a CHANGED file (new mtime) is delivered again. Reset on
 *  resume alongside readRegistry — after a rebuild the images in history came
 *  from a fresh disk read anyway. */
private shownImages = new Map<string, number>();
```
In `seedHistory` (~line 391), alongside the `readRegistry` clear: `this.shownImages.clear();`

New private method (place directly under `imagePartsFor`):
```ts
/** Resolve a tool's promised image paths into deliverable parts, charging the
 *  per-turn budget and the per-session dedupe, and AMENDING the result text
 *  with a named note for every skip — the note rides the same text the model
 *  and the transcript see, so promise and delivery can never disagree. */
private resolveToolImages(
  payload: ToolResultPayload,
  budget: { count: number; bytes: number },
): { text: string; images: Array<{ path: string; mediaType: string; data: Buffer }> } {
  const paths = payload.images ?? [];
  if (!paths.length) return { text: payload.text, images: [] };
  let text = payload.text;
  const images: Array<{ path: string; mediaType: string; data: Buffer }> = [];
  for (const p of paths) {
    let mtime: number;
    try { mtime = fs.statSync(p).mtimeMs; } catch {
      text += `\n[image not attached: ${p} is no longer readable]`; continue;
    }
    if (this.shownImages.get(p) === mtime) {
      text += `\n[image not re-attached: ${p} is unchanged and already visible earlier in this conversation]`; continue;
    }
    if (budget.count >= MAX_IMAGES_PER_TURN) {
      text += `\n[image not attached: over the ${MAX_IMAGES_PER_TURN}-images-per-turn budget — ask again next turn if you still need it]`; continue;
    }
    const img = readImageFromDisk(p);
    if (!img) { text += `\n[image not attached: ${p} vanished or exceeds the per-image size limit]`; continue; }
    if (budget.bytes + img.data.length > MAX_IMAGE_BYTES_PER_TURN) {
      text += `\n[image not attached: over the ${MAX_IMAGE_BYTES_PER_TURN / (1024 * 1024)} MB-per-turn image budget]`; continue;
    }
    budget.count += 1; budget.bytes += img.data.length;
    this.shownImages.set(p, mtime);
    images.push({ path: p, mediaType: img.mediaType, data: img.data });
  }
  return { text, images };
}
```

`toolResultPart` (line 628) — new optional parameter; the no-image shape stays byte-identical (pinned by the ai@7 contract test):
```ts
private toolResultPart(call: ToolCall, text: string, images: Array<{ mediaType: string; data: Buffer }> = []): any {
  if (!images.length) return { type: 'tool-result', toolCallId: call.toolCallId, toolName: call.toolName, output: { type: 'text', value: text } };
  // Canonical image-bearing result: ai@7's 'content' output. @ai-sdk/anthropic
  // maps it to native tool_result image blocks; every other wire is rewritten
  // by adaptForWire before the request (wire-adapter.ts).
  return {
    type: 'tool-result', toolCallId: call.toolCallId, toolName: call.toolName,
    output: {
      type: 'content',
      value: [
        { type: 'text', text },
        ...images.map((i) => ({ type: 'file', mediaType: i.mediaType, data: { type: 'data', data: i.data } })),
      ],
    },
  };
}
```

Tool loop: in `beginTurn`'s per-turn locals (next to `recentCalls`, ~line 1048): `const imageBudget = { count: 0, bytes: 0 };  // per-turn image delivery budget (spec "Budgets")`. Then in the result handling (lines 1175-1180), replace with:
```ts
const delivered = this.resolveToolImages(payload, imageBudget);
this.emitEvent('tool-result', {
  toolUseId: call.toolCallId, toolName: call.toolName,
  toolResult: delivered.text, isError: payload.isError ?? false,
  ...(payload.structuredPatch ? { structuredPatch: payload.structuredPatch } : {}),
  // Paths only — events carry no binary; resume re-reads (history-rebuild.ts).
  ...(delivered.images.length ? { images: delivered.images.map((i) => i.path) } : {}),
});
resultParts.push(this.toolResultPart(call, delivered.text, delivered.images));
```
(The interrupt back-fill at line 1169 keeps calling `toolResultPart(rem, CANCELED_TOOL_TEXT)` — the default `[]` covers it.)

- [ ] **Step 4: Run tests** — `npx vitest run tests/harness-session-loop.test.ts tests/harness-sdk-toolcall-contract.test.ts` — Expected: PASS (the contract test still sees the exact old shape on text-only results).

- [ ] **Step 5: Verify and commit**

```bash
git add desktop/src/main/harness/harness-session.ts desktop/tests/harness-session-loop.test.ts
git commit -m "feat(native): tool-delivered images live in the tool result, with per-turn budgets and dedupe"
```

---

### Task 6: Wire adapter + `nativeImageToolResults` capability

The per-provider split, at request-build time, every request. Direct Anthropic passes through; OpenAI-compatible wires get placeholder text + a synthetic follow-up user message (`@ai-sdk/openai-compatible@3.0.14` would JSON.stringify a content output into hallucination-bait — its `dist/index.js:305-313`); a non-vision model (mid-session swap) gets all pixels replaced by named placeholders. Synthetic messages exist only in the outgoing request — never in history, never persisted, never rendered.

**Files:**
- Create: `desktop/src/main/harness/wire-adapter.ts`
- Test: `desktop/tests/wire-adapter.test.ts`
- Modify: `desktop/src/main/harness/capability-profile.ts` (interface + bases + `resolveProfile` lines 217-243), `desktop/src/main/harness/harness-session.ts` (`runStreamOnce` line 1279, `generateSummary` line 930)
- Test updates: `desktop/tests/capability-profile.test.ts`

**Interfaces:**
- Produces: `adaptForWire(messages: ModelMessage[], caps: { nativeImageToolResults: boolean; supportsVision: boolean }): ModelMessage[]` (pure); `CapabilityProfile.nativeImageToolResults: boolean`.
- Consumes: content-output shape from Task 5.

- [ ] **Step 1: Write the failing tests**

Create `desktop/tests/wire-adapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { adaptForWire } from '../src/main/harness/wire-adapter';

const img = (name: string) => ({ type: 'file', mediaType: 'image/png', data: { type: 'data', data: Buffer.from(name) } });
const imageToolMsg = {
  role: 'tool',
  content: [{ type: 'tool-result', toolCallId: 't1', toolName: 'Read', output: { type: 'content', value: [{ type: 'text', text: 'Read image a.png' }, img('a')] } }],
} as any;
const textToolMsg = { role: 'tool', content: [{ type: 'tool-result', toolCallId: 't2', toolName: 'Bash', output: { type: 'text', value: 'ok' } }] } as any;
const userImgMsg = { role: 'user', content: [{ type: 'text', text: 'see shot' }, { type: 'file', mediaType: 'image/png', data: Buffer.from('u') }] } as any;

describe('adaptForWire', () => {
  it('native path (Anthropic): passes everything through untouched', () => {
    const out = adaptForWire([userImgMsg, imageToolMsg, textToolMsg], { nativeImageToolResults: true, supportsVision: true });
    expect(out).toEqual([userImgMsg, imageToolMsg, textToolMsg]);
  });

  it('split path: text-only tool output + synthetic follow-up user message with the image', () => {
    const out = adaptForWire([imageToolMsg], { nativeImageToolResults: false, supportsVision: true });
    expect(out).toHaveLength(2);
    expect(out[0].role).toBe('tool');
    const output = (out[0] as any).content[0].output;
    expect(output.type).toBe('text');                       // openai-compatible must NEVER see 'content'
    expect(output.value).toContain('Read image a.png');
    expect(output.value).toContain('next message');          // forward-pointing placeholder (classic Cline)
    expect(out[1].role).toBe('user');
    const parts = (out[1] as any).content;
    expect(parts[0].type).toBe('text');                      // provenance framing, not a bare image
    expect(parts[1]).toEqual({ type: 'file', mediaType: 'image/png', data: Buffer.from('a') });
  });

  it('split path: a multi-result tool message inserts the synthetic message AFTER the whole tool message', () => {
    const both = { role: 'tool', content: [imageToolMsg.content[0], textToolMsg.content[0]] } as any;
    const out = adaptForWire([both], { nativeImageToolResults: false, supportsVision: true });
    expect(out.map((m) => m.role)).toEqual(['tool', 'user']);  // pairing invariant: tool message stays whole
  });

  it('non-vision model: every pixel is replaced by a named placeholder, nothing is sent', () => {
    const out = adaptForWire([userImgMsg, imageToolMsg], { nativeImageToolResults: true, supportsVision: false });
    const userParts = (out[0] as any).content;
    expect(userParts[1]).toEqual({ type: 'text', text: '[image omitted: this model cannot view images]' });
    const output = (out[1] as any).content[0].output;
    expect(output.type).toBe('text');
    expect(output.value).toContain('[image omitted');
    expect(JSON.stringify(out)).not.toContain('"data"');
  });

  it('image-free history is returned with zero changes (byte-identical fast path)', () => {
    const msgs = [{ role: 'user', content: 'hi' }, textToolMsg] as any;
    expect(adaptForWire(msgs, { nativeImageToolResults: false, supportsVision: false })).toEqual(msgs);
  });
});
```

- [ ] **Step 2: Run to verify failure** — module not found.

- [ ] **Step 3: Implement `wire-adapter.ts`**

```ts
// Per-provider image adaptation, at REQUEST-BUILD time (2026-08-11 spec).
//
// Canonical history keeps images where they factually belong — inside the tool
// result that fetched them, or the user message that attached them. But only
// the direct-Anthropic wire can carry an image inside a tool result;
// @ai-sdk/openai-compatible JSON.stringifies a content-type output into a wall
// of base64 the model hallucinates over (Cline documents this exact failure in
// its split-tool-images middleware, which this module mirrors). So every
// request adapts a COPY of the canonical view:
//   - nativeImageToolResults (Anthropic): pass through.
//   - otherwise: tool output becomes plain text with a forward-pointing
//     placeholder, and a SYNTHETIC user message carrying the image is inserted
//     immediately AFTER the complete tool message (the position
//     injectPathTriggers already proves safe on every provider).
//   - a non-vision model (e.g. mid-session swap to a local model): every image
//     part anywhere becomes a named text placeholder — pixels are NEVER sent.
// Synthetic messages exist only in the outgoing request: never pushed to
// history, never persisted, never rendered. Re-checked EVERY request, which is
// what closes the swap-time leak a push-time gate cannot.
import type { ModelMessage } from 'ai';

export interface WireImageCaps { nativeImageToolResults: boolean; supportsVision: boolean }

const OMITTED_TEXT = '[image omitted: this model cannot view images]';
// Forward-pointing on purpose: classic Cline found "(see the following user
// message...)" measurably outperforms unexplained placeholder text.
const FORWARD_TEXT = '(the image could not be embedded here — it is attached in the next message, sent on your behalf)';
const PROVENANCE_TEXT = 'Attached below: the image from the tool result above, delivered automatically because this provider cannot carry images inside tool results. This is not a message the user typed.';

type AnyPart = { type: string; [k: string]: unknown };

function hasImageParts(m: ModelMessage): boolean {
  const c = (m as { content: unknown }).content;
  if (!Array.isArray(c)) return false;
  return (c as AnyPart[]).some((p) =>
    p?.type === 'file'
    || (p?.type === 'tool-result' && (p as any).output?.type === 'content'));
}

export function adaptForWire(messages: ModelMessage[], caps: WireImageCaps): ModelMessage[] {
  // Fast path: an image-free history is returned as-is (byte-identical — the
  // no-image pipeline must not change shape at all).
  if (!messages.some(hasImageParts)) return messages;

  const out: ModelMessage[] = [];
  for (const m of messages) {
    const content = (m as { content: unknown }).content;
    if (m.role === 'user' && Array.isArray(content)) {
      out.push(caps.supportsVision ? m : ({
        role: 'user',
        content: (content as AnyPart[]).map((p) => (p?.type === 'file' ? { type: 'text', text: OMITTED_TEXT } : p)),
      } as any));
      continue;
    }
    if (m.role !== 'tool' || !Array.isArray(content)) { out.push(m); continue; }

    const followUpImages: AnyPart[] = [];
    const newContent = (content as AnyPart[]).map((part) => {
      if (part?.type !== 'tool-result' || (part as any).output?.type !== 'content') return part;
      const value = (part as any).output.value as AnyPart[];
      const files = value.filter((v) => v?.type === 'file');
      const text = value.filter((v) => v?.type === 'text').map((v) => (v as any).text).join('\n');
      if (!files.length) return { ...part, output: { type: 'text', value: text } };
      if (!caps.supportsVision) return { ...part, output: { type: 'text', value: `${text}\n${OMITTED_TEXT}` } };
      if (caps.nativeImageToolResults) return part;
      followUpImages.push(...files);
      return { ...part, output: { type: 'text', value: `${text}\n${FORWARD_TEXT}` } };
    });
    out.push({ ...(m as object), content: newContent } as ModelMessage);
    if (followUpImages.length) {
      out.push({
        role: 'user',
        content: [
          { type: 'text', text: PROVENANCE_TEXT },
          // Tool-output file parts wrap data as {type:'data', data}; user-message
          // file parts take the bytes directly.
          ...followUpImages.map((f) => ({ type: 'file', mediaType: (f as any).mediaType, data: (f as any).data.data })),
        ],
      } as any);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the adapter tests** — `npx vitest run tests/wire-adapter.test.ts` — Expected: PASS.

- [ ] **Step 5: Add the capability field**

`capability-profile.ts`:
1. `CapabilityProfile` interface: add
```ts
/** Provider can carry an image INSIDE a tool result (Anthropic tool_result
 *  blocks). Everything else gets the wire-adapter split. Provider-type fact,
 *  not a model fact — the registry never overrides it. */
nativeImageToolResults: boolean;
```
2. Both base profiles (`CLOUD_DEFAULT` and the `localFallback` return) get `nativeImageToolResults: false,`.
3. In `resolveProfile` (line 225), next to `supportsVision`: `const nativeImageToolResults = d.providerType === 'anthropic';` and spread `nativeImageToolResults` alongside `supportsVision` in ALL THREE return sites (lines 227, 231, 232-242).

Add to `desktop/tests/capability-profile.test.ts`:
```ts
it('nativeImageToolResults is true only for the direct Anthropic provider', () => {
  expect(resolveProfile({ providerType: 'anthropic', modelId: 'claude-opus-5', contextLength: 200_000 }).nativeImageToolResults).toBe(true);
  for (const providerType of ['openai', 'google', 'openrouter', 'openai-compatible', 'local-engine'] as const) {
    expect(resolveProfile({ providerType, modelId: 'x', contextLength: 32_768 }).nativeImageToolResults).toBe(false);
  }
});
```
(Match the test file's existing `resolveProfile` fixture shape for `DiscoveredModel`.)

- [ ] **Step 6: Integrate at both model-call sites**

`harness-session.ts` — `import { adaptForWire } from './wire-adapter';`

`runStreamOnce` (line 1279):
```ts
// Wire adaptation runs on the FITTED view, per request — this is what makes a
// mid-session swap to a non-vision model safe (pixels stripped at build time).
messages: adaptForWire(this.fitToContext(this.history), {
  nativeImageToolResults: this.profile.nativeImageToolResults,
  supportsVision: this.profile.supportsVision,
}),
```

`generateSummary` (line 930), wrap the span:
```ts
// Summaries are text about text: images are ALWAYS stripped here — the
// summarizer may be a non-vision local model, and pixels add nothing to a
// compression prompt.
messages: [...adaptForWire(bounded, { nativeImageToolResults: false, supportsVision: false }), { role: 'user', content: summarizePrompt() } as ModelMessage],
```

- [ ] **Step 7: Run tests, verify, commit**

`npx vitest run tests/wire-adapter.test.ts tests/capability-profile.test.ts tests/harness-session-loop.test.ts tests/harness-compaction.test.ts` then `bash scripts/verify.sh native-images`.

```bash
git add desktop/src/main/harness/wire-adapter.ts desktop/tests/wire-adapter.test.ts desktop/src/main/harness/capability-profile.ts desktop/tests/capability-profile.test.ts desktop/src/main/harness/harness-session.ts
git commit -m "feat(native): per-provider wire adaptation — native tool-result images on Anthropic, split elsewhere, strip for non-vision"
```

---

### Task 7: Resume rebuilds image tool-results

A reopened session must re-read tool-delivered images from disk; a vanished/changed file becomes a NAMED note in the rebuilt result — the model never holds a reference to a picture that silently isn't there.

**Files:**
- Modify: `desktop/src/main/harness/history-rebuild.ts` (`tool-result` case, lines 68-73)
- Test: `desktop/tests/harness-history-rebuild.test.ts` (extend)

**Interfaces:**
- Consumes: `RebuildImageReader` (Task 3), `images?: string[]` on tool-result event data (Task 5), the content-output shape (Task 5).

- [ ] **Step 1: Write the failing tests**

```ts
describe('image tool-result resume', () => {
  const fakeReader = (p: string) => p.endsWith('ok.png') ? { mediaType: 'image/png', data: Buffer.from('png!') } : null;
  const ev = (type: string, data: any) => ({ type, sessionId: 's', uuid: crypto.randomUUID(), timestamp: 1, data }) as any;
  const pair = (images: string[]) => [
    ev('tool-use', { toolUseId: 't1', toolName: 'Read', toolInput: { file_path: images[0] } }),
    ev('tool-result', { toolUseId: 't1', toolName: 'Read', toolResult: 'Read image', images }),
    ev('turn-complete', {}),
  ];

  it('re-reads a persisted image into the exact live content-output shape', () => {
    const out = rebuildHistory(pair(['/tmp/ok.png']), fakeReader);
    const toolMsg = out.find((m: any) => m.role === 'tool') as any;
    expect(toolMsg.content[0].output).toEqual({
      type: 'content',
      value: [{ type: 'text', text: 'Read image' }, { type: 'file', mediaType: 'image/png', data: { type: 'data', data: Buffer.from('png!') } }],
    });
  });

  it('a vanished image degrades to text WITH a named note — never a silent dangling reference', () => {
    const out = rebuildHistory(pair(['/tmp/gone.png']), fakeReader);
    const toolMsg = out.find((m: any) => m.role === 'tool') as any;
    expect(toolMsg.content[0].output.type).toBe('text');
    expect(toolMsg.content[0].output.value).toContain('[image no longer available: /tmp/gone.png]');
  });

  it('no reader → plain text output, today's shape', () => {
    const out = rebuildHistory(pair(['/tmp/ok.png']));
    const toolMsg = out.find((m: any) => m.role === 'tool') as any;
    expect(toolMsg.content[0].output).toEqual({ type: 'text', value: 'Read image' });
  });
});
```

- [ ] **Step 2: Run to verify failure** — Expected: the first two FAIL.

- [ ] **Step 3: Implement — replace the `tool-result` case**

```ts
case 'tool-result': {
  // Close the assistant(tool-call) message this result answers — this
  // flush is what prevents the NEXT step's text from merging into it.
  flushAssistant();
  const base = String(e.data?.toolResult ?? '');
  const imagePaths = Array.isArray(e.data?.images) ? (e.data.images as string[]) : [];
  if (!imagePaths.length || !readImage) {
    toolResults.push({ type: 'tool-result', toolCallId: String(e.data?.toolUseId ?? ''), toolName: String(e.data?.toolName ?? ''), output: { type: 'text', value: base } });
    break;
  }
  // Tool-delivered images re-read from disk (events carry paths, not binary).
  // A vanished/undeliverable file becomes a NAMED note — the model must never
  // hold a reference to a picture that silently isn't there (the M4 failure
  // class). A changed file is re-read as-is: current pixels beat none.
  let text = base;
  const files: Array<{ type: 'file'; mediaType: string; data: { type: 'data'; data: Buffer } }> = [];
  for (const p of imagePaths) {
    const img = readImage(p);
    if (img) files.push({ type: 'file', mediaType: img.mediaType, data: { type: 'data', data: img.data } });
    else text += `\n[image no longer available: ${p}]`;
  }
  toolResults.push({
    type: 'tool-result', toolCallId: String(e.data?.toolUseId ?? ''), toolName: String(e.data?.toolName ?? ''),
    output: files.length ? ({ type: 'content', value: [{ type: 'text', text }, ...files] } as any) : { type: 'text', value: text },
  });
  break;
}
```

- [ ] **Step 4: Run tests** — `npx vitest run tests/harness-history-rebuild.test.ts` — Expected: PASS, including the pre-existing deep-equal contract block.

- [ ] **Step 5: Verify and commit**

```bash
git add desktop/src/main/harness/history-rebuild.ts desktop/tests/harness-history-rebuild.test.ts
git commit -m "feat(native): resume re-reads tool-delivered images; a missing file becomes a named note"
```

---

### Task 8: Compaction — prune image outputs, fix turn counting

Two guards: (a) stage-1 prune must be able to reclaim image tokens outside the protected window (today it only rewrites string outputs, so images would sit in the window until a full summarize destroys them silently); (b) `summarizeCutIndex` counts every `role:'user'` message as a turn boundary, so `injectPathTriggers` messages shrink the protected last-2-turns window — pre-existing, and worth fixing while we're in the file (synthetic wire messages never enter history, so they're already immune by construction).

**Files:**
- Modify: `desktop/src/main/harness/compaction.ts` (`pruneToolOutputs`, lines 34-46), `desktop/src/main/harness/harness-session.ts` (`summarizeCutIndex`, line 907)
- Test: `desktop/tests/compaction.test.ts`, `desktop/tests/harness-compaction.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

`desktop/tests/compaction.test.ts`:
```ts
it('prunes an image content-output outside the protected window down to its text + a named note', () => {
  const imageMsg = { role: 'tool', content: [{ type: 'tool-result', toolCallId: 't1', toolName: 'Read', output: { type: 'content', value: [{ type: 'text', text: 'Read image shot.png' }, { type: 'file', mediaType: 'image/png', data: { type: 'data', data: Buffer.alloc(500_000) } }] } }] } as any;
  const filler = { role: 'user', content: 'x'.repeat(8_000) } as any;   // pushes imageMsg outside protectedTokens
  const out = pruneToolOutputs([imageMsg, filler], { contextLength: 32_768, triggerRatio: 0.8, protectedTokens: 1_000, minPruneSavings: 100, pruneToChars: 4_000 });
  const output = (out[0] as any).content[0].output;
  expect(output.type).toBe('text');
  expect(output.value).toContain('Read image shot.png');
  expect(output.value).toContain('[image pruned');
  expect(JSON.stringify(out[0])).not.toContain('"data"');
});
```

`desktop/tests/harness-compaction.test.ts` (or wherever `summarizeCutIndex` behavior is pinned — it's exercised through the summarize driver; use the file's existing setup):
```ts
it('injected <project-rule> messages do not count as user turns for the protected window', () => {
  // history: user A → (assistant/tool) → injected rule → injected rule → user B
  // The cut must land at user A (last-2 REAL turns), not at the first injection.
  // Drive via the session helper the file already uses for summarize tests and
  // assert the summarized span excludes user A's turn.
});
```
(Write the assertion against the file's existing summarize-span fixture; the contract is: two injected messages + two real user messages → cut index = first real user message.)

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

`compaction.ts` — inside `pruneToolOutputs`'s part-mapping (after `if (part?.type !== 'tool-result') return part;`):
```ts
// An image-bearing 'content' output outside the protected window collapses to
// its text plus a named note. Without this, stage-1 prune can never reclaim
// image tokens (it only rewrites string outputs) and the only thing that ever
// removes an image is a silent full summarize.
const output = part.output;
if (output?.type === 'content' && Array.isArray(output.value)) {
  const text = output.value.filter((v: any) => v?.type === 'text').map((v: any) => v.text).join('\n');
  return { ...part, output: { type: 'text', value: `${text}\n[image pruned — ${part.toolName ?? 'the tool'} the file again if you need to see it]` } };
}
```
(Keep the existing string branch below it unchanged.)

`harness-session.ts` `summarizeCutIndex` (line 907):
```ts
/** Index where the last 2 user-message-delimited turns begin (0 if <2 turns).
 *  Injected rule messages are role:'user' but are NOT turns — counting them
 *  shrank the protected window to "the last 2 injections" when a step touched
 *  several rule-matched paths (2026-08-11 spec, compaction accounting). */
private summarizeCutIndex(): number {
  const userIdx: number[] = [];
  this.history.forEach((m, i) => {
    const c = (m as any).content;
    const isInjected = typeof c === 'string' && c.startsWith('<project-rule ');
    if ((m as any).role === 'user' && !isInjected) userIdx.push(i);
  });
  return userIdx.length < 2 ? 0 : userIdx[userIdx.length - 2];
}
```

- [ ] **Step 4: Run tests** — `npx vitest run tests/compaction.test.ts tests/harness-compaction.test.ts` — Expected: PASS.

- [ ] **Step 5: Verify and commit**

```bash
git add desktop/src/main/harness/compaction.ts desktop/src/main/harness/harness-session.ts desktop/tests/
git commit -m "fix(native): compaction can prune delivered images; injected rules no longer count as turns"
```

---

### Task 9: UI — RESOLVED, NO CODE NEEDED (2026-08-11)

~~The renderer today ignores unknown `data.images` on tool-result events, so the safe default after Tasks 1-8 is: the Read card shows the result text ("Read image …") and nothing else — functional, invisible.~~

**That premise was wrong, and Destin caught it.** It reasoned from the *new* `images` field instead of checking the artifact path that already exists. The Read card already thumbnails images, and the mechanism is runtime-agnostic — verified by tracing, not inspection of the new field:

- `App.tsx:1490-1570` listens to `tool-use` events and tracks `Write/Edit/MultiEdit/`**`Read`**; for `Read` it tracks exactly the *document*-category files, and `shared/artifacts/categorization.ts:17-38` puts `png/jpg/jpeg/gif/webp/svg/bmp/ico/avif` in that bucket. An image Read therefore registers a session artifact.
- `ToolFilePreview` (`tool-views/ToolBody.tsx:116`) matches it via `matchSessionArtifact`, and `ArtifactThumbnail.tsx:182-189` renders a real `<img>` from a blob URL fetched through `artifacts.readBinary`, with click-to-open in the artifact drawer.
- **Native sessions reach it identically:** `ipc-handlers.ts:2345` pushes native transcript events down the *same* IPC channel as Claude Code's (its own comment says so), and `harness-session.ts:496-499` emits `tool-use` with `file_path` in the same shape.
- Files **outside** the project root still get pixels: `ArtifactThumbnail` uses `artifact.absolutePath` for external artifacts, so `deriveProjectRoot` returning `''` is irrelevant. (`deriveProjectRoot`'s own comment at `ToolBody.tsx:113-115` is stale on this point — worth a fix-on-sight if someone is in that file.)

**Not covered, by design:** code/config reads are never tracked (document-category only), and the buddy window / workbench sandbox render without `ArtifactProvider`, so they fall back to `PathHeader`.

**Files:** none. No workbench mockups, no renderer change, no commit. Confirmation is a look at a real dev instance during Task 10's smoke — Destin's, not scripted.

---

### Task 10: Full verification, docs, and branch finish

- [ ] **Step 1: Full test suite + gates**

```bash
cd /home/destin/youcoded-dev && bash scripts/verify.sh native-images --full
```
Expected: exit 0 (tsc, full vitest, knip, eslint, ast-grep). Fix anything red before proceeding.

- [ ] **Step 2: Manual smoke in the dev instance** (worktree, never the live app)

```bash
bash scripts/run-dev.sh native-images --label "Image Delivery"
```
With a vision-capable OpenRouter model: drop a PNG in the cwd, ask "look at ./shot.png". Verify: Read runs → result text says "Read image …" → the model describes the actual picture. Then `/compact` and re-ask to confirm the dedupe note. With a local/text-only model: same ask → honest refusal, no crash. This is a behavior smoke Destin may prefer to do himself — ask before scripting anything interactive.

- [ ] **Step 3: Offer (not run) the harness review battery** — a real model exercising Read-on-image across the roster is exactly what unit tests can't cover, and there's a fresh tool-description change. `--dry-run` is free; the full roster is ~$1.50 and is **Destin's call** (`.claude/rules/harness-review-runner.md`).

- [ ] **Step 4: Docs + watch items**
  - Add to `youcoded/docs/cc-dependencies.md` watch items: vercel/ai PR #12621 + issue #10850 (if merged upstream, `wire-adapter.ts`'s split branch can shrink; our adapter stays for llama.cpp + non-vision strip).
  - Update the spec (`docs/active/specs/2026-08-11-native-image-handling.md`): flip `status:` to `shipped` when merged; correct its "#290 open" line (merged as `9a2d8af7`).
  - Update `.claude/rules/native-runtime.md`'s native-tools section with one line: images travel inside tool results canonically and are adapted per wire in `wire-adapter.ts` (guard: `wire-adapter.test.ts`).

- [ ] **Step 5: Finish the branch** — invoke `superpowers:finishing-a-development-branch`: PR to `itsdestin/youcoded` master, merge AND push, then remove the worktree, delete the branch both ends, archive the spec+plan to `docs/archive/`, flip the ROADMAP item — all per workspace rules. Note the iteration-mode memory: if Destin is still iterating (Task 9 pending his pick), report and stop rather than pushing to merge.

---

## Self-Review (performed at write time)

- **Spec coverage:** decision→Tasks 4-6; three #290 fixes→Tasks 1-3 (+extension table in 2); resolve-before-promise→Task 4 (tool stats first) + Task 5 (driver amends the same text); budgets+dedupe→Task 5; build-time vision gate→Task 6; resume→Tasks 3+7; compaction accounting→Task 8; dynamic description→Task 4; UI open question→Task 9 (Destin gate); watch items+prompt-caching caveat→Task 10 (caching check folded into the battery offer — a dedicated OpenRouter cache measurement needs a paid run, Destin's call).
- **Known simplifications:** no image downscaling (deliberate — cap + honest skip instead; only Codex resizes; revisit if budgets pinch); `shownImages` dedupe resets on resume (deliberate — rebuild re-read the pixels anyway, a post-resume re-Read re-attaches once); no decode/signature validation — **not deliberate, a known gap**: PNG/JPEG/GIF/WEBP have stable magic-number signatures and `readImageFromDisk` already holds the buffer, so a ~6-line signature check was skippable, not ruled out; the "Electron `nativeImage` can't decode gif/webp reliably" rationale conflates decoding with sniffing and doesn't apply to a signature check. Consequence: a text file renamed `.png` passes extension+size and base64's to the provider, coming back as a non-transient 400 instead of a named skip.
- **Type consistency:** `resolveToolImages` returns `{ text, images: {path, mediaType, data}[] }`; `toolResultPart` takes `{mediaType, data}[]` (path unused there — event carries paths separately); wire-adapter consumes `{type:'file', mediaType, data:{type:'data', data}}` and emits user-part `{type:'file', mediaType, data}` — matches the #290 user-message part shape at `harness-session.ts:1036`.
