// Violation fixture: the buddy is created before the refusal is returned.
declare const ipcMain: { handle: (channel: string, fn: () => unknown) => void };
declare const IPC: { BUDDY_SHOW: string };
declare const buddyManager: { show: () => void };
declare const refusal: string | null;
ipcMain.handle(IPC.BUDDY_SHOW, async () => {
  buddyManager.show();
  if (refusal) return { ok: false, reason: refusal };
  return { ok: true };
});
