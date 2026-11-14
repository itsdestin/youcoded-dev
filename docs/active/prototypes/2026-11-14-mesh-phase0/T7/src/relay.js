// T7 throwaway: minimal relay Durable Object implementing design 6.4.
// One DO per device set. SQLite-backed (see wrangler.toml). Hibernatable WebSockets.
//
// WHY every piece of state is in SQLite and nothing in memory except caches that can be
// rebuilt: a hibernated DO is evicted and its constructor runs again on the next message
// ("In-memory state is reset" - Cloudflare WebSockets doc), so memory may only hold things
// that are cheap to reload.

const enc = new TextEncoder();
const dec = new TextDecoder();
const DAY = 86_400_000;
const THIRTY_DAYS = 30 * DAY;
const NINETY_DAYS = 90 * DAY;
// Largest payload one hold frame may carry, and largest reply message the relay sends.
// WHY 1 MiB: platform allows 32 MiB per received message, but the isolate has 128 MB and
// every copy of a payload (receive, bind to SQL, read back, send) is another allocation.
export const MAX_FRAME = 1 << 20;
const FETCH_PAGE_BYTES = 4 << 20; // frames sent per fetch-after reply burst before `more`

function pack(header, payload) {
  const hb = enc.encode(JSON.stringify(header));
  const pl = payload ? new Uint8Array(payload.buffer ? payload.buffer : payload, payload.byteOffset || 0, payload.byteLength) : null;
  const out = new Uint8Array(4 + hb.length + (pl ? pl.length : 0));
  new DataView(out.buffer).setUint32(0, hb.length);
  out.set(hb, 4);
  if (pl) out.set(pl, 4 + hb.length);
  return out.buffer;
}
function unpack(buf) {
  const n = new DataView(buf).getUint32(0);
  return [JSON.parse(dec.decode(new Uint8Array(buf, 4, n))), new Uint8Array(buf, 4 + n)];
}

