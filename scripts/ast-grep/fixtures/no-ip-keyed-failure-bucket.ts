// Violation fixture for no-ip-keyed-failure-bucket: a failed-login budget keyed
// by address, in four spellings (fires four times: the get call, the comment,
// the per-connection-reachable set call, and the untyped method definition).
export class Server {
  private failedAttempts = new Map<string, number>();
  private connAttempts = new Map<string, number>();
  onAuthFailed(ip: string) {
    const n = this.failedAttempts.get(ip) ?? 0;
    // then isRateLimited(ip) decides
    this.connAttempts.set(ip, n + 1);
  }
  recordFailedAttempt(ip) { void ip; }
}
