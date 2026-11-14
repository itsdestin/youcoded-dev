// Back-of-envelope monthly cost model for the relay. Every input below is an ASSUMPTION except
// rows-written-per-hold (measured in bench.mjs: 3) and the Cloudflare prices (fetched 2026-11-14,
// see report). Run: node cost-model.mjs
const P = { // Workers Paid, Durable Objects, SQLite backend (developers.cloudflare.com/durable-objects/platform/pricing/)
  base: 5, reqIncl: 1e6, reqPerM: 0.15, durIncl: 400e3, durPerM: 12.5, wIncl: 50e6, wPerM: 1.0, rIncl: 25e9, rPerM: 0.001, stIncl: 5, stPerGB: 0.2 };
const F = { reqDay: 100e3, rowsWDay: 100e3, rowsRDay: 5e6, durDay: 13e3, storGB: 5 }; // Workers Free daily limits
const MSG_PER_REQ = 20;           // incoming WebSocket messages bill 20:1
const MS_PER_MSG = 3;             // assumed handler wall time per message (hibernatable: idle time is free)
const GB_PER_ACTIVE_S = 0.125;    // 128 MB billed
const ROWS_PER_HOLD_CYCLE = 6;    // measured 3 on hold + ~3 when the last device reports and the frames are deleted

// A user class: per-day figures.
const classes = {
  heavy:  { // Destin-like: 4 devices, 50 MB/day, 6 h/day of a watcher receiving words, 2,000 chats
    holds: 3000, fetches: 3000, receivedMsgs: 1800, regSets: 600, regReads: 100,
    liveMsgs: 6 * 3600 * 4 * 0.30,     // 6 h watching, replies streaming 30% of that time, 4 msg/s while streaming
    liveMsgsWorst: 6 * 3600 * 4,       // streaming the whole 6 h
    devices: 4, beatSec: 10, connects: 40, heldGB: 0.5, heldGBworst: 1.0 },
  medium: { holds: 300, fetches: 300, receivedMsgs: 180, regSets: 60, regReads: 20, liveMsgs: 1 * 3600 * 4 * 0.30, devices: 2, beatSec: 10, connects: 10, heldGB: 0.05, heldGBworst: 1.0 },
  light:  { holds: 50, fetches: 50, receivedMsgs: 30, regSets: 10, regReads: 10, liveMsgs: 0, devices: 2, beatSec: 10, connects: 6, heldGB: 0.005, heldGBworst: 0.05 },
};
function perDay(c, beatSec = c.beatSec) {
  const beats = c.devices * (86400 / beatSec) * 0.5;   // assume devices are connected about half the day on average
  const msgs = c.holds + c.fetches + c.receivedMsgs + c.regSets + c.regReads + c.liveMsgs + beats;
  const req = msgs / MSG_PER_REQ + c.connects;
  const rowsW = c.holds * ROWS_PER_HOLD_CYCLE + c.regSets * 3;
  const rowsR = c.holds * 5 + c.fetches * 5 + c.regReads * 30 + 6000 * 0.1 * 0; // reg-list deltas read ~nothing
  const durS = msgs * MS_PER_MSG / 1000;
  return { msgs, req, rowsW, rowsR, durGBs: durS * GB_PER_ACTIVE_S, beats };
}
function monthly(mix, { beatSec, worst } = {}) {
  let t = { req: 0, rowsW: 0, rowsR: 0, durGBs: 0, heldGB: 0, users: 0 };
  for (const [name, n] of Object.entries(mix)) {
    const c = { ...classes[name] }; if (worst && c.liveMsgsWorst) c.liveMsgs = c.liveMsgsWorst;
    const d = perDay(c, beatSec);
    t.req += d.req * 30 * n; t.rowsW += d.rowsW * 30 * n; t.rowsR += d.rowsR * 30 * n; t.durGBs += d.durGBs * 30 * n;
    t.heldGB += (worst ? c.heldGBworst : c.heldGB) * n; t.users += n;
  }
  const over = (x, incl) => Math.max(0, x - incl);
  const c = {
    requests: over(t.req, P.reqIncl) / 1e6 * P.reqPerM, duration: over(t.durGBs, P.durIncl) / 1e6 * P.durPerM,
    rowsWritten: over(t.rowsW, P.wIncl) / 1e6 * P.wPerM, rowsRead: over(t.rowsR, P.rIncl) / 1e6 * P.rPerM,
    storage: over(t.heldGB, P.stIncl) * P.stPerGB };
  const marginal = { // as if no allowance were left: list overage price for every unit, shows what ONE more user adds
    requests: t.req / 1e6 * P.reqPerM, duration: t.durGBs / 1e6 * P.durPerM, rowsWritten: t.rowsW / 1e6 * P.wPerM,
    rowsRead: t.rowsR / 1e6 * P.rPerM, storage: t.heldGB * P.stPerGB };
  const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
  const day = { req: t.req / 30, rowsW: t.rowsW / 30, rowsR: t.rowsR / 30, durGBs: t.durGBs / 30, heldGB: t.heldGB };
  return { users: t.users, perMonth: { requests: Math.round(t.req), rowsWritten: Math.round(t.rowsW), rowsRead: Math.round(t.rowsR), durGBs: Math.round(t.durGBs), heldGB: +t.heldGB.toFixed(1) },
    paidTotalUSD: +(P.base + sum(c)).toFixed(2), paidMarginalAtListUSD: +sum(marginal).toFixed(2),
    freePerDay: { req: Math.round(day.req), reqPctOfLimit: +(100 * day.req / F.reqDay).toFixed(1), rowsW: Math.round(day.rowsW), rowsWPct: +(100 * day.rowsW / F.rowsWDay).toFixed(1),
      rowsRPct: +(100 * day.rowsR / F.rowsRDay).toFixed(2), durPct: +(100 * day.durGBs / F.durDay).toFixed(2), heldGB: +day.heldGB.toFixed(1), storagePct: +(100 * day.heldGB / F.storGB).toFixed(0) } };
}
const scenarios = {
  "a1 one heavy user (typical)": [{ heavy: 1 }, {}],
  "a2 one heavy user (worst: streaming all 6h, 1 GB parked)": [{ heavy: 1 }, { worst: true }],
  "a3 one heavy user, heartbeat every 30 s": [{ heavy: 1 }, { beatSec: 30 }],
  "b1 10 users, all heavy (worst reading of 'today')": [{ heavy: 10 }, {}],
  "b2 10 users, 2 heavy 4 medium 4 light": [{ heavy: 2, medium: 4, light: 4 }, {}],
  "c1 1,000 mixed (5% heavy, 25% medium, 70% light)": [{ heavy: 50, medium: 250, light: 700 }, {}],
  "c2 1,000 mixed, heartbeat 30 s": [{ heavy: 50, medium: 250, light: 700 }, { beatSec: 30 }],
  "c3 1,000 mixed, worst storage (every set parks its cap)": [{ heavy: 50, medium: 250, light: 700 }, { worst: true }],
};
for (const [k, [mix, opt]] of Object.entries(scenarios)) console.log(k, JSON.stringify(monthly(mix, opt)));
// how many users of one class fit in the Free plan before each daily limit breaks
for (const name of ["heavy", "medium", "light"]) {
  const d = perDay(classes[name]);
  console.log(`free plan, only ${name} users: requests ${Math.floor(F.reqDay / d.req)}, rows written ${Math.floor(F.rowsWDay / d.rowsW)}, storage (1 GB parked each) ${Math.floor(F.storGB / classes[name].heldGBworst)}, storage (typical) ${Math.floor(F.storGB / classes[name].heldGB)}`);
}
