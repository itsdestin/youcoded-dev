// Violation fixture for no-sync-fs-in-main-hot-path-transcript-mirror.
export function mirror(path: string) {
  fs.appendFileSync(path, 'x');
}
