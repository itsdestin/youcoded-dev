// Violation fixture for pty-worker-passthrough-single-write — a passthrough
// that chunks, with the single write named only in a comment:
// ptyProcess.write(text);
async function handleInput(text) {
  const endsCR = text.endsWith('\r');
  if (!endsCR) {
    for (const piece of chunks(text)) { ptyProcess.write(piece); }
    return;
  }
}
