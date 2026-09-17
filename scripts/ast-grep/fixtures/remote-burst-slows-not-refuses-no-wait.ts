// Violation fixture for remote-burst-slows-not-refuses: the slow start is
// computed but never waited on (fires once, on the whole file).
const HOST_FAILURES_BEFORE_SLOWDOWN = 25;
const HOST_SLOWDOWN_MS = 2_000;
export class Server {
  shouldSlowConnection() { return false; }
  async handleConnection() {
    const slowStart = this.shouldSlowConnection() ? HOST_SLOWDOWN_MS : 0;
    if (slowStart) void new Promise(r => setTimeout(r, slowStart));
  }
}
