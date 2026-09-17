// Violation fixture for pty-worker-passthrough-single-write — a passthrough
// that returns BEFORE its single write (the write is dead code).
async function handleInput(text) {
  const endsCR = text.endsWith('\r');
  if (!endsCR) {
    return;
    ptyProcess.write(text);
  }
  ptyProcess.write(text);
  return;
}
