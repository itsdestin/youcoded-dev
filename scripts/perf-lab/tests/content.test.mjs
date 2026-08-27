// Tests for the perf-lab realistic content generator.
//
// Run:  node --test scripts/perf-lab/tests/content.test.mjs
// NOTE: `node --test <dir>/` fails on this Node — always name the file or use a glob.
//
// The load-bearing test in here is `real parser` below: it imports the app's
// OWN COMPILED loadHistory and runs it against a transcript this generator
// wrote. Everything else can pass while the fixture is silently rejected by the
// app, which is the exact failure mode this file exists to prevent.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  assistantContentBlocks,
  realisticTurn,
  realisticTranscriptLines,
  toolResultContentBlocks,
  MIX,
  KINDS,
  messagesPerTurn,
} from '../content.mjs';

const CWD = '/tmp/perf-fixture/projects/alpha';
const SESSION = '11111111-2222-3333-4444-555555555555';
const STARTED = 1750000000000;

const turnArgs = (index, extra = {}) => ({
  index, seed: 'perf-lab', cwd: CWD, sessionId: SESSION,
  parentUuid: null, startedAt: STARTED, ...extra,
});

// ---------------------------------------------------------------------------
describe('determinism', () => {
  test('same seed + index produces byte-identical lines', () => {
    for (const i of [0, 1, 2, 3, 7, 41, 500]) {
      const a = realisticTurn(turnArgs(i));
      const b = realisticTurn(turnArgs(i));
      assert.deepEqual(a.lines, b.lines, `turn ${i} differed between two calls`);
      assert.equal(a.lastUuid, b.lastUuid);
      assert.equal(a.kind, b.kind);
    }
  });

  test('a whole transcript is byte-identical across builds', () => {
    const one = realisticTranscriptLines({ sessionId: SESSION, cwd: CWD, turns: 120, startedAt: STARTED }).join('\n');
    const two = realisticTranscriptLines({ sessionId: SESSION, cwd: CWD, turns: 120, startedAt: STARTED }).join('\n');
    assert.equal(one, two);
    assert.equal(Buffer.byteLength(one), Buffer.byteLength(two));
  });

  test('a different seed produces different bytes (the PRNG is actually seeded)', () => {
    const a = realisticTranscriptLines({ sessionId: SESSION, cwd: CWD, turns: 30, startedAt: STARTED, seed: 'a' }).join('\n');
    const b = realisticTranscriptLines({ sessionId: SESSION, cwd: CWD, turns: 30, startedAt: STARTED, seed: 'b' }).join('\n');
    assert.notEqual(a, b);
  });

  test('assistantContentBlocks is deterministic per (kind, seed)', () => {
    for (const kind of KINDS) {
      const a = JSON.stringify(assistantContentBlocks(kind, 'k:9'));
      const b = JSON.stringify(assistantContentBlocks(kind, 'k:9'));
      assert.equal(a, b, `kind ${kind} was not deterministic`);
    }
  });

  test('no run-to-run entropy source is used', () => {
    const raw = fs.readFileSync(new URL('../content.mjs', import.meta.url), 'utf8');
    // The file's own comments legitimately NAME these as the things it avoids,
    // and one generator emits the literal text "Date.now()" INSIDE a fenced
    // code sample. Only a real call is a defect, so strip comments and template
    // literals before looking. (Crude but sufficient: this file has no regex
    // literal or string containing '//'.)
    const src = raw
      .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments
      .replace(/^\s*\/\/.*$/gm, ' ')          // whole-line // comments
      .replace(/`(?:\\.|[^`\\])*`/g, '\'\'');  // template literals (code samples)
    assert.equal(/Math\.random\s*\(/.test(src), false, 'Math.random() is called');
    assert.equal(/Date\.now\s*\(/.test(src), false, 'Date.now() is called');
    assert.equal(/crypto|randomUUID|randomBytes/.test(src), false, 'a crypto entropy source is referenced');
  });
});

// ---------------------------------------------------------------------------
describe('MIX', () => {
  test('weights sum to 100 and every kind is generatable', () => {
    assert.equal(MIX.reduce((n, e) => n + e.weight, 0), 100);
    for (const e of MIX) {
      assert.ok(e.why && e.why.length > 10, `MIX entry ${e.kind} has no stated reasoning`);
      assert.ok(KINDS.includes(e.kind));
    }
  });

  test('every kind is actually selected across a realistic run, in roughly its weight', () => {
    const counts = Object.fromEntries(KINDS.map((k) => [k, 0]));
    const N = 4000;
    for (let i = 0; i < N; i++) counts[realisticTurn(turnArgs(i)).kind]++;
    for (const e of MIX) {
      const pct = (counts[e.kind] / N) * 100;
      assert.ok(counts[e.kind] > 0, `kind ${e.kind} never appeared in ${N} turns`);
      // Generous band: this asserts the mix is wired up, not that the PRNG is uniform.
      assert.ok(Math.abs(pct - e.weight) < 6, `kind ${e.kind}: ${pct.toFixed(1)}% vs weight ${e.weight}`);
    }
  });
});

// ---------------------------------------------------------------------------
describe('block shapes', () => {
  test('every kind returns a non-empty array of well-formed blocks', () => {
    for (const kind of KINDS) {
      const blocks = assistantContentBlocks(kind, `shape:${kind}`);
      assert.ok(Array.isArray(blocks) && blocks.length > 0, `${kind} returned no blocks`);
      for (const b of blocks) {
        assert.ok(typeof b.type === 'string', `${kind}: block has no type`);
        if (b.type === 'text') {
          assert.equal(typeof b.text, 'string');
          assert.ok(b.text.trim().length > 0, `${kind}: empty text block would be dropped by both parsers`);
        } else if (b.type === 'tool_use') {
          // transcript-watcher.ts:176-178 reads exactly these three.
          assert.equal(typeof b.id, 'string');
          assert.ok(b.id.startsWith('toolu_'));
          assert.equal(typeof b.name, 'string');
          assert.equal(typeof b.input, 'object');
          assert.notEqual(b.input, null);
        } else {
          assert.fail(`${kind}: unexpected block type ${b.type}`);
        }
      }
      // Every kind must carry at least one non-empty text block, or loadHistory
      // drops the whole message (session-browser.ts:714).
      assert.ok(blocks.some((b) => b.type === 'text' && b.text.trim()), `${kind} has no text block`);
    }
  });

  test('unknown kind throws with the real detail, not a silent fallback', () => {
    assert.throws(() => assistantContentBlocks('nope', 1), /unknown kind "nope".*Known kinds: prose, code, tool, diff, long_output/s);
  });

  test('code blocks are fenced with a language lowlight actually registers', () => {
    // Verified against this repo's lowlight `common` set: an unregistered tag
    // means rehype-highlight silently skips tokenization (detect defaults to
    // false), which would make the fixture cheaper than intended.
    const REGISTERED = new Set(['ts', 'tsx', 'js', 'jsx', 'json', 'bash', 'sh', 'shell', 'console', 'python', 'py', 'diff', 'text']);
    let seenLangs = new Set();
    let fences = 0;
    for (let i = 0; i < 800; i++) {
      const t = realisticTurn(turnArgs(i));
      for (const line of t.lines) {
        const parsed = JSON.parse(line);
        if (parsed.type !== 'assistant') continue;
        for (const b of parsed.message.content) {
          if (b.type !== 'text') continue;
          for (const m of b.text.matchAll(/^```([A-Za-z0-9+-]*)$/gm)) {
            fences++;
            if (m[1]) { seenLangs.add(m[1]); assert.ok(REGISTERED.has(m[1]), `fence language "${m[1]}" is not registered in lowlight common`); }
          }
        }
      }
    }
    assert.ok(fences > 100, `only ${fences} fenced blocks in 800 turns — the code kinds are not firing`);
    for (const want of ['ts', 'tsx', 'js', 'json', 'bash', 'python', 'diff']) {
      assert.ok(seenLangs.has(want), `language ${want} never appeared across 800 turns`);
    }
  });

  test('code block bodies are 10-80 lines', () => {
    let checked = 0;
    for (let i = 0; i < 400; i++) {
      for (const line of realisticTurn(turnArgs(i)).lines) {
        const parsed = JSON.parse(line);
        if (parsed.type !== 'assistant') continue;
        for (const b of parsed.message.content) {
          if (b.type !== 'text') continue;
          // Only these six tags carry GENERATED CODE bodies. ```console (log
          // dump) and the bare fence (stack trace) are quoted OUTPUT and have
          // their own size contract, so they are excluded here on purpose.
          const re = /```(ts|tsx|js|json|bash|python)\n([\s\S]*?)\n```/g;
          for (const m of b.text.matchAll(re)) {
            const n = m[2].split('\n').length;
            assert.ok(n >= 10 && n <= 80, `${m[1]} block had ${n} lines, expected 10-80`);
            checked++;
          }
        }
      }
    }
    assert.ok(checked > 50, `only ${checked} code bodies checked`);
  });

  test('diff turns emit both a structuredPatch and a ```diff fence', () => {
    let found = 0;
    for (let i = 0; i < 400 && found < 5; i++) {
      const t = realisticTurn(turnArgs(i));
      if (t.kind !== 'diff') continue;
      found++;
      const parsedLines = t.lines.map((l) => JSON.parse(l));
      const patchLine = parsedLines.find((p) => p.toolUseResult?.structuredPatch);
      assert.ok(patchLine, 'diff turn has no toolUseResult.structuredPatch');
      for (const h of patchLine.toolUseResult.structuredPatch) {
        // StructuredPatchHunk, src/shared/types.ts:353-365
        for (const k of ['oldStart', 'oldLines', 'newStart', 'newLines']) assert.equal(typeof h[k], 'number');
        assert.ok(Array.isArray(h.lines) && h.lines.length > 0);
        for (const l of h.lines) assert.ok([' ', '-', '+'].includes(l[0]), `patch line does not start with ' '/'-'/'+': ${JSON.stringify(l)}`);
      }
      const answer = parsedLines.at(-1);
      assert.match(answer.message.content[0].text, /```diff\n--- a\//);
    }
    assert.ok(found >= 5, `only ${found} diff turns found in 400`);
  });

  test('tool_result lines carry tool_use_id and match a preceding tool_use', () => {
    let pairs = 0;
    for (let i = 0; i < 300; i++) {
      const parsedLines = realisticTurn(turnArgs(i)).lines.map((l) => JSON.parse(l));
      const ids = new Set();
      for (const p of parsedLines) {
        if (p.type === 'assistant') for (const b of p.message.content) if (b.type === 'tool_use') ids.add(b.id);
        if (p.type === 'user' && Array.isArray(p.message.content)) {
          for (const b of p.message.content) {
            if (b.type !== 'tool_result') continue;
            // transcript-watcher.ts:90-92
            assert.equal(typeof b.tool_use_id, 'string');
            assert.equal(typeof b.content, 'string');
            assert.ok(b.content.length > 0);
            assert.equal(typeof b.is_error, 'boolean');
            assert.ok(ids.has(b.tool_use_id), 'tool_result has no matching tool_use in the same turn');
            pairs++;
          }
        }
      }
    }
    assert.ok(pairs > 100, `only ${pairs} tool pairs in 300 turns`);
  });

  test('toolResultContentBlocks surfaces is_error faithfully', () => {
    assert.equal(toolResultContentBlocks('toolu_x', 'boom', { isError: true })[0].is_error, true);
    assert.equal(toolResultContentBlocks('toolu_x', 'ok')[0].is_error, false);
  });

  test('long_output turns really do carry a wall of text in ASSISTANT TEXT', () => {
    // WHY assert on assistant text and not the tool result: ToolCard.tsx:1083
    // does not mount a collapsed tool body, so a payload that lives only in a
    // tool_result costs the renderer nothing.
    let found = 0;
    for (let i = 0; i < 400 && found < 5; i++) {
      const t = realisticTurn(turnArgs(i));
      if (t.kind !== 'long_output') continue;
      found++;
      const answer = JSON.parse(t.lines.at(-1));
      const text = answer.message.content.map((b) => b.text).join('');
      assert.ok(text.length > 2000, `long_output answer text was only ${text.length} chars`);
    }
    assert.ok(found >= 5);
  });
});

// ---------------------------------------------------------------------------
describe('turn structure and uuids', () => {
  test('uuids are unique across 2000 turns and RFC-4122 v4 shaped', () => {
    const seen = new Set();
    const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    let parent = null, total = 0;
    for (let i = 0; i < 2000; i++) {
      const t = realisticTurn(turnArgs(i, { parentUuid: parent }));
      for (const line of t.lines) {
        const p = JSON.parse(line);
        assert.match(p.uuid, V4, `bad uuid shape: ${p.uuid}`);
        assert.equal(seen.has(p.uuid), false, `duplicate uuid ${p.uuid} at turn ${i}`);
        seen.add(p.uuid);
        if (p.promptId) assert.match(p.promptId, V4);
        total++;
      }
      parent = t.lastUuid;
    }
    assert.equal(seen.size, total);
  });

  test('parentUuid chains: first line points at the caller-supplied parent, lastUuid is the final line', () => {
    let parent = null;
    for (let i = 0; i < 50; i++) {
      const t = realisticTurn(turnArgs(i, { parentUuid: parent }));
      const parsed = t.lines.map((l) => JSON.parse(l));
      assert.equal(parsed[0].parentUuid, parent, `turn ${i} first line does not chain`);
      for (let j = 1; j < parsed.length; j++) {
        assert.equal(parsed[j].parentUuid, parsed[j - 1].uuid, `turn ${i} line ${j} does not chain`);
      }
      assert.equal(t.lastUuid, parsed.at(-1).uuid);
      parent = t.lastUuid;
    }
  });

  test('exactly one end_turn assistant line and one promptId user line per turn', () => {
    for (let i = 0; i < 500; i++) {
      const parsed = realisticTurn(turnArgs(i)).lines.map((l) => JSON.parse(l));
      const endTurns = parsed.filter((p) => p.type === 'assistant' && p.message.stop_reason === 'end_turn');
      const prompts = parsed.filter((p) => p.type === 'user' && p.promptId && !p.isMeta);
      assert.equal(endTurns.length, 1, `turn ${i} had ${endTurns.length} end_turn lines`);
      assert.equal(prompts.length, 1, `turn ${i} had ${prompts.length} prompt lines`);
      // Every non-final assistant line must be stop_reason 'tool_use', or
      // loadHistory would count it and transcript-watcher would fire a bogus
      // turn-complete (transcript-watcher.ts:219).
      for (const p of parsed.filter((x) => x.type === 'assistant')) {
        assert.ok(['end_turn', 'tool_use'].includes(p.message.stop_reason));
      }
      assert.equal(parsed.at(-1).message.stop_reason, 'end_turn');
    }
  });

  test('every line is valid JSON on ONE line with no NUL bytes', () => {
    // loadHistory splits on '\n' and discards any line containing \x00
    // (session-browser.ts:676-678). A newline inside a line would corrupt the file.
    for (let i = 0; i < 300; i++) {
      for (const line of realisticTurn(turnArgs(i)).lines) {
        assert.equal(line.includes('\n'), false, 'a JSONL line contains a raw newline');
        assert.equal(line.includes('\x00'), false, 'a JSONL line contains a NUL byte');
        JSON.parse(line);
      }
    }
  });

  test('bad arguments produce a specific error, never a silent default', () => {
    assert.throws(() => realisticTurn(turnArgs(-1)), /index must be a non-negative integer, got -1/);
    assert.throws(() => realisticTurn(turnArgs(0, { sessionId: '' })), /sessionId must be a non-empty string/);
    assert.throws(() => realisticTurn(turnArgs(0, { cwd: '' })), /cwd must be a non-empty string/);
    assert.throws(() => realisticTurn(turnArgs(0, { startedAt: NaN })), /startedAt must be a finite epoch-ms number/);
  });
});

// ---------------------------------------------------------------------------
// The real parser.
// ---------------------------------------------------------------------------
describe('real parser (youcoded/desktop/dist/main/session-browser.js)', () => {
  const DIST = path.resolve(
    new URL('../../..', import.meta.url).pathname,
    'youcoded/desktop/dist/main/session-browser.js',
  );

  test('loadHistory returns exactly 2 x turns messages, in order, with our content', async (t) => {
    if (!fs.existsSync(DIST)) {
      t.skip(`compiled parser absent at ${DIST} — cannot run the REAL loadHistory`);
      return;
    }
    // PROJECTS_DIR is computed at module load from os.homedir(), which honours
    // $HOME on POSIX (dist/main/session-browser.js:11-12). Point HOME at a temp
    // dir BEFORE requiring, so this test never reads or writes the real
    // ~/.claude — a live perf-lab measurement run must not be disturbed.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-content-'));
    const realHome = process.env.HOME;
    process.env.HOME = home;
    try {
      const cwd = path.join(home, 'projects', 'alpha');
      const slug = cwd.replace(/[^a-zA-Z0-9]/g, '-');   // ccProjectSlug, fixture.mjs:52
      const dir = path.join(home, '.claude', 'projects', slug);
      fs.mkdirSync(dir, { recursive: true });

      const turns = 200;
      const body = realisticTranscriptLines({ sessionId: SESSION, cwd, turns, startedAt: STARTED }).join('\n') + '\n';
      fs.writeFileSync(path.join(dir, `${SESSION}.jsonl`), body);

      const require = createRequire(import.meta.url);
      const { loadHistory } = require(DIST);

      const all = await loadHistory(SESSION, slug, 0, true);
      assert.equal(all.length, messagesPerTurn * turns,
        `the REAL loadHistory kept ${all.length} of ${messagesPerTurn * turns} expected messages`);

      // Alternating user/assistant, in file order.
      for (let i = 0; i < all.length; i++) {
        assert.equal(all[i].role, i % 2 === 0 ? 'user' : 'assistant', `message ${i} had role ${all[i].role}`);
        assert.ok(all[i].content.trim().length > 0);
      }
      // The parser must have carried our EXPENSIVE content through, not just prose.
      const assistantText = all.filter((m) => m.role === 'assistant').map((m) => m.content).join('\n');
      assert.ok(assistantText.includes('```'), 'no fenced code survived loadHistory');
      assert.ok(/```(ts|tsx|js|json|bash|python)\n/.test(assistantText), 'no language-tagged fence survived');
      assert.ok(assistantText.includes('```diff'), 'no diff fence survived');

      const last10 = await loadHistory(SESSION, slug, 10, false);
      assert.equal(last10.length, 10);
    } finally {
      if (realHome === undefined) delete process.env.HOME; else process.env.HOME = realHome;
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
