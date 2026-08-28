---
status: active
date: 2026-08-27
spec: docs/active/specs/2026-08-27-landing-page-rebuild-design.md
audit: docs/active/investigations/2026-08-27-landing-page-audit.md
---

# Landing Page Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `youcoded/docs/index.html` for the 1.3.0 release with the real app as its demos — a live, clickable embed of the renderer at the top and a recorded loop of the real app for each showcase row — plus the tooling that regenerates those demos before every release.

**Architecture:** Three layers. (1) The UI Workbench (the real renderer against a fake backend, `desktop/src/renderer/dev/workbench/`) gains a scripted-reply channel, a stateful model switch, a `site` scenario, the Golden Sunbreak theme, and a production build flag so it can be shipped statically into `docs/site/`. (2) A CDP screen recorder (`scripts/ui-review/record.mjs`, workspace repo) plays scene files against the workbench and encodes WebM loops + WebP posters; `site-assets.sh` regenerates every loop and gallery image in one command. (3) `docs/index.html` is rewritten section by section to the spec, consuming the embed and the loops.

**Tech Stack:** Vite 7 / React renderer (existing), Chrome DevTools Protocol over Node 26's global `WebSocket`, `google-chrome-stable --headless=new`, ffmpeg n8.1.2 (`libvpx-vp9`, `libwebp`), ImageMagick `magick`, vanilla HTML/CSS/JS single-file page (no build step for the page itself).

## Global Constraints

- **Target is 1.3.0.** Rows 1–8 describe master; row 9 is labelled `Roadmap` and drawn, never recorded.
- **Copy standard:** concrete nouns, fewest words, lead with the difference. Forbidden in headlines: "harness", "agentic", "open-source", "built with Claude Code", "does real work", "powerful", "seamless". "Claude Code", "MCP", "git" appear only in row 8.
- **Wordmark:** "YouCoded **Assistant**" ("Agent" visually subordinate). Subheader: **"Agentic AI for Everyone."**
- **Hero:** "Make AI *Useful.* → *Fun.* → *Yours.*" — exactly three cycler states; word delays 1.1 s / 2.3 s / 3.5 s (1.2 s spacing); themes midnight → halftone → crème; page rests on "Yours."/crème. One sentence under it: *A self-improving, customizable AI agent. Use any AI model from any provider to build or accomplish anything you want.* **No hero buttons** — the existing floating "Download ↓" pill (`#floating-cta`) stays and is the CTA (Destin, copy review 2026-08-28).
- **Section order:** hero → What is this? → live embed → rows (Destin, 2026-08-28: the embed sits *below* "What is this?").
- **Accounts:** GitHub Required · Anthropic Optional · OpenRouter Optional · Google/Apple Optional (Drive/iCloud second copy).
- **Never claim** (audit §6): long-running background commands, PDF/Word reading in the native harness, automations as shipped, native models on Android, IDE features, MCP *settings UI*.
- **Keep verbatim:** "YouCoded is an independent, community-built project. Not affiliated with, endorsed by, or officially supported by Anthropic."
- **Git hygiene:** app changes on branch `site/1.3-rebuild` in `/home/destin/youcoded-dev/worktrees/site-rebuild`; rig scripts + docs commit to `youcoded-dev` **by explicit path only** (never `git add -A`); every commit message ends with the Co-Authored-By / Claude-Session trailer.
- **Embed budget is met:** measured 2026-08-27 — main renderer chunk 636 KB gzipped + 140 KB CSS; PDF/Docx/Xlsx viewers are lazy chunks the embed never loads. No trimming task is needed.
- **Workbench ports:** recording and boot checks use `YOUCODED_PORT_OFFSET=300` (Vite 5473, CDP 9977+300=10277 for the boot check) so they never collide with a live workbench on 5233 or run-dev on 5223.
- **After ANY change to `mock-shim.ts`, `scenarios.ts`, or `seed-chat.ts`:** `node scripts/workbench-boot-check.mjs 5473` must pass. **Before claiming a desktop task done:** `bash scripts/verify.sh worktrees/site-rebuild` must pass.
- **Copy review:** done 2026-08-28 via the page-shaped preview (`docs/active/design/2026-08-27-landing-page/copy.preview.answers.md`); its edits are folded into Tasks 10–12 below. Everything not edited there is approved as written.

## File map

| File | Responsibility |
|---|---|
| `desktop/src/renderer/index.tsx:214` | workbench mount gate — add `VITE_WORKBENCH` |
| `desktop/package.json` | `build:site` script |
| `desktop/src/renderer/dev/workbench/scenarios.ts` | new `site` scenario |
| `desktop/src/renderer/dev/workbench/fixtures/sessions.ts` | `SITE_SESSIONS` |
| `desktop/src/renderer/dev/workbench/fixtures/conversations/site.jsonl` | the embed's opening conversation |
| `desktop/src/renderer/dev/workbench/seed-chat.ts:28-32` | map `site` → `site-1` |
| `desktop/src/renderer/dev/workbench/reply-script.ts` | **new** — plays a reply fixture as transcript/hook events |
| `desktop/src/renderer/dev/workbench/fixtures/replies/*.jsonl` | reply scripts: `demo`, `any-ai`, `receipts`, `theme-builder` |
| `desktop/src/renderer/dev/workbench/mock-shim.ts` | hand-written `session.sendInput`, `session.respondToPermission`, `on.transcriptEvent`, `on.hookEvent`, `native.setBinding` |
| `desktop/src/renderer/dev/workbench/fixtures/themes/golden-sunbreak/` | copied theme pack |
| `desktop/tests/workbench-reply-script.test.ts` | reply-script unit test |
| `desktop/tests/workbench-shim-semantics.test.ts` | + setBinding, theme.list cases |
| `scripts/workbench-boot-check.mjs:49-77` | + `scenario=site` route |
| `scripts/ui-review/record.mjs` | **new** — CDP screencast → WebM + poster |
| `scripts/ui-review/scenes/site-*.json` | **new** — one scene per row |
| `scripts/ui-review/plans/site-gallery.json` | **new** — gallery stills |
| `scripts/ui-review/site-assets.sh` | **new** — regenerate everything |
| `youcoded/docs/site/` | built embed (committed) + `media/` loops and posters |
| `youcoded/docs/gallery/*.webp` | refreshed gallery |
| `youcoded/docs/og-image.png` | link-preview image (currently missing) |
| `youcoded/docs/index.html` | the page |
| `docs/active/design/2026-08-27-landing-page/copy.md` | every string old → new (review gate) |
| `docs/build-and-release.md` | release checklist step: run `site-assets.sh` |

---

## Part A — Workbench site mode (repo `youcoded`, worktree `worktrees/site-rebuild`)

### Task 1: Ship the workbench in a production build

**Files:**
- Modify: `desktop/src/renderer/index.tsx:214`
- Modify: `desktop/package.json:11` (scripts block)
- Modify: `desktop/vite.config.ts:24` (outDir)

**Interfaces:**
- Produces: `npm run build:site` → `docs/site/index.html` + `docs/site/assets/*`, which serves `?mode=workbench&child=1&scenario=…` from any static host.

- [ ] **Step 1: Change the mount gate so a build with `VITE_WORKBENCH=1` keeps the workbench branch**

In `desktop/src/renderer/index.tsx` replace line 214:
```ts
if (import.meta.env.DEV && __buddyMode === 'workbench') {
```
with:
```ts
// Site mode: the landing page embeds the workbench as a live demo, built with
// `npm run build:site` (VITE_WORKBENCH=1). Any other production build still
// tree-shakes this whole branch — VITE_WORKBENCH is unset, so the condition is
// statically false and the workbench chunks never ship in the app.
if ((import.meta.env.DEV || import.meta.env.VITE_WORKBENCH === '1') && __buddyMode === 'workbench') {
```

- [ ] **Step 2: Add the build script**

In `desktop/package.json`, inside `"scripts"`, add after the `"build:main": "tsc",` line:
```json
    "build:site": "VITE_WORKBENCH=1 vite build --outDir ../../../docs/site --emptyOutDir",
```
`--outDir` resolves against Vite's `root` (`desktop/src/renderer`), so three `../` reach the repo root: the target is `<repo>/docs/site`, a sibling of `<repo>/docs/index.html`. (The existing `'../../dist/renderer'` in `vite.config.ts:24` is two levels = `desktop/dist/renderer`; this is one level further up.)

- [ ] **Step 3: Build**

Run from `worktrees/site-rebuild/desktop`:
```bash
npm run build:site 2>&1 | tail -5 && ls ../docs/site && ls ../docs/site/assets | wc -l
```
Expected: `✓ built in …`, `index.html assets`, ~45 asset files. If `ls ../docs/site` fails, fix the `--outDir` depth in Step 2 until `<repo>/docs/site/index.html` exists.

- [ ] **Step 4: Prove the static build boots the workbench**

```bash
cd /home/destin/youcoded-dev/worktrees/site-rebuild/docs/site && python3 -m http.server 5473 --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/claude-1000/site-http.pid
sleep 1
cd /home/destin/youcoded-dev && node scripts/workbench-boot-check.mjs 5473; echo "exit $?"
kill $(cat /tmp/claude-1000/site-http.pid)
```
Expected: every route prints `ok`, `exit 0`. A route failing with `#boot still present` means the gate change did not take — re-check Step 1 and that `VITE_WORKBENCH=1` reached Vite.

- [ ] **Step 5: Confirm a normal build still drops the workbench**

```bash
cd /home/destin/youcoded-dev/worktrees/site-rebuild/desktop && npx vite build --outDir /tmp/claude-1000/site-normal-dist >/dev/null 2>&1 && grep -l "workbench" /tmp/claude-1000/site-normal-dist/assets/*.js | wc -l
```
Expected: `0` (no chunk contains the workbench). If non-zero, `VITE_WORKBENCH` leaked into the environment — unset it and rebuild.

- [ ] **Step 6: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/site-rebuild && git add desktop/src/renderer/index.tsx desktop/package.json docs/site && git commit -m "feat(workbench): build:site ships the workbench statically for the landing-page embed

