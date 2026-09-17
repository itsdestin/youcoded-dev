// Violation fixture for no-sync-fs-whole-file (marketplace-file-reader.ts).
export function readComponent(path: string) {
  return fs.readFileSync(path, 'utf8');
}
