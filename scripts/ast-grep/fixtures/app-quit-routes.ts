// Violation fixture for main-registers-all-quit-routes: the SIGTERM/SIGINT
// route (and its string literals) is missing entirely.
app.on('window-all-closed', () => {
  app.quit();
});
app.on('before-quit', (e) => {
  if (shuttingDown) return;
  e.preventDefault();
  void shutdownApp().finally(() => app.quit());
});
let shuttingDown: Promise<void> | null = null;
function shutdownApp(): Promise<void> {
  if (shuttingDown) return shuttingDown;
  shuttingDown = runShutdown();
  return shuttingDown;
}
