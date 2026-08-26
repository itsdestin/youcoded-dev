// scripts/perf-lab/procs.mjs — /proc-based CPU + memory sampling for the perf lab.
// Linux-only by design (the rig runs on Destin's machine). HZ=100 matches
// scripts/measure-idle-cpu.mjs, whose parsing this mirrors.
import { readdirSync, readFileSync } from 'node:fs';
const HZ = 100;

export function parseStatTicks(line) {
  const rest = line.slice(line.lastIndexOf(')') + 2).split(' ');
  // after ")" the fields are: state ppid pgrp session tty tpgid flags minflt cminflt majflt cmajflt utime stime
  return Number(rest[11]) + Number(rest[12]);
}
export function parseSmapsPssKb(text) {
  const m = /^Pss:\s+(\d+) kB/m.exec(text);
  return m ? Number(m[1]) : 0;
}
function cmdline(pid) {
  try { return readFileSync(`/proc/${pid}/cmdline`, 'latin1').replace(/\0/g, ' '); } catch { return ''; }
}
/** pids whose cmdline contains ANY needle (fixture HOME or the unpacked app dir). */
export function findFamily(needles) {
  const out = [];
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    const c = cmdline(d);
    if (c && needles.some((n) => c.includes(n))) out.push(Number(d));
  }
  return out;
}
export function cpuSnapshot(pids) {
  const m = new Map();
  for (const pid of pids) {
    try { m.set(pid, parseStatTicks(readFileSync(`/proc/${pid}/stat`, 'utf8'))); } catch { /* exited */ }
  }
  return m;
}
export function cpuPercent(before, after, seconds) {
  const perPid = new Map(); let total = 0;
  for (const [pid, b] of before) {
    const a = after.get(pid); if (a === undefined) continue;
    const pct = ((a - b) / HZ / seconds) * 100;
    perPid.set(pid, pct); total += pct;
  }
  return { totalPct: total, perPid };
}
function procType(pid) {
  const c = cmdline(pid);
  const t = /--type=([a-z-]+)/.exec(c);
  if (t) return t[1];
  const exe = (c.split(' ')[0] || '').split('/').pop();
  if (exe === 'llama-server') return 'llama-server';
  if (exe === 'node') return c.includes('pty-worker') ? 'pty-worker' : c.includes('bin/claude') ? 'fake-claude' : 'node';
  return c.includes('linux-unpacked/youcoded') ? 'main' : 'other';
}
export function pssMb(pids) {
  const perPid = []; let total = 0;
  for (const pid of pids) {
    try {
      const kb = parseSmapsPssKb(readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8'));
      const mb = kb / 1024; total += mb;
      perPid.push({ pid, type: procType(pid), mb: Math.round(mb * 10) / 10 });
    } catch { /* exited */ }
  }
  return { totalMb: Math.round(total * 10) / 10, perPid };
}
export function loadAvg1() {
  return Number(readFileSync('/proc/loadavg', 'utf8').split(' ')[0]);
}
/** Whole-machine CPU busy % over `seconds` (from /proc/stat), for the noise gate. */
export async function machineBusyPct(seconds) {
  const read = () => { const f = readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number); const idle = f[3] + f[4]; const total = f.reduce((a, b) => a + b, 0); return { idle, total }; };
  const a = read(); await new Promise((r) => setTimeout(r, seconds * 1000)); const b = read();
  return 100 * (1 - (b.idle - a.idle) / (b.total - a.total));
}