VITE_WORKBENCH=1 keeps the ?mode=workbench branch in a production build; unset (every app build) it is still tree-shaken.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JT8RKNphr2HekthYqV9Qzi"
```

### Task 2: The `site` scenario

**Files:**
- Modify: `desktop/src/renderer/dev/workbench/scenarios.ts:11-15` (ids) and `:159-187` (`seed()`)
- Modify: `desktop/src/renderer/dev/workbench/fixtures/sessions.ts` (append `SITE_SESSIONS`)
- Create: `desktop/src/renderer/dev/workbench/fixtures/conversations/site.jsonl`
- Modify: `desktop/src/renderer/dev/workbench/seed-chat.ts:28-32`
- Modify: `scripts/workbench-boot-check.mjs:49-77` (workspace repo)

**Interfaces:**
- Produces: `?scenario=site` — one native session `site-1` named `plan my week` (provider `native`, model bound to a local model), two past sessions, providers ready, tags. Its timeline is `site.jsonl`. Used by the embed and by scenes 1, 2, 6.

- [ ] **Step 1: Add the `site` session factory to `fixtures/sessions.ts`**

`sessions()` is exported as a factory (`fixtures/sessions.ts:13`) so every store gets its own array; keep that pattern. Append at the end of the file:
```ts
// Landing-page embed (scenario=site): ONE native session so the first thing a
// visitor sees is a conversation with a locally running model, not a strip of
// eleven tabs. Field shape mirrors wb-2 above (provider + harnessId mark it native).
export function siteSessions(): SessionInfo[] {
  return [
    {
      id: 'site-1',
      name: 'plan my week',
      cwd: '/home/you/Documents',
      permissionMode: 'normal',
      skipPermissions: false,
      status: 'idle',
      createdAt: 1_753_790_000_000,
      provider: 'native',
      harnessId: 'coder',
      model: 'qwen3-coder-30b-a3b-instruct',
    },
  ];
}
```

- [ ] **Step 2: Add `sitePast()` beside `defaultPast()` in `scenarios.ts:94`**

```ts
function sitePast(): PastSession[] {
  return [
    past(0, 'draft the club newsletter', {
      provider: 'native',
      lastUsedModel: { modelId: 'qwen3-coder-30b-a3b-instruct', providerType: 'local-engine', providerLabel: 'Local' },
    }),
    past(1, 'compare two laptops', { tags: ['tag_work'] }),
  ];
}
```
(`past(index, name, overrides)` is the helper `defaultPast()` already uses at `:96-106`.)

- [ ] **Step 3: Register the scenario**

In `scenarios.ts`, add `'site'` to the `ScenarioId` union (`:11`) and to `SCENARIO_IDS` (`:13-15`); import `siteSessions` from `./fixtures/sessions`. In `seed()` (`:159-187`) add a case beside `'stress'`:
```ts
    case 'site':
      // Landing-page embed: providers/catalog/tags/defaults as default, one
      // native session, two past rows, no pre-set meta.
      return { ...base, sessions: siteSessions(), past: sitePast(), meta: {} };
```

- [ ] **Step 4: Write the opening conversation**

`fixtures/conversations/site.jsonl`:
```jsonl
{"type":"user_message","text":"help me plan this week — I have a chem midterm Thursday and a shift Saturday"}
{"type":"assistant_text","text":"Here's a first pass. I put chem review in the two evenings before Thursday and kept Saturday clear until your shift."}
{"type":"tool_use","id":"s1","name":"Write","input":{"file_path":"Documents/week-plan.md","content":"# This week\n\n- Mon: chem ch. 7–8 (2h)\n- Tue: chem practice exam (2h)\n- Wed: review wrong answers (1h)\n- Thu: MIDTERM 9am\n- Sat: shift 12–6\n"}}
{"type":"tool_result","tool_use_id":"s1","content":"Wrote Documents/week-plan.md (6 lines)"}
{"type":"assistant_text","text":"Want me to add reminders the night before each block?"}
```

- [ ] **Step 5: Map it in `seed-chat.ts`**

At `:28-32` add `site: 'site-1',` to `SESSION_FOR`.

- [ ] **Step 6: Add the route to the boot check**

In `/home/destin/youcoded-dev/scripts/workbench-boot-check.mjs` routes list (`:49-77`), add beside the other scenario routes:
```js
  { name: 'app scenario=site', path: '/?mode=workbench&child=1&scenario=site&latency=0' },
```
(match the exact object shape of the neighbouring entries).

- [ ] **Step 7: Boot check + tests**

```bash
cd /home/destin/youcoded-dev/worktrees/site-rebuild/desktop && (VITE_NO_WATCH=1 YOUCODED_PORT_OFFSET=300 bash /home/destin/youcoded-dev/scripts/run-workbench.sh /home/destin/youcoded-dev/worktrees/site-rebuild >/tmp/claude-1000/wb.log 2>&1 &) ; sleep 8
cd /home/destin/youcoded-dev && node scripts/workbench-boot-check.mjs 5473; echo "exit $?"
cd worktrees/site-rebuild/desktop && npx vitest run tests/workbench-fixture-actions.test.ts tests/workbench-shim-semantics.test.ts 2>&1 | tail -5
```
Expected: boot check `exit 0` including `app scenario=site`; vitest `passed`. Leave the workbench running for later tasks (it is on 5473).

- [ ] **Step 8: Commit (two repos)**

```bash
cd /home/destin/youcoded-dev/worktrees/site-rebuild && git add desktop/src/renderer/dev/workbench/scenarios.ts desktop/src/renderer/dev/workbench/fixtures/sessions.ts desktop/src/renderer/dev/workbench/fixtures/conversations/site.jsonl desktop/src/renderer/dev/workbench/seed-chat.ts && git commit -m "feat(workbench): scenario=site — one native session for the landing-page embed

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JT8RKNphr2HekthYqV9Qzi"
cd /home/destin/youcoded-dev && git add scripts/workbench-boot-check.mjs && git commit -m "chore(workbench-boot-check): cover scenario=site

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JT8RKNphr2HekthYqV9Qzi"
```

### Task 3: Scripted replies — a sent message gets an answer

**Files:**
- Create: `desktop/src/renderer/dev/workbench/reply-script.ts`
- Create: `desktop/src/renderer/dev/workbench/fixtures/replies/demo.jsonl`, `any-ai.jsonl`, `receipts.jsonl`, `theme-builder.jsonl`
- Modify: `desktop/src/renderer/dev/workbench/mock-shim.ts` — `HAND_WRITTEN` (`:52-95`), `subs` (`:414-419`), `session` (`:432+`), `on` (`:960-975`)
- Test: `desktop/tests/workbench-reply-script.test.ts`

**Interfaces:**
- Consumes: App's `on.transcriptEvent` contract (`App.tsx:1112-1215`): `{type:'user-message'|'assistant-text'|'tool-use'|'tool-result'|'turn-complete', sessionId, uuid, timestamp, data}`; `on.hookEvent` → `hookEventToAction` (`state/hook-dispatcher.ts:8-60`): `{type:'PermissionRequest', sessionId, payload:{tool_name, tool_input, _requestId, permissionMode}}`.
- Produces: `playReply(sessionId, text, emit)` and `resolvePermission(requestId)`; URL param `?reply=<name>` picks the script (default `demo`).

- [ ] **Step 1: Write the failing test**

`desktop/tests/workbench-reply-script.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { playReply, resolvePermission, parseReplyScript } from '../src/renderer/dev/workbench/reply-script';

const SCRIPT = [
  '{"type":"assistant_text","text":"Reading them now.","delay":10}',
  '{"type":"tool_use","id":"r1","name":"Read","input":{"file_path":"a.jpg"},"delay":10}',
  '{"type":"tool_result","tool_use_id":"r1","content":"[image]","delay":10}',
  '{"type":"permission_request","id":"p1","name":"Write","input":{"file_path":"out.xlsx"},"delay":10}',
  '{"type":"tool_result","tool_use_id":"p1","content":"Wrote out.xlsx","delay":10}',
  '{"type":"turn_complete","delay":10}',
].join('\n');

