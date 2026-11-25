// Review-10 independent fuzz of the chat store (head 5ff9a593c). Own oracle, own fault catalogue; reuses only review 9's virtual disk (vfs.ts) as the disk model.
// Env: R10_MODE=mixed|crash  R10_FROM R10_TO (seed range)  R10_OUT (jsonl results)  R10_SEEDS=1,2,3 (explicit)  R10_DBG=1
// ORACLE: hist[v] = every line the store acknowledged or was observed to serve for version v (positions below hist.length are fixed forever).
//   WRONG-LINE: a served line differing from hist[i] (i < hist.length), or an un-adopted position holding a line that no append/park ever carried at that position.
//   Loud outcomes (typed error, flag, rolledBack, quarantine) are only allowed on a version that had a fault dealt; on unfaulted versions every one is a FALSE-ALARM.
//   SILENT-SHRINK: head below hist.length with nothing reported. Violation unless the dealt fault is one of the documented limit-4 shapes (folder rolled back AND its high-water record also changed).
//   LOCKOUT: after resending hist from the reported start, a non-retired version is not clean (flags, refused reads, append errors).
import { test } from 'vitest';
import * as fs from 'node:fs';
import { env, reg, vid, prng, StoreError, Crash, BASE } from './lib';

const MODE = process.env.R10_MODE ?? 'mixed'; const CRASHONLY = MODE === 'crash';
const OUT = process.env.R10_OUT; const DBG = !!process.env.R10_DBG;
const seeds: number[] = process.env.R10_SEEDS ? process.env.R10_SEEDS.split(',').map(Number) : (() => { const a = Number(process.env.R10_FROM ?? 1), b = Number(process.env.R10_TO ?? 11); return Array.from({ length: b - a }, (_, i) => a + i); })();

