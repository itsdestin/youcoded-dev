// Violation fixture for no-sync-fs-in-main-read-path-session-browser.
async function readIndexMeta() {
  return fs.readFileSync('index.json', 'utf8');
}
