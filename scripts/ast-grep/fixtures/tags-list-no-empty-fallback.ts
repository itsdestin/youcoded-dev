// Violation fixture for tags-list-no-empty-fallback (EMPTY FALLBACK) — the
// handler delegates, but answers an absent registry with []. Fires once.
declare const ipcMain: any, IPC: any, getTagRegistry: () => unknown, listTagsForHost: () => Promise<unknown>;
ipcMain.handle(IPC.TAGS_LIST, async () => {
  if (!getTagRegistry()) return [];
  return listTagsForHost();
});
ipcMain.handle(IPC.TAGS_CREATE, () => ({ ok: true }));
