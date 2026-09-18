// Violation fixture for pty-worker-passthrough-single-write — the write sits
// inside a later block, after a bare return nested in an earlier statement.
async function handleInput(text) {
  const endsCR = text.endsWith('\r');
  if (!endsCR) {
    if (!text) { return; }
    try { ptyProcess.write(text); } finally { trace('PASSTHROUGH'); }
  }
}
