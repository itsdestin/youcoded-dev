// Violation fixture for tags-list-no-empty-fallback (NO DELEGATION) — the
// handler reads the registry itself; listTagsForHost() is named only here.
declare const ipcMain: any, IPC: any, getTagRegistry: () => { list(): Promise<unknown> };
ipcMain.handle(IPC.TAGS_LIST, () => getTagRegistry().list());
ipcMain.handle(IPC.TAGS_CREATE, () => ({ ok: true }));
