// T21: roll pair results up to one verdict per chat id (ids truncated to 8 chars in output).
import fs from 'node:fs';
const [fsF, gitF] = process.argv.slice(2);
const rd = (f) => fs.readFileSync(f, 'utf8').trim().split('\n').map(JSON.parse);
const chats = new Map();
const note = (id, src, r) => { const e = chats.get(id) ?? { id: id.replace(/^(\w+:\w{8}).*/, '$1'), tags: new Set() }; chats.set(id, e);
  const c = r.rel === 'diverged' ? (r.id.startsWith('native:') ? 'native-in-place-edit' : r.cat.replace('(same-conversation)', '')) : r.rel === 'b-prefix-of-a' ? 'prefix' : r.rel;
  e.tags.add(src + ':' + c); };
for (const r of rd(fsF)) note(r.id, 'disk', r);
for (const r of rd(gitF)) note(r.id, 'history', r);
const tot = { chats: chats.size, onlyIdenticalOrPrefix: 0, hasBookkeepingTail: 0, hasRealSplit: 0, hasNativeInPlaceEdit: 0, hasTornTail: 0, hasOneContainsOther: 0 };
const interesting = [];
for (const e of chats.values()) {
  const t = [...e.tags]; const has = (s) => t.some((x) => x.includes(s));
  const flag = { bk: has('bytes-differ-same-conversation'), rs: has('real-split'), ne: has('native-in-place-edit'), oc: has('one-contains-other') };
  if (!flag.bk && !flag.rs && !flag.ne && !flag.oc) tot.onlyIdenticalOrPrefix++;
  if (flag.bk) tot.hasBookkeepingTail++; if (flag.rs) tot.hasRealSplit++; if (flag.ne) tot.hasNativeInPlaceEdit++; if (flag.oc) tot.hasOneContainsOther++;
  if (flag.bk || flag.rs || flag.ne || flag.oc) interesting.push({ id: e.id, tags: t.filter((x) => !/identical|prefix$/.test(x)) });
}
console.log(JSON.stringify({ tot, interesting }, null, 1));
