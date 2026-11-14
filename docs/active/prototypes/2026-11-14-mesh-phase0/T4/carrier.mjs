// T4 prototype: devices, a controllable network, and the carrier loop of design 5.7.
import fs from 'node:fs';
import path from 'node:path';
import { Repo, run, mergeCommit, hiddenCopies } from './lib.mjs';

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.int = (n) => Math.floor(f() * n);
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  return f;
}

export class Net {
  constructor(r) { this.r = r; this.items = []; this.dropped = 0; this.delivered = 0; this.dup = 0; this.bytes = 0; }
  send(item, now, maxDelay = 2) { this.items.push({ ...item, ready: now + this.r.int(maxDelay + 1) }); }
  /** Deliver a random subset in random order; may drop or duplicate. */
  deliver(now, devices, { pDeliver = 0.6, pDrop = 0, pDup = 0 } = {}) {
    const ready = this.items.filter((i) => i.ready <= now);
    this.items = this.items.filter((i) => i.ready > now);
    for (let i = ready.length - 1; i > 0; i--) { const j = this.r.int(i + 1); [ready[i], ready[j]] = [ready[j], ready[i]]; }
    for (const it of ready) {
      if (this.r.chance(pDrop)) { this.dropped++; continue; }
      if (!this.r.chance(pDeliver)) { this.items.push(it); continue; }
      if (this.r.chance(pDup)) { this.items.push({ ...it, ready: now + 1 + this.r.int(4) }); this.dup++; }
      this.delivered++;
      devices.get(it.to)?.receive(it);
    }
  }
}

const RETRY = 3; // ticks between resends while a neighbour has not caught up

