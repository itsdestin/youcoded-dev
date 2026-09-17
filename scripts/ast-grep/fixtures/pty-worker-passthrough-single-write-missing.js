// Violation fixture for pty-worker-passthrough-single-write — no passthrough
// branch at all.
async function handleInput(text) {
  ptyProcess.write(text);
}
