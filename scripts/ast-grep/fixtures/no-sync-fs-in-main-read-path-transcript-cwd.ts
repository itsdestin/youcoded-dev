// Violation fixture for no-sync-fs-in-main-read-path-transcript-cwd.
export function resolveCwd(slug: string) {
  return fs.existsSync(slug);
}