describe('reply-script', () => {
  it('parses one event per line and ignores blanks', () => {
    expect(parseReplyScript(SCRIPT + '\n\n').length).toBe(6);
  });

  it('plays transcript + hook events in order and pauses on a permission ask', async () => {
    vi.useFakeTimers();
    const transcript: any[] = []; const hooks: any[] = [];
    const done = playReply('s1', 'turn these into a spreadsheet', parseReplyScript(SCRIPT), {
      transcript: (e) => transcript.push(e), hook: (e) => hooks.push(e), cps: 1000,
    });
    await vi.advanceTimersByTimeAsync(200);
    // user echo, streamed text (3 words → 3 chunks, one partId), tool-use, tool-result
    expect(transcript[0]).toMatchObject({ type: 'user-message', sessionId: 's1', data: { text: 'turn these into a spreadsheet' } });
    const chunks = transcript.filter((e) => e.type === 'assistant-text');
    expect(chunks.length).toBe(3);
    expect(new Set(chunks.map((c) => c.data.partId)).size).toBe(1);
    expect(transcript.find((e) => e.type === 'tool-use')).toMatchObject({ data: { toolUseId: 'r1', toolName: 'Read' } });
    expect(hooks[0]).toMatchObject({ type: 'PermissionRequest', sessionId: 's1', payload: { tool_name: 'Write', _requestId: 'p1', permissionMode: 'ask' } });
    // paused: the tool-result after the ask has NOT been emitted yet
    expect(transcript.some((e) => e.type === 'tool-result' && e.data.toolUseId === 'p1')).toBe(false);
    resolvePermission('p1');
    await vi.advanceTimersByTimeAsync(200);
    await done;
    expect(transcript.some((e) => e.type === 'tool-result' && e.data.toolUseId === 'p1')).toBe(true);
    expect(transcript.at(-1)).toMatchObject({ type: 'turn-complete' });
    vi.useRealTimers();
  });

  it('ignores control input (PTY escapes) so a Claude Code session does not trigger a script', async () => {
    const transcript: any[] = [];
    await playReply('s1', '\x1b', parseReplyScript(SCRIPT), { transcript: (e) => transcript.push(e), hook: () => {} });
    expect(transcript.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /home/destin/youcoded-dev/worktrees/site-rebuild/desktop && npx vitest run tests/workbench-reply-script.test.ts 2>&1 | tail -5
```
Expected: FAIL — `Cannot find module '../src/renderer/dev/workbench/reply-script'`.

- [ ] **Step 3: Implement `reply-script.ts`**

```ts
// Plays a reply fixture back as the same events a real backend would send —
// `on.transcriptEvent` for the timeline and `on.hookEvent` for a permission
// ask — so a message typed into the workbench gets an answer. This is the
// "phase 2 live play-through" the workbench spec deferred; the landing-page
// embed needs it because a composer that swallows input reads as broken.
//
// Fixture lines reuse the conversation-fixture vocabulary (fixture-loader.ts)
// plus `delay` (ms before the line) and two new kinds:
//   permission_request — emits a PermissionRequest hook event and PAUSES until
//                        session.respondToPermission(id) (mock-shim) resolves it
//   turn_complete      — ends the turn
// No Date.now(): timestamps are a counter so a replay is byte-identical.

export type ReplyLine =
  | { type: 'assistant_text'; text: string; delay?: number; model?: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; delay?: number }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean; delay?: number }
  | { type: 'permission_request'; id: string; name: string; input: Record<string, unknown>; delay?: number }
  | { type: 'turn_complete'; delay?: number; model?: string };

export interface ReplySinks {
  transcript: (event: unknown) => void;
  hook: (event: unknown) => void;
  /** characters per second for streamed text; tests pass a large number */
  cps?: number;
}

export function parseReplyScript(raw: string): ReplyLine[] {
  return raw.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as ReplyLine);
}

const pending = new Map<string, () => void>();
export function resolvePermission(requestId: string): boolean {
  const r = pending.get(requestId);
  if (!r) return false;
  pending.delete(requestId);
  r();
  return true;
}

let counter = 0;
const uid = () => `wb-ev-${++counter}`;
const stamp = () => 1_753_800_000_000 + counter * 1000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** True for the control bytes App/useSubmitConfirmation send to a PTY session
 *  ('\r' submit, '\x1b' interrupt, '\x1b[Z' shift-tab). Those must never start
 *  a scripted reply. */
function isControl(text: string): boolean {
  return text.trim().length === 0 || text.startsWith('\x1b') || text === '\r';
}

export async function playReply(sessionId: string, text: string, script: ReplyLine[], sinks: ReplySinks): Promise<void> {
  if (isControl(text)) return;
  const t = (type: string, data: Record<string, unknown>) =>
    sinks.transcript({ type, sessionId, uuid: uid(), timestamp: stamp(), data });
  const perChar = 1000 / (sinks.cps ?? 40);

  t('user-message', { text });
  for (const line of script) {
    await sleep(line.delay ?? 400);
    switch (line.type) {
      case 'assistant_text': {
        // One partId across the chunks: App.tsx merges same-partId deltas into
        // the last text segment, which is what makes it look like streaming.
        const partId = uid();
        const words = line.text.split(' ');
        for (let i = 0; i < words.length; i++) {
          t('assistant-text', { text: (i ? ' ' : '') + words[i], partId, model: line.model });
          await sleep(perChar * (words[i].length + 1));
        }
        break;
      }
      case 'tool_use':
        t('tool-use', { toolUseId: line.id, toolName: line.name, toolInput: line.input });
        break;
      case 'tool_result':
        t('tool-result', { toolUseId: line.tool_use_id, toolResult: line.content, isError: !!line.is_error });
        break;
      case 'permission_request': {
        sinks.hook({
          type: 'PermissionRequest', sessionId,
          payload: { tool_name: line.name, tool_input: line.input, _requestId: line.id, permissionMode: 'ask' },
        });
        await new Promise<void>((resolve) => pending.set(line.id, resolve));
        // The ask was for this tool call; a tool-use with the same id makes the
        // card show the work happening after approval.
        t('tool-use', { toolUseId: line.id, toolName: line.name, toolInput: line.input });
        break;
      }
      case 'turn_complete':
        t('turn-complete', { stopReason: 'end_turn', model: line.model ?? null });
        break;
    }
  }
}
```

- [ ] **Step 4: Run the test**

```bash
npx vitest run tests/workbench-reply-script.test.ts 2>&1 | tail -5
```
Expected: 3 passed.

- [ ] **Step 5: Write the four reply fixtures**

`fixtures/replies/demo.jsonl` (the embed's default — answers anything):
```jsonl
{"type":"assistant_text","text":"Got it. I'll start with what's in your Documents folder and check with you before I change anything.","delay":500}
{"type":"tool_use","id":"d1","name":"Glob","input":{"pattern":"Documents/**/*"},"delay":600}
{"type":"tool_result","tool_use_id":"d1","content":"Documents/week-plan.md\nDocuments/chem-notes.md\nDocuments/shift-schedule.png","delay":700}
{"type":"assistant_text","text":"Three files. Tell me what you'd like done with them, or pick a different folder — nothing happens until you say so.","delay":400}
{"type":"turn_complete","delay":300}
```
`fixtures/replies/any-ai.jsonl` (row 1 — after a model switch):
```jsonl
{"type":"assistant_text","text":"Still here — same conversation, different model. Where were we? You wanted the chem review moved to Tuesday and Wednesday.","delay":500}
{"type":"turn_complete","delay":300}
```
`fixtures/replies/receipts.jsonl` (row 2):
```jsonl
{"type":"assistant_text","text":"I'll read each receipt, then build the spreadsheet.","delay":500}
{"type":"tool_use","id":"r1","name":"Read","input":{"file_path":"Receipts/2026-03-02.jpg"},"delay":600}
{"type":"tool_result","tool_use_id":"r1","content":"[image 1200×900] Trader Joe's — $42.17 — 2026-03-02","delay":900}
{"type":"tool_use","id":"r2","name":"Read","input":{"file_path":"Receipts/2026-03-05.jpg"},"delay":300}
{"type":"tool_result","tool_use_id":"r2","content":"[image 1200×900] Shell — $38.40 — 2026-03-05","delay":900}
{"type":"tool_use","id":"r3","name":"Read","input":{"file_path":"Receipts/2026-03-09.jpg"},"delay":300}
{"type":"tool_result","tool_use_id":"r3","content":"[image 1200×900] CVS — $12.99 — 2026-03-09","delay":900}
{"type":"assistant_text","text":"Three receipts, $93.56 total. I'd like to write Receipts/march.xlsx — one row each, with a total.","delay":500}
{"type":"permission_request","id":"p1","name":"Write","input":{"file_path":"Receipts/march.xlsx"},"delay":400}
{"type":"tool_result","tool_use_id":"p1","content":"Wrote Receipts/march.xlsx (4 rows)","delay":1200}
{"type":"assistant_text","text":"Done — march.xlsx is in your Receipts folder.","delay":400}
{"type":"turn_complete","delay":300}
```
`fixtures/replies/theme-builder.jsonl` (row 6):
```jsonl
{"type":"assistant_text","text":"Warm and atmospheric — golden-hour light, hand-painted glow. Building it.","delay":500}
{"type":"tool_use","id":"t1","name":"Write","input":{"file_path":"themes/golden-sunbreak/manifest.json"},"delay":700}
{"type":"tool_result","tool_use_id":"t1","content":"Wrote manifest.json","delay":1600}
{"type":"tool_use","id":"t2","name":"Write","input":{"file_path":"themes/golden-sunbreak/assets/wallpaper.jpg"},"delay":300}
{"type":"tool_result","tool_use_id":"t2","content":"Golden Sunbreak installed — pick it under Settings → Appearance","delay":1400}
{"type":"turn_complete","delay":300}
```

- [ ] **Step 6: Wire the shim**

In `mock-shim.ts`:

(a) `HAND_WRITTEN` (`:52-95`): add `'session.sendInput', 'session.respondToPermission', 'on.transcriptEvent', 'on.hookEvent',` after the `'session.setFlag', …` line. All four exist in `preload.ts` (`:390`, `:396`, `:518`, `:456`), so `tests/workbench-mock-contract.test.ts` passes without a `MOCK_ONLY` entry.

(b) imports at the top:
```ts
import { playReply, resolvePermission, parseReplyScript } from './reply-script';
```
and beside the other `import.meta.glob` blocks (`:310` region):
```ts
// @ts-ignore TS1343 — Vite rewrites import.meta.glob statically at build time.
const REPLY_SCRIPTS = import.meta.glob('./fixtures/replies/*.jsonl', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
function replyScriptName(): string {
  if (typeof location === 'undefined') return 'demo';
  return new URLSearchParams(location.search).get('reply') ?? 'demo';
}
```

(c) `subs` (`:414-419`): add
```ts
    transcript: new Set<(e: any) => void>(),
    hook: new Set<(e: any) => void>(),
```

(d) inside the `session` object (after `destroy`):
```ts
    // Site mode / phase-2 play-through: a typed message gets a scripted answer
    // (`?reply=<name>`, fixtures/replies/). Control bytes are ignored inside
    // playReply so the PTY-shaped calls App makes for Claude Code sessions
    // ('\r', '\x1b') never start a script.
    sendInput: (sessionId: string, text: string) => {
      const raw = REPLY_SCRIPTS[`./fixtures/replies/${replyScriptName()}.jsonl`];
      if (!raw) { console.warn(`[workbench] no reply script "${replyScriptName()}"`); return; }
      void playReply(sessionId, text, parseReplyScript(raw), {
        transcript: (e) => subs.transcript.forEach((f) => f(e)),
        hook: (e) => subs.hook.forEach((f) => f(e)),
      });
    },
    respondToPermission: async (requestId: string, _decision: object) => {
      resolvePermission(requestId);
      return { ok: true };
    },
```

(e) `on` (`:960-975`): add
```ts
    transcriptEvent: (cb) => { subs.transcript.add(cb); return () => { subs.transcript.delete(cb); }; },
    hookEvent: (cb) => { subs.hook.add(cb); return () => { subs.hook.delete(cb); }; },
```
If `Ns<'on'>` does not type these members, attach them the way `specialistEvent` is attached at `:979` (`(on as any).transcriptEvent = …`).

- [ ] **Step 7: Contract + boot check + look at it**

```bash
npx vitest run tests/workbench-mock-contract.test.ts tests/workbench-shim-semantics.test.ts tests/workbench-reply-script.test.ts 2>&1 | tail -5
cd /home/destin/youcoded-dev && node scripts/workbench-boot-check.mjs 5473; echo "exit $?"
```
Expected: all passed; boot `exit 0`. Then open `http://127.0.0.1:5473/?mode=workbench&child=1&scenario=site&reply=receipts` in a headless screenshot after typing: 
```bash
cd /home/destin/youcoded-dev && cat > /tmp/claude-1000/reply-probe.json <<'EOF'
{ "base": "http://127.0.0.1:5233/?mode=workbench&child=1&scenario=site&latency=0&reply=receipts", "boot": 3000,
  "shots": [ { "name": "reply-plays", "actions": [
    {"click": "[placeholder^='Message']", "settle": 200}, {"type": "turn my receipts into a spreadsheet"}, {"key": "Enter", "settle": 9000} ],
    "expect": "js:[...document.querySelectorAll('*')].some(e=>e.childElementCount===0&&/march\\.xlsx/.test(e.textContent))" } ] }
EOF
WB_PORT=5473 CDP_PORT=10311 node scripts/ui-review/shot.mjs /tmp/claude-1000/reply-probe.json /tmp/claude-1000/reply-probe midnight; ls /tmp/claude-1000/reply-probe/midnight
```
Expected: `reply-plays.png` in `midnight/` (not `_unverified/`). Open the PNG: exactly **one** user bubble, streamed assistant text, three Read cards, a permission card for `Write Receipts/march.xlsx` still waiting. **If two user bubbles appear** (App's optimistic `USER_PROMPT` plus the echoed `user-message`), delete the `t('user-message', { text })` line in `playReply` and the first `expect` in the test, and re-run.

- [ ] **Step 8: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/site-rebuild && git add desktop/src/renderer/dev/workbench/reply-script.ts desktop/src/renderer/dev/workbench/fixtures/replies desktop/src/renderer/dev/workbench/mock-shim.ts desktop/tests/workbench-reply-script.test.ts && git commit -m "feat(workbench): scripted replies — a sent message plays a reply fixture as transcript/hook events

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JT8RKNphr2HekthYqV9Qzi"
```

### Task 4: Stateful model switch + Golden Sunbreak in the workbench

**Files:**
- Modify: `desktop/src/renderer/dev/workbench/mock-shim.ts:582` (`native`), `HAND_WRITTEN`
- Copy: `desktop/src/renderer/themes/community/golden-sunbreak/` → `desktop/src/renderer/dev/workbench/fixtures/themes/golden-sunbreak/`
- Test: `desktop/tests/workbench-shim-semantics.test.ts`

**Interfaces:**
- Consumes: `ModelPickerPopup.tsx:304` `window.claude.native.setBinding(sessionId, { providerId, modelId })` → `boolean`.
- Produces: `session.list()` reflects the new `model`; `theme.list()` includes `golden-sunbreak`.

- [ ] **Step 1: Failing tests**

Append to `tests/workbench-shim-semantics.test.ts` (mirror its existing `createStore`/`createMockShim` setup at the top of the file):
```ts
describe('site mode additions', () => {
  it('native.setBinding rebinds the session model', async () => {
    const store = createStore('site');
    const shim = createMockShim(store);
    const ok = await shim.native.setBinding('site-1', { providerId: 'openrouter', modelId: 'anthropic/claude-sonnet-5' });
    expect(ok).toBe(true);
    const s = (await shim.session.list()).find((x: any) => x.id === 'site-1');
    expect(s.model).toBe('anthropic/claude-sonnet-5');
  });
  it('theme.list includes the vendored golden-sunbreak pack', async () => {
    const shim = createMockShim(createStore('default'));
    expect(await shim.theme.list()).toContain('golden-sunbreak');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/workbench-shim-semantics.test.ts 2>&1 | tail -8
```
Expected: 2 failed (`setBinding is not a function`, list lacks `golden-sunbreak`).

- [ ] **Step 3: Implement**

`mock-shim.ts:582` — replace `const native: Ns<'native'> = { supported: true };` with:
```ts
  const native: Ns<'native'> & { setBinding: (sessionId: string, b: { providerId: string; modelId: string }) => Promise<boolean> } = {
    supported: true,
    // Model picker (ModelPickerPopup.tsx:304). Real backend rebinds the
    // provider/model on the live session; here it updates the row the status
    // bar and picker read from, so the chip changes on screen.
    setBinding: async (sessionId, b) => {
      if (store.refuseWrites) return false;
      store.setState((s) => ({
        ...s,
        sessions: s.sessions.map((x: any) => x.id === sessionId ? { ...x, model: b.modelId, providerId: b.providerId } : x),
      }));
      return true;
    },
  };
```
Add `'native.setBinding'` to `HAND_WRITTEN` (exists in `preload.ts:1217`). Read `ModelPickerPopup.tsx:290-330`: if after `ok` the popup relies on an event (e.g. `on.sessionRenamed`-style refresh) rather than re-fetching `session.list()`, emit the matching `subs.*` event in `setBinding` the same way `session.create` emits `subs.created`.

Copy the theme:
```bash
cp -r src/renderer/themes/community/golden-sunbreak src/renderer/dev/workbench/fixtures/themes/golden-sunbreak && ls src/renderer/dev/workbench/fixtures/themes/golden-sunbreak/assets
```
The glob at `mock-shim.ts:310-326` picks it up with no code change.

- [ ] **Step 4: Tests + boot check**

```bash
npx vitest run tests/workbench-shim-semantics.test.ts tests/workbench-mock-contract.test.ts 2>&1 | tail -5
cd /home/destin/youcoded-dev && node scripts/workbench-boot-check.mjs 5473; echo "exit $?"
```
Expected: passed; `exit 0`.

- [ ] **Step 5: Commit**

```bash
cd /home/destin/youcoded-dev/worktrees/site-rebuild && git add desktop/src/renderer/dev/workbench/mock-shim.ts desktop/src/renderer/dev/workbench/fixtures/themes/golden-sunbreak desktop/tests/workbench-shim-semantics.test.ts && git commit -m "feat(workbench): stateful native.setBinding; vendor golden-sunbreak for the site scenes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JT8RKNphr2HekthYqV9Qzi"
```

### Task 5: Full desktop verification + rebuild the embed

- [ ] **Step 1: `bash scripts/verify.sh worktrees/site-rebuild`** from `/home/destin/youcoded-dev`. Expected: all checks pass (tsc, related tests, knip, eslint, ast-grep). Fix anything it reports — `knip` will flag `reply-script.ts` exports only if a test does not import them (it does).
- [ ] **Step 2:** `cd worktrees/site-rebuild/desktop && npm run build:site` then repeat Task 1 Step 4 (static boot check on 5473 — stop the dev workbench first: find its pid with `ss -ltnp 'sport = :5473'` and `kill <pid>`; restart it afterwards for the recording tasks).
- [ ] **Step 3: Commit** `git add docs/site && git commit -m "chore(site): rebuild embed with site scenario, replies, golden-sunbreak"` (+ trailers).

---

## Part B — Recorder and scenes (repo `youcoded-dev`, `scripts/ui-review/`)

### Task 6: `record.mjs` — scene → WebM loop + WebP poster

**Files:**
- Create: `scripts/ui-review/cdp-helpers.mjs` — the Chrome flags, `waitForCdp`, and the `selExpr`/`textExpr`/`rectOf` selector helpers, extracted from `shot.mjs:71-95` and `:166-168` so the recorder and the screenshot driver share one copy
- Modify: `scripts/ui-review/shot.mjs` — import those helpers instead of defining them (behaviour unchanged)
- Create: `scripts/ui-review/record.mjs`
- Create: `scripts/ui-review/scenes/smoke.json`

**Interfaces:**
- Consumes: the workbench on `WB_PORT` (default 5473); `google-chrome-stable`; `ffmpeg`; `magick`.
- Produces: `node record.mjs <scene.json> <outBase>` → `<outBase>.webm`, `<outBase>.webp`, prints `frames=N duration=S.s`. Scene format:
  ```json
  { "base": "http://127.0.0.1:5473/?mode=workbench&child=1&scenario=site&latency=150",
    "theme": "midnight", "width": 1440, "height": 900, "boot": 3500,
    "actions": [ {"hold": 800}, {"moveTo": "<css|js:expr>", "ms": 500}, {"click": "<css|js:expr>", "settle": 900},
                 {"clickText": "Label", "tag": "button"}, {"typeSlow": "text", "cps": 18}, {"key": "Enter"},
                 {"eval": "js"}, {"wait": 500} ] }
  ```
  `moveTo` interpolates the mouse over `ms`; `click` = `moveTo` (300 ms) + press; `typeSlow` sends one `Input.dispatchKeyEvent` per character; `hold` records still frames.

- [ ] **Step 0: Extract the shared helpers**

Create `scripts/ui-review/cdp-helpers.mjs` exporting `CHROME_FLAGS(W, H, cdpPort, profileDir)` (the argv array from `shot.mjs:73-85`, including the `--blink-settings=…` pointer line and its WHY comment), `waitForCdp(port)` (`shot.mjs:89-95`), `selExpr`, `textExpr`, `rectOfExpr` (the three expression builders at `shot.mjs:166-168`, returned as strings the caller evaluates). Then change `shot.mjs` to `import { CHROME_FLAGS, waitForCdp, selExpr, textExpr, rectOfExpr } from './cdp-helpers.mjs'` and delete its local copies — no behaviour change. Prove it: `WB_PORT=5473 CDP_PORT=10330 node scripts/ui-review/shot.mjs scripts/ui-review/plans/main.json /tmp/claude-1000/shot-regress midnight` with `SHARD=0/12` (four shots) must produce the same verified/unverified counts as before the refactor (run it once before editing and once after; compare the `manifest-*.json` `verified` fields).

- [ ] **Step 1: Write the recorder**

`scripts/ui-review/record.mjs`:
```js
#!/usr/bin/env node
// Records a scripted scene in the real renderer (UI Workbench, headless Chrome,
// raw CDP) and encodes a looping WebM + a WebP poster for the landing page.
// Sibling of shot.mjs — shares its Chrome flags and selector helpers through
// cdp-helpers.mjs; the difference is Page.startScreencast instead of one
// captureScreenshot, an interpolated mouse, and per-key typing, because a
// recording of a cursor teleporting and text appearing all at once does not
// look like a person using the app.
//
// Usage: WB_PORT=5473 CDP_PORT=10320 node record.mjs <scene.json> <outBase>
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { CHROME_FLAGS, waitForCdp, selExpr, textExpr, rectOfExpr } from './cdp-helpers.mjs';

const [scenePath, outBase] = process.argv.slice(2);
if (!scenePath || !outBase) { console.error('usage: node record.mjs <scene.json> <outBase>'); process.exit(2); }
const scene = JSON.parse(readFileSync(scenePath, 'utf8'));
const WB_PORT = process.env.WB_PORT ?? '5473';
const CDP_PORT = Number(process.env.CDP_PORT ?? 10320);
const W = scene.width ?? 1440, H = scene.height ?? 900;
const url = scene.base.replace(/127\.0\.0\.1:\d+/, `127.0.0.1:${WB_PORT}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'ui-record-'));
const chrome = spawn('google-chrome-stable', CHROME_FLAGS(W, H, CDP_PORT, profile), { stdio: 'ignore' });
process.on('exit', () => { chrome.kill(); rmSync(profile, { recursive: true, force: true }); });
await waitForCdp(CDP_PORT);
const [target] = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const frames = [];
const framesDir = mkdtempSync(join(tmpdir(), 'ui-frames-'));
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Page.screencastFrame') {
    const n = frames.length;
    writeFileSync(join(framesDir, `f${String(n).padStart(5, '0')}.png`), Buffer.from(d.params.data, 'base64'));
    frames.push({ n, t: d.params.metadata.timestamp });
    send('Page.screencastFrameAck', { sessionId: d.params.sessionId });
  }
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;

// ---- selectors (shared with shot.mjs) ----
const rectOf = async (expr) => evaluate(rectOfExpr(expr));

// ---- humanised input ----
let cur = { x: W / 2, y: H / 2 };
async function moveTo(p, ms = 400) {
  const steps = Math.max(6, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps, e = 1 - Math.pow(1 - k, 3);          // ease-out
    const x = cur.x + (p.x - cur.x) * e, y = cur.y + (p.y - cur.y) * e;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await sleep(16);
  }
  cur = p;
}
async function click(expr) {
  const p = await rectOf(expr);
  if (!p) throw new Error(`MISSING ${expr}`);
  await moveTo(p, 300);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
}
async function typeSlow(text, cps = 18) {
  for (const ch of text) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    await sleep(1000 / cps * (0.7 + Math.random() * 0.6));
  }
}
const KEYS = { Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }, Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 } };
async function key(name, modifiers = 0) {
  const k = KEYS[name] ?? { key: name, code: `Key${name.toUpperCase()}`, windowsVirtualKeyCode: name.toUpperCase().charCodeAt(0) };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers, ...k });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, ...k });
}

// ---- boot ----
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('youcoded-theme',${JSON.stringify(scene.theme ?? 'midnight')});}catch{}` });
await send('Page.navigate', { url });
const READY = scene.ready ?? "document.readyState === 'complete' && document.body.innerText.trim().length > 20";
for (let i = 0; i < 120; i++) { if (await evaluate(READY)) break; await sleep(250); }
await sleep(scene.boot ?? 3500);
await moveTo({ x: W * 0.6, y: H * 0.55 }, 1);

// ---- record ----
await send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: W, maxHeight: H });
const t0 = Date.now();
for (const a of scene.actions) {
  if (a.hold != null) { await sleep(a.hold); continue; }
  if (a.wait != null) { await sleep(a.wait); continue; }
  if (a.moveTo) { const p = await rectOf(selExpr(a.moveTo)); if (!p) throw new Error(`MISSING ${a.moveTo}`); await moveTo(p, a.ms ?? 400); }
  else if (a.click) await click(selExpr(a.click));
  else if (a.clickText) await click(textExpr(a.clickText, a.tag));
  else if (a.typeSlow != null) await typeSlow(a.typeSlow, a.cps);
  else if (a.key) await key(a.key, a.modifiers ?? 0);
  else if (a.eval) await evaluate(a.eval);
  await sleep(a.settle ?? 400);
}
await send('Page.stopScreencast');
await sleep(300);
const duration = (Date.now() - t0) / 1000;
if (frames.length < 10) { console.error(`only ${frames.length} frames — did the page paint?`); process.exit(1); }

// ---- encode (frames are NOT evenly spaced: use a concat list with real durations) ----
const list = frames.map((f, i) => {
  const next = frames[i + 1]?.t ?? f.t + 0.5;
  return `file '${join(framesDir, `f${String(f.n).padStart(5, '0')}.png`)}'\nduration ${Math.max(0.016, next - f.t).toFixed(4)}`;
}).join('\n') + `\nfile '${join(framesDir, `f${String(frames.at(-1).n).padStart(5, '0')}.png`)}'\n`;
writeFileSync(join(framesDir, 'list.txt'), list);
mkdirSync(dirname(outBase), { recursive: true });
const enc = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(framesDir, 'list.txt'),
  '-vf', `scale=${W}:-2,fps=24,format=yuv420p`, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '33', '-row-mt', '1', '-an', `${outBase}.webm`]);
if (enc.status !== 0) { console.error(enc.stderr.toString()); process.exit(1); }
spawnSync('magick', [join(framesDir, 'f00000.png'), '-quality', '82', `${outBase}.webp`]);
rmSync(framesDir, { recursive: true, force: true });
console.log(`frames=${frames.length} duration=${duration.toFixed(1)}s out=${outBase}.webm`);
process.exit(0);
```

- [ ] **Step 2: Smoke scene**

`scripts/ui-review/scenes/smoke.json`:
```json
{ "base": "http://127.0.0.1:5473/?mode=workbench&child=1&scenario=site&latency=150&reply=demo",
  "theme": "midnight", "boot": 3000,
  "actions": [ {"hold": 600}, {"click": "[placeholder^='Message']", "settle": 300},
               {"typeSlow": "what's in my Documents folder?", "cps": 20}, {"key": "Enter", "settle": 5000}, {"hold": 1200} ] }
```

- [ ] **Step 3: Run it**

Workbench on 5473 must be running (Task 2 Step 7). Then:
```bash
cd /home/destin/youcoded-dev && node scripts/ui-review/record.mjs scripts/ui-review/scenes/smoke.json /tmp/claude-1000/smoke && ffprobe -v error -show_entries format=duration -of csv=p=0 /tmp/claude-1000/smoke.webm && ls -la /tmp/claude-1000/smoke.webm /tmp/claude-1000/smoke.webp
```
Expected: `frames=… duration=~9s`, ffprobe duration ≈ 9, `.webm` under 1 MB, `.webp` present. Play the WebM (`ffmpeg -i smoke.webm -vf "select=eq(n\,150)" -frames:v 1 /tmp/claude-1000/mid.png` and view): the typed sentence appears character by character and the reply streams.

- [ ] **Step 4: Commit**

```bash
git add scripts/ui-review/cdp-helpers.mjs scripts/ui-review/shot.mjs scripts/ui-review/record.mjs scripts/ui-review/scenes/smoke.json && git commit -m "feat(ui-review): record.mjs — scene → looping WebM + poster over CDP screencast; shared cdp-helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JT8RKNphr2HekthYqV9Qzi"
```

### Task 7: The eight row scenes

**Files:**
- Create: `scripts/ui-review/scenes/row1-any-ai.json` … `row8-builders.json` (+ `row5-phone.json`)

**Interfaces:**
- Consumes: selectors proven in `plans/main.json` / `overlays.json` / `narrow.json` (quoted below); `?reply=` scripts from Task 3; `scenario=site` from Task 2.
- Produces: `docs/media/row<N>.webm` + `.webp` via Task 8.

Each scene file is `{ base, theme, boot, actions }` as in Task 6. Where a selector is uncertain, first run the rig's `dump` action through `shot.mjs` (`{"dump": true}` lists clickable controls) and pin an `aria-label`/`title` selector — never a text match that a copy change breaks.

- [ ] **Step 1: `row1-any-ai.json`** (theme `midnight`, base `…scenario=site&latency=150&reply=any-ai`)
```json
"actions": [ {"hold": 700},
  {"click": "[title^='Click to change model']", "settle": 900},
  {"hold": 900},
  {"clickText": "Opus", "tag": "button", "settle": 700},
  {"key": "Escape", "settle": 600},
  {"click": "[placeholder^='Message']", "settle": 200},
  {"typeSlow": "keep going from where we were", "cps": 18}, {"key": "Enter", "settle": 4500},
  {"hold": 1200} ]
```
Then switch to a local model: repeat the picker open, `{"clickText": "Local", "tag": "button"}` (or the local provider tab's `aria-label` from a dump), pick the first local row, close, `{"hold": 1500}`.

- [ ] **Step 2: `row2-does-things.json`** (theme `creme`, base `…scenario=site&latency=150&reply=receipts`)
```json
"actions": [ {"hold": 600}, {"click": "[placeholder^='Message']", "settle": 200},
  {"typeSlow": "turn the receipts in my Receipts folder into a spreadsheet", "cps": 18}, {"key": "Enter", "settle": 7500},
  {"hold": 800},
  {"clickText": "Allow", "tag": "button", "settle": 2500},
  {"hold": 800},
  {"click": "[title=Settings]", "settle": 700},
  {"click": "js:[...document.querySelectorAll('button')].find(b=>b.textContent.includes(\"Permissions\"))", "settle": 1200},
  {"hold": 2000} ]
```
The permission button label is whatever ToolCard renders for approve — pin it from a dump (`Allow` / `Yes` / `Allow once`).

- [ ] **Step 3: `row3-projects.json`** (theme `light`, base `…scenario=default&latency=150`)
```json
"actions": [ {"hold": 600}, {"click": "[title=Projects]", "settle": 1200},
  {"hold": 900},
  {"clickText": "week-plan.md", "tag": "button,div,span", "settle": 1500},
  {"hold": 1200},
  {"click": "[aria-label=Context]", "settle": 1200}, {"hold": 1500} ]
```
Pick a file that exists in `fixtures/artifacts.ts` (a `.xlsx` or `.pdf` if the fixture has one — `ls src/renderer/dev/workbench/fixtures` and read `artifacts.ts`).

- [ ] **Step 4: `row4-organized.json`** (theme `dark`, base `…scenario=default&latency=150`)
```json
"actions": [ {"hold": 600},
  {"click": "[title^='Tags & note']", "settle": 900}, {"hold": 700},
  {"clickText": "work", "tag": "button", "settle": 700},
  {"click": "[placeholder^='Search or create']", "settle": 200}, {"typeSlow": "midterm", "cps": 16}, {"key": "Enter", "settle": 800},
  {"key": "Escape", "settle": 600},
  {"click": "[placeholder^='Message']", "settle": 200}, {"typeSlow": "/resume", "cps": 16}, {"key": "Enter", "settle": 1400},
  {"hold": 1200},
  {"click": "[placeholder^='Search sessions']", "settle": 200}, {"typeSlow": "midterm", "cps": 16}, {"hold": 1500} ]
```
Also click one quick chip above the composer at the start (`{"clickText": "Journal", "tag": "button"}` — chips visible in the rig's `main-home` shot).

- [ ] **Step 5: `row5-follow.json`** (desktop, theme `meadow-mist`, base `…scenario=site&latency=150`) — `{"hold": 2500}` after a `{"click": "[placeholder^='Message']"}` and `{"typeSlow": "add reminders the night before", "cps": 18}` + Enter + `{"hold": 3000}`.
  **`row5-phone.json`** — same base, `"width": 390, "height": 844`, theme `meadow-mist`: `{"hold": 1500}`, `{"click": "[aria-label='Open menu']", "settle": 700}`, `{"hold": 900}`, `{"key": "Escape"}`, scroll the timeline (`{"eval": "document.querySelector('[data-testid=chat-scroll],main')?.scrollBy({top:400,behavior:'smooth'})"}`), `{"hold": 2000}`.
  The page composes desktop + phone side by side (Task 12).

- [ ] **Step 6: `row6-yours.json`** (theme `midnight`, base `…scenario=site&latency=150&reply=theme-builder`)
```json
"actions": [ {"hold": 500}, {"click": "[placeholder^='Message']", "settle": 200},
  {"typeSlow": "build me a theme with the vibe of outdoor anime art", "cps": 18}, {"key": "Enter", "settle": 6500},
  {"click": "[title=Settings]", "settle": 700},
  {"click": "js:[...document.querySelectorAll('button')].find(b=>b.textContent.includes(\"Appearance\"))", "settle": 1000},
  {"clickText": "Golden Sunbreak", "tag": "button,div,span", "settle": 1800},
  {"key": "Escape", "settle": 800}, {"hold": 1200},
  {"click": "[title='Browse skills']", "settle": 800}, {"click": "[title='Open marketplace']", "settle": 1800},
  {"hold": 800}, {"eval": "document.querySelector('main, [role=main]')?.scrollBy({top:600,behavior:'smooth'})"}, {"hold": 2200} ]
```
Pin the theme-card selector from a dump (community cards carry `aria-label='Edit <Name>'` on the pencil; the card itself may use a title).

- [ ] **Step 7: `row7-play.json`** (theme `halftone-dimension`, base `…scenario=default&latency=150`) — `{"hold": 600}`, `{"click": "[title='Connect 4']", "settle": 1200}`, `{"hold": 1500}`, then three column clicks on the board (pin `[data-col]`/cell selectors from a dump; the workbench's board is local state so moves render), `{"hold": 1500}`.

- [ ] **Step 8: `row8-builders.json`** (theme `midnight`, base `…scenario=default&latency=150`) — click the Claude Code session tab (`wb-1`, tab title from the session name in `fixtures/sessions.ts`), `{"hold": 1500}`; click the native tab `wb-2`, `{"hold": 1200}`; `{"click": "[title=Settings]"}` → `Model Providers` row (`…textContent.trim().startsWith("Model Providers")`), `{"hold": 1500}`, `{"eval": "…scrollDialog bottom equivalent"}` (copy the `scrollDialog` expression from `shot.mjs:184-187`), `{"clickText": "Resume", "tag": "button", "settle": 2500}` (the local-model download progress bar animates), `{"hold": 1500}`. **No git or MCP screen** — the workbench has neither (canned `repoInfo`, no MCP UI); the copy names them, the loop does not fake them.

- [ ] **Step 9: Record all eight + phone and review each**

```bash
cd /home/destin/youcoded-dev && for s in row1-any-ai row2-does-things row3-projects row4-organized row5-follow row5-phone row6-yours row7-play row8-builders; do CDP_PORT=10320 node scripts/ui-review/record.mjs scripts/ui-review/scenes/$s.json /tmp/claude-1000/scenes/$s || echo "FAILED $s"; done; ls -la /tmp/claude-1000/scenes
```
Expected: nine `.webm`/`.webp` pairs, none `FAILED`. For each, extract three frames (`ffmpeg -i X.webm -vf fps=1/3 /tmp/claude-1000/scenes/X-%02d.png`) and view them; a scene whose key moment is missing (picker never opened, permission never answered) gets its selector fixed and re-recorded. **Show Destin the nine posters + one mid-frame each before Task 8** — this is the interactive-verification handoff point.

- [ ] **Step 10: Commit** `git add scripts/ui-review/scenes && git commit -m "feat(ui-review): landing-page row scenes"` (+ trailers).

### Task 8: `site-assets.sh` + gallery plan + release checklist

**Files:**
- Create: `scripts/ui-review/site-assets.sh`
- Create: `scripts/ui-review/plans/site-gallery.json`
- Modify: `docs/build-and-release.md` (release checklist)

- [ ] **Step 1: Gallery plan** — `plans/site-gallery.json`, 1440×900, base `http://127.0.0.1:5233/?mode=workbench&child=1&latency=0&scenario=default`, eight shots reusing exact action lists from `main.json`: `home` (no actions, `sameAsBaseline: true`), `marketplace` (`main.json:343`), `projects` (`:203`), `model-picker` (`:413`), `tags` (`:423`), `connect4` (`:294`), `themes` (Settings → Appearance), `permissions` (`:133`). Themes are passed on the command line per shot group in the script (`midnight`, `meadow-mist`, `halftone-dimension`, `creme`, `light`, `dark` — two shots each).

- [ ] **Step 2: The script**

`scripts/ui-review/site-assets.sh`:
```bash
#!/usr/bin/env bash
# Regenerates every landing-page demo asset from the REAL renderer:
#   docs/site/           the live embed (npm run build:site)
#   docs/media/     one WebM loop + WebP poster per showcase row (record.mjs)
#   docs/gallery/        gallery stills as WebP (shot.mjs + magick)
# Run before every release so the site can never drift from the app again.
# Usage: bash scripts/ui-review/site-assets.sh <worktree-or-path>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; WS="$(cd "$HERE/../.." && pwd)"
TARGET="${1:?worktree name or path}"
TDIR="$TARGET"; [ -d "$TDIR" ] || TDIR="$WS/worktrees/$TARGET"; [ -d "$TDIR" ] || TDIR="$WS/youcoded"
export YOUCODED_PORT_OFFSET=300 VITE_NO_WATCH=1; export WB_PORT=5473
OUT="$TDIR/docs"

# 1. workbench (reuse if already up on 5473 from the same tree, else boot)
if ! curl -sf "http://127.0.0.1:$WB_PORT/" >/dev/null; then
  (cd "$TDIR" && nohup bash "$WS/scripts/run-workbench.sh" "$TDIR" >/tmp/claude-1000/site-assets-wb.log 2>&1 &)
  for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$WB_PORT/" >/dev/null && break; sleep 1; done
  STARTED=1
fi
trap '[ "${STARTED:-0}" = 1 ] && pkill -f "[v]ite --port $WB_PORT" || true' EXIT
node "$WS/scripts/workbench-boot-check.mjs" "$WB_PORT"

# 2. loops
mkdir -p "$OUT/media"
i=0
for scene in row1-any-ai row2-does-things row3-projects row4-organized row5-follow row5-phone row6-yours row7-play row8-builders; do
  CDP_PORT=$((10320 + i)) node "$HERE/record.mjs" "$HERE/scenes/$scene.json" "$OUT/media/$scene"; i=$((i+1))
done

# 3. gallery
TMP="$(mktemp -d /tmp/claude-1000/site-gallery-XXXX)"
for theme in midnight meadow-mist halftone-dimension creme light dark; do
  CDP_PORT=$((10340 + i)) node "$HERE/shot.mjs" "$HERE/plans/site-gallery.json" "$TMP" "$theme"; i=$((i+1))
done
rm -f "$OUT/gallery/"*.png "$OUT/gallery/"*.webp
for f in "$TMP"/*/*.png; do
  theme="$(basename "$(dirname "$f")")"; name="$(basename "$f" .png)"
  magick "$f" -resize 1200x -quality 80 "$OUT/gallery/$name-$theme.webp"
done
du -sh "$OUT/media" "$OUT/gallery"

# 4. embed (needs the workbench stopped? no — vite build is independent of the dev server)
(cd "$TDIR/desktop" && npm run build:site >/dev/null)
echo "site assets regenerated under $OUT — review docs/gallery and docs/media, then commit them"
```

- [ ] **Step 3: Run it end to end**

```bash
bash scripts/ui-review/site-assets.sh site-rebuild 2>&1 | tail -15
```
Expected: boot check ok, nine `frames=…` lines, gallery `du` under 1.5 MB total, media under 8 MB total, `site assets regenerated`. If media exceeds 8 MB, raise `-crf` in `record.mjs` to 36 and re-run.

- [ ] **Step 4: Release checklist** — in `docs/build-and-release.md`, in the desktop release steps, add a line: `- Regenerate the landing-page demos: \`bash scripts/ui-review/site-assets.sh <worktree>\`, review \`docs/gallery\` + \`docs/media\`, commit them with the version bump — the site's loops and embed are built from the renderer and go stale otherwise.`

- [ ] **Step 5: Commit** (workspace: `scripts/ui-review/site-assets.sh scripts/ui-review/plans/site-gallery.json docs/build-and-release.md`; app worktree: `docs/site docs/gallery`).

---

## Part C — The page (repo `youcoded`, `docs/index.html`)

### Task 9: Copy document (the review gate)

**Files:**
- Create: `docs/active/design/2026-08-27-landing-page/copy.md` (workspace repo)

- [ ] **Step 1: Write every string, old → new, grouped by section.** Old strings are quoted from the audit (§3); new strings are the ones inserted in Tasks 10–13 — copy them verbatim from those tasks so the document and the page cannot disagree. Sections: Meta (title, description, OG) · Nav · Hero · What is this? · Row 1…9 (label, headline, body) · Story · Get started (4 cards + line) · Download · Install modal "After install" · FAQ (7 Q + A) · Footer. Mark the "What is this?" paragraph `draft 1 — Destin: "don't love any of these; fine for now"`.

- [ ] **Step 2: Commit** `git add docs/active/design/2026-08-27-landing-page/copy.md && git commit -m "docs(design): landing-page copy — every string old→new for review"` (+ trailers). **Hand this file to Destin.** Tasks 10–13 may proceed in parallel with his review; his edits are applied in Task 14.

### Task 10: Head, nav, hero

**Files:**
- Modify: `docs/index.html` — `<head>` (`:1-32`), cycler CSS (`:584-656`), nav (`:2646-2677`), hero (`:2678-2695`), intro JS (`:3484` onward: `THEMES`, `HERO_THEME_SEQUENCE`, `intro-mode` lift at 6300 ms)

- [ ] **Step 1: Head** — `<title>YouCoded Assistant — Agentic AI for Everyone</title>`; meta description / OG / Twitter description: `One app for Claude, hundreds of cloud models, or one that runs free on your own computer — working in your files, on every device you own. Windows, macOS, Linux, Android.`; `og:title` `YouCoded Assistant — Agentic AI for Everyone`; keep `og:image` URL (Task 13 creates the file).

- [ ] **Step 2: Wordmark** — in the nav logo block replace `You<span class="…">Coded</span>` (keep the existing accent span) with:
```html
<span class="nav-logo-text">You<span class="nav-logo-accent">Coded</span> <span class="nav-logo-agent">Assistant</span></span>
<span class="nav-logo-sub">Agentic AI for Everyone.</span>
```
CSS (add after `.nav-logo-sub`): `.nav-logo-agent { font-weight: 500; opacity: .72; letter-spacing: .01em; }`. Keep the existing accent class name (read the current markup at `:2647-2652` and reuse its class).

- [ ] **Step 3: Hero** — replace the h1 cycler markup with three words:
```html
<h1 class="hero-title">Make AI
  <span class="word-cycler" aria-label="Useful, Fun, Yours.">
    <span class="cycler-sizer" aria-hidden="true">Useful.</span>
    <span class="cycler-stage" aria-hidden="true">
      <span class="cycler-word cycler-word-1">Useful.</span>
      <span class="cycler-word cycler-word-2">Fun.</span>
      <span class="cycler-word cycler-word-3 cycler-word-final">Yours.</span>
    </span>
  </span>
</h1>
<p class="hero-sub">A self-improving, customizable AI agent. Use any AI model from any provider to build or accomplish anything you want.</p>
```
Read the current markup at `:2678-2695` first and keep any wrapper elements the JS measures (`.cycler-sizer`, `.cycler-stage`, the `--cycler-width` measuring code).

- [ ] **Step 4: Cycler timing** — CSS `:612-623`: `.cycler-word-1 { animation-delay: 1.1s }`, `.cycler-word-2 { animation-delay: 2.3s }`, `.cycler-word-3 { animation-delay: 3.5s }`; the final word rule (today `.cycler-word-4`, the one that stays) becomes `.cycler-word-3` with the "rest" keyframes; delete `.cycler-word-4`/`-5` rules and the reduced-motion `display:none` list becomes `-1, -2`. JS `HERO_THEME_SEQUENCE` → `[{theme:'midnight',at:1000},{theme:'halftone',at:2200},{theme:'creme',at:3400}]`; the intro-mode lift (`6300`) → `4300`; the word-measuring loop iterates 3 words. `THEMES` (manual cycle) stays `['midnight','creme','halftone','strawberry-kitty']`.

- [ ] **Step 5: Hero CSS** — `.hero-sub{max-width:720px;margin:18px auto 0;font-size:20px;line-height:1.5;color:var(--text-secondary);text-align:center}`. No buttons; keep `#floating-cta` ("Download ↓") exactly as it is today.

- [ ] **Step 6: Look** — `python3 -m http.server 8765 --directory docs` and capture with `node /home/destin/youcoded-dev/scripts/ui-review/site-fullpage.mjs` (create it from the scratchpad `fullshot.mjs` used on 2026-08-27: navigate, wait 6 s, scroll through, capture full page at 1440 and 390). Check: three words cycle, page rests on crème with "Yours.", the sentence sits under it, the floating Download pill still appears, nothing overlaps at 390.

- [ ] **Step 7: Commit** `git add docs/index.html && git commit -m "feat(site): YouCoded Assistant wordmark, three-state hero, CTA buttons"` (+ trailers).

### Task 11: Live embed section

**Files:**
- Modify: `docs/index.html` — insert `<section id="see-it">` AFTER the About section (hero → About → embed → rows); CSS; JS

- [ ] **Step 1: Markup** (after the About `</section>` and its divider — the embed sits below "What is this?"):
```html
<section class="embed-section" id="see-it">
  <div class="container">
    <div class="section-label">Try it</div>
    <h2 class="section-title">Click around, I guess.</h2>
    <p class="section-desc">Type a message, open the model picker, or switch the theme. This demo is a pixel-perfect representation of the real app's interface.</p>
    <div class="embed-frame">
      <div class="embed-titlebar"><span></span><span></span><span></span></div>
      <div class="embed-stage">
        <img class="embed-poster" src="media/row1-any-ai.webp" alt="YouCoded Assistant chat window" width="1440" height="900">
        <button class="embed-start" type="button">Start the demo</button>
        <iframe class="embed-iframe" title="YouCoded Assistant live demo" loading="lazy" data-src="site/index.html?mode=workbench&amp;child=1&amp;scenario=site&amp;latency=150&amp;reply=demo"></iframe>
      </div>
      <div class="embed-swatches" role="group" aria-label="Change the theme">
        <button data-theme="midnight" style="--sw:#0b1020">Midnight</button>
        <button data-theme="creme" style="--sw:#f3e8d8">Crème</button>
        <button data-theme="light" style="--sw:#f4f4f5">Light</button>
        <button data-theme="dark" style="--sw:#18181b">Dark</button>
        <button data-theme="halftone-dimension" style="--sw:#2a1638">Halftone</button>
        <button data-theme="meadow-mist" style="--sw:#6fa3c9">Meadow Mist</button>
        <button data-theme="golden-sunbreak" style="--sw:#c98a2e">Golden Sunbreak</button>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: CSS**
```css
.embed-frame{border-radius:16px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.28);border:1px solid var(--border);background:#0b1020}
.embed-titlebar{display:flex;gap:6px;padding:10px 12px;background:rgba(255,255,255,.06)}
.embed-titlebar span{width:11px;height:11px;border-radius:50%;background:rgba(255,255,255,.25)}
.embed-stage{position:relative;aspect-ratio:16/10}
.embed-poster,.embed-iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.embed-iframe{opacity:0;transition:opacity .35s}
.embed-frame.live .embed-iframe{opacity:1}
.embed-frame.live .embed-poster,.embed-frame.live .embed-start{display:none}
.embed-start{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:14px 26px;border-radius:999px;font-weight:600;background:var(--title-highlight);color:#fff;border:0;cursor:pointer}
.embed-swatches{display:flex;flex-wrap:wrap;gap:8px;padding:12px;background:rgba(255,255,255,.04)}
.embed-swatches button{display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;border:1px solid var(--border);background:transparent;color:inherit;cursor:pointer;font-size:13px}
.embed-swatches button::before{content:"";width:12px;height:12px;border-radius:50%;background:var(--sw);border:1px solid rgba(0,0,0,.2)}
.embed-swatches button[aria-pressed=true]{outline:2px solid var(--title-highlight)}
@media (max-width:768px){.embed-stage{aspect-ratio:4/3}}
```
The iframe renders at the stage's real pixel width; on phones the app's own narrow layout kicks in (that is the point of an iframe — `WorkbenchFrame.tsx:10-28`).

- [ ] **Step 3: JS** (in the page script)
```js
(function () {
  var frame = document.querySelector('.embed-frame'); if (!frame) return;
  var iframe = frame.querySelector('.embed-iframe'), start = frame.querySelector('.embed-start');
  var theme = 'midnight', live = false;
  function boot() {
    if (live) return; live = true;
    // Same-origin: preset the app's theme before it boots (index.tsx:12 reads this key).
    iframe.addEventListener('load', function () { frame.classList.add('live'); });
    iframe.src = iframe.dataset.src + '#t=' + theme;
    try { iframe.contentWindow.localStorage.setItem('youcoded-theme', theme); } catch (e) {}
  }
  start.addEventListener('click', boot);
  // Also boot when the visitor scrolls it into view, unless they asked for less motion.
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) boot(); }); }, { threshold: 0.6 }).observe(frame);
  }
  frame.querySelectorAll('.embed-swatches button').forEach(function (b) {
    b.addEventListener('click', function () {
      theme = b.dataset.theme;
      frame.querySelectorAll('.embed-swatches button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      if (!live) return;
      // Theme lives in the app's localStorage; a reload applies it (assets are cached, so it is ~instant).
      frame.classList.remove('live');
      try { iframe.contentWindow.localStorage.setItem('youcoded-theme', theme); } catch (e) {}
      iframe.contentWindow.location.reload();
    });
  });
})();
```
The `localStorage` write before `src` is set targets `about:blank`'s origin, not the site's — so the first boot's theme comes from the app default (`midnight`), which is also the first swatch; the swatch path sets it on the real origin. Keep the pre-boot `try` anyway; it is harmless.

- [ ] **Step 4: Verify** — serve `docs/` on 8765, headless: navigate, click `.embed-start`, wait 4 s, `expect` `document.querySelector('.embed-frame.live')`, screenshot; click the `creme` swatch, wait 3 s, screenshot — the iframe's background must be crème. Use `shot.mjs` with a one-off plan whose `base` is `http://127.0.0.1:8765/index.html` (theme argument irrelevant — pass `midnight`).

