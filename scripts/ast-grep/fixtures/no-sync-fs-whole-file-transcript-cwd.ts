// Violation fixture for no-sync-fs-whole-file (transcript-cwd.ts).
export function resolveCwd(slug: string) {
  return fs.existsSync(slug);
}
