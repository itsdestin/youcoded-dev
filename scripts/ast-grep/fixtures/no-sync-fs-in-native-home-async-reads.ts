// Violation fixture for no-sync-fs-in-native-home-async-reads.
export class NativeHome {
  async readSessionLinesAsync(): Promise<unknown[]> {
    return fs.readFileSync('s.jsonl', 'utf8').split('\n');
  }
  async listSessionFilesAsync(): Promise<unknown[]> { return []; }
  async readSessionHeadAsync(): Promise<unknown[]> { return []; }
}