- [ ] **Step 5: Commit** `git add docs/index.html && git commit -m "feat(site): live embed of the real app with theme swatches"` (+ trailers).

### Task 12: "What is this?" + the nine showcase rows

**Files:**
- Modify: `docs/index.html` — About (`:2696-2710`), replace the demo section (`:2711-3240`) entirely; CSS for `.row-media`, `.phone-bezel`, `.roadmap-mock`; JS for video play/pause; delete the `runDemo()` / `#mock-c4` IIFE and the integrations `data-desc` handler from the script.

- [ ] **Step 1: About copy** — replace the three paragraphs inside `.intro-box` with:
```html
<p>YouCoded is a fully-customizable AI assistant that works with your own files and data to autonomously accomplish tasks. Review and organize large spreadsheets, compile the latest medical or financial research, draft an email or slideshow, or build new features in large coding projects. With YouCoded, you can utilize OpenRouter to access any AI model from any provider including Anthropic (Claude), OpenAI (ChatGPT), Alibaba (Qwen) and more. YouCoded also allows you to download and run open source AI models on your own device, if your hardware supports it. YouCoded is built to become a fully-modular and open source assistant platform, as the app itself integrates the ability for all users to build and share skills, tools, themes, and app improvements. Because YouCoded was designed from the ground up to improved by individuals with no coding or development interest, it can quickly outpace development of competing closed agents in a way that is driven by what users really want.</p>
<p class="permission-note">Nothing happens without your permission. YouCoded Assistant asks before it acts.</p>
```

