// Violation fixture for no-sync-fs-in-transcript-global-poll.
export class TranscriptWatcher {
  private ensureGlobalPoll(): void {
    setInterval(() => fs.statSync('t.jsonl'), 2000);
  }
}
