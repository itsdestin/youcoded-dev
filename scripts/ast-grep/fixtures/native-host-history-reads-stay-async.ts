// Violation fixture for native-host-history-reads-stay-async.
export class NativeSessionHost {
  async getHistoryAsync(): Promise<unknown[] | null> { return null; }
  async getHistoryPageAsync(): Promise<unknown> { return null; }
  isLive(sessionId: string): boolean {
    return this.getHistory(sessionId) !== null;
  }
}
