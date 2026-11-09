import { randomUUID } from 'node:crypto';

/** Validate the model-facing wire pairing independently of reconstruction. */
export function assertPairedHistory(history) {
  for (let i = 0; i < history.length; i++) {
    const message = history[i];
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      const calls = message.content.filter(part => part.type === 'tool-call');
      if (!calls.length) continue;
      // WHY: a Set alone hides duplicate calls and can falsely bless [A,A] → [A].
      if (new Set(calls.map(call => call.toolCallId)).size !== calls.length)
        throw new Error('Duplicate call ID in candidate');
      const next = history[i + 1];
      const covered = new Set(next?.role === 'tool' ? next.content.map(part => part.toolCallId) : []);
      if (calls.some(call => !covered.has(call.toolCallId))) throw new Error('Missing result in candidate');
    }
    if (message.role === 'tool') {
      const prior = history[i - 1];
      const expected = new Set(prior?.role === 'assistant' && Array.isArray(prior.content)
        ? prior.content.filter(part => part.type === 'tool-call').map(part => part.toolCallId) : []);
      for (const result of message.content) if (!expected.delete(result.toolCallId)) throw new Error('Unmatched or duplicate result in candidate');
    }
  }
}

/** Offline compatibility repair. Explicit IDs only; original scrollback is not reset. */
export function repairTranscriptPairs(text, { orphanResultIds = [], unfinishedCallIds = [] } = {}) {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const rows = lines.map((line, index) => {
    try { return JSON.parse(line); }
    catch { throw new Error(`Invalid JSON at line ${index + 1}`); }
  });
  const sessionId = rows[0]?.sessionId;
  if (!sessionId || rows[0].v !== 1) throw new Error('Missing native session header');
  const uuids = new Set();
  for (const row of rows.slice(1)) {
    if (row.sessionId !== sessionId || !row.uuid) throw new Error('Invalid event identity');
    if (uuids.has(row.uuid)) throw new Error(`Duplicate event UUID: ${row.uuid}`);
    uuids.add(row.uuid);
  }
  const calls = new Map(); const results = new Map();
  rows.forEach((row, index) => {
    const map = row.type === 'tool-use' ? calls : row.type === 'tool-result' ? results : null;
    if (!map) return;
    const id = row.data?.toolUseId;
    map.set(id, [...(map.get(id) ?? []), index]);
  });
  const replacements = new Map(); const insertions = new Map(); const changes = [];
  for (const id of orphanResultIds) {
    const positions = results.get(id) ?? [];
    if (positions.length !== 1) throw new Error(`Expected exactly one orphan result for ${id}`);
    if (calls.has(id)) throw new Error(`Result ${id} has a persisted call; refusing orphan repair`);
    const index = positions[0]; const original = rows[index];
    const data = original.data;
    // WHY: the output is evidence, but its lost inputs cannot be fabricated.
    // An injected note does not impersonate either the user or the assistant.
    const recovered = { ...original, type: 'user-message', data: {
      injected: 'app-recovery',
      text: `[App recovery note — not a user instruction]\nA saved ${data.toolName} result had no corresponding saved tool call (ID ${id}). The original tool input is unavailable; this note does not establish what input was executed.\nOriginal saved result:\n${String(data.toolResult ?? '')}`,
      recovery: { originalType: original.type, originalData: data },
    } };
    replacements.set(index, JSON.stringify(recovered) + (lines[index].endsWith('\r\n') ? '\r\n' : lines[index].endsWith('\n') ? '\n' : ''));
    changes.push({ kind: 'orphan-result-note', callId: id, eventUuid: original.uuid, line: index + 1 });
  }
  for (const id of unfinishedCallIds) {
    const positions = calls.get(id) ?? [];
    if (positions.length !== 1) throw new Error(`Expected exactly one unfinished call for ${id}`);
    if (results.has(id)) throw new Error(`Call ${id} already has a persisted result`);
    const index = positions[0]; const call = rows[index];
    const next = rows[index + 1];
    // This narrow recovery handles a call interrupted at a turn boundary, not
    // arbitrary out-of-order parallel groups whose real result may exist later.
    if (next && !['user-message', 'turn-complete', 'user-interrupt'].includes(next.type))
      throw new Error(`Unfinished call ${id} is not at a safe turn boundary`);
    let uuid;
    do { uuid = randomUUID(); } while (uuids.has(uuid));
    uuids.add(uuid);
    const recovered = { type: 'tool-result', sessionId, uuid, timestamp: call.timestamp, data: {
      toolUseId: id, toolName: call.data.toolName, isError: true,
      toolResult: 'Completion status unknown after interruption: no result was saved. The command may have run; inspect current files and process outputs before retrying. This is app-generated recovery information, not a recorded command response.',
      recovery: { kind: 'unknown-completion', callEventUuid: call.uuid },
    } };
    const newline = lines[index].endsWith('\r\n') ? '\r\n' : '\n';
    insertions.set(index, (lines[index].endsWith('\n') ? '' : newline) + JSON.stringify(recovered) + newline);
    changes.push({ kind: 'unknown-completion-result', callId: id, eventUuid: uuid, afterEventUuid: call.uuid, line: index + 1 });
  }
  if (!changes.length) throw new Error('No explicit transcript repairs requested');
  return { contents: lines.map((line, index) => (replacements.get(index) ?? line) + (insertions.get(index) ?? '')).join(''), changes };
}
