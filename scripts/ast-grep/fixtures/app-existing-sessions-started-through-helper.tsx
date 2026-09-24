// Violation fixture for app-existing-sessions-started-through-helper.
declare function setInitializedSessions(v: unknown): void;
declare const list: Array<{ id: string; awaitingStart?: boolean }>;
export function onList() {
  // VIOLATION 1: every listed session counted as started.
  setInitializedSessions(new Set(list.map((s) => s.id)));
  // VIOLATION 2: the loop form.
  setInitializedSessions((prev: Set<string>) => { const next = new Set(prev); for (const s of list) next.add(s.id); return next; });
}
