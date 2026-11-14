// Same session id in more than one project folder: is the smaller copy a byte prefix of the larger? (READ-ONLY)
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { createHash } from 'node:crypto';
const by = new Map();
(function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'subagents' && e.name !== 'tool-results') w(p); } else if (e.name.endsWith('.jsonl')) { const id = e.name.slice(0, -6); (by.get(id) ?? by.set(id, []).get(id)).push([p, fs.statSync(p).size]); } } })(path.join(os.homedir(), '.claude/projects'));
const hashPrefix = (p, n) => { const h = createHash('sha256'); const fd = fs.openSync(p, 'r'); const b = Buffer.alloc(1 << 20); let pos = 0; while (pos < n) { const k = fs.readSync(fd, b, 0, Math.min(b.length, n - pos), pos); if (!k) break; h.update(b.subarray(0, k)); pos += k; } fs.closeSync(fd); return h.digest('hex'); };
let ids = 0, extra = 0, identical = 0, prefix = 0, diverged = 0, groups = {};
for (const [id, fs_] of by) { if (fs_.length < 2) continue; ids++; groups[fs_.length] = (groups[fs_.length] || 0) + 1; fs_.sort((a, b) => b[1] - a[1]); const big = fs_[0];
  for (const small of fs_.slice(1)) { extra++; if (small[1] === big[1]) { identical += hashPrefix(small[0], small[1]) === hashPrefix(big[0], big[1]) ? 1 : 0; if (hashPrefix(small[0], small[1]) !== hashPrefix(big[0], big[1])) diverged++; } else if (hashPrefix(small[0], small[1]) === hashPrefix(big[0], small[1])) prefix++; else diverged++; } }
console.log({ sessionIds: by.size, idsInMoreThanOneFolder: ids, groupSizes: groups, extraCopies: extra, byteIdenticalToLargest: identical, strictPrefixOfLargest: prefix, divergedFromLargest: diverged });
