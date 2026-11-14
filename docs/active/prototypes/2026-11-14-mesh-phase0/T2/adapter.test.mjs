// Unit tests for the throwaway S1 adapter. Run: node --test adapter.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { poll, initState, scrub, TAIL } from './adapter.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't2-adapter-'));
const opts = { seed: 'v1|0', isReplyEnd: (l) => l.toString().includes('"end":true') };
const line = (i, end = false) => JSON.stringify({ i, pad: 'x'.repeat(200), end }) + '\n';
const fresh = (n) => path.join(dir, n + '.jsonl');
const text = (r) => r.lines.map((b) => b.toString());

test('append: only new lines come back, chain advances, reply ends indexed', () => {
  const f = fresh('append');
  fs.writeFileSync(f, line(0) + line(1, true));
  let r = poll(f, initState(opts.seed), opts);
  assert.equal(r.lines.length, 2); assert.deepEqual(r.replyEnds, [1]);
  fs.appendFileSync(f, line(2) + line(3, true));
  r = poll(f, r.state, opts);
  assert.deepEqual(text(r), [line(2), line(3, true)]); assert.deepEqual(r.replyEnds, [3]);
  assert.equal(r.state.lines, 4);
  r = poll(f, r.state, opts); // unchanged
  assert.equal(r.lines.length, 0); assert.ok(!r.rewritten);
  // chain equals a from-scratch chain
  const fromScratch = poll(f, initState(opts.seed), opts);
  assert.equal(fromScratch.state.chain, r.state.chain);
  assert.ok(scrub(f, r.state, opts));
});

test('partial trailing line is not ingested until its newline arrives', () => {
  const f = fresh('partial');
  const full = line(0);
  fs.writeFileSync(f, full + line(1).slice(0, 50));
  let r = poll(f, initState(opts.seed), opts);
  assert.equal(r.lines.length, 1); assert.equal(r.state.offset, full.length);
  r = poll(f, r.state, opts); assert.equal(r.lines.length, 0); // still partial
  fs.appendFileSync(f, line(1).slice(50));
  r = poll(f, r.state, opts);
  assert.deepEqual(text(r), [line(1)]);
});

test('truncate (shrink) -> rewritten', () => {
  const f = fresh('trunc');
  fs.writeFileSync(f, line(0) + line(1) + line(2));
  let r = poll(f, initState(opts.seed), opts);
  fs.truncateSync(f, line(0).length);
  assert.equal(poll(f, r.state, opts).rewritten, 'shrunk');
});

test('truncate then regrow PAST the old size -> rewritten (not seen by a size check)', () => {
  const f = fresh('regrow');
  fs.writeFileSync(f, line(0) + line(1));
  const r = poll(f, initState(opts.seed), opts);
  fs.writeFileSync(f, line(10) + line(11) + line(12) + line(13));
  assert.equal(poll(f, r.state, opts).rewritten, 'rewritten');
});

test('in-place rewrite of earlier bytes, same size, inside last 64 KiB -> rewritten', () => {
  const f = fresh('inplace-tail');
  fs.writeFileSync(f, line(0) + line(1) + line(2));
  const r = poll(f, initState(opts.seed), opts);
  const fd = fs.openSync(f, 'r+'); fs.writeSync(fd, 'Z', 100); fs.closeSync(fd);
  assert.equal(poll(f, r.state, opts).rewritten, 'rewritten');
});

test('in-place rewrite in the first 4 KiB of a big file -> rewritten (head check)', () => {
  const f = fresh('inplace-head');
  let s = ''; for (let i = 0; i < 2000; i++) s += line(i);
  fs.writeFileSync(f, s);
  const r = poll(f, initState(opts.seed), opts);
  assert.ok(s.length > 4 * TAIL);
  const fd = fs.openSync(f, 'r+'); fs.writeSync(fd, 'Z', 50); fs.closeSync(fd);
  assert.equal(poll(f, r.state, opts).rewritten, 'rewritten');
});

test('KNOWN BLIND SPOT: same-size edit in the middle of a big file passes the cheap check; the slow scrub catches it', () => {
  const f = fresh('inplace-mid');
  let s = ''; for (let i = 0; i < 2000; i++) s += line(i);
  fs.writeFileSync(f, s);
  const r = poll(f, initState(opts.seed), opts);
  const fd = fs.openSync(f, 'r+'); fs.writeSync(fd, 'Z', Math.floor(s.length / 2)); fs.closeSync(fd);
  const r2 = poll(f, r.state, opts);
  assert.ok(!r2.rewritten, 'documented: cheap check cannot see this');
  assert.equal(scrub(f, r.state, opts), false, 'scrub must see it');
});

test('file replaced by rename -> rewritten (identity changed), even if bytes are identical', () => {
  const f = fresh('replaced');
  const body = line(0) + line(1);
  fs.writeFileSync(f, body);
  const r = poll(f, initState(opts.seed), opts);
  const tmp = f + '.new'; fs.writeFileSync(tmp, body + line(2)); fs.renameSync(tmp, f);
  assert.equal(poll(f, r.state, opts).rewritten, 'replaced');
});

test('file deleted -> rewritten(missing)', () => {
  const f = fresh('gone');
  fs.writeFileSync(f, line(0));
  const r = poll(f, initState(opts.seed), opts);
  fs.unlinkSync(f);
  assert.equal(poll(f, r.state, opts).rewritten, 'missing');
});

test('large append across chunk boundary matches from-scratch chain', () => {
  const f = fresh('big');
  fs.writeFileSync(f, line(0));
  let r = poll(f, initState(opts.seed), opts);
  let s = ''; for (let i = 1; i < 60000; i++) s += line(i, i % 7 === 0); // ~13 MB, > one 8 MB chunk
  fs.appendFileSync(f, s);
  r = poll(f, r.state, opts);
  const scratch = poll(f, initState(opts.seed), opts);
  assert.equal(r.state.chain, scratch.state.chain); assert.equal(r.state.lines, 60000);
  assert.deepEqual(r.replyEnds, scratch.replyEnds.filter((n) => n >= 1));
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

// ---- reply-end tracker (Claude Code lookahead) ----
import { replyEndStepCC } from './reply-end.mjs';
test('CC tracker: a 2-block final message ends once, at its LAST block line; tool_use lines never end', () => {
  const A = (id, stop, blk) => Buffer.from(JSON.stringify({ type: 'assistant', uuid: Math.random() + '', message: { id, stop_reason: stop, content: [{ type: blk }] } }) + '\n');
  const U = (extra = {}) => Buffer.from(JSON.stringify({ type: 'user', message: { content: 'hi' }, promptId: 'p', ...extra }) + '\n');
  const TD = Buffer.from(JSON.stringify({ type: 'system', subtype: 'turn_duration' }) + '\n');
  const seq = [U(), A('m1', 'tool_use', 'tool_use'), U({ message: { content: [{ type: 'tool_result' }] }, promptId: undefined }), A('m2', 'end_turn', 'thinking'), A('m2', 'end_turn', 'text'), TD, U(), A('m3', 'end_turn', 'text')];
  let rs = null; const got = [];
  seq.forEach((b, i) => { const o = replyEndStepCC(rs, b, i); rs = o.rs; got.push(...o.confirmed); });
  assert.deepEqual(got, [4]);                 // m2's last block (line 4), NOT line 3
  assert.deepEqual(rs, { cand: { n: 7, id: 'm3' } }); // trailing candidate stays unconfirmed until something follows
});
