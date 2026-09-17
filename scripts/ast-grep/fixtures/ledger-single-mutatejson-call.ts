// Violation fixture for ledger-single-mutatejson-call (EXTRA branch) — a
// method beside mutate() writes through home.mutateJson directly, so its write
// never reaches the change listener. Fires once, on the second call.
declare const home: { mutateJson(p: string, fn: (c: unknown) => unknown): Promise<void> };
export class Ledger {
  private home = home;
  private async mutate(p: string): Promise<void> {
    await this.home.mutateJson(p, (cur) => cur);
  }
  async markSeen(p: string): Promise<void> {
    await this.home.mutateJson(p, (cur) => cur);
  }
}