export class Device {
  constructor(name, root, world) {
    this.name = name; this.w = world; this.root = root;
    this.work = path.join(root, 'work');
    this.hist = path.join(this.work, '.youcoded', 'sync.git');
    this.mr = path.join(this.work, '.youcoded', 'mesh-remote.git');
    this.neighbours = []; this.peerHead = new Map(); this.lastSent = new Map(); this.sentHead = new Map();
    this.pendingTips = new Map(); // id -> sender
    this.owe = new Set(); // neighbours that sent us a tip and have not heard our head
    this.diverged = new Map(); // sender -> tip id
    this.parked = []; // bundles whose prerequisites are not here yet
    this.dirty = false; this.localCommits = []; this.changed = false; this.stat = { bundles: 0, bundleBytes: 0, imports: 0, importFails: 0 };
  }
  init() {
    fs.mkdirSync(this.work, { recursive: true });
    run(['init', '-q', '-b', 'main', '--bare', this.mr]);
    run(['init', '-q', '-b', 'main', '--bare', this.hist]);
    this.repo = new Repo(this.hist, this.work);
    this.repo.g(['config', 'core.bare', 'false']);
    this.repo.g(['config', 'core.worktree', this.work]);
    fs.mkdirSync(path.join(this.hist, 'info'), { recursive: true });
    fs.writeFileSync(path.join(this.hist, 'info', 'exclude'), '.youcoded/\n');
    this.mrRepo = new Repo(this.mr);
  }
  /** Paths of HEAD that are kept in history but not shown (identical duplicate conflict copies). */
  hiddenNow() {
    if (this.w.cfg.view === false) return new Set();
    const h = this.head(); if (!h) return new Set();
    if (this._hid?.[0] === h) return this._hid[1];
    const m = new Map(); for (const l of this.repo.g(['ls-tree', '-r', '-z', h]).out.split('\0').filter(Boolean)) { const [meta, f] = l.split('\t'); m.set(f, meta.split(' ')[2]); }
    const set = hiddenCopies(m); this._hid = [h, set, [...m.keys()]]; return set;
  }
  /** Make the disk match HEAD minus the hidden copies. */
  syncView() {
    const hid = this.hiddenNow();
    for (const f of hid) fs.rmSync(path.join(this.work, f), { force: true });
    // a copy that stopped being a duplicate must show up again
    const missing = (this._hid?.[2] ?? []).filter((f) => !hid.has(f) && !fs.existsSync(path.join(this.work, f)));
    if (missing.length) this.repo.g(['checkout', '-q', 'HEAD', '--', ...missing]);
  }
  /** `add -A`, then put the hidden copies' index entries back (their absence on disk is not a deletion). */
  stageAll() {
    this.repo.g(['add', '-A']);
    const hid = this.hiddenNow(); if (!hid.size) return;
    const lines = []; for (const l of this.repo.g(['ls-tree', '-r', '-z', this.head()]).out.split('\0').filter(Boolean)) { const [meta, f] = l.split('\t'); if (hid.has(f)) lines.push(`100644 ${meta.split(' ')[2]}\t${f}`); }
    if (lines.length) this.repo.g(['update-index', '--add', '--index-info'], { input: lines.join('\n') + '\n' });
  }
  now() { return this.w.baseTime + this.w.tick * 2 + this.skew; }
  head() { if (this._head === undefined) this._head = this.repo.out(['rev-parse', '-q', '--verify', 'refs/heads/main'], { ok: true }) || null; return this._head; }
  commitLocal(msg = 'sync') {
    this.stageAll();
    if (this.repo.g(['diff', '--cached', '--quiet'], { ok: true }).code === 0 && this.head()) return null;
    const t = `${this.now()} +0000`;
    const env = { GIT_AUTHOR_NAME: this.name, GIT_AUTHOR_EMAIL: 'd@x', GIT_COMMITTER_NAME: this.name, GIT_COMMITTER_EMAIL: 'd@x', GIT_AUTHOR_DATE: t, GIT_COMMITTER_DATE: t };
    this.repo.g(['commit', '-q', '-m', msg], { env });
    this._head = undefined;
    const id = this.head(); this.localCommits.push(id); this.changed = true; this.dirty = false;
    this.syncView(); // an edit may have made a copy a duplicate, or stopped it being one
    return id;
  }
  snapshot() { if (this.dirty) this.commitLocal(); }
  receive(it) {
    if (it.type === 'tip') { (this.tipFrom ||= new Set()).add(it.sender); this.peerHead.set(it.sender, it.id); this.pendingTips.set(it.id, it.sender); if (!it.ack) this.owe.add(it.sender); return; }
    if (it.type === 'bundle') { if (!this.importBundle(it)) this.parked.push(it); else this.retryParked(); }
  }
  importBundle(it) {
    const r = run(['fetch', '-q', it.file, `+refs/tips/${it.sender}:refs/mesh/${it.sender}`], { gitDir: this.mr, ok: true });
    if (r.code !== 0) { this.stat.importFails++; return false; }
    this.repo.g(['fetch', '-q', this.mr, '+refs/mesh/*:refs/remotes/mesh/*']);
    this.stat.imports++; (this.bundleFrom ||= new Set()).add(it.sender);
    return true;
  }
  retryParked() {
    let progress = true;
    while (progress && this.parked.length) {
      progress = false;
      for (const it of [...this.parked]) if (this.importBundle(it)) { this.parked = this.parked.filter((p) => p !== it); progress = true; }
    }
  }
  /** Adopt tips that connect to local history; merge; update the work tree. */
  integrate() {
    // mixed=true: each device uses a different line-matching method, standing in for different git versions
    const cfg = this.w.cfg.mixed ? { ...this.w.cfg, diffAlgo: this.mixAlgo ?? 'myers' } : this.w.cfg;
    let head = this.head();
    const cands = [];
    for (const [id, sender] of [...this.pendingTips]) {
      if (this.diverged.has(sender)) { this.pendingTips.delete(id); continue; }
      if (!this.repo.has(id)) continue;                      // bundle not here yet: keep waiting
      if (head && this.repo.isAnc(id, head)) { this.pendingTips.delete(id); continue; } // already inside
      if (head && this.repo.g(['merge-base', head, id], { ok: true }).code !== 0) { // shares no history
        this.diverged.set(sender, id); this.pendingTips.delete(id); continue;
      }
      this.pendingTips.delete(id); cands.push(id);
    }
    if (!cands.length) return;
    let heads = [...new Set([head, ...cands].filter(Boolean))];
    if (cfg.dominance === false) { // the design as written: only real ancestry removes a head
      heads = heads.filter((h) => !heads.some((o) => o !== h && this.repo.isAnc(h, o)));
    } else {
      // WHY: a head whose user commits (non-merge commits) are all inside another head adds nothing
      // to merge; on a tie of content the lower commit id wins. Without this rule two devices that
      // each merged the same commits in a different order keep merging each other's merges forever.
      const covered = (a, b) => this.repo.out(['rev-list', '--no-merges', '--max-count=1', a, `^${b}`]) === '';
      const cov = new Map(); const C = (a, b) => { const k = a + b; if (!cov.has(k)) cov.set(k, covered(a, b)); return cov.get(k); };
      // Equal content: the commit with more history wins, then the lower id. (Lower id alone dead-locks:
      // a device whose head is a descendant of the lower-id one never gives way, the others never take it.)
      const cnt = (h) => { if (!this.repo.cnt.has(h)) this.repo.cnt.set(h, +this.repo.out(['rev-list', '--count', h])); return this.repo.cnt.get(h); };
      const beats = (o, h) => (cfg.tie === 'id' ? o < h : cnt(o) > cnt(h) || (cnt(o) === cnt(h) && o < h));
      heads = heads.filter((h) => !heads.some((o) => o !== h && C(h, o) && (!C(o, h) || beats(o, h))));
    }
    let cur;
    if (cfg.fold === 'naive') { cur = head; for (const c of cands) cur = mergeCommit(this.repo, cur, c, cfg, { dev: this.name, now: this.now() }); }
    else { heads.sort(); cur = heads[0]; for (const h of heads.slice(1)) cur = mergeCommit(this.repo, cur, h, cfg, { dev: this.name, now: this.now() }); }
    if (cur !== head) {
      this.repo.g(['update-ref', 'refs/heads/main', cur]); this._head = cur;
      this.repo.g(['reset', '-q', '--hard', cur]);
      this.syncView();
      this.changed = true;
    }
  }
  /** Local history goes into the carrier repo too (GitTransport pushes to its remote), so bundles can name it as a prerequisite. */
  publishLocal() { const h = this.head(); if (h && this.pubHead !== h) { this.repo.g(['push', '-q', this.mr, '+refs/heads/main:refs/heads/main']); this.pubHead = h; } }
  /** Send our head to each neighbour that may lack it. */
  sendRound(now) {
    const head = this.head(); if (!head) return 0;
    this.publishLocal();
    let sent = 0;
    for (const p of this.neighbours) {
      const ph = this.peerHead.get(p);
      if (ph && this.repo.has(ph) && this.repo.isAnc(head, ph)) {
        // it has everything we have; still answer a tip once so it learns where we are
        if (this.owe.delete(p)) { this.w.net.send({ type: 'tip', to: p, sender: this.name, id: head, ack: true }, now); sent++; }
        continue;
      }
      this.owe.delete(p);
      const fresh = this.sentHead.get(p) !== head;
      if (!fresh && now - (this.lastSent.get(p) ?? -99) < RETRY) continue;
      this.sentHead.set(p, head); this.lastSent.set(p, now);
      this.repo.g(['update-ref', `refs/tips/${this.name}`, head]);
      const file = path.join(this.w.dir, `b-${this.name}-${p}-${this.w.seq++}.bundle`);
      const args = ['bundle', 'create', '-q', file, `refs/tips/${this.name}`];
      if (ph && this.repo.has(ph) && !this.w.cfg.fullBundles) args.push(`^${ph}`);
      this.repo.g(args);
      const size = fs.statSync(file).size; this.stat.bundles++; this.stat.bundleBytes += size; this.w.net.bytes += size;
      this.w.net.send({ type: 'bundle', to: p, sender: this.name, file }, now);
      this.w.net.send({ type: 'tip', to: p, sender: this.name, id: head }, now);
      sent++;
    }
    return sent;
  }
}

