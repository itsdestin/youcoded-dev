// Violation fixture for no-sync-fs-in-main-hot-path-git-transport.
class Transport {
  async gitDirSizeBytes(space: unknown): Promise<number> {
    return fs.statSync('x').size;
  }
}
