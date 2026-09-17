// Violation fixture for no-sync-fs-whole-file (transcript-mirror.ts).
export function mirror(path: string) {
  fs.appendFileSync(path, 'x');
}
