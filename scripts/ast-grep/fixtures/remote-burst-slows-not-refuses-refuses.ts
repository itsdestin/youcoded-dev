// Violation fixture for remote-burst-slows-not-refuses: a burst REFUSES the
// connection instead of computing a slow start (fires once, on the whole file;
// the comment spelling the old shape does not count).
const HOST_FAILURES_BEFORE_SLOWDOWN = 25;
const HOST_SLOWDOWN_MS = 2_000;
export class Server {
  shouldSlowConnection() { return false; }
  async handleConnection(ws: { close(code: number): void }) {
    // const slowStart = this.shouldSlowConnection() ? HOST_SLOWDOWN_MS : 0;
    if (this.shouldSlowConnection()) return ws.close(4029);
    const slowStart = HOST_SLOWDOWN_MS;
    if (slowStart) await new Promise(r => setTimeout(r, slowStart));
  }
}
