// scripts/perf-lab/phone/device.mjs — the phone side of the phone speed lab: adb, the page's debugging connection,
// real touches, process CPU counters and memory. Only the YouCoded Dev copy (com.youcoded.app.dev) is ever driven:
// the release-test copy is not inspectable, and Destin's own app (com.youcoded.app) is never touched.
//
// PRIVACY (Destin's standing rule): the lab takes no pictures at all, and before every step it checks that the dev
// copy is the window in front — a locked phone, the notification shade or any other app stops the run.
import { execFileSync } from 'node:child_process';
import { connect } from '../cdp.mjs';

export const PKG = 'com.youcoded.app.dev';
const PORT = 9223; // its own forward, not 9222 (hand-run probes use that)

export function adb(...args) {
  return execFileSync('adb', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}
export const shell = (cmd) => adb('shell', cmd);

/** The window in front, as Android names it ("com.youcoded.app.dev/…MainActivity", "NotificationShade", …). */
export function focusedWindow() {
  const line = shell('dumpsys window | grep mCurrentFocus').split('\n').pop() || '';
  return line.replace(/.*mCurrentFocus=Window\{\S+ u0 /, '').replace(/\}.*$/, '').trim();
}
/** Throws unless the dev copy is in front — the privacy and validity guard every step passes. */
export function requireDevInFront() {
  const f = focusedWindow();
  if (!f.startsWith(`${PKG}/`)) throw new Error(`stopped: the dev copy is not in front (${f || 'unknown'}) — the phone may be locked or in use`);
}

export function pidOf(name) { return shell(`pidof ${name}`).split(/\s+/)[0] || null; }
/** The app's own processes: the app (Kotlin + the WebView's graphics thread) and the assistant (node, its child). */
export function appProcesses() {
  const app = pidOf(PKG);
  if (!app) throw new Error('the dev copy is not running');
  const rows = shell('ps -A -o PID,PPID,NAME').split('\n').slice(1).map((l) => l.trim().split(/\s+/));
  const node = rows.find((r) => r[1] === app && r[2] === 'node')?.[0] ?? null;
  return { app, node };
}

/** Screen geometry: device pixels per CSS pixel come from the page; the page starts under the status bar. */
export function statusBarTop() {
  const m = shell('dumpsys window | grep -m1 "type=statusBars frame"').match(/frame=\[\d+,\d+\]\[\d+,(\d+)\]/);
  return m ? Number(m[1]) : 0;
}
export function screenSize() {
  const m = shell('wm size').match(/(\d+)x(\d+)/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

export const tap = (x, y) => shell(`input tap ${Math.round(x)} ${Math.round(y)}`);
export const key = (code) => shell(`input keyevent ${code}`);
export const swipe = (x1, y1, x2, y2, ms) => shell(`input swipe ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)} ${ms}`);

/** Jiffies (1/100 s) a process has spent on the CPU so far, all threads: utime + stime from /proc/<pid>/stat. */
export function cpuTicks(pid) {
  if (!pid) return null;
  const raw = shell(`cat /proc/${pid}/stat 2>/dev/null`);
  const rest = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
  // After the name: state(0) ppid(1) … utime is field 14 overall → index 11 here, stime index 12.
  const v = Number(rest[11]) + Number(rest[12]);
  return Number.isFinite(v) ? v : null;
}
/** Memory the dev copy holds, in MB (PSS, shared memory counted fairly). */
export function memoryMb() {
  const m = shell(`dumpsys meminfo ${PKG} | grep -m1 "TOTAL PSS"`).match(/TOTAL PSS:\s+(\d+)/);
  return m ? Math.round(Number(m[1]) / 1024) : null;
}

/** The page's debugging connection (the dev copy's WebView is inspectable). */
export async function connectPage() {
  const app = pidOf(PKG);
  if (!app) throw new Error('the dev copy is not running');
  adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${app}`);
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page in the dev copy (still loading?)');
  return connect(page.webSocketDebuggerUrl);
}

/** Android's own count of the app's frames, as shown on screen (all of it: the page AND the system's composition of
 *  it), since the last reset — the part the page cannot see, where a stutter it never measured shows up. */
export function gfxReset() { shell(`dumpsys gfxinfo ${PKG} reset`); }
export function gfxStats() {
  const out = shell(`dumpsys gfxinfo ${PKG}`);
  const n = (re) => { const m = out.match(re); return m ? Number(m[1]) : null; };
  return { total: n(/Total frames rendered:\s*(\d+)/), janky: n(/Janky frames:\s*(\d+)/), p90: n(/90th percentile:\s*(\d+)ms/), p99: n(/99th percentile:\s*(\d+)ms/) };
}
