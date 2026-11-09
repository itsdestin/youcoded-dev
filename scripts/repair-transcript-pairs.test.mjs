import test from 'node:test';
import assert from 'node:assert/strict';
import { repairTranscriptPairs, assertPairedHistory } from './repair-transcript-pairs.mjs';

const header = { v: 1, sessionId: 'session', cwd: '/project' };
const event = (type, id, data) => ({ type, uuid: id, sessionId: 'session', timestamp: 1, data });
const serialize = rows => rows.map(row => JSON.stringify(row) + '\n').join('');

test('relabels an explicitly selected orphan output without inventing tool input', () => {
  const orphan = event('tool-result', 'result', { toolUseId: 'lost', toolName: 'Write', toolResult: 'Created file', structuredPatch: [{ lines: ['+hello'] }] });
  const original = serialize([header, orphan]);
  const { contents, changes } = repairTranscriptPairs(original, { orphanResultIds: ['lost'] });
  const rows = contents.trim().split('\n').map(JSON.parse);
  assert.equal(rows[1].type, 'user-message');
  assert.equal(rows[1].uuid, 'result');
  assert.equal(rows[1].data.injected, 'app-recovery');
  assert.match(rows[1].data.text, /not a user instruction/);
  assert.match(rows[1].data.text, /Created file/);
  assert.deepEqual(rows[1].data.recovery.originalData, orphan.data);
  assert.ok(!rows.some(row => row.type === 'tool-use'));
  assert.equal(changes.length, 1);
});

test('adds an honest unknown-completion result only for an existing unfinished call', () => {
  const call = event('tool-use', 'call', { toolUseId: 'unfinished', toolName: 'Bash', toolInput: { command: 'do work' } });
  const follow = event('user-message', 'user', { text: 'continue' });
  const original = serialize([header, call, follow]);
  const { contents } = repairTranscriptPairs(original, { unfinishedCallIds: ['unfinished'] });
  const rows = contents.trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows[1], call);
  assert.equal(rows[2].type, 'tool-result');
  assert.equal(rows[2].data.toolUseId, 'unfinished');
  assert.equal(rows[2].data.isError, true);
  assert.match(rows[2].data.toolResult, /may have run/);
  assert.match(rows[2].data.toolResult, /not a recorded command response/);
  assert.deepEqual(rows[3], follow);
});

test('leaves every unaffected line byte-for-byte intact', () => {
  const call = event('tool-use', 'call', { toolUseId: 'unfinished', toolName: 'Bash', toolInput: {} });
  const headerLine = '  ' + JSON.stringify(header) + '\r\n';
  const callLine = JSON.stringify(call) + '\r\n';
  const followLine = JSON.stringify(event('user-message', 'u', { text: 'hi' }));
  const { contents } = repairTranscriptPairs(headerLine + callLine + followLine, { unfinishedCallIds: ['unfinished'] });
  assert.ok(contents.startsWith(headerLine + callLine));
  assert.ok(contents.endsWith(followLine));
});

test('recovery validation requires one-to-one adjacent call/result coverage', () => {
  const call = id => ({ type: 'tool-call', toolCallId: id });
  const result = id => ({ type: 'tool-result', toolCallId: id });
  const pair = (calls, results) => [{ role: 'assistant', content: calls.map(call) }, { role: 'tool', content: results.map(result) }];
  assert.doesNotThrow(() => assertPairedHistory(pair(['a', 'b'], ['b', 'a'])));
  assert.throws(() => assertPairedHistory(pair(['a', 'a'], ['a'])), /duplicate call/i);
  assert.throws(() => assertPairedHistory(pair(['a'], ['a', 'a'])), /duplicate|unmatched/i);
  assert.throws(() => assertPairedHistory(pair(['a', 'b'], ['a'])), /missing/i);
  assert.throws(() => assertPairedHistory([{ role: 'tool', content: [result('a')] }]), /unmatched/i);
});

test('only explicitly selected events change, including around clear and summary markers', () => {
  const rows = [header,
    event('context-clear', 'clear', {}),
    event('compact-summary', 'summary', { summary: 'existing summary' }),
    event('tool-result', 'result', { toolUseId: 'lost', toolName: 'Read', toolResult: 'data' }),
    event('user-message', 'user', { text: 'next' }),
  ];
  const before = serialize(rows).split('\n');
  const after = repairTranscriptPairs(serialize(rows), { orphanResultIds: ['lost'] }).contents.split('\n');
  assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i++) if (i !== 3) assert.equal(after[i], before[i]);
});

test('refuses a selected unfinished call inside a parallel or streaming group', () => {
  const call = event('tool-use', 'call', { toolUseId: 'unfinished', toolName: 'Bash', toolInput: {} });
  for (const next of [event('tool-use', 'other', { toolUseId: 'other' }), event('assistant-text', 'text', { text: 'still running' })]) {
    assert.throws(() => repairTranscriptPairs(serialize([header, call, next]), { unfinishedCallIds: ['unfinished'] }), /safe turn boundary/);
  }
});

test('refuses absent targets, already paired calls, and duplicate UUIDs', () => {
  const call = event('tool-use', 'call', { toolUseId: 'paired', toolName: 'Bash', toolInput: {} });
  const result = event('tool-result', 'result', { toolUseId: 'paired', toolName: 'Bash', toolResult: 'ok' });
  const text = serialize([header, call, result]);
  assert.throws(() => repairTranscriptPairs(text, { orphanResultIds: ['absent'] }), /exactly one/);
  assert.throws(() => repairTranscriptPairs(text, { orphanResultIds: ['paired'] }), /has a persisted call/);
  assert.throws(() => repairTranscriptPairs(text, { unfinishedCallIds: ['paired'] }), /already has a persisted result/);
  assert.throws(() => repairTranscriptPairs(serialize([header, call, call]), { unfinishedCallIds: ['paired'] }), /Duplicate/);
});