- [ ] **Step 2: Row template** — every row is:
```html
<div class="showcase-item[ reverse]" id="row-N">
  <div class="showcase-text">
    <div class="showcase-label">LABEL</div>
    <h3 class="showcase-title">HEADLINE</h3>
    <p class="showcase-desc">BODY</p>
  </div>
  <div class="row-media">
    <video class="row-video" muted loop playsinline preload="none" poster="media/FILE.webp" width="1440" height="900" aria-label="ALT">
      <source src="media/FILE.webm" type="video/webm">
    </video>
  </div>
</div>
```
Rows and their strings (LABEL · HEADLINE · BODY · FILE):
1. `Seamless integration` · `Tools and conversations work across any model.` · `Select from hundreds of models via OpenRouter, use Claude Code with your subscription plan, or pick an offline, private model to run on your own computer. Switch models mid-conversation without interruption.` · `row1-any-ai`
2. `Genuinely useful` · `Give it a task and it does real work, with boundaries you can trust.` · `It reads your files, writes new ones, develops repeatable skills and workflows, searches the web, and helps you manage your computer and your life more efficiently. Permission modes let you restrict the model to match your level of comfort.` · `row2-does-things`
3. `Logical management` · `Project view keeps your files, conversations, and assistant instructions organized.` · `Open spreadsheets, documents, and images, revisit prior conversations, and see how your assistant is instructed to behave in each project.` · `row3-projects`
4. `Stay organized` · `Tags, notes, and shortcuts.` · `Tag and annotate conversations, pin the ones that matter, and hide the ones you'll never go back to. Quick chips run the prompts you use every day in one tap.` · `row4-organized`
5. `Works everywhere` · `Start on your laptop. Finish on your phone.` · `Windows, macOS, Linux, Android, and any browser. Your conversations and files stay in sync through your own private GitHub, so what you started here is waiting there.` · `row5-follow` (+ phone, see Step 4)
6. `Make it yours` · `Describe a look. Install a plugin. Share both.` · `Build a theme by describing it — customize wallpapers, app colors, mascots. Browse 300+ plugins from the marketplace: journaling, a personal encyclopedia, calendar and email integrations, and whatever your friends publish.` · `row6-yours`
7. `Play while it works` · `Challenge a friend while it thinks.` · `Long tasks take a minute. Play Connect Four with a friend in the side panel, see who's online, and get back to the answer when it's ready.` · `row7-play`
8. `For builders` · `Made to be customized and work with you.` · `Run Claude Code as a first-class session next to the app's own agent. Review, stage, and commit changes without leaving the window. Connect tools over MCP. Download and run local models with a GPU-fit check.` · `row8-builders`
9. Roadmap row — see Step 5.

