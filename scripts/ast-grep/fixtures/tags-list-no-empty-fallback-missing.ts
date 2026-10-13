// Violation fixture for tags-list-no-empty-fallback (NO DELEGATION) — the
// entry reads the registry itself; listTagsForHost() is named only here.
declare const defineChannel: any, IPC: any, getTagRegistry: () => { list(): Promise<unknown> };
export const entries = [
  defineChannel({ name: IPC.TAGS_LIST, kind: 'handle', handler: () => getTagRegistry().list() }),
  defineChannel({ name: IPC.TAGS_CREATE, kind: 'handle', handler: () => ({ ok: true }) }),
];
