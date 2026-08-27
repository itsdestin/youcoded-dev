// Unit tests for scenario-artifacts.mjs — everything checkable without an app.
//
// WHY these exist: this scenario cannot be smoke-tested until a packaged build
// and Xvfb are available, and its riskiest content is JavaScript SOURCE living
// inside template literals that only get parsed when CDP evaluates them. A typo
// there fails at run time with an opaque "evaluate threw" and no line number.
// So the two things tested here are (a) the deterministic fixture builders and
// the pure summarising/attribution helpers, and (b) that every in-page
// expression the module emits is syntactically valid JavaScript — checked with
// new Function, which parses without executing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rng32, buildCodeArtifact, buildMarkdownArtifact, buildHtmlArtifact,
  summarise, attributeStall, keyEventsFor, ratio,
  installArtifactHelpers, registerArtifacts,
} from '../scenario-artifacts.mjs';

// ---------------------------------------------------------------------------
// Deterministic fixture builders
// ---------------------------------------------------------------------------

test('rng32 is deterministic per seed and differs across seeds', () => {
  const a = Array.from({ length: 5 }, rng32(7));
  const b = Array.from({ length: 5 }, rng32(7));
  const c = Array.from({ length: 5 }, rng32(8));
  assert.deepEqual(a, b, 'the same seed must produce the same stream');
  assert.notDeepEqual(a, c);
  for (const n of a) assert.ok(n >= 0 && n < 1, `out of range: ${n}`);
});

