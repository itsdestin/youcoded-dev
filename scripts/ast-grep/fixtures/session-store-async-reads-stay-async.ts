// Violation fixture for session-store-async-reads-stay-async.
export class SessionStore {
  async readEventsAsync(): Promise<unknown[]> { return []; }
  async listAsync(): Promise<unknown[]> {
    return this.home.listSessionFiles();
  }
}
