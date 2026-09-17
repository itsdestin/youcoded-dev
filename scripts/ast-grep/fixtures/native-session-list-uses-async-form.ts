// Violation fixture for native-session-list-uses-async-form.
ipcMain.handle(IPC.NATIVE_SESSIONS_LIST, async () => nativeHost.list());