export class Relay {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql;
    this.cap = Number(env.CAP_BYTES);
    this.constructedAt = Date.now(); // lets a test see that hibernation really evicted and rebuilt the object
    this.counters = { rowsRead: 0, rowsWritten: 0, messagesIn: 0, messagesOut: 0, passIn: 0 };
    this.alarmArmed = false;
    state.blockConcurrencyWhile(async () => { this.init(); });
  }

  // WHY a method: deleteAll() (90-day erase) drops the tables, and the object stays alive and
  // keeps answering. The first version of this prototype hung every later request after an erase
  // because the schema was only created in the constructor.
  init() {
    {
      this.q(`CREATE TABLE IF NOT EXISTS frames(g TEXT, seq INTEGER, sz INTEGER, b BLOB, PRIMARY KEY(g,seq)) WITHOUT ROWID`);
      this.q(`CREATE TABLE IF NOT EXISTS groups(g TEXT PRIMARY KEY, next_seq INTEGER NOT NULL, bytes INTEGER NOT NULL,
              last_line_at INTEGER NOT NULL, last_touch INTEGER NOT NULL, released_through INTEGER NOT NULL) WITHOUT ROWID`);
      this.q(`CREATE TABLE IF NOT EXISTS recv(g TEXT, dev TEXT, through INTEGER NOT NULL, PRIMARY KEY(g,dev)) WITHOUT ROWID`);
      this.q(`CREATE TABLE IF NOT EXISTS regs(k TEXT PRIMARY KEY, v BLOB, tok INTEGER NOT NULL, rev INTEGER NOT NULL) WITHOUT ROWID`);
      // WHY index on rev: without it "what changed since rev N" still reads every register row (measured: 6,000 rows read to return 0).
      this.q(`CREATE INDEX IF NOT EXISTS regs_rev ON regs(rev)`);
      this.q(`CREATE TABLE IF NOT EXISTS roster(dev TEXT PRIMARY KEY) WITHOUT ROWID`);
      this.q(`CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v INTEGER NOT NULL) WITHOUT ROWID`);
    }
  }

  // Counting wrapper: rowsRead / rowsWritten are what Cloudflare bills (SQLite rows).
  q(text, ...bind) {
    const cur = this.sql.exec(text, ...bind);
    const rows = cur.toArray();
    this.counters.rowsRead += cur.rowsRead;
    this.counters.rowsWritten += cur.rowsWritten;
    return rows;
  }
  metaGet(k, d = 0) { const r = this.q(`SELECT v FROM meta WHERE k=?`, k); return r.length ? r[0].v : d; }
  metaSet(k, v) { this.q(`INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, k, v); }
  now() { return Date.now() + this.metaGet("clock_off", 0); }
  totalBytes() { return this.metaGet("total_bytes", 0); }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("ws only", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // Hibernatable: duration is not billed while idle (Cloudflare DO pricing doc).
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ authed: false, device: null });
    // Free automatic keepalive that never wakes the object and costs no duration.
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    return new Response(null, { status: 101, webSocket: client });
  }

  send(ws, header, payload) {
    this.counters.messagesOut++;
    ws.send(pack(header, payload));
  }

  async webSocketMessage(ws, message) {
    if (typeof message === "string") return;
    this.counters.messagesIn++;
    const [h, payload] = unpack(message);
    let att = ws.deserializeAttachment() || {};
    if (h.op === "auth") {
      // AUTH STUB: real design = signed challenge against the public roster (6.4 `auth`).
      if (h.sig !== "ok:" + h.device) { this.send(ws, { op: "auth-result", r: "not-on-roster", id: h.id }); return ws.close(4003, "no"); }
      att = { authed: true, device: h.device };
      ws.serializeAttachment(att);
      this.q(`INSERT OR IGNORE INTO roster(dev) VALUES(?)`, h.device);
      // Throttle: one write per hour at most, not one per reconnect.
      const t = this.now();
      if (t - this.metaGet("last_connect", 0) > 3_600_000) this.metaSet("last_connect", t);
      await this.arm();
      this.send(ws, { op: "auth-result", r: "ok", id: h.id });
      this.broadcastPresence(att.device, "on");
      return;
    }
    if (!att.authed) return ws.close(4001, "auth first");
    const me = att.device;
    switch (h.op) {
      case "hold": return this.hold(ws, h, payload);
      case "fetch-after": return this.fetchAfter(ws, h);
      case "received": return this.received(me, h);
      case "reg-get": {
        const r = this.q(`SELECT k,v,tok FROM regs WHERE k=?`, h.key);
        return this.send(ws, { op: "reg-result", id: h.id, regs: r.map(x => ({ key: x.k, token: x.tok, len: x.v.byteLength })) }, r[0] ? new Uint8Array(r[0].v) : null);
      }
      case "reg-list": return this.regList(ws, h);
      case "reg-set": return this.regSet(ws, h, payload);
      case "presence": return this.send(ws, { op: "presence-result", id: h.id, devices: this.onlineDevices() });
      case "pass": return this.pass(me, h, payload);
      case "drop-group": return this.dropGroup(h.g, true);
      case "stats": {
        const c = { ...this.counters, constructedAt: this.constructedAt, totalBytes: this.totalBytes(), dbSize: this.sql.databaseSize, groups: this.q(`SELECT count(*) n FROM groups`)[0].n };
        if (h.reset) this.counters = { rowsRead: 0, rowsWritten: 0, messagesIn: 0, messagesOut: 0, passIn: 0 };
        return this.send(ws, { op: "stats-result", id: h.id, stats: c });
      }
      // ---- test-only controls (clock skew, alarm), never in a real build ----
      case "debug-clock": this.metaSet("clock_off", h.offsetMs); return this.send(ws, { op: "ok", id: h.id });
      case "debug-alarm-in": await this.state.storage.setAlarm(Date.now() + h.ms); return this.send(ws, { op: "ok", id: h.id });
      case "debug-alarm-get": return this.send(ws, { op: "alarm-at", id: h.id, at: await this.state.storage.getAlarm() });
    }
  }

  webSocketClose(ws) {
    const att = ws.deserializeAttachment();
    if (att && att.device) this.broadcastPresence(att.device, "off", ws);
  }
  webSocketError(ws) { this.webSocketClose(ws); }

  // ---- presence: the set of authenticated hibernatable sockets, nothing stored ----
  onlineDevices(excluding) {
    const s = new Set();
    for (const w of this.state.getWebSockets()) {
      if (w === excluding) continue;
      const a = w.deserializeAttachment();
      if (a && a.authed) s.add(a.device);
    }
    return [...s];
  }
  broadcastPresence(device, state, excluding) {
    // If another socket of the same device remains, it is still "on".
    if (state === "off" && this.onlineDevices(excluding).includes(device)) return;
    for (const w of this.state.getWebSockets()) {
      if (w === excluding) continue;
      const a = w.deserializeAttachment();
      if (a && a.authed && a.device !== device) this.send(w, { op: "presence-change", device, state });
    }
  }

  // ---- pass-through: not stored, not counted against the cap ----
  pass(from, h, payload) {
    this.counters.passIn++;
    for (const w of this.state.getWebSockets()) {
      const a = w.deserializeAttachment();
      if (!a || !a.authed || a.device === from) continue;
      if (h.to !== "all" && h.to !== a.device) continue;
      this.send(w, { op: "pass", from, g: h.g }, payload);
    }
  }

  // ---- hold ----
  hold(ws, h, payload) {
    if (payload.byteLength > MAX_FRAME) return this.send(ws, { op: "over-limit", id: h.id, why: "frame" });
    const now = this.now();
    const size = payload.byteLength;
    let g = this.q(`SELECT next_seq,bytes,last_line_at FROM groups WHERE g=?`, h.g)[0];
    if (!g) {
      this.q(`INSERT INTO groups(g,next_seq,bytes,last_line_at,last_touch,released_through) VALUES(?,?,?,?,?,?)`, h.g, 1, 0, now, now, 0);
      g = { next_seq: 1, bytes: 0, last_line_at: now };
    }
    if (g.bytes + size > this.cap) return this.send(ws, { op: "over-limit", id: h.id, why: "group" });
    // Release whole groups, least recently used first, never the one being written.
    let released = [];
    if (this.totalBytes() + size > this.cap) released = this.makeRoom(size, h.g);
    if (this.totalBytes() + size > this.cap) return this.send(ws, { op: "over-limit", id: h.id, why: "set" });
    const seq = g.next_seq;
    this.q(`INSERT INTO frames(g,seq,sz,b) VALUES(?,?,?,?)`, h.g, seq, size, payload);
    // One row for the group (counter + touch + last line), one for the set total.
    this.q(`UPDATE groups SET next_seq=?, bytes=bytes+?, last_touch=?, last_line_at=CASE WHEN ? THEN ? ELSE last_line_at END WHERE g=?`,
      seq + 1, size, now, h.line ? 1 : 0, now, h.g);
    this.metaSet("total_bytes", this.totalBytes() + size);
    this.send(ws, { op: "stored", id: h.id, g: h.g, seq, boot: this.constructedAt });
    for (const r of released) this.announceRelease(r.g, r.through);
    return this.arm();
  }

  makeRoom(need, protectG) {
    const released = [];
    const victims = this.q(`SELECT g,next_seq,bytes FROM groups WHERE g<>? AND bytes>0 ORDER BY last_touch ASC`, protectG);
    for (const v of victims) {
      if (this.totalBytes() + need <= this.cap) break;
      released.push({ g: v.g, through: v.next_seq - 1 });
      this.dropGroup(v.g, false);
    }
    return released;
  }

  // Empties a group, keeps its row as a mark: released_through says "lines up to here were let go".
  dropGroup(g, announce) {
    const row = this.q(`SELECT next_seq,bytes FROM groups WHERE g=?`, g)[0];
    if (!row) return;
    this.q(`DELETE FROM frames WHERE g=?`, g);
    this.q(`UPDATE groups SET bytes=0, released_through=? WHERE g=?`, row.next_seq - 1, g);
    this.metaSet("total_bytes", Math.max(0, this.totalBytes() - row.bytes));
    if (announce) this.announceRelease(g, row.next_seq - 1);
  }
  announceRelease(g, through) {
    for (const w of this.state.getWebSockets()) this.send(w, { op: "released", g, throughSeq: through });
  }

  // ---- fetch-after ----
  fetchAfter(ws, h) {
    const g = this.q(`SELECT released_through,next_seq FROM groups WHERE g=?`, h.g)[0];
    if (!g) return this.send(ws, { op: "frames-end", id: h.id, g: h.g, more: false, empty: true });
    if (h.seq < g.released_through) return this.send(ws, { op: "gap", id: h.id, g: h.g, through: g.released_through });
    let sent = 0, last = h.seq, more = false;
    const cur = this.sql.exec(`SELECT seq,sz,b FROM frames WHERE g=? AND seq>? ORDER BY seq`, h.g, h.seq);
    for (const r of cur) {
      if (sent + r.sz > FETCH_PAGE_BYTES && sent > 0) { more = true; break; }
      this.send(ws, { op: "frame", id: h.id, g: h.g, seq: r.seq }, new Uint8Array(r.b));
      sent += r.sz; last = r.seq;
    }
    this.counters.rowsRead += cur.rowsRead;
    this.send(ws, { op: "frames-end", id: h.id, g: h.g, more, last });
  }

  // ---- received: unsealed progress; frame dropped once EVERY roster device has it ----
  received(dev, h) {
    this.q(`INSERT INTO recv(g,dev,through) VALUES(?,?,?) ON CONFLICT(g,dev) DO UPDATE SET through=MAX(through,excluded.through)`, h.g, dev, h.throughSeq);
    // Writer already has its own frames: the writer reports its own writes as received too (stub).
    const roster = this.q(`SELECT count(*) n FROM roster`)[0].n;
    const m = this.q(`SELECT count(*) n, min(through) m FROM recv WHERE g=?`, h.g)[0];
    if (m.n < roster) return; // a roster device has said nothing yet
    const sz = this.q(`SELECT coalesce(sum(sz),0) s FROM frames WHERE g=? AND seq<=?`, h.g, m.m)[0].s;
    if (!sz) return;
    this.q(`DELETE FROM frames WHERE g=? AND seq<=?`, h.g, m.m);
    this.q(`UPDATE groups SET bytes=bytes-? WHERE g=?`, sz, h.g);
    this.metaSet("total_bytes", Math.max(0, this.totalBytes() - sz));
  }

  // ---- registers with compare-and-swap ----
  regList(ws, h) {
    // sinceRev lets a device ask only for what changed (0 = everything).
    const rows = this.q(`SELECT k,v,tok,rev FROM regs WHERE rev>?`, h.sinceRev || 0);
    let total = 0; for (const r of rows) total += r.v.byteLength;
    const body = new Uint8Array(total); let o = 0;
    for (const r of rows) { body.set(new Uint8Array(r.v), o); o += r.v.byteLength; }
    this.send(ws, { op: "reg-list-result", id: h.id, rev: this.metaGet("rev", 0), regs: rows.map(r => ({ key: r.k, token: r.tok, len: r.v.byteLength })) }, body);
  }
  regSet(ws, h, payload) {
    if (payload.byteLength > 16 * 1024) return this.send(ws, { op: "over-limit", id: h.id, why: "register" });
    const cur = this.q(`SELECT tok,v FROM regs WHERE k=?`, h.key)[0];
    const curTok = cur ? cur.tok : 0;
    if (curTok !== (h.expectToken || 0)) {
      return this.send(ws, { op: "conflict", id: h.id, token: curTok, len: cur ? cur.v.byteLength : 0 }, cur ? new Uint8Array(cur.v) : null);
    }
    const rev = this.metaGet("rev", 0) + 1;
    this.metaSet("rev", rev);
    this.q(`INSERT INTO regs(k,v,tok,rev) VALUES(?,?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, tok=excluded.tok, rev=excluded.rev`, h.key, payload, curTok + 1, rev);
    this.send(ws, { op: "reg-ok", id: h.id, token: curTok + 1 });
  }

  // ---- lifetime rules by alarm: 30 days after a group's last line; 90 idle days erases the set ----
  async arm() {
    if (this.alarmArmed) return;
    // An early alarm is harmless (it recomputes and re-arms), so one getAlarm per wake is enough.
    if ((await this.state.storage.getAlarm()) === null) {
      await this.state.storage.setAlarm(Date.now() + THIRTY_DAYS);
    }
    this.alarmArmed = true;
  }
  async alarm() {
    const now = this.now();
    if (now - this.metaGet("last_connect", now) > NINETY_DAYS) {
      for (const w of this.state.getWebSockets()) { try { w.close(4004, "set erased"); } catch {} }
      await this.state.storage.deleteAll(); // registers, roster, everything
      this.init(); this.alarmArmed = false;
      return;
    }
    const old = this.q(`SELECT g,next_seq FROM groups WHERE bytes>0 AND last_line_at<?`, now - THIRTY_DAYS);
    for (const o of old) this.dropGroup(o.g, true);
    // next wake: the oldest remaining group's expiry, or the 90-day idle check, whichever is sooner
    const m = this.q(`SELECT min(last_line_at) m FROM groups WHERE bytes>0`)[0].m;
    const idleAt = this.metaGet("last_connect", now) + NINETY_DAYS;
    const next = Math.min(m ? m + THIRTY_DAYS : Infinity, idleAt);
    await this.state.storage.setAlarm(Date.now() + Math.max(60_000, next - now));
  }
}