- [ ] **Step 3: Video play/pause JS**
```js
(function () {
  var vids = document.querySelectorAll('.row-video'); if (!vids.length) return;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;   // poster only
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      var v = e.target;
      if (e.isIntersecting) { if (v.preload === 'none') v.preload = 'auto'; v.play().catch(function () {}); }
      else v.pause();
    });
  }, { threshold: 0.35 });
  vids.forEach(function (v) { io.observe(v); });
})();
```
CSS: `.row-media{border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25);border:1px solid var(--border);background:#0b1020}.row-video{display:block;width:100%;height:auto}`. Reuse the existing `.showcase-item` grid/alternation rules unchanged.

- [ ] **Step 4: Row 5 composition** — `.row-media` for row 5 holds two videos:
```html
<div class="row-media row-media-duo">
  <video class="row-video" … poster="media/row5-follow.webp"><source src="media/row5-follow.webm" type="video/webm"></video>
  <div class="phone-bezel"><video class="row-video" … poster="media/row5-phone.webp"><source src="media/row5-phone.webm" type="video/webm"></video></div>
</div>
```
CSS: `.row-media-duo{position:relative;background:transparent;box-shadow:none;border:0;overflow:visible}.phone-bezel{position:absolute;right:-4%;bottom:-6%;width:24%;border-radius:22px;padding:6px;background:#111;box-shadow:0 20px 50px rgba(0,0,0,.35)}.phone-bezel .row-video{border-radius:16px}`.

