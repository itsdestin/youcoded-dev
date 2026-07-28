// VIOLATION FIXTURE — not real code, never imported, never built.
// Every rule that targets chat-reducer.ts must fire on this file. If a rule
// stops matching here, the rule is broken — a rule that matches nothing looks
// exactly like a rule that passes.
//
// It also carries the LEGITIMATE seenUuids usage so a false positive is caught
// as loudly as a false negative.

type Action = { type: string; sessionId: string; uuid?: string; toolUseId?: string };
type Session = { toolCalls: Map<string, unknown>; seenUuids: Set<string> };

export function fixtureReducer(session: Session, action: Action) {
  switch (action.type) {
    // --- CORRECT: seenUuids is load-bearing here (replay/live dedup). ---
    // The no-seenuuids-on-tool-use rule must NOT fire on this case.
    case 'TRANSCRIPT_USER_MESSAGE': {
      if (action.uuid && session.seenUuids.has(action.uuid)) return session;
      const seenUuids = action.uuid
        ? new Set(session.seenUuids).add(action.uuid)
        : session.seenUuids;
      return { ...session, seenUuids };
    }

    // --- VIOLATION 1 + 2: toolCalls cleared, and a uuid guard on tool-use. ---
    case 'TRANSCRIPT_TOOL_USE': {
      const toolCalls = new Map(session.toolCalls);
      toolCalls.clear(); // violates: toolcalls-never-cleared
      if (action.uuid && session.seenUuids.has(action.uuid)) return session; // violates: no-seenuuids-on-tool-use
      return { ...session, toolCalls };
    }

    default:
      return session;
  }
}