const mk = (tag: string, i: number, alt = 0) => Buffer.from(JSON.stringify({ type: i % 2 ? 'user' : 'assistant', uuid: `${tag}${alt ? 'A' + alt : ''}-${i}`, message: { role: 'user', content: `${tag}#${i}#${alt}#` + 'x'.repeat(10 + (i * 7) % 40) } }) + '\n');
interface Fault { kind: string; hwIntact: boolean; documented: boolean; hwOnly: boolean }
interface Ver { id: Buffer; hex: string; chat: string; tag: string; base: Buffer[]; hist: Buffer[]; cand: Map<number, Buffer[]>; ev: number; evMax: number; retired: boolean; retireMaybe: boolean; registered: boolean; fault: Fault | null; snaps: { files: Map<string, Buffer>; hw: Buffer | null; at: number }[]; recopyOf?: Ver; pendingFork?: { parent: Ver; from: number }; retiredFaulted?: boolean; wasRetiredFromId?: Ver }
const D = (...a: any[]) => { if (DBG) fs.appendFileSync(BASE + '/dbg.log', a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n'); };
const isCrash = (e: any) => e instanceof Crash || /r5-crash/.test(String(e?.message));

async function runSeed(seed: number) {
  const r = prng(seed * 7919 + 13); const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1)); const pickOf = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const viol: any[] = []; const events: Record<string, number> = {}; const ev = (k: string, n = 1) => { events[k] = (events[k] ?? 0) + n; };
  const bad = (k: string, d: any = {}) => { const vv = vers.find((x) => x.hex === d.v); if (/^RETIRED-ID/.test(k) && vv && (vv as any).allGone) { ev('retired-id-back-after-all-witnesses-gone:' + (vv as any).allGone); return; } viol.push({ k, ...d }); };
  const e = await env(seed, pickOf([250, 400, 900]));
  let s: any = null; let idc = 1;
  const vers: Ver[] = [];
  const newVer = (chat: string, base: Buffer[], recopyOf?: Ver): Ver => { const id = vid(idc++); D('NEWVER', id.toString('hex'), recopyOf?.hex ?? ''); const v: Ver = { id, hex: id.toString('hex'), chat, tag: 'v' + id[1] + 's' + seed, base, hist: [...base], cand: new Map(), ev: 0, evMax: 0, retired: false, retireMaybe: false, registered: false, fault: null, snaps: [], recopyOf }; vers.push(v); return v; };
  const gen = (v: Ver, i: number) => (i < v.base.length ? v.base[i] : mk(v.tag, i));
  const addCand = (v: Ver, i: number, b: Buffer) => { const a = v.cand.get(i) ?? []; if (!a.some((x) => x.equals(b))) a.push(b); v.cand.set(i, a); };
  const pickLine = (v: Ver, i: number, allowAlt = true): Buffer => { if (i < v.hist.length) return v.hist[i]; const b = allowAlt && r() < 0.12 ? mk(v.tag, i, ri(1, 2)) : gen(v, i); addCand(v, i, b); return b; };
  const chats = ['c1', 'c2'];
  for (let k = 0; k < 3; k++) newVer(pickOf(chats), []);
  const live = () => vers.filter((v) => !v.retired && v.registered && !v.pendingFork);
  const hexOf = (v: Ver) => v.hex;
  const dirOf = (v: Ver) => `${e.root}/versions/${v.hex}/`; const hwOf = (v: Ver) => `${e.root}/highwater/${v.hex}.hw`;
  const vfiles = (v: Ver) => e.vfs.files().filter((p) => p.startsWith(dirOf(v)));
  const code = (x: any) => (x instanceof StoreError ? x.code : isCrash(x) ? 'CRASH' : 'UNTYPED:' + String(x?.message ?? x).slice(0, 60));
  const unfaultedLoud = (v: Ver, what: string, d: any = {}) => { if (!v.fault) bad('FALSE-ALARM-' + what, { v: v.hex, ...d }); else ev('loud-' + what + '-faulted'); };

  async function openStore() {
    for (let a = 0; a < 3; a++) { try { s = await e.open(); return; } catch (x: any) { if (isCrash(x)) { await e.crash(r() < 0.5 ? 'kill' : 'power'); continue; } bad('OPEN-THREW', { code: code(x) }); throw x; } }
  }
  async function crashed() { D('CRASH'); s = null; ev('crash'); await e.crash(r() < 0.5 ? 'kill' : 'power'); }

  async function retireHandling(v: Ver, why: string) { // the store (or the caller) retired v
    if (v.retired && (v as any).planned) return; v.retired = true; (v as any).planned = true; ev('retired-' + why);
    if (v.hist.length > 0 || r() < 0.5) { const nv = newVer(v.chat, [], v); (nv as any).fill = [...v.hist]; }
  }

  // ---- observe: full read-back check of one version ----
  async function observe(v: Ver, tag: string): Promise<any | null> {
    let h: any;
    try { h = await s.head(v.id); } catch (x: any) {
      const c = code(x); if (c === 'CRASH') throw x;
      if (v.retired) { if (!['damaged', 'unknown-version', 'corrupt'].includes(c)) bad('RETIRED-HEAD-THREW-OTHER', { v: v.hex, c }); return null; }
      if (!v.registered) return null;
      if (c === 'damaged') { if (!v.fault && !v.retireMaybe) bad('FALSE-QUARANTINE', { v: v.hex, tag }); else ev('quarantined'); await retireHandling(v, 'by-store'); return null; }
      unfaultedLoud(v, 'head-threw-' + c, { tag }); return null;
    }
    if (v.retired) { if (v.retireMaybe) { v.retired = false; v.retireMaybe = false; ev('retire-did-not-happen'); } else { bad('RETIRED-ID-SERVES', { v: v.hex, tag }); return null; } }
    const flagged = h.rolledBack || h.damagedFromLine !== null;
    if (flagged) { if (!v.fault) bad('FALSE-FLAG', { v: v.hex, tag, rb: h.rolledBack, dmg: h.damagedFromLine, n: h.lines }); else ev('flag-faulted'); }
    if (h.evictedLines > v.evMax) { if (!v.fault) bad('EVICTED-MORE-THAN-ASKED', { v: v.hex, tag, had: h.evictedLines, asked: v.evMax }); else { ev('evicted-more-faulted'); const b0 = e.vfs.get(`${dirOf(v)}body-0000000000000000.bin`); ev('evicted-more:' + v.fault.kind + ((v.fault as any).sub ? ':' + (v.fault as any).sub : '') + (b0 && b0.length > 0 ? ':BODIES-PRESENT' : ':bodies-gone')); } }
    if (h.lines < v.hist.length) {
      if (!v.fault) bad('SHRINK-NO-FAULT', { v: v.hex, tag, n: h.lines, hist: v.hist.length });
      else if (!flagged) {
        // a loud typed refusal on every read would also count as reported; check one read
        let loud = false; try { const x = await s.read(v.id, 0, Math.max(0, h.lines - 1), Math.max(1, h.lines)); if (x !== 'evicted' && h.lines === 0) loud = false; } catch (er: any) { if (er instanceof StoreError) loud = true; }
        if (!loud) { if (v.fault.documented) ev('silent-shrink-documented'); else bad('SILENT-SHRINK', { v: v.hex, tag, n: h.lines, hist: v.hist.length, fault: v.fault.kind }); }
      }
    }
    for (let i = 0; i < h.lines; i++) {
      let got: any;
      try { got = await s.read(v.id, 0, i, i + 1); } catch (x: any) {
        const c = code(x); if (c === 'CRASH') throw x;
        if (!(x instanceof StoreError)) { bad('UNTYPED-READ', { v: v.hex, c }); continue; }
        if (!v.fault) bad('FALSE-READ-REFUSED', { v: v.hex, tag, i, c, n: h.lines, dmg: h.damagedFromLine, rb: h.rolledBack }); else ev('read-refused-faulted:' + c); continue;
      }
      if (got === 'evicted') { if (i >= v.evMax && !v.fault) bad('EVICTED-UNEXPECTED', { v: v.hex, tag, i }); continue; }
      const line: Buffer = got[0];
      if (i < v.hist.length) { if (!line.equals(v.hist[i])) bad('WRONG-LINE', { v: v.hex, tag, i, n: h.lines, hist: v.hist.length, fault: v.fault?.kind ?? null, rb: h.rolledBack, dmg: h.damagedFromLine }); }
      else if (i === v.hist.length) { const c = v.cand.get(i) ?? []; if (c.some((x) => x.equals(line))) { v.hist.push(line); ev('adopted'); } else bad('UNKNOWN-LINE', { v: v.hex, tag, i, n: h.lines }); }
      else ev('gap-unobserved'); // an earlier line could not be read (fault dealt): later lines are checked but not adopted
    }
    return h;
  }

  async function ensureRegistered() {
    for (const v of vers) {
      if (v.registered || v.retired || v.pendingFork) continue;
      try { await s.registerVersion(v.id, { chatId: v.chat, runtime: 'claude-code', parent: null }); v.registered = true; }
      catch (x: any) { const c = code(x); if (c === 'CRASH') throw x; if (c === 'damaged') { v.retired = true; ev('register-damaged'); bad('REGISTER-DAMAGED-NEW', { v: v.hex }); } else if (!v.fault) { bad('REGISTER-THREW', { c, v: v.hex }); } }
      if (v.registered && v.recopyOf) { /* filled by the recopy step */ }
    }
  }
  async function recopyStep() {
    for (const nv of vers.filter((x) => x.recopyOf && !x.retired && x.registered)) {
      const fill: Buffer[] = (nv as any).fill ?? []; if (!fill.length) continue;
      // the acked history of the old one is the truth to copy; new id holds what it holds; resend toward it
      for (let g = 0; g < 4; g++) {
        const h = await observe(nv, 'recopy'); if (!h) break; if (h.lines >= fill.length) break;
        const from = h.lines; const n = Math.min(fill.length - from, ri(1, 7)); const ls = fill.slice(from, from + n);
        ls.forEach((b, k) => addCand(nv, from + k, b));
        try { const res = await s.append(nv.id, 0, from, ls); if (res === 'ok') ev('recopy-append'); } catch (x: any) { if (isCrash(x)) throw x; if (!nv.fault) bad('FALSE-ALARM-recopy-threw', { c: code(x) }); break; }
      }
    }
  }
  async function pendingForks() {
    for (const c of vers.filter((x) => x.pendingFork)) {
      const { parent, from } = c.pendingFork!;
      try { const res = await s.forkVersion(parent.id, from, c.id); c.pendingFork = undefined; c.registered = true; c.base = parent.hist.slice(0, from); c.hist = [...c.base]; if (parent.fault?.documented) c.fault = { ...parent.fault, kind: 'inherited:' + parent.fault.kind }; ev(res.created ? 'fork-retry-created' : 'fork-found-complete'); }
      catch (x: any) { if (isCrash(x)) throw x; const k = code(x); c.pendingFork = undefined; c.retired = true; if (!parent.fault && !parent.retired && k !== 'evicted') bad('FALSE-ALARM-fork-retry', { c: k }); }
    }
  }

  async function op(n: number) {
    const lv = live(); if (!lv.length) return; const v = pickOf(lv); const kind = process.env.R10_RETIREHEAVY ? pickOf(['append', 'retire', 'retire', 'retire', 'reopen', 'fork']) : pickOf(['append', 'append', 'append', 'append', 'park', 'resend', 'fork', 'evict', 'restore', 'scrub', 'retire', 'reopen', 'close', 'hashAt', 'forkagain']);
    let h: any; if (!['reopen', 'close'].includes(kind)) { h = await observe(v, 'pre-' + kind); if (!h) return; }
    D('OP', kind, v.hex, 'head', h?.lines, 'hist', v.hist.length, 'dmg', h?.damagedFromLine, 'rb', h?.rolledBack);
    switch (kind) {
      case 'append': case 'resend': {
        if (v.hist.length < h.lines) return; // loud state: some served lines could not be read; skip
        const ov = kind === 'resend' ? ri(0, Math.min(h.lines, 12)) : ri(0, Math.min(3, h.lines));
        let from = h.lines - ov; if (h.damagedFromLine !== null && kind === 'resend') from = Math.min(from, h.damagedFromLine); if (from < v.ev) from = v.ev; if (from > h.lines) return;
        if (v.hist.length > h.lines && r() < 0.6) from = h.rolledBack ? h.rolledBack.from : h.lines;      // the replicator refills toward what it knows
        const m = ri(1, 7); const ls: Buffer[] = []; for (let i = from; i < from + m; i++) ls.push(pickLine(v, i, i >= v.hist.length));
        ev(kind);
        try {
          const res = await s.append(v.id, 0, from, ls);
          if (res === 'ok') { for (let i = from; i < from + m; i++) if (i >= v.hist.length) { if (i === v.hist.length) v.hist.push(ls[i - from]); } }
          else if (res === 'not-a-prefix') { if (!v.fault && from + m <= v.hist.length + 0) bad('FALSE-NOT-A-PREFIX', { v: v.hex, from, m, hist: v.hist.length }); else ev('not-a-prefix'); }
          else if (res === 'parked') ev('append-parked');
        } catch (x: any) {
          const c = code(x); if (c === 'CRASH') throw x; if (c === 'damaged') { if (!v.fault) bad('FALSE-QUARANTINE-append', { v: v.hex, from, m }); else ev('quarantined'); await retireHandling(v, 'by-store'); }
          else if (c === 'bad-argument') bad('APPEND-BAD-ARG', { from, head: h.lines });
          else unfaultedLoud(v, 'append-threw-' + c, { from, m, hist: v.hist.length, head: h.lines });
        }
        break;
      }
      case 'park': {
        const top = Math.max(h.lines, v.hist.length); const pos = ri(h.lines + 1, top + 3); const m = ri(1, 4); const ls: Buffer[] = [];
        for (let i = pos; i < pos + m; i++) { if (i < v.hist.length && r() < 0.6) ls.push(mk(v.tag, i, 7)); else ls.push(pickLine(v, i)); }
        ev('park'); if (pos < v.hist.length) ev('park-over-acked');
        try { await s.append(v.id, 0, pos, ls); } catch (x: any) { const c = code(x); if (c === 'CRASH') throw x; if (c === 'damaged') { await retireHandling(v, 'by-store'); if (!v.fault) bad('FALSE-QUARANTINE-park', {}); } else if (!['limit'].includes(c)) unfaultedLoud(v, 'park-threw-' + c); }
        break;
      }
      case 'fork': case 'forkagain': {
        if (v.ev > 0 || h.lines < 1 || v.hist.length < 1) return; const from = ri(1, Math.min(h.lines, v.hist.length));
        const child = newVer(v.chat, []); child.registered = false; child.pendingFork = { parent: v, from }; ev('fork');
        try { const res = await s.forkVersion(v.id, from, child.id); child.pendingFork = undefined; child.registered = true; child.base = v.hist.slice(0, from); child.hist = [...child.base]; if (v.fault?.documented) child.fault = { ...v.fault, kind: 'inherited:' + v.fault.kind }; ev(res.created ? 'fork-created' : 'fork-found'); if (kind === 'forkagain') { const r2 = await s.forkVersion(v.id, from, child.id); if (r2.created) bad('FORK-AGAIN-CREATED', {}); } }
        catch (x: any) { const c = code(x); if (c === 'CRASH') throw x; child.pendingFork = undefined; child.retired = true; if (c === 'damaged' && !v.fault) bad('FALSE-QUARANTINE-fork', {}); else if (!['evicted'].includes(c)) unfaultedLoud(v, 'fork-threw-' + c); }
        break;
      }
      case 'evict': {
        if (h.lines < 3 || v.hist.length < h.lines || h.damagedFromLine !== null) return; const through = ri(Math.max(1, v.ev), h.lines - 1); let hash: string | null;
        try { hash = await s.hashAt(v.id, 0, through); } catch (x: any) { if (isCrash(x)) throw x; return; } if (!hash) return;
        v.evMax = Math.max(v.evMax, through); ev('evict');
        try { const res = await s.evictBody(v.id, { kind: 'holders-confirmed', version: v.hex, through, hash, acks: [{ holder: 'p', version: v.hex, lines: through, hash, signature: 's' }] } as any); v.ev = Math.max(v.ev, res.evictedLines); }
        catch (x: any) { const c = code(x); if (c === 'CRASH') throw x; if (c === 'damaged') { await retireHandling(v, 'by-store'); if (!v.fault) bad('FALSE-QUARANTINE-evict', {}); } else unfaultedLoud(v, 'evict-threw-' + c); }
        break;
      }
      case 'restore': {
        if (h.evictedLines === 0 && v.evMax === 0) return; const n = h.evictedLines; if (n > v.hist.length) return; ev('restore');
        try { await s.restoreBody(v.id, v.hist.slice(0, n)); v.ev = 0; v.evMax = 0; }
        catch (x: any) { const c = code(x); if (c === 'CRASH') throw x; if (c === 'damaged') { await retireHandling(v, 'by-store'); if (!v.fault) bad('FALSE-QUARANTINE-restore', {}); } else unfaultedLoud(v, 'restore-threw-' + c); }
        break;
      }
      case 'scrub': { ev('scrub'); try { await s.scrubStep(v.id, { maxBytes: 1 << 20 }); } catch (x: any) { const c = code(x); if (c === 'CRASH') throw x; if (c === 'damaged') { await retireHandling(v, 'by-store'); if (!v.fault) bad('FALSE-QUARANTINE-scrub', {}); } else unfaultedLoud(v, 'scrub-threw-' + c); } break; }
      case 'hashAt': { const i = ri(0, h.lines); try { await s.hashAt(v.id, 0, i); } catch (x: any) { const c = code(x); if (c === 'CRASH') throw x; if (c !== 'damaged') unfaultedLoud(v, 'hashAt-threw-' + c); } break; }
      case 'retire': {
        if ((!process.env.R10_RETIREHEAVY && r() < 0.6) || v.hist.length === 0) return; ev('retire'); v.retireMaybe = true;
        try { await s.setAsideDamaged(v.id); v.retireMaybe = false; await retireHandling(v, 'by-caller'); }
        catch (x: any) { const c = code(x); if (c === 'CRASH') { await retireHandling(v, 'crashed-retire'); throw x; } v.retireMaybe = false; if (c === 'damaged') { await retireHandling(v, 'by-store'); } else unfaultedLoud(v, 'retire-threw-' + c); }
        break;
      }
      case 'reopen': { ev('reopen'); await s.close(); e.vfs.settle('kill'); s = null; await openStore(); break; }
      case 'close': break;
    }
  }

  // ---- retired-id checks (done each episode) ----
  async function checkRetired() {
    for (const v of vers.filter((x) => x.retired && !x.retireMaybe && x.registered)) {
      try { await s.head(v.id); bad('RETIRED-ID-SERVES', { v: v.hex }); } catch (x: any) { if (isCrash(x)) throw x; if (!['damaged', 'unknown-version', 'corrupt'].includes(code(x))) bad('RETIRED-HEAD-OTHER', { c: code(x) }); }
      try { const res = await s.append(v.id, 0, 0, [mk(v.tag, 0)]); bad('RETIRED-ID-ACCEPTED-APPEND', { v: v.hex, res }); } catch (x: any) { if (isCrash(x)) throw x; if (!['damaged', 'unknown-version', 'corrupt'].includes(code(x))) bad('RETIRED-APPEND-OTHER', { c: code(x) }); }
      try { await s.registerVersion(v.id, { chatId: v.chat, runtime: 'claude-code', parent: null }); bad('RETIRED-ID-REGISTERED', { v: v.hex }); } catch (x: any) { if (isCrash(x)) throw x; if (code(x) !== 'damaged') ev('retired-register-' + code(x)); }
    }
  }

  // ---- fault dealing (store closed) ----
  function dealFault(): void {
    const cands = vers.filter((v) => v.registered && !v.pendingFork && !v.fault && !v.retired && vfiles(v).length);
    const retiredC = vers.filter((v) => v.retired && v.registered && !v.retiredFaulted);
    if (retiredC.length && r() < (process.env.R10_RETIREHEAVY ? 0.9 : 0.25)) { // retirement witnesses
      const v = pickOf(retiredC); v.retiredFaulted = true;
      const asideF = e.vfs.files().filter((p) => p.startsWith(`${e.root}/aside/${v.hex}-`)); const dirF = vfiles(v); const ret = `${e.root}/retired/${v.hex}.ret`;
      const witness = ['aside', 'vdir', 'ret'].filter((w) => (w === 'aside' ? asideF.length : w === 'vdir' ? dirF.length : e.vfs.get(ret) !== null)); if (witness.length < 3) ev('retired-with-fewer-than-3-witnesses'); if (!witness.length) return;
      const del = new Set(r() < 0.8 ? [pickOf(witness)] : witness.filter(() => r() < 0.67));
      if (del.size >= 3 || (del.size === witness.length && witness.length >= 3)) ev('unretire-3-documented'); if (del.size === 2) ev('unretire-2'); if (del.size === 1) ev('unretire-1');
      const rmTree = (pre: string) => { for (const m of [e.vfs.vol, e.vfs.base]) for (const key of [...m.keys()]) if (key === pre || key.startsWith(pre + '/')) m.delete(key); };
      if (del.has('aside')) { for (const p of asideF) e.vfs.put(p, null); for (const key of [...e.vfs.vol.keys()]) if (key.startsWith(`${e.root}/aside/${v.hex}-`) && key.split('/').length === e.root.split('/').length + 2) rmTree(key); }
      if (del.has('vdir')) { for (const p of dirF) e.vfs.put(p, null); rmTree(`${e.root}/versions/${v.hex}`); } if (del.has('ret')) e.vfs.put(ret, null);
      const remaining = witness.filter((w) => !del.has(w)); if (!remaining.length) { (v as any).allGone = witness.length < 3 ? 'fewer-than-3' : 'all-3'; ev('all-witnesses-gone-' + (v as any).allGone); } else ev('witnesses-left-' + remaining.length + '-of-' + witness.length);
      return;
    }
    if (!cands.length) return; const v = pickOf(cands); const files = vfiles(v);
    const kind = pickOf(['flip', 'zero', 'trunc', 'delete', 'folder-old', 'folder-old', 'files-old', 'files-old', 'folder-old+hwold', 'folder-old+hwdel', 'hw-flip', 'hw-del', 'hw-old', 'hw-foreign', 'swap']);
    ev('fault-' + kind);
    const F = (documented: boolean, hwIntact: boolean, hwOnly = false): Fault => ({ kind, hwIntact: hwIntact && !(v as any).hwFaulted, documented: documented || ((v as any).hwFaulted && !hwOnly && /folder-old|files-old/.test(kind)), hwOnly });
    const snap = v.snaps.length ? pickOf(v.snaps) : null; D('FAULT', kind, v.hex, 'files', files.map((p) => p.slice(dirOf(v).length)), 'snap', snap?.at);
    const restoreFiles = (sn: NonNullable<typeof snap>, filter: (rel: string) => boolean) => { for (const p of files) { const rel = p.slice(dirOf(v).length); if (filter(rel) && !sn.files.has(p)) e.vfs.put(p, null); } for (const [p, b] of sn.files) { if (filter(p.slice(dirOf(v).length))) e.vfs.put(p, b); } };
    switch (kind) {
      case 'flip': { const p = pickOf(files); const b = e.vfs.get(p)!; if (!b.length) return; const nb = Buffer.from(b); nb[ri(0, b.length - 1)] ^= 1 << ri(0, 7); e.vfs.put(p, nb); v.fault = F(false, true); break; }
      case 'zero': { const p = pickOf(files); const b = e.vfs.get(p)!; if (!b.length) return; const nb = Buffer.from(b); const a = ri(0, b.length - 1); nb.fill(0, a, Math.min(b.length, a + ri(1, 64))); e.vfs.put(p, nb); v.fault = F(false, true); break; }
      case 'trunc': { const p = pickOf(files); const b = e.vfs.get(p)!; e.vfs.put(p, b.subarray(0, ri(0, b.length))); v.fault = F(false, true); break; }
      case 'delete': { e.vfs.put(pickOf(files), null); v.fault = F(false, true); break; }
      case 'swap': { const o = pickOf(vers.filter((x) => x !== v && x.registered && vfiles(x).length && !x.retired)); if (!o) return; const ofl = vfiles(o); const q = pickOf(files); const relq = q.slice(dirOf(v).length); const m = ofl.find((p) => p.slice(dirOf(o).length) === relq); if (!m) return; e.vfs.put(q, e.vfs.get(m)); v.fault = F(false, true); break; }
      case 'folder-old': if (!snap) return; restoreFiles(snap, () => true); v.fault = F(false, true); break;
      case 'files-old': { if (!snap) return; const sub = pickOf(['index.bin', 'checkpoint.bin', 'body-', 'parked/', 'marks.bin', 'ix+ck', 'ix+body']); restoreFiles(snap, (rel) => (sub === 'ix+ck' ? /^(index|checkpoint)\.bin$/.test(rel) : sub === 'ix+body' ? rel === 'index.bin' || rel.startsWith('body-') : rel.startsWith(sub))); v.fault = F(false, true); (v.fault as any).sub = sub; break; }
      case 'folder-old+hwold': if (!snap) return; restoreFiles(snap, () => true); e.vfs.put(hwOf(v), snap.hw); v.fault = F(true, false); break;
      case 'folder-old+hwdel': if (!snap) return; restoreFiles(snap, () => true); e.vfs.put(hwOf(v), null); v.fault = F(true, false); break;
      case 'hw-flip': { const b = e.vfs.get(hwOf(v)); if (!b) return; const nb = Buffer.from(b); nb[ri(0, b.length - 1)] ^= 1 << ri(0, 7); e.vfs.put(hwOf(v), nb); v.fault = F(false, true, true); break; }
      case 'hw-del': if (e.vfs.get(hwOf(v)) === null) return; e.vfs.put(hwOf(v), null); v.fault = F(false, true, true); break;
      case 'hw-old': if (!snap || !snap.hw) return; e.vfs.put(hwOf(v), snap.hw); v.fault = F(false, true, true); break;
      case 'hw-foreign': { const o = pickOf(vers.filter((x) => x !== v && e.vfs.get(hwOf(x)) !== null)); if (!o) return; e.vfs.put(hwOf(v), e.vfs.get(hwOf(o))); v.fault = F(false, true, true); break; }
    }
    // a faulted version with only an hw fault must stay perfectly clean: model it as "no fault" for loudness but strict
    if (v.fault?.hwOnly) { (v as any).hwOnly = v.fault.kind; (v as any).hwFaulted = true; v.fault = null; }
  }
  const snapshotAll = () => { for (const v of vers) if (v.registered && !v.retired && !v.fault && r() < 0.5) D('SNAP', v.hex, 'hist', v.hist.length), v.snaps.push({ files: new Map(vfiles(v).map((p) => [p, e.vfs.get(p)!])), hw: e.vfs.get(hwOf(v)), at: v.hist.length }); };

  async function episode(n: number) {
    const crashAfter = r() < 0.45 ? ri(1, 400) : 0; let armed = false;
    try {
      D('EPISODE', n); await openStore(); await ensureRegistered(); await pendingForks(); await recopyStep();
      for (const v of live()) await observe(v, 'open'); await checkRetired();
      if (crashAfter) { e.vfs.arm(crashAfter, pickOf(['none', 'prefix', 'garbage'] as const)); armed = true; }
      const ops = ri(8, 24); for (let k = 0; k < ops; k++) await op(n);
      e.vfs.disarm(); armed = false; await recopyStep();
      if (r() < 0.8) { await s.close(); e.vfs.settle('kill'); s = null; } else { await crashed(); }
    } catch (x: any) {
      if (!isCrash(x)) { bad('HARNESS-OR-UNTYPED', { n, c: code(x), stack: String(x?.stack).slice(0, 300) }); try { e.vfs.disarm(); } catch {} s = null; await e.crash('kill'); }
      else { await crashed(); }
    }
    if (!CRASHONLY) { if (r() < 0.55) snapshotAll(); if (r() < 0.6) dealFault(); }
    else if (r() < 0.5) snapshotAll();
  }

  async function finalHeal() {
    await openStore();
    try { await ensureRegistered(); await pendingForks(); await recopyStep(); await checkRetired(); } catch (x: any) { if (!isCrash(x)) bad('FINAL-OPEN-ERR', { c: code(x) }); }
    for (let round = 0; round < 3; round++) for (const v of [...live()]) {
      let h = await observe(v, 'final'); if (!h) continue;
      D('FINALSTART', v.hex, 'head', h.lines, 'hist', v.hist.length, 'ev', h.evictedLines, 'dmg', h.damagedFromLine, 'rb', h.rolledBack, 'fault', v.fault?.kind);
      for (let g = 0; g < 80 && h && !v.retired; g++) {
        const maxCand = Math.max(-1, ...[...v.cand.keys()]); const target = Math.max(v.hist.length, h.rolledBack ? h.rolledBack.had : 0, h.lines, h.damagedFromLine !== null && v.fault ? Math.min(maxCand + 1, h.lines + 6) : 0);
        const wantMore = h.lines < target || h.damagedFromLine !== null || h.rolledBack; if (wantMore && target > v.hist.length && h.lines >= v.hist.length) ev('heal-needs-unacked-lines');
        if (!wantMore && h.evictedLines === 0) break;
        if (h.evictedLines > 0 && h.evictedLines <= v.hist.length && (g === 0 || !(h.damagedFromLine !== null || h.rolledBack || h.lines < target))) { try { await s.restoreBody(v.id, v.hist.slice(0, h.evictedLines)); v.ev = 0; v.evMax = 0; ev('final-restore'); } catch (x: any) { const c = code(x); if (c === 'damaged') { await retireHandling(v, 'final'); if (!v.fault) bad('FALSE-QUARANTINE-final-restore', {}); } else if (!v.fault) bad('FINAL-RESTORE-THREW', { c }); else ev('final-restore-threw-' + c); break; } h = await observe(v, 'final-restore'); if (!h) break; continue; }
        const from = Math.max(h.evictedLines, Math.min(h.lines, h.damagedFromLine ?? h.lines, h.rolledBack ? h.rolledBack.from : h.lines)); const to = Math.min(target, Math.max(from + 9, h.lines + 9));
        if (to <= from) { D('HEAL-BREAK to<=from', v.hex, 'from', from, 'to', to, 'target', target, 'head', h.lines, 'ev', h.evictedLines, 'dmg', h.damagedFromLine); break; }
        // lines past what was acknowledged (the call that was in flight when something went wrong) come from the candidates, the way a replicator re-fetches them from its source
        const ls: Buffer[] = []; let noCand = false;
        for (let i = from; i < to; i++) { if (i < v.hist.length) ls.push(v.hist[i]); else { const c = v.cand.get(i) ?? []; if (!c.length) { noCand = true; break; } ls.push(c[g % c.length]); } }
        if (noCand && ls.length === 0) { ev('final-no-candidate'); break; }
        const to2 = from + ls.length;
        if (to > v.hist.length && from < v.hist.length + 0 || to > v.hist.length) ev('heal-beyond-acked');
        try { const res = await s.append(v.id, 0, from, ls); D('HEAL', v.hex, 'from', from, 'to', to2, 'res', res, 'head', h.lines, 'dmg', h.damagedFromLine, 'rb', h.rolledBack, 'g', g); if (res === 'not-a-prefix') { if (!v.fault && to <= v.hist.length) bad('FINAL-NOT-A-PREFIX', { v: v.hex, from }); ev('final-not-a-prefix'); continue; } else if (res === 'ok') { for (let i = from; i < to2; i++) if (i === v.hist.length) v.hist.push(ls[i - from]); } }
        catch (x: any) { const c = code(x); if (c === 'damaged') { ev('final-quarantine'); if (!v.fault) bad('FALSE-QUARANTINE-final', { v: v.hex }); else if (v.fault.kind) ev('final-quarantine-faulted'); await retireHandling(v, 'final'); } else { if (!v.fault) bad('FINAL-APPEND-THREW', { c, v: v.hex }); else ev('final-append-threw-' + c); } break; }
        h = await observe(v, 'final-step'); if (!h) break;
      }
      if (round === 2 && !v.retired) {
        const h2 = await observe(v, 'final-check');
        if (h2 && (h2.damagedFromLine !== null || h2.rolledBack || h2.lines < v.hist.length)) { if (v.fault?.documented && h2.lines < v.hist.length) ev('final-short-documented'); else bad('LOCKOUT', { v: v.hex, fault: v.fault?.kind ?? null, sub: (v.fault as any)?.sub, n: h2.lines, hist: v.hist.length, dmg: h2.damagedFromLine, rb: h2.rolledBack }); }
        else if (h2) ev('healed-clean');
      }
    }
    if (s) await s.close().catch(() => {});
  }

  try {
    const eps = ri(3, 7); for (let n = 0; n < eps; n++) await episode(n);
    await finalHeal();
  } catch (x: any) { bad('HARNESS-ERROR', { c: code(x), stack: String(x?.stack).slice(0, 400) }); }
  if (viol.length && process.env.R10_KEEP) { try { for (const p of e.vfs.files()) { const rel = p.slice(e.root.length); const dst = process.env.R10_KEEP + '/seed-' + seed + rel; fs.mkdirSync(dst.slice(0, dst.lastIndexOf('/')), { recursive: true }); fs.writeFileSync(dst, e.vfs.get(p)!); } } catch {} }
  let ops = 0; for (const k of ['append', 'resend', 'park', 'fork', 'evict', 'restore', 'retire', 'scrub']) ops += events[k] ?? 0;
  await e.rm(); return { seed, viol, events, ops };
}

test('fuzz10', async () => {
  const total: Record<string, number> = {}; let badN = 0; let n = 0;
  for (const seed of seeds) {
    const res = await runSeed(seed); n++;
    for (const [k, v] of Object.entries(res.events)) total[k] = (total[k] ?? 0) + v;
    if (OUT) fs.appendFileSync(OUT, JSON.stringify({ seed, viol: res.viol.length, ops: res.ops }) + '\n');
    if (res.viol.length) { badN++; if (OUT) fs.appendFileSync(OUT + '.viol', res.viol.map((x) => JSON.stringify({ seed, ...x })).join('\n') + '\n'); else console.log(JSON.stringify(res.viol.slice(0, 3))); }
  }
  if (OUT) fs.writeFileSync(OUT + '.events.json', JSON.stringify({ seeds: n, bad: badN, ...total }, null, 1));
  else console.log(JSON.stringify({ seeds: n, bad: badN, total }));
}, 7 * 24 * 3600 * 1000);
