// Violation fixture for remote-burst-slows-not-refuses: the host-wide failure
// threshold constant is gone (fires once, on the whole file).
const HOST_SLOWDOWN_MS = 2_000;
export class Server {
  shouldSlowConnection() { return false; }
  async handleConnection() {
    const slowStart = this.shouldSlowConnection() ? HOST_SLOWDOWN_MS : 0;
    if (slowStart) await new Promise(r => setTimeout(r, slowStart));
  }
}
