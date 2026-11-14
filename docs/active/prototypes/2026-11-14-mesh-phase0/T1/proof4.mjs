// T1 proof 4: what a device does on the network at boot, with and without YOUCODED_PROFILE; memory per device.
import { up, descendants } from './rig.mjs';
import fs from 'node:fs'; import path from 'node:path';
const rig = await up({ n: 3 });
await new Promise((r) => setTimeout(r, 6000));
const rss = (pid) => { try { return Math.round(Number(/VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8'))[1]) / 1024); } catch { return null; } };
const out = rig.devices.map((d) => ({ name: d.name, readyMs: d.readyMs, procs: descendants(d.pid).map((p) => { try { const c = fs.readFileSync(`/proc/${p}/cmdline`, 'utf8').split('\0'); return { pid: p, what: path.basename(c[0]) + ' ' + path.basename(c[1] ?? '') + ' ' + (c[2] ? path.basename(c[2]).slice(0, 30) : ''), rssMb: rss(p) }; } catch { return null; } }).filter(Boolean) }));
await rig.stop();
console.log(JSON.stringify(out.map((o) => ({ name: o.name, readyMs: o.readyMs, nodeRssMb: o.procs.filter((p) => /^node -r/.test(p.what)).map((p) => p.rssMb), net: o.procs.filter((p) => /git/.test(p.what)).length })), null, 0));
