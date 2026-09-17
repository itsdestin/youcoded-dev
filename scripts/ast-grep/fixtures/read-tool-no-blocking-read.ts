// Violation fixture for read-tool-no-blocking-read.
export function readTool(abs: string): string {
  return fs.readFileSync(abs, 'utf8');
}
