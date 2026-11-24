// Reviewer-5 virtual disk (written from scratch): per-file durable/volatile bytes with a log of unsynced writes (any subsequence may survive a power cut),
// and a global log of unsynced directory operations (per-directory prefix survives; cross-directory rename atomic).
import type { Fs, FileLike } from './new/fsio';
export class Crash extends Error { constructor(public op: number) { super('r5-crash@' + op); } }
type WOp = { t: 'w'; pos: number; buf: Buffer } | { t: 'T'; len: number };
interface Ino { id: number; dur: Buffer; vol: Buffer; pend: WOp[] }
type Ent = number | 'D';
interface DOp { kind: 'set' | 'del' | 'mv'; path: string; to?: string; ent?: Ent; dirs: string[]; dur: boolean }
const par = (p: string) => p.slice(0, p.lastIndexOf('/')) || '/';
const enospc = () => Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
const enoent = (p: string) => Object.assign(new Error('ENOENT ' + p), { code: 'ENOENT' });
export class VFS implements Fs {
  inos = new Map<number, Ino>(); nextIno = 1;
  base = new Map<string, Ent>(); vol = new Map<string, Ent>(); ops: DOp[] = [];
  ops_n = 0; failAt = -1; dead = false; tearMode: 'none' | 'prefix' | 'garbage' = 'none'; enospcFrom = -1; allocs = 0; tearFull = false;
  rnd: () => number;
  constructor(rnd: () => number) { this.rnd = rnd; this.base.set('/', 'D'); this.vol.set('/', 'D'); }
  arm(n: number, tear: 'none' | 'prefix' | 'garbage') { this.failAt = this.ops_n + n; this.tearMode = tear; }
  disarm() { this.failAt = -1; }
  private tick() { if (this.dead) throw new Crash(this.ops_n); this.ops_n++; if (this.ops_n === this.failAt) { this.dead = true; return true; } return false; }
  private full() { this.allocs++; return this.enospcFrom >= 0 && this.allocs >= this.enospcFrom; }
  private ino(id: number) { return this.inos.get(id)!; }
  private logOp(o: Omit<DOp, 'dur'>) { this.ops.push({ ...o, dur: false }); }
  private applyVol(m: Map<string, Ent>, o: DOp) {
    if (o.kind === 'set') m.set(o.path, o.ent!);
    else if (o.kind === 'del') { m.delete(o.path); }
    else if (o.kind === 'mv') { const e = m.get(o.path); if (e === undefined) return; m.delete(o.path); m.set(o.to!, e); if (e === 'D') { for (const [k, v] of [...m]) if (k.startsWith(o.path + '/')) { m.delete(k); m.set(o.to! + k.slice(o.path.length), v); } } }
  }
  settle(mode: 'kill' | 'power') {
    this.dead = false; this.failAt = -1; this.enospcFrom = -1;
    if (mode === 'kill') { for (const i of this.inos.values()) { i.dur = i.vol; i.pend = []; } this.base = new Map(this.vol); this.ops = []; return; }
    for (const i of this.inos.values()) {
      let cur = Buffer.from(i.dur); const style = this.rnd();
      for (let k = 0; k < i.pend.length; k++) {
        const keep = style < 0.34 ? false : style < 0.67 ? k < Math.floor(this.rnd() * (i.pend.length + 1)) : this.rnd() < 0.5;
        if (keep) cur = applyW(cur, i.pend[k]);
      }
      i.dur = cur; i.vol = cur; i.pend = [];
    }
    const nd = new Map<string, DOp[]>();
    for (const o of this.ops) if (!o.dur) for (const d of o.dirs) { if (!nd.has(d)) nd.set(d, []); nd.get(d)!.push(o); }
    const cut = new Map<string, number>(); const strategy = this.rnd();
    for (const [d, l] of nd) cut.set(d, strategy < 0.25 ? 0 : strategy < 0.5 ? l.length : Math.floor(this.rnd() * (l.length + 1)));
    const m = new Map(this.base);
    for (const o of this.ops) { const kept = o.dur || o.dirs.every((d) => nd.get(d)!.indexOf(o) < (cut.get(d) ?? 0)); if (kept) this.applyVol(m, o); }
    this.base = m; this.vol = new Map(m); this.ops = [];
  }
  private mustParent(p: string) { const d = par(p); if (this.vol.get(d) !== 'D') throw enoent(d); }
  async open(path: string, o: { create: boolean }): Promise<FileLike> {
    let e = this.vol.get(path);
    if (e === 'D') throw Object.assign(new Error('EISDIR'), { code: 'EISDIR' });
    if (e === undefined) {
      if (!o.create) throw enoent(path);
      this.mustParent(path);
      if (this.tick()) throw new Crash(this.ops_n);
      if (this.full()) throw enospc();
      const id = this.nextIno++; this.inos.set(id, { id, dur: Buffer.alloc(0), vol: Buffer.alloc(0), pend: [] });
      this.vol.set(path, id); this.logOp({ kind: 'set', path, ent: id, dirs: [par(path)] }); e = id;
    } else if (this.dead) throw new Crash(this.ops_n);
    const ino = this.ino(e as number); const self = this;
    return {
      async write(buf, pos) {
        if (self.dead) throw new Crash(self.ops_n);
        self.ops_n++;
        const b = Buffer.from(buf);
        if (self.ops_n === self.failAt) {
          self.dead = true;
          if (self.tearMode !== 'none' && b.length > 1) { const n = 1 + Math.floor(self.rnd() * (b.length - 1)); const piece = self.tearMode === 'prefix' ? b.subarray(0, n) : Buffer.from(Array.from({ length: n }, () => Math.floor(self.rnd() * 256))); const op: WOp = { t: 'w', pos, buf: Buffer.from(piece) }; ino.vol = applyW(ino.vol, op); ino.pend.push(op); }
          throw new Crash(self.ops_n);
        }
        if (self.full()) { if (self.tearFull && b.length > 1) { const op: WOp = { t: 'w', pos, buf: b.subarray(0, b.length >> 1) }; ino.vol = applyW(ino.vol, op); ino.pend.push(op); } throw enospc(); }
        const op: WOp = { t: 'w', pos, buf: b }; ino.vol = applyW(ino.vol, op); ino.pend.push(op);
      },
      async read(pos, len) { if (self.dead) throw new Crash(self.ops_n); return Buffer.from(ino.vol.subarray(pos, pos + len)); },
      async size() { if (self.dead) throw new Crash(self.ops_n); return ino.vol.length; },
      async truncate(len) { if (self.tick()) throw new Crash(self.ops_n); const op: WOp = { t: 'T', len }; ino.vol = applyW(ino.vol, op); ino.pend.push(op); },
      async sync() { if (self.tick()) throw new Crash(self.ops_n); ino.dur = ino.vol; ino.pend = []; },
      async close() { /* nothing */ },
    };
  }
  async readFile(p: string) { if (this.dead) throw new Crash(this.ops_n); const e = this.vol.get(p); if (e === undefined || e === 'D') return null; return Buffer.from(this.ino(e).vol); }
  async readdir(p: string) { if (this.dead) throw new Crash(this.ops_n); const out: string[] = []; const pre = p === '/' ? '/' : p + '/'; for (const k of this.vol.keys()) if (k !== p && k.startsWith(pre) && !k.slice(pre.length).includes('/')) out.push(k.slice(pre.length)); return out; }
  async exists(p: string) { if (this.dead) throw new Crash(this.ops_n); return this.vol.has(p); }
  async mkdir(p: string) { if (this.vol.has(p)) return; this.mustParent(p); if (this.tick()) throw new Crash(this.ops_n); if (this.full()) throw enospc(); this.vol.set(p, 'D'); this.logOp({ kind: 'set', path: p, ent: 'D', dirs: [par(p)] }); }
  async rename(a: string, b: string) {
    if (!this.vol.has(a)) throw enoent(a); this.mustParent(b);
    if (this.tick()) throw new Crash(this.ops_n);
    const o: Omit<DOp, 'dur'> = { kind: 'mv', path: a, to: b, dirs: [...new Set([par(a), par(b)])] }; this.logOp(o); this.applyVol(this.vol, { ...o, dur: false });
  }
  async unlink(p: string) { if (!this.vol.has(p)) return; if (this.tick()) throw new Crash(this.ops_n); this.vol.delete(p); this.logOp({ kind: 'del', path: p, dirs: [par(p)] }); }
  async fsyncDir(p: string) { if (this.tick()) throw new Crash(this.ops_n); for (const o of this.ops) if (o.dirs.includes(p)) o.dur = true; }
  files(): string[] { return [...this.vol].filter(([, e]) => e !== 'D').map(([k]) => k).sort(); }
  get(p: string): Buffer | null { const e = this.vol.get(p); return e === undefined || e === 'D' ? null : Buffer.from(this.ino(e as number).vol); }
  put(p: string, b: Buffer | null) {
    const e = this.vol.get(p);
    if (b === null) { this.vol.delete(p); this.base.delete(p); return; }
    if (e === undefined || e === 'D') { const id = this.nextIno++; this.inos.set(id, { id, dur: b, vol: b, pend: [] }); this.vol.set(p, id); this.base.set(p, id); return; }
    const i = this.ino(e); i.vol = b; i.dur = b; i.pend = [];
  }
  dirSnapshot(prefix: string): Map<string, Buffer> { const m = new Map<string, Buffer>(); for (const f of this.files()) if (f.startsWith(prefix)) m.set(f, this.get(f)!); return m; }
  dirRestore(prefix: string, snap: Map<string, Buffer>) { for (const f of this.files()) if (f.startsWith(prefix) && !snap.has(f)) this.put(f, null); for (const [f, b] of snap) this.put(f, b); }
}
function applyW(cur: Buffer, op: WOp): Buffer {
  if (op.t === 'T') return op.len <= cur.length ? Buffer.from(cur.subarray(0, op.len)) : Buffer.concat([cur, Buffer.alloc(op.len - cur.length)]);
  const end = op.pos + op.buf.length; const out = Buffer.alloc(Math.max(cur.length, end)); cur.copy(out); op.buf.copy(out, op.pos); return out;
}
