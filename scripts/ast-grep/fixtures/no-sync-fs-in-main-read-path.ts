// Violation fixture for no-sync-fs-in-main-read-path.
export function readComponent(path: string) {
  return fs.readFileSync(path, 'utf8');
}
