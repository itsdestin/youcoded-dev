// Violation fixture for buddy-show-consults-refusal-gate.
// The handler exists but never consults the gate before showing the buddy.
declare const ipcMain: { handle: (channel: string, fn: () => void) => void };
declare const IPC: { BUDDY_SHOW: string };
declare const buddyManager: { show: () => void };
ipcMain.handle(IPC.BUDDY_SHOW, () => {
  buddyManager.show();
});
