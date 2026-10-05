// Violation fixture for tags-list-no-empty-fallback (EMPTY FALLBACK) — the
// table entry delegates, but answers an absent registry with []. Fires once.
declare const defineChannel: any, IPC: any, getTagRegistry: () => unknown, listTagsForHost: () => Promise<unknown>;
export const entries = [
  defineChannel({
    name: IPC.TAGS_LIST, kind: 'handle',
    handler: async () => {
      if (!getTagRegistry()) return [];
      return listTagsForHost();
    },
  }),
  defineChannel({ name: IPC.TAGS_CREATE, kind: 'handle', handler: () => ({ ok: true }) }),
];