- [ ] **Step 5: Roadmap row** (no video — a drawn sketch, dashed, clearly a plan):
```html
<div class="showcase-item reverse" id="row-9">
  <div class="showcase-text">
    <div class="showcase-label">Roadmap <span class="roadmap-chip">Coming after 1.3</span></div>
    <h3 class="showcase-title">Hand it off.</h3>
    <p class="showcase-desc">Set up a job once — what to do, which tools it may use, where to stop and check with you — then run it on a schedule or send it from your phone. Results and approvals land in an inbox. First: run now and scheduled runs. Later: kick off from an incoming email or a changed file.</p>
  </div>
  <div class="row-media roadmap-mock" aria-label="Sketch of the planned Agents view">
    <div class="rm-side"><div class="rm-h">Agents</div><div class="rm-item rm-on">Weekly grocery list</div><div class="rm-item">Inbox digest · 7am</div><div class="rm-item">Receipts → spreadsheet</div></div>
    <div class="rm-main">
      <div class="rm-title">Weekly grocery list <span class="rm-pill">Sundays 6pm</span></div>
      <div class="rm-step">1 · Read this week's plan</div><div class="rm-step">2 · Draft the list</div><div class="rm-step rm-check">3 · Check with me before ordering</div><div class="rm-step">4 · Send to my phone</div>
      <div class="rm-inbox"><div class="rm-h">Inbox</div><div class="rm-row">Needs approval · Weekly grocery list · 2 min ago</div><div class="rm-row rm-dim">Done · Inbox digest · 7:02am</div></div>
    </div>
    <div class="rm-phone">Run now ▸</div>
  </div>
</div>
```
CSS: `.roadmap-mock{display:grid;grid-template-columns:30% 1fr;gap:12px;padding:16px;aspect-ratio:16/10;background:transparent;border:2px dashed var(--border);box-shadow:none;position:relative;font-family:var(--font-mono);font-size:12px}.rm-h{opacity:.6;text-transform:uppercase;font-size:10px;letter-spacing:.08em;margin-bottom:8px}.rm-item,.rm-step,.rm-row{border:1.5px dashed var(--border);border-radius:8px;padding:8px 10px;margin-bottom:6px}.rm-on{border-style:solid}.rm-check{border-color:var(--title-highlight)}.rm-title{font-weight:700;margin-bottom:10px}.rm-pill{border:1.5px dashed var(--border);border-radius:999px;padding:2px 8px;margin-left:6px;font-weight:400}.rm-inbox{margin-top:14px}.rm-dim{opacity:.5}.rm-phone{position:absolute;right:14px;bottom:14px;border:2px dashed var(--title-highlight);border-radius:14px;padding:10px 14px}.roadmap-chip{margin-left:8px;border:1px solid var(--title-highlight);color:var(--title-highlight);border-radius:999px;padding:1px 8px;font-size:10px}`.

