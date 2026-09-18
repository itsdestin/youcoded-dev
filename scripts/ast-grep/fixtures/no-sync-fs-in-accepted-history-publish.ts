// Violation fixture for no-sync-fs-in-accepted-history-publish.
class IncrementalTranscriptReader {
  read(): string { return ''; }
}
export class AcceptedHistoryStore {
  async publish(): Promise<void> {
    fs.writeFileSync('manifest', 'x');
  }
  private async atomicWrite(): Promise<void> {}
}
