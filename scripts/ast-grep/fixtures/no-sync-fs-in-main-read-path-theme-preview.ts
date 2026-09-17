// Violation fixture for no-sync-fs-in-main-read-path-theme-preview.
async function buildPreviewHTML(manifest: unknown, themeDir: string): Promise<string> {
  return fs.readFileSync(themeDir, 'utf8');
}
