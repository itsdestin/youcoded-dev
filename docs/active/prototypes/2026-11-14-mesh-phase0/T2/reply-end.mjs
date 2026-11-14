// T2 throwaway: per-runtime isReplyEnd(line) for seam S1 (design 6.1) and the line classifier
// used by the static scan. Mirrors what the app treats as `turn-complete` / `user-interrupt`.
//
// Claude Code (transcript-watcher.ts:376): an `assistant` line whose message.stop_reason is set
// and is not 'tool_use' emits `turn-complete`. A user line whose whole text is
// "[Request interrupted by user]" (or "... for tool use]") emits `user-interrupt`, which the
// reducer uses to end the in-flight turn. Both end a reply.
// Native (session-store.ts / harness-session.ts:1437): persisted `turn-complete` and
// `user-interrupt` events. `session-error` also ends a turn but is NEVER persisted
// (session-store.ts append(): returns before writing), so it can never be a line.

function userText(o) {
  const c = o?.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('');
  return '';
}

/** Classify a parsed Claude Code line. kind is one of:
 *  reply-end | interrupt | tool-use | assistant-partial | tool-result | prompt | meta | other */
export function classifyCC(o) {
  if (!o || typeof o !== 'object') return { kind: 'other' };
  if (o.type === 'assistant') {
    const sr = o.message?.stop_reason;
    if (sr && sr !== 'tool_use') return { kind: 'reply-end', stop: sr, apiError: !!o.isApiErrorMessage, synthetic: o.message?.model === '<synthetic>' };
    if (sr === 'tool_use') return { kind: 'tool-use' };
    return { kind: 'assistant-partial' };
  }
  if (o.type === 'user') {
    if (o.isCompactSummary || o.isMeta) return { kind: 'meta' };
    const t = userText(o);
    if (t === '[Request interrupted by user]' || t === '[Request interrupted by user for tool use]') return { kind: 'interrupt' };
    if (/^\s*<(local-command-|command-name>)/.test(t)) return { kind: 'meta' };
    const c = o.message?.content;
    if (Array.isArray(c) && c.some((b) => b && b.type === 'tool_result')) return { kind: 'tool-result' };
    return { kind: 'prompt' };
  }
  return { kind: 'other' };
}

export function isReplyEndCC(lineBuf) {
  // cheap substring prefilter: nearly every non-reply-end line lacks this token
  const s = lineBuf.toString('utf8');
  if (!s.includes('"stop_reason"') && !s.includes('[Request interrupted by user')) return false;
  let o; try { o = JSON.parse(s); } catch { return false; }
  const k = classifyCC(o).kind;
  return k === 'reply-end' || k === 'interrupt';
}

export function isReplyEndNative(lineBuf) {
  const s = lineBuf.toString('utf8');
  if (!s.includes('"turn-complete"') && !s.includes('"user-interrupt"')) return false;
  let o; try { o = JSON.parse(s); } catch { return false; }
  return o?.type === 'turn-complete' || o?.type === 'user-interrupt';
}

/**
 * Claude Code reply-end tracker with one-line lookahead (the form S1 should specify for CC).
 *
 * WHY: CC writes ONE assistant API message as one line per content block (thinking, text, ...),
 * and every one of those lines carries the message's stop_reason. Measured over Destin's 1,364 chats:
 * 31,685 lines with a non-tool_use stop_reason, but only 21,238 distinct messages; 46% of final
 * messages are 2+ lines. A cut after the FIRST block line would drop the answer text.
 * So: remember the last candidate (line number + message.id) and confirm it when
 *   - an assistant line with a DIFFERENT message.id arrives, or
 *   - any user line arrives (prompt, tool result, interrupt, meta), or
 *   - a `system` `turn_duration` line arrives (CC writes it once, after the final block).
 * Bookkeeping lines (last-prompt, ai-title, mode, queue-operation, ...) neither confirm nor cancel.
 * An interrupt line is a reply end by itself (no multi-line message), and is also a user line, so it
 * first confirms any earlier candidate and then becomes the new candidate, confirmed by the next
 * relevant line like any other.
 * rs = { cand: {n, id} | null }  (JSON-safe)
 */
export function replyEndStepCC(rs, lineBuf, lineNo) {
  rs = rs ?? { cand: null };
  const s = lineBuf.toString('utf8');
  const confirmed = [];
  const mayMatter = s.includes('"type":"assistant"') || s.includes('"type":"user"') || s.includes('turn_duration');
  if (!mayMatter) return { rs, confirmed };
  let o; try { o = JSON.parse(s); } catch { return { rs, confirmed }; }
  const confirm = () => { if (rs.cand) { confirmed.push(rs.cand.n); rs = { cand: null }; } };
  if (o.type === 'system' && o.subtype === 'turn_duration') { confirm(); return { rs, confirmed }; }
  if (o.type === 'assistant') {
    const id = o.message?.id ?? null;
    if (rs.cand && rs.cand.id !== id) confirm();
    const c = classifyCC(o);
    if (c.kind === 'reply-end') rs = { cand: { n: lineNo, id } };
    return { rs, confirmed };
  }
  if (o.type === 'user') {
    confirm();
    if (classifyCC(o).kind === 'interrupt') rs = { cand: { n: lineNo, id: null } };
    return { rs, confirmed };
  }
  return { rs, confirmed };
}

/** Native lines: one persisted turn-complete / user-interrupt per turn; no lookahead needed. */
export function replyEndStepNative(rs, lineBuf, lineNo) {
  return { rs: null, confirmed: isReplyEndNative(lineBuf) ? [lineNo] : [] };
}