test('buildCodeArtifact is byte-identical run to run and hits its size target', () => {
  const a = buildCodeArtifact({ approxBytes: 20000, seed: 11 });
  const b = buildCodeArtifact({ approxBytes: 20000, seed: 11 });
  // Byte-identity is the whole point: a baseline run and a candidate run must
  // open the SAME file, or "the large file got slower" could just mean it got
  // different.
  assert.equal(a, b);
  assert.ok(a.length >= 20000, `wanted at least 20000 bytes, got ${a.length}`);
  // Real syntax, not filler — CodeMirror's cost is in tokenising actual code.
  assert.match(a, /export function \w+\(/);
  assert.match(a, /export interface \w+Options \{/);
});

test('buildCodeArtifact scales with the requested size', () => {
  const small = buildCodeArtifact({ approxBytes: 2000, seed: 1 });
  const large = buildCodeArtifact({ approxBytes: 200000, seed: 1 });
  assert.ok(large.length > small.length * 50, `large ${large.length} vs small ${small.length}`);
});

test('buildMarkdownArtifact reports a fence count that matches the text', () => {
  const { text, fences } = buildMarkdownArtifact({ approxBytes: 30000, seed: 21 });
  // The reported fence count is the independent variable for the hastText
  // suspect, so it must be the real number of code blocks, not an estimate.
  const opens = (text.match(/^```ts$/gm) ?? []).length;
  const closes = (text.match(/^```$/gm) ?? []).length;
  assert.equal(opens, fences, 'reported fences must equal opening fences in the text');
  assert.equal(closes, fences, 'every fence must be closed, or the rest of the file renders as one code block');
  assert.ok(fences > 0);
});

test('buildMarkdownArtifact: a bigger file carries proportionally more fences', () => {
  const s = buildMarkdownArtifact({ approxBytes: 3000, seed: 21 });
  const l = buildMarkdownArtifact({ approxBytes: 300000, seed: 22 });
  assert.ok(l.fences > s.fences * 20, `small ${s.fences} vs large ${l.fences}`);
});

test('buildHtmlArtifact produces the requested sections and a parseable inline script', () => {
  const { text, sections } = buildHtmlArtifact({ approxBytes: 20000, sections: 5, seed: 31 });
  assert.equal(sections, 5);
  assert.equal((text.match(/<section id="s\d+" class="route"/g) ?? []).length, 5);
  // Section 0 is the only one visible at load; the rest are hidden, so a
  // navigation has something to actually reveal.
  assert.ok(text.includes('<section id="s0" class="route">'));
  assert.equal((text.match(/ hidden>/g) ?? []).length, 4);

  // The inline script is the ONLY channel through which an in-document
  // navigation can be driven or observed (the preview frame is an opaque
  // origin), so a syntax error in it would silently disable that whole leg.
  const body = text.slice(text.indexOf('<script>') + '<script>'.length, text.indexOf('<\/script>'));
  assert.doesNotThrow(() => new Function(body), 'the embedded page script must parse');
  assert.ok(body.includes('perf-lab-nav'), 'the page must speak the message protocol the scenario listens for');
  assert.ok(body.includes('perf-lab-nav-ready'));
  assert.ok(body.includes('perf-lab-nav-done'));
});

test('buildHtmlArtifact contains no backtick, so it survives template-literal embedding', () => {
  // The page text is interpolated into Node template literals and written to
  // disk; a stray backtick in the generator would terminate a template early
  // and produce a syntax error a long way from its cause.
  const { text } = buildHtmlArtifact({ approxBytes: 5000, sections: 3, seed: 3 });
  assert.ok(!text.includes('`'), 'generated HTML must not contain a backtick');
});

test('buildHtmlArtifact is deterministic per seed', () => {
  assert.equal(
    buildHtmlArtifact({ approxBytes: 8000, sections: 4, seed: 5 }).text,
    buildHtmlArtifact({ approxBytes: 8000, sections: 4, seed: 5 }).text,
  );
});

// ---------------------------------------------------------------------------
// Summaries and attribution
// ---------------------------------------------------------------------------

test('summarise returns null (never 0) when nothing was measured', () => {
  // A 0 here would read as "instant", which is the opposite of "did not happen".
  assert.deepEqual(summarise([]), { count: 0, medianMs: null, p95Ms: null, maxMs: null });
  assert.deepEqual(summarise(undefined), { count: 0, medianMs: null, p95Ms: null, maxMs: null });
  assert.deepEqual(summarise([null, undefined, NaN]), { count: 0, medianMs: null, p95Ms: null, maxMs: null });
});

test('summarise ignores non-numbers but keeps the real samples', () => {
  const s = summarise([10, null, 20, 30, NaN, 40]);
  assert.equal(s.count, 4);
  assert.equal(s.maxMs, 40);
  assert.ok(s.medianMs >= 20 && s.medianMs <= 30);
});

test('attributeStall: no stall when the IPC ping stayed responsive', () => {
  const v = attributeStall({ maxMs: 60 }, { longtaskMaxMs: 900 });
  assert.equal(v.verdict, 'none');
  assert.match(v.why, /60ms/);
});

test('attributeStall: renderer when both spiked together', () => {
  const v = attributeStall({ maxMs: 900 }, { longtaskMaxMs: 850 });
  assert.equal(v.verdict, 'renderer');
  assert.match(v.why, /renderer thread was the one blocked/);
});

test('attributeStall: MAIN process when the ping stalled and the renderer was idle', () => {
  // This is the app-wide-freeze signature the plain long-task number misses,
  // and the entire reason both probes run on every step.
  const v = attributeStall({ maxMs: 1200 }, { longtaskMaxMs: 60 });
  assert.equal(v.verdict, 'main');
  assert.match(v.why, /MAIN process was blocked/);
});

test('attributeStall: unclear rather than a guess when the two are close', () => {
  const v = attributeStall({ maxMs: 800 }, { longtaskMaxMs: 300 });
  assert.equal(v.verdict, 'unclear');
});

test('attributeStall: unknown when a probe reported nothing', () => {
  assert.equal(attributeStall({ error: 'not installed' }, { longtaskMaxMs: 10 }).verdict, 'unknown');
  assert.equal(attributeStall({ maxMs: 10 }, { windowMs: null, missingMark: 'x:end' }).verdict, 'unknown');
  assert.equal(attributeStall(null, null).verdict, 'unknown');
});

test('ratio is null rather than 0 or Infinity when a side is missing', () => {
  assert.equal(ratio(200, 50), 4);
  assert.equal(ratio(200, null), null);
  assert.equal(ratio(null, 50), null);
  assert.equal(ratio(200, 0), null);
  assert.equal(ratio(NaN, 3), null);
});

// ---------------------------------------------------------------------------
// Key events
// ---------------------------------------------------------------------------

test('keyEventsFor emits a keyDown carrying text plus a keyUp', () => {
  const [down, up] = keyEventsFor('a');
  // `text` on the keyDown is what makes Blink generate a char event and
  // actually insert into a contenteditable; without it CodeMirror sees a key
  // press that edits nothing and the whole typing step would measure a no-op.
  assert.equal(down.type, 'keyDown');
  assert.equal(down.text, 'a');
  assert.equal(down.code, 'KeyA');
  assert.equal(down.windowsVirtualKeyCode, 65);
  assert.equal(up.type, 'keyUp');
  assert.equal(up.text, undefined, 'a keyUp must not carry text, or the character is inserted twice');
});

test('keyEventsFor handles space', () => {
  const [down] = keyEventsFor(' ');
  assert.equal(down.code, 'Space');
  assert.equal(down.windowsVirtualKeyCode, 32);
  assert.equal(down.text, ' ');
});

test('keyEventsFor refuses anything needing a modifier, loudly', () => {
  // Silently emitting a wrong key event would type the wrong characters and
  // could trigger CodeMirror bracket/indent handling, measuring something else.
  assert.throws(() => keyEventsFor('A'), /only a-z and space/);
  assert.throws(() => keyEventsFor('{'), /only a-z and space/);
  assert.throws(() => keyEventsFor('ab'), /exactly one character/);
  assert.throws(() => keyEventsFor(''), /exactly one character/);
});

test('the typed sample uses only characters keyEventsFor accepts', () => {
  // Mirrors the literal in the typing step. If that string ever gains a capital
  // or a symbol, this fails here rather than mid-run against a live app.
  for (const ch of 'perf lab typing sample ') {
    assert.doesNotThrow(() => keyEventsFor(ch), `sample character ${JSON.stringify(ch)} is not typeable`);
  }
});

// ---------------------------------------------------------------------------
// In-page source must parse
// ---------------------------------------------------------------------------

/** A CDP stand-in that PARSES each expression (never runs it) and records it. */
function parsingCdp(answer = () => true) {
  const seen = [];
  return {
    seen,
    async evaluate(expr) {
      assert.equal(typeof expr, 'string');
      // new Function parses without executing — exactly the check that would
      // otherwise only happen inside the app, at run time, with no line number.
      assert.doesNotThrow(() => new Function(`return (${expr});`),
        `emitted in-page source did not parse:\n${expr.slice(0, 400)}`);
      seen.push(expr);
      return answer(expr);
    },
    async send() { return {}; },
  };
}

test('installArtifactHelpers emits parseable in-page source', async () => {
  const cdp = parsingCdp();
  await installArtifactHelpers(cdp);
  assert.equal(cdp.seen.length, 1);
  const src = cdp.seen[0];
  // Every selector this scenario depends on should be visible in one place, so
  // a rename in the app shows up as a failure here and in the report's
  // evidence table together.
  for (const needle of [
    '.framed-shell .drawer-pane:not(.game-pane)',
    '.artifact-content-pane',
    '.chat-scroll',
    'iframe[title="HTML preview"]',
    '[data-artifact-viewer]',
    'data-artifact-source',
    'data-doc-path',
    '.cm-content',
    'span.font-mono',
    'pre.yc-code',
    'Copied!',
  ]) {
    assert.ok(src.includes(needle), `installArtifactHelpers no longer mentions ${needle}`);
  }
});

test('registerArtifacts emits parseable source and fails loudly on a refused append', async () => {
  const files = { a: { rel: 'd/a.ts' }, b: { rel: 'd/b.ts' } };
  const cdp = parsingCdp(() => ({
    appended: [{ rel: 'd/a.ts', ok: true }, { rel: 'd/b.ts', ok: false, error: 'nope' }],
    listed: [{ id: 'art_1', path: 'd/a.ts' }],
  }));
  await assert.rejects(
    () => registerArtifacts(cdp, '/p', 's1', files),
    // The message must name the count and the real error, never a guess.
    /refused to register 1 of 2 .*nope/s,
  );
});

test('registerArtifacts fails when list-session comes back without a registered file', async () => {
  const files = { a: { rel: 'd/a.ts' }, b: { rel: 'd/b.ts' } };
  const cdp = parsingCdp(() => ({
    appended: [{ rel: 'd/a.ts', ok: true }, { rel: 'd/b.ts', ok: true }],
    listed: [{ id: 'art_1', path: 'd/a.ts' }],
  }));
  // A missing row is exactly the silent-zero failure this rig has been bitten
  // by twice: the open step would click nothing and report a miss for a reason
  // that has nothing to do with performance.
  await assert.rejects(
    () => registerArtifacts(cdp, '/p', 's1', files),
    /came back without \["d\/b\.ts"\]/,
  );
});

test('registerArtifacts stamps the artifact ids back onto the file records', async () => {
  const files = { a: { rel: 'd/a.ts' }, b: { rel: 'd/b.ts' } };
  const cdp = parsingCdp(() => ({
    appended: [{ rel: 'd/a.ts', ok: true }, { rel: 'd/b.ts', ok: true }],
    listed: [{ id: 'art_1', path: 'd/a.ts' }, { id: 'art_2', path: 'd/b.ts' }],
  }));
  const n = await registerArtifacts(cdp, '/p', 's1', files);
  assert.equal(n, 2);
  assert.equal(files.a.id, 'art_1');
  assert.equal(files.b.id, 'art_2');
});
