// Violation fixture for ledger-single-mutatejson-call (MISSING branch) — the
// chokepoint no longer writes through home.mutateJson at all; the call is
// named only in this comment: await this.home.mutateJson(p, fn)
declare const home: { writeJson(p: string, v: unknown): Promise<void> };
export class Ledger {
  private home = home;
  private async mutate(p: string): Promise<void> {
    await this.home.writeJson(p, {});
  }
}
