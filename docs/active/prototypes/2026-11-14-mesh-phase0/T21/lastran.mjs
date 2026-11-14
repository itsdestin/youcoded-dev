// T21 part 3: can this device tell which chats it "last ran"? Reads conversation records (read-only) and compares
// record.device (os.hostname() of the last device that ran a turn) with where live runtime files exist here.
// Usage: node lastran.mjs fs-copies.jsonl
import fs from 'node:fs'; import os from 'node:os';
const copies = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map(JSON.parse);
const here = os.hostname();
const base = os.homedir() + '/YouCoded/Personal/Conversations/';
const byId = new Map(); for (const c of copies) { if (!byId.has(c.id)) byId.set(c.id, []); byId.get(c.id).push(c); }
const out = { host: here, records: 0, live_and_record: 0, byDeviceWhenLiveHere: {}, liveLongerThanMirror: {}, liveSameAsMirror: {}, noLiveHere: {}, emptyDeviceWithLive: 0, ownerDeviceIsHereButLiveMissing: 0, recordsWithoutLiveCopyHere: 0 };
const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
const seen = new Set();
for (const [key, cs] of byId) {
  const [prov, id] = key.split(':'); let r;
  try { r = JSON.parse(fs.readFileSync(`${base}${prov}/${id}.json`)); } catch { continue; }
  out.records++; seen.add(key);
  const live = cs.find((c) => c.kind.startsWith('live')); const mir = cs.find((c) => c.kind === 'mirror');
  const dev = r.device || '(empty)';
  if (!live) { inc(out.noLiveHere, dev); continue; }
  out.live_and_record++; inc(out.byDeviceWhenLiveHere, dev);
  if (mir && live.bytes > mir.bytes) inc(out.liveLongerThanMirror, dev); else if (mir && live.bytes === mir.bytes) inc(out.liveSameAsMirror, dev);
  if (!r.device) out.emptyDeviceWithLive++;
}
console.log(JSON.stringify(out, null, 1));
