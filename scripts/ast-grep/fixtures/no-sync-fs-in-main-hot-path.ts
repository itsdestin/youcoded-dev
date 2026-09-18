// Violation fixture for no-sync-fs-in-main-hot-path.
export function createLeaseClient(opts: unknown) {
  fs.writeFileSync('lease', 'held');
}
