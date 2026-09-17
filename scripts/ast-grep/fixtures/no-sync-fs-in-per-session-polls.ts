// Violation fixture for no-sync-fs-in-per-session-polls.
// WHY attachTopicWatch comes first and calls fs.watch: a non-Sync fs call ahead
// of the real violation silenced the old constraint-based form of this rule
// (see its note); this fixture fires only if each call is judged on its own.
export function registerIpcHandlers(): void {
  function attachTopicWatch(a: string, b: string) {
    fs.watch(a, () => {});
  }
  async function buildStatusData() {
    return fs.readFileSync('usage.json', 'utf8');
  }
  async function readTopicFile(id: string): Promise<string | null> { return null; }
  function startPolling(a: string, b: string) {}
}
