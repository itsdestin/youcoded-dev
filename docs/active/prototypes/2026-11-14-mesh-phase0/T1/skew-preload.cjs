// T1 rig clock skew, JavaScript side. Loaded with `node -r`. Shifts Date.now() and `new Date()` by an
// offset the rig can change while the device runs (write <RIG_CLOCK_FILE> as {"offsetMs": N}).
// NOT shifted, on purpose of what is possible: monotonic timers (setTimeout, performance.now),
// file mtimes (the kernel stamps them), and child processes (git, claude). The design never compares
// two devices' clocks for correctness (5.2 Clocks) so the JS clock is the seam that matters; a bug that
// stamps a file's age by mtime would NOT be caught here and is reported by T1 as a limit.
'use strict';
const fs = require('node:fs');
const file = process.env.RIG_CLOCK_FILE;
let offset = Number(process.env.RIG_CLOCK_OFFSET_MS || 0) || 0;
function reload() {
  if (!file) return;
  try { const o = JSON.parse(fs.readFileSync(file, 'utf8')); if (Number.isFinite(o.offsetMs)) offset = o.offsetMs; } catch { /* absent: keep current */ }
}
reload();
if (file) setInterval(reload, 200).unref();
const RealDate = Date;
const realNow = RealDate.now.bind(RealDate);
function SkewedDate(...a) {
  if (!new.target) return new RealDate(realNow() + offset).toString();
  return a.length === 0 ? new RealDate(realNow() + offset) : new RealDate(...a);
}
SkewedDate.prototype = RealDate.prototype;
SkewedDate.now = () => realNow() + offset;
SkewedDate.parse = RealDate.parse; SkewedDate.UTC = RealDate.UTC;
Object.setPrototypeOf(SkewedDate, RealDate);
globalThis.Date = SkewedDate;
