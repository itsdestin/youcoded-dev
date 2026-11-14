// Usage: node bench.mjs <scenario>   scenarios: roster | bulk | bigchat | lru | live | alarms | acks | hibernate | small
import { startServer, Dev, sleep, fmt } from "./lib.mjs";
const scenario = process.argv[2];
const MiB = 1 << 20;
const t = () => performance.now();
const rand = n => { const b = new Uint8Array(n); for (let i = 0; i < n; i += 65536) crypto.getRandomValues(b.subarray(i, Math.min(n, i + 65536))); return b; };
const out = o => console.log(JSON.stringify(o, null, 1));
// run `fn(i)` with up to `n` in flight
async function pool(total, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < total) { const k = i++; await fn(k); } })); }
async function stats(d, reset = false) { return (await d.rpc({ op: "stats", reset })).h.stats; }

const scenarios = {
async roster() {
  const s = await startServer({}); const r = {};
  try {
    const a = await new Dev(s.port, "setR", "devA").connect();
    const sizes = { head: 300, host: 600, del: 600 };
    await stats(a, true);
    let t0 = t();
    await pool(6000, 32, async i => { const c = Math.floor(i / 3), kind = ["head", "host", "del"][i % 3]; const x = await a.rpc({ op: "reg-set", key: `${kind}:chat${c}`, expectToken: 0 }, rand(sizes[kind])); if (x.h.op !== "reg-ok") throw new Error(JSON.stringify(x.h)); });
    r.setAll = { count: 6000, ms: Math.round(t() - t0), perSecond: Math.round(6000 / ((t() - t0) / 1000)) };
    r.statsAfterSets = await stats(a, true);
    t0 = t(); const L = await a.rpc({ op: "reg-list" });
    r.regListFull = { ms: Math.round(t() - t0), regs: L.h.regs.length, payloadBytes: L.p.byteLength, rev: L.h.rev };
    r.statsRegList = await stats(a, true);
    const times = [];
    for (let k = 0; k < 10; k++) { const t1 = t(); await a.rpc({ op: "reg-list" }); times.push(Math.round(t() - t1)); }
    r.regListRepeat10ms = times;
    r.statsRegList10 = await stats(a, true);
    t0 = t(); const L2 = await a.rpc({ op: "reg-list", sinceRev: L.h.rev });
    r.regListNothingNew = { ms: Math.round(t() - t0), regs: L2.h.regs.length }; r.statsSince = await stats(a, true);
    // change 5 registers, ask since
    for (let k = 0; k < 5; k++) await a.rpc({ op: "reg-set", key: `head:chat${k}`, expectToken: 1 }, rand(300));
    await stats(a, true);
    const L3 = await a.rpc({ op: "reg-list", sinceRev: L.h.rev }); r.regListAfter5Changes = { regs: L3.h.regs.length, stats: await stats(a, true) };
    // CAS
    const ok = await a.rpc({ op: "reg-set", key: "host:chat0", expectToken: 1 }, rand(600));
    const bad = await a.rpc({ op: "reg-set", key: "host:chat0", expectToken: 1 }, rand(600));
    r.cas = { first: ok.h.op, tokenAfter: ok.h.token, secondWithStaleToken: bad.h.op, conflictToken: bad.h.token, conflictValueReturnedBytes: bad.p.byteLength };
    // two devices race
    const b = await new Dev(s.port, "setR", "devB").connect();
    const [x, y] = await Promise.all([a.rpc({ op: "reg-set", key: "host:race", expectToken: 0 }, rand(100)), b.rpc({ op: "reg-set", key: "host:race", expectToken: 0 }, rand(100))]);
    r.race = [x.h.op, y.h.op].sort();
    r.finalStats = await stats(a);
  } finally { s.stop(); }
  out(r);
},
async bulk() {
  const frame = Number(process.argv[3] || MiB), total = Number(process.argv[4] || 1024) * MiB, groups = Number(process.argv[5] || 100);
  const s = await startServer({ capBytes: 1073741824 }); const r = { frameBytes: frame };
  try {
    const a = await new Dev(s.port, "setB", "devA").connect(); await stats(a, true);
    const n = Math.ceil(total / frame); const body = rand(frame);
    const t0 = t(); let stored = 0, over = 0;
    // sequential per group (seq ordering), parallel across groups: 4 in flight
    await pool(n, 4, async i => { const g = "chat:" + (i % groups); const x = await a.rpc({ op: "hold", g, line: false }, body); if (x.h.op === "stored") stored++; else over++; });
    const ms = t() - t0;
    r.hold = { frames: n, stored, over, seconds: +(ms / 1000).toFixed(1), MBps: +(total / MiB / (ms / 1000)).toFixed(1) };
    const st = await stats(a, true); r.stats = st;
    r.perHold = { rowsWritten: +(st.rowsWritten / n).toFixed(2) };
    r.overhead = { payloadBytes: st.totalBytes, dbSizeBytes: st.dbSize, overheadPct: +(((st.dbSize - st.totalBytes) / st.totalBytes) * 100).toFixed(1) };
    const b = await new Dev(s.port, "setB", "devB").connect();
    const t1 = t(); let seq = 0, got = 0, bytes = 0, rounds = 0;
    for (;;) { const f = await b.rpc({ op: "fetch-after", g: "chat:0", seq }); rounds++; for (const [h, p] of f.frames) { got++; bytes += p.byteLength; seq = h.seq; } if (!f.h.more) break; }
    const ms2 = t() - t1; r.fetchOneGroup = { frames: got, MB: +(bytes / MiB).toFixed(0), seconds: +(ms2 / 1000).toFixed(2), MBps: +(bytes / MiB / (ms2 / 1000)).toFixed(1), rounds };
    r.statsFetch = await stats(a, true);
  } finally { s.stop(); }
  out(r);
},
async small() {
  // Lines-sized frames: how many holds per second, and rows written per hold.
  const size = Number(process.argv[3] || 4096), n = Number(process.argv[4] || 20000);
  const s = await startServer({}); const r = { frameBytes: size, holds: n };
  try {
    const boots = new Set(); const a = await new Dev(s.port, "setS", "devA").connect(); const body = rand(size); await stats(a, true);
    const t0 = t(); await pool(n, 16, async i => { const x = await a.rpc({ op: "hold", g: "chat:" + (i % 20), line: true }, body); if (x.h.op !== "stored") throw new Error(x.h.op); boots.add(x.h.boot); });
    const ms = t() - t0; r.seconds = +(ms / 1000).toFixed(1); r.holdsPerSecond = Math.round(n / (ms / 1000));
    r.distinctObjectInstances = boots.size; r.stats = await stats(a); r.rowsWrittenPerHold = +(r.stats.rowsWritten / n).toFixed(2);
  } finally { s.stop(); }
  out(r);
},
async bigchat() {
  const s = await startServer({}); const r = {};
  try {
    const a = await new Dev(s.port, "setC", "devA").connect(); const b = await new Dev(s.port, "setC", "devB").connect(); await stats(a, true);
    const body = rand(MiB); const n = 300; const t0 = t();
    for (let i = 0; i < n; i++) { const x = await a.rpc({ op: "hold", g: "chat:big", line: false }, body); if (x.h.op !== "stored") throw new Error(x.h.op); }
    r.upload = { MB: n, seconds: +((t() - t0) / 1000).toFixed(1) }; r.stats = await stats(a, true);
    const t1 = t(); let seq = 0, bytes = 0, rounds = 0, maxRoundMs = 0;
    for (;;) { const t2 = t(); const f = await b.rpc({ op: "fetch-after", g: "chat:big", seq }); maxRoundMs = Math.max(maxRoundMs, t() - t2); rounds++; for (const [h, p] of f.frames) { bytes += p.byteLength; seq = h.seq; } if (!f.h.more) break; }
    r.download = { MB: bytes / MiB, rounds, seconds: +((t() - t1) / 1000).toFixed(1), maxRoundMs: Math.round(maxRoundMs) };
    // Resume mid-way (device had 100 frames already)
    const f = await b.rpc({ op: "fetch-after", g: "chat:big", seq: 100 }); r.resumeAt100 = { firstSeq: f.frames[0][0].seq, frames: f.frames.length, more: f.h.more };
    // over-limit group (cap shrunk run is in 'lru'); frame over 1 MiB:
    const big = await a.rpc({ op: "hold", g: "chat:x", line: false }, rand(MiB + 1)); r.oversizeFrame = big.h;
    // a single 4 MiB / 8 MiB message to learn the transport limit locally (platform doc: 32 MiB in)
    r.messageLimitLocal = {};
    for (const mb of [4, 16, 33]) { try { const res = await Promise.race([a.rpc({ op: "reg-set", key: "z" + mb, expectToken: 0 }, rand(mb * MiB)), sleep(5000).then(() => ({ h: { op: "timeout/closed" } }))]); r.messageLimitLocal[mb + "MiB"] = res.h.op; } catch (e) { r.messageLimitLocal[mb + "MiB"] = "error " + e.message; } }
  } finally { s.stop(); }
  out(r);
},
async lru() {
  const cap = 100 * MiB; const s = await startServer({ capBytes: cap }); const r = {};
  try {
    const a = await new Dev(s.port, "setL", "devA").connect(); const b = await new Dev(s.port, "setL", "devB").connect();
    const body = rand(MiB);
    for (let c = 0; c < 10; c++) { for (let i = 0; i < 9; i++) await a.rpc({ op: "hold", g: "chat:" + c, line: true }, body); await sleep(5); }
    r.before = await stats(a, true);
    // touch chat:0 again so it is NOT least recently used
    await a.rpc({ op: "hold", g: "chat:0", line: true }, body);
    b.events.length = 0; a.events.length = 0;
    const x = await a.rpc({ op: "hold", g: "chat:new", line: true }, rand(MiB));
    // 91 MiB now; add until a release is forced: write 12 MiB into the new chat
    const res = []; for (let i = 0; i < 12; i++) res.push((await a.rpc({ op: "hold", g: "chat:new", line: true }, body)).h.op);
    r.writes = res; await sleep(100);
    r.releasedEventsSeenByDevB = b.events.filter(e => e.op === "released").map(e => [e.g, e.throughSeq]);
    r.after = await stats(a, true);
    const gap = await b.rpc({ op: "fetch-after", g: r.releasedEventsSeenByDevB[0][0], seq: 0 }); r.fetchReleasedChat = gap.h;
    const ok = await b.rpc({ op: "fetch-after", g: "chat:0", seq: 0 }); r.fetchSurvivorFrames = ok.frames.length;
    // new lines for a released chat are accepted, asking for the missing stretch gets gap, past the mark gets frames
    const rel = r.releasedEventsSeenByDevB[0]; const nl = await a.rpc({ op: "hold", g: rel[0], line: true }, rand(1000)); r.newLineOnReleasedChat = nl.h;
    const past = await b.rpc({ op: "fetch-after", g: rel[0], seq: rel[1] }); r.fetchPastMark = past.frames.length;
    // group bigger than the cap is refused
    r.groupOverCap = []; for (let i = 0; i < 101; i++) { const y = await a.rpc({ op: "hold", g: "chat:huge", line: true }, body); if (y.h.op !== "stored") { r.groupOverCap = [i, y.h]; break; } }
    r.final = await stats(a);
  } finally { s.stop(); }
  out(r);
},
async live() {
  // 250 ms batches from devA to watchers devB and devC. Real time, 60 s, then a burst to find the ceiling.
  const s = await startServer({}); const r = {};
  try {
    const a = await new Dev(s.port, "setV", "devA").connect(); const b = await new Dev(s.port, "setV", "devB").connect(); const c = await new Dev(s.port, "setV", "devC").connect();
    let gotB = 0, gotC = 0; b.onEvent = h => { if (h.op === "pass") gotB++; }; c.onEvent = h => { if (h.op === "pass") gotC++; };
    await stats(a, true); const batch = rand(600); // ~ a quarter second of words
    const secs = Number(process.argv[3] || 60); const t0 = t(); let sent = 0;
    while (t() - t0 < secs * 1000) { a.send({ op: "pass", to: "all", g: "live" }, batch); sent++; await sleep(250); }
    await sleep(500);
    r.steady = { seconds: secs, sent, receivedByB: gotB, receivedByC: gotC, stats: await stats(a, true) };
    // burst
    gotB = gotC = 0; const N = 20000; const t1 = t();
    for (let i = 0; i < N; i++) { a.send({ op: "pass", to: "all", g: "live" }, batch); if (i % 500 === 499) await sleep(1); }
    while ((gotB < N || gotC < N) && t() - t1 < 60000) await sleep(20);
    r.burst = { sent: N, deliveredB: gotB, deliveredC: gotC, seconds: +((t() - t1) / 1000).toFixed(2), msgsPerSecond: Math.round(N / ((t() - t1) / 1000)), stats: await stats(a) };
  } finally { s.stop(); }
  out(r);
},
async alarms() {
  const s = await startServer({}); const r = {};
  try {
    const a = await new Dev(s.port, "setAl", "devA").connect(); const b = await new Dev(s.port, "setAl", "devB").connect();
    await a.rpc({ op: "hold", g: "chat:old", line: true }, rand(1000)); await a.rpc({ op: "hold", g: "chat:keep", line: true }, rand(1000));
    await a.rpc({ op: "reg-set", key: "head:old", expectToken: 0 }, rand(100));
    r.alarmArmedAt = (await a.rpc({ op: "debug-alarm-get" })).h.at; r.alarmIsInDays = +(((r.alarmArmedAt - Date.now()) / 86400000)).toFixed(2);
    const D = 86400000; console.error('step1');
    await a.rpc({ op: "debug-clock", offsetMs: 20 * D }); await a.rpc({ op: "hold", g: "chat:keep", line: true }, rand(10)); // keep gets a fresh line at day 20
    await a.rpc({ op: "debug-clock", offsetMs: 31 * D }); b.events.length = 0; console.error('step2');
    await a.rpc({ op: "debug-alarm-in", ms: 300 }); console.error('step3'); await sleep(1500);
    console.error("s4"); r.afterDay31 = { releasedEvents: b.events.filter(e => e.op === "released"), stats: await stats(a) };
    console.error("s5"); r.registerSurvives30Days = (await a.rpc({ op: "reg-get", key: "head:old" })).h.regs.length;
    console.error("s6"); console.error("b state", b.ws.readyState); r.fetchOld = (await Promise.race([b.rpc({ op: "fetch-after", g: "chat:old", seq: 0 }), sleep(3000).then(()=>({h:{op:"TIMEOUT"}}))])).h.op; console.error("fo", r.fetchOld);
    r.nextAlarmInDays = +((((await a.rpc({ op: "debug-alarm-get" })).h.at) - Date.now()) / D).toFixed(2);
    // 90 idle days: nobody connects (clock jumps), alarm erases everything
    await a.rpc({ op: "debug-clock", offsetMs: 125 * D }); await a.rpc({ op: "debug-alarm-in", ms: 300 }); await sleep(1500);
    const c = await new Dev(s.port, "setAl", "devC").connect();
    r.after90Idle = { registers: (await c.rpc({ op: "reg-list" })).h.regs.length, groups: (await stats(c)).groups, oldSocketsClosed: a.ws.readyState === 3 };
  } finally { s.stop(); }
  out(r);
},
async acks() {
  const s = await startServer({}); const r = {};
  try {
    const A = await new Dev(s.port, "setK", "devA").connect(), B = await new Dev(s.port, "setK", "devB").connect(), C = await new Dev(s.port, "setK", "devC").connect();
    const body = rand(1000); for (let i = 0; i < 10; i++) await A.rpc({ op: "hold", g: "chat:1", line: true }, body);
    const left = async () => (await stats(A)).totalBytes;
    await A.send({ op: "received", g: "chat:1", throughSeq: 10 }); await sleep(100); r.afterWriterOnly = await left();
    await B.send({ op: "received", g: "chat:1", throughSeq: 10 }); await sleep(100); r.afterWriterAndB = await left();
    await C.send({ op: "received", g: "chat:1", throughSeq: 6 }); await sleep(100); r.afterCThrough6 = await left();
    await C.send({ op: "received", g: "chat:1", throughSeq: 10 }); await sleep(100); r.afterAllThrough10 = await left();
    r.fetchAfterDrop = (await C.rpc({ op: "fetch-after", g: "chat:1", seq: 0 })).h;
    r.note = "a device that has never reported blocks the drop (roster device with nothing); 'recent'-only devices must be excluded by the client sending throughSeq=head for chats it does not want";
  } finally { s.stop(); }
  out(r);
},
async hibernate() {
  const s = await startServer({}); const r = {};
  try {
    const a = await new Dev(s.port, "setH", "devA").connect(); const b = await new Dev(s.port, "setH", "devB").connect();
    r.boot1 = (await stats(a)).constructedAt; await sleep(25000);
    r.presenceAfterIdle = (await a.rpc({ op: "presence" })).h.devices;
    r.boot2 = (await stats(a)).constructedAt; r.hibernatedAndRebuilt = r.boot2 !== r.boot1;
    // auto ping/pong
    let pong = false; const ws = a.ws; const prev = ws.onmessage; ws.onmessage = ev => { if (typeof ev.data === "string") pong = ev.data; else prev(ev); };
    ws.send("ping"); await sleep(300); r.autoPong = pong;
    r.holdAfterWake = (await a.rpc({ op: "hold", g: "chat:h", line: true }, rand(10))).h.op;
  } finally { s.stop(); }
  out(r);
},
};
await scenarios[scenario]();