export class World {
  constructor({ dir, names, topo = 'full', cfg = {}, seed = 1 }) {
    this.dir = dir; this.cfg = cfg; this.r = rng(seed); this.seq = 0; this.tick = 0; this.baseTime = 1_760_000_000;
    this.net = new Net(rng(seed ^ 0x9e3779b9));
    fs.mkdirSync(dir, { recursive: true });
    this.devices = new Map();
    for (const n of names) {
      const d = new Device(n, path.join(dir, n), this); d.skew = 0; d.mixAlgo = ['myers', 'patience', 'histogram', 'minimal', 'myers'][this.devices.size % 5]; d.init(); this.devices.set(n, d);
    }
    const ns = [...names];
    for (let i = 0; i < ns.length; i++) for (let j = 0; j < ns.length; j++) {
      if (i === j) continue;
      const ok = topo === 'full' || (topo === 'chain' && Math.abs(i - j) === 1) || (topo === 'star' && (i === 0 || j === 0));
      if (ok) this.devices.get(ns[i]).neighbours.push(ns[j]);
    }
    this.log = { written: new Set(), removed: new Set(), userCommits: 0, ops: 0 };
  }
  /** Give every device the first device's starting project (the one-time first download). */
  seedFrom(first) {
    const a = this.devices.get(first);
    a.commitLocal('initial');
    for (const [n, d] of this.devices) {
      if (n === first) continue;
      d.mrRepo.g(['fetch', '-q', a.hist, '+refs/heads/main:refs/mesh/seed']);
      d.repo.g(['fetch', '-q', d.mr, '+refs/mesh/*:refs/remotes/mesh/*']);
      const id = d.repo.out(['rev-parse', 'refs/remotes/mesh/seed']);
      d.repo.g(['update-ref', 'refs/heads/main', id]); d._head = undefined;
      d.repo.g(['reset', '-q', '--hard', id]);
    }
  }
  /** One simulated 2 s step. ops: callback(world) that edits work trees. */
  step({ ops, net = {} } = {}) {
    this.tick++;
    let sent = 0, changed = false;
    if (ops) ops(this);
    for (const d of this.devices.values()) d.snapshot();
    this.net.deliver(this.tick, this.devices, net);
    for (const d of this.devices.values()) { d.integrate(); }
    for (const d of this.devices.values()) { sent += d.sendRound(this.tick); if (d.changed) { changed = true; d.changed = false; } }
    return { sent, changed };
  }
  heads() { return [...this.devices.values()].map((d) => d.head()); }
  /** Run with no new writes until nothing moves. Returns ticks used, or null if it never settled. */
  quiesce({ cap = 400, net = { pDeliver: 0.6, pDup: 0.1 } } = {}) {
    let quiet = 0;
    for (let i = 0; i < cap; i++) {
      const r = this.step({ net });
      if (this.cfg.trace) console.log(this.tick, this.heads().map((h) => h?.slice(0, 6)).join(' '), 'sent', r.sent, 'inflight', this.net.items.length, [...this.devices.values()].map((d) => d.parked.length + '/' + d.pendingTips.size).join(' '));
      const hs = this.heads(); const same = hs.every((h) => h === hs[0]);
      if (!r.sent && !r.changed && !this.net.items.length && same) quiet++; else quiet = 0;
      if (quiet >= RETRY + 1) return i + 1;
    }
    return null;
  }
}