- [ ] **Step 6: Delete** the `runDemo()` function + its IntersectionObserver, the `#mock-c4` board IIFE, the `integration-tag` click handler, and every `.mock-*` CSS rule that no remaining markup uses (`grep -c "mock-" docs/index.html` must go to 0 after; the `.mock-stage` scaling rule is gone with them).

- [ ] **Step 7: Verify** — full-page capture at 1440 and 390 (Task 10 Step 6 script); every `<video>` has a poster visible; headless check that scrolling plays: `shot.mjs` plan with `{"eval":"document.querySelector('#row-2').scrollIntoView()"}`, wait 2000, `expect: "js:!document.querySelector('#row-2 video').paused"`.

- [ ] **Step 8: Commit** `git add docs/index.html && git commit -m "feat(site): nine showcase rows with recorded loops of the real app; roadmap row drawn, not recorded"` (+ trailers).

### Task 13: Story, Get started, Download, FAQ, Gallery, Footer, og-image, dead CSS

**Files:**
- Modify: `docs/index.html` — story (`:3241-3255`), prerequisites (`:3256-3299`), download (`:3300-3341`), FAQ (`:3342-3416`), gallery (`:3417-3437`), install modal "After install" `<details>`
- Create: `docs/og-image.png`

- [ ] **Step 1: Story** — keep both paragraphs; append:
```html
<p>YouCoded Assistant is what that kind of AI looks like when it's built for everyone — not just the people who already know how to use it.</p>
```

- [ ] **Step 2: Get started** — section id `get-started`; title `You may need a few accounts.`; four `.prereq-card`s in this order (reuse the existing card markup and badge classes):
1. **GitHub** [Required] [Free] — `Keeps your conversations and files in sync across devices and delivers marketplace updates. Sign up with your Google or Apple account.` → `Create a GitHub account →`
2. **Anthropic** [Optional] [Paid] — `A Claude Pro or Max plan lets you use Claude — the model YouCoded was built with.` → `See Claude plans →`
3. **OpenRouter** [Optional] [Pay as you go] — `One account provides access to hundreds of models from every AI company. Pay only for what you use.` → `Create an OpenRouter account →`
4. **Google or Apple** [Optional] [Free] — `An extra copy of your data in Google Drive or iCloud, on top of GitHub.` → no link
Line under the cards: `Or skip the paid ones entirely — run a model on your own computer, free and offline.`
Grid CSS: the current three-column grid becomes `grid-template-columns:repeat(auto-fit,minmax(220px,1fr))`.

- [ ] **Step 3: Download** — note line becomes `Free and open source. On iPhone? Use YouCoded Assistant from Safari by connecting to any computer running the app.`; in the install modal's shared "After install" `<details>`, the three steps become: `Sign in with GitHub.` · `Choose where your AI comes from — Claude, OpenRouter, or a model on this computer (Settings → Model Providers).` · `Pick a theme and browse the marketplace.` Android extra line keeps the runtime-download note only if 1.3.0 still downloads a runtime on first launch (check `app/` — `rg -n "runtime" app/src/main/java --max-count 3`); otherwise delete it.

- [ ] **Step 4: FAQ** — seven items:
1. `How is this different from ChatGPT or claude.ai?` — `Those are chat websites. YouCoded Assistant is an app on your computer and phone that works in your own files — it opens, edits, and organizes them, runs tasks, and searches the web — and you choose the AI behind it: Claude, hundreds of cloud models, or one that runs locally for free.`
2. `Do I have to pay for anything?` — `No. The app is free and open source. A model that runs on your own computer costs nothing. If you want Claude, that's a Claude Pro or Max plan from Anthropic; if you want other cloud models, OpenRouter bills per use.`
3. `Is my data private?` — `Your conversations, files, and settings live in your own GitHub (and, if you add them, your Google Drive or iCloud). Cloud models see what you send them while they work; a local model sends nothing anywhere. The app sends one anonymous daily ping — a hash of your device ID, the app version, platform, and rough region — so we can see how many people use it. No IP address, no username, no message content. Turn it off in Settings → About → Privacy.`
4. `What platforms does it run on?` — `Windows, macOS, Linux, and Android, plus any web browser by connecting to a computer running the app. Apple integrations (iMessage, Apple Notes, and so on) work on macOS only.`
5. `Do I need to know how to code?` — `No. The whole app was built by someone who has never written code, by talking to AI. If you can use ChatGPT, you can use this.`
6. `Is "agentic" AI safe?` — `The app asks before it changes anything, and every standing permission you grant is listed on one screen where you can revoke it. AI still makes mistakes, so keep an eye on what it's doing — and be careful with full-auto mode, which lets it act without asking.`
7. `Who built this?` — keep the current answer verbatim.

- [ ] **Step 5: Gallery** — keep the section; replace the seven `<img>`s with the WebPs `site-assets.sh` produced (`ls docs/gallery/*.webp`), alt text `YouCoded Assistant — <surface> in the <Theme> theme`.

- [ ] **Step 6: og-image** — `magick docs/gallery/home-midnight.webp -resize 1200x630^ -gravity center -extent 1200x630 -fill white -font DejaVu-Sans-Bold -pointsize 64 -gravity southwest -annotate +48+48 "YouCoded Assistant" -pointsize 30 -annotate +48+128 "AI for Everyone." docs/og-image.png` then `ls -la docs/og-image.png` (< 400 KB).

- [ ] **Step 7: Dead CSS** — delete the rules for `.hero-tagline`, `.hero-platforms`, `.hero-btn`, `.hero-highlights`, `.hero-mini-mockup`, `.steps-flow`, `.step-item`, `.features-grid`, `.android-pitch`, `.android-stack`, `.android-gate`, and the JS that un-hides `.android-gate`. Check each with `grep -c "<classname>" docs/index.html` → exactly the CSS occurrences you are deleting, no markup.

- [ ] **Step 8: Verify + commit** — full-page captures at 1440/390; `git add docs/index.html docs/og-image.png docs/gallery && git commit -m "feat(site): story, accounts (GitHub required; Anthropic/OpenRouter/Google optional), download, FAQ, gallery, og-image"` (+ trailers).

### Task 14: Apply Destin's copy review, final verification, hand-off

- [ ] **Step 1:** Apply every edit from Destin's markup of `copy.md` to `index.html` (and back into `copy.md` so it stays the record). Commit both.
- [ ] **Step 2: Page-weight check** — with `docs/` served on 8765: `node -e` a fetch of `index.html`, its `<link>`/`<script>`/`<img>` referenced files, and the `.webp` posters (not the videos, not the embed), sum `content-length`; **must be < 1.5 MB**. Videos and the embed load on demand only.
- [ ] **Step 3: Downloads still resolve** — headless: navigate, wait 3 s, `expect: "js:/releases\\/download\\//.test(document.querySelector('#dl-linux').href)"`.
- [ ] **Step 4: Link preview** — `curl -sI http://127.0.0.1:8765/og-image.png | head -1` → `200`.
- [ ] **Step 5: Desktop suite** — `bash scripts/verify.sh worktrees/site-rebuild` passes; `node scripts/workbench-boot-check.mjs 5473` passes against the **static** `docs/site` build (Task 1 Step 4).
- [ ] **Step 6: Push the branch** (`git push -u origin site/1.3-rebuild`) and open a PR titled `site: rebuild for 1.3.0 — YouCoded Assistant` with the four "before" captures from 2026-08-27 and the new full-page captures. **Do not merge** — the site goes live when Destin says the 1.3.0 story is public. Stop the workbench on 5473 and the static server.
- [ ] **Step 7:** Move `docs/active/specs/2026-08-27-landing-page-rebuild-design.md` and this plan to `docs/archive/` **only after** the PR merges; until then flip nothing.
