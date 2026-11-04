// Pure helpers for the "What changed" viewer. Plain ES module with no DOM access so the browser
// page (viewer.js) and node:test (scripts/shoot/tests/what-changed-viewer.test.mjs) share one copy.

// Colour-coded kinds, in legend order. `label` is the plain word the owner sees.
export const KINDS = [
  { kind: 'added', label: 'Added' },
  { kind: 'removed', label: 'Removed' },
  { kind: 'text', label: 'Wording' },
  { kind: 'moved', label: 'Moved' },
  { kind: 'restyled', label: 'Restyled' },
  { kind: 'pixels', label: 'Other pixels' },
];
export const kindLabel = (k) => (KINDS.find((x) => x.kind === k) || { label: k }).label;

// Roles a person would call "a button or control".
const CONTROL_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem',
  'combobox', 'slider', 'textbox', 'searchbox', 'option', 'spinbutton']);

// A change can sit in several filters at once (a reworded button is both wording and controls).
export function categories(change) {
  const out = [];
  if (change.kind === 'text') out.push('wording');
  if (CONTROL_ROLES.has(change.role)) out.push('controls');
  if (!out.length) out.push('other');
  return out;
}

// Boxes are CSS px; pictures are `scale` times bigger. Returns percentages of the picture so the
// overlay stays correct whatever size the picture is shown at.
export function boxToPercent(box, scale, natW, natH) {
  if (!box || !natW || !natH) return null;
  const s = scale || 1;
  return {
    left: (box.x * s / natW) * 100, top: (box.y * s / natH) * 100,
    width: (box.w * s / natW) * 100, height: (box.h * s / natH) * 100,
  };
}

// Which picture a change's `box` belongs on. Removed things only exist in the before picture.
export const boxSide = (change) => (change.kind === 'removed' ? 'before' : (change.side || 'after'));

// Real names look like `chat#admin-approval` or `settings/assistant/cloud#x`: the area is whatever
// comes before the first `/` or `#`, and the rest is the row's label.
const AREA_END = /[\/#]/;
export const areaOf = (name) => { const i = name.search(AREA_END); return i > 0 ? name.slice(0, i) : name; };
export const rowLabel = (name) => { const i = name.search(AREA_END); return i > 0 && i < name.length - 1 ? name.slice(i + 1) : name; };

// One screen name can have several theme rows; the owner decides per name (FORMAT.md), so fold
// the rows into one entry with an overall status.
export function aggregateScreens(screens) {
  const byName = new Map();
  for (const s of screens || []) {
    if (!byName.has(s.name)) byName.set(s.name, { name: s.name, area: areaOf(s.name), rows: [] });
    byName.get(s.name).rows.push(s);
  }
  const rank = ['changed', 'new', 'removed', 'failed', 'unchanged'];
  const entries = [...byName.values()];
  for (const e of entries) {
    const has = (st) => e.rows.some((r) => r.status === st);
    e.status = rank.find(has) || 'unchanged';
    // A screen with one failed theme but a changed other theme is still reviewable; the failure
    // is noted on that theme's tab.
    e.reason = (e.rows.find((r) => r.reason) || {}).reason || '';
    const kinds = new Set();
    for (const r of e.rows) for (const c of r.changes || []) kinds.add(c.kind);
    e.kinds = KINDS.map((k) => k.kind).filter((k) => kinds.has(k));
    // Screens with wording / added / removed changes first, then restyled, moved, pixel-only.
    e.priority = ['text', 'added', 'removed'].some((k) => kinds.has(k)) ? 0 : kinds.has('restyled') ? 1 : kinds.has('moved') ? 2 : 3;
    e.changeCount = Math.max(0, ...e.rows.map((r) => (r.changes ? r.changes.length : 0))); // per theme, not summed
  }
  return entries;
}

export function countStatuses(entries) {
  const c = { changed: 0, new: 0, unchanged: 0, failed: 0, removed: 0 };
  for (const e of entries) c[e.status] = (c[e.status] || 0) + 1;
  return c;
}

export const isReviewable = (e) => e.status === 'changed' || e.status === 'new' || e.status === 'removed';

export function matchesFilter(entry, filter) {
  if (!filter || filter === 'all') return true;
  const want = { controls: 'controls', wording: 'wording', other: 'other' }[filter];
  return entry.rows.some((r) => (r.changes || []).some((c) => categories(c).includes(want)));
}

export function matchesQuery(entry, q) {
  const needle = (q || '').trim().toLowerCase();
  if (!needle) return true;
  const hay = [entry.name];
  for (const r of entry.rows) for (const c of r.changes || []) hay.push(c.name, c.oldText, c.newText, c.role);
  return hay.some((t) => t && String(t).toLowerCase().includes(needle));
}

// Area groups in first-seen order, each with its visible entries.
export function groupByArea(entries) {
  const groups = new Map();
  for (const e of entries) {
    if (!groups.has(e.area)) groups.set(e.area, []);
    groups.get(e.area).push(e);
  }
  return [...groups].map(([area, items]) => ({ area, items: [...items].sort((a, b) => a.priority - b.priority) }));
}

// `words` -> what to print in the Old and New columns, with the changed words flagged.
export function wordParts(words) {
  const oldParts = []; const newParts = [];
  for (const w of words || []) {
    if ('same' in w) { oldParts.push({ text: w.same }); newParts.push({ text: w.same }); continue; }
    if (w.old) oldParts.push({ text: w.old, mark: true });
    if (w.new) newParts.push({ text: w.new, mark: true });
  }
  return { oldParts, newParts };
}

export function progress(entries, decisions) {
  const list = entries.filter(isReviewable);
  const decided = list.filter((e) => decisions[e.name] && decisions[e.name].verdict).length;
  return { decided, total: list.length };
}

// Verdict map -> the decisions.json document (FORMAT.md). Entries with no verdict and no note are dropped.
export function buildDecisions(run, screens, now = new Date()) {
  const out = {};
  for (const [name, d] of Object.entries(screens || {})) {
    if (d && (d.verdict || d.note)) out[name] = { verdict: d.verdict || '', note: d.note || '' };
  }
  return { run, decidedAt: now.toISOString(), screens: out };
}

// Accepts only what the viewer writes; used by serve.mjs so a stray request cannot write junk.
export function validateDecisions(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return 'not an object';
  if (!doc.screens || typeof doc.screens !== 'object' || Array.isArray(doc.screens)) return 'screens missing';
  for (const [name, d] of Object.entries(doc.screens)) {
    if (!d || typeof d !== 'object') return `bad entry ${name}`;
    if (d.verdict !== '' && d.verdict !== 'keep' && d.verdict !== 'not-this') return `bad verdict for ${name}`;
    if (typeof d.note !== 'string' || d.note.length > 5000) return `bad note for ${name}`;
  }
  return null;
}

// ---------- plain-words descriptions ----------
const RGB = /rgba?\([^)]*\)/g;
const num = (t) => { const m = /-?\d+(\.\d+)?/.exec(t || ''); return m ? parseFloat(m[0]) : NaN; };
const colorsIn = (t) => (t || '').match(RGB) || [];

// One style change -> { label, from, to, swatch } or null when nothing a person could see changed.
// `label` is also the grouping signature, so it never contains the values themselves.
export function describeStyle(sc) {
  const { prop, from, to } = sc;
  const raw = `${prop}: ${from} to ${to}`;
  const sw = (a, b) => (a && b ? { from: a, to: b } : null);
  if (prop === 'color') return { label: 'Text colour changed', swatch: sw(colorsIn(from)[0], colorsIn(to)[0]), raw };
  if (prop === 'background') return { label: 'Background colour changed', swatch: sw(colorsIn(from)[0], colorsIn(to)[0]), raw };
  if (prop === 'border') {
    const wf = num(from), wt = num(to);
    if (wf === 0 && wt === 0) return null; // no border drawn either way: the colour is invisible
    if (wf !== wt) return { label: wt > wf ? 'Border thicker' : 'Border thinner', raw };
    return { label: 'Border colour changed', swatch: sw(colorsIn(from)[0], colorsIn(to)[0]), raw };
  }
  if (prop === 'radius') {
    const a = num(from), b = num(to);
    if (a === b) return null;
    return { label: b > a ? 'Corners more rounded' : 'Corners less rounded', raw };
  }
  if (prop === 'opacity') return { label: num(to) < num(from) ? 'More see-through' : 'Less see-through', raw };
  if (prop === 'font') {
    // recorder format: "<size>px <weight> <family>"
    const [sf, wf, ...ff] = String(from).split(' '); const [st, wt, ...ft] = String(to).split(' ');
    if (num(sf) !== num(st)) return { label: num(st) > num(sf) ? 'Text size larger' : 'Text size smaller', raw };
    if (wf !== wt) return { label: num(wt) > num(wf) ? 'Text bolder' : 'Text lighter', raw };
    if (ff.join(' ') !== ft.join(' ')) return { label: 'Font changed', raw };
    return null;
  }
  return { label: `${prop} changed`, raw };
}

const px = (n) => `${Math.round(Math.abs(n))} px`;
// Position/size change of a moved or restyled thing: "Moved left 9 px, up 6 px", "Wider by 12 px".
export function describeMove(c) {
  const a = c.box, b = c.beforeBox; if (!a || !b) return null;
  const out = []; const dx = a.x - b.x, dy = a.y - b.y, dw = a.w - b.w, dh = a.h - b.h;
  const mv = [];
  if (Math.round(Math.abs(dx)) >= 1) mv.push(`${dx < 0 ? 'left' : 'right'} ${px(dx)}`);
  if (Math.round(Math.abs(dy)) >= 1) mv.push(`${dy < 0 ? 'up' : 'down'} ${px(dy)}`);
  if (mv.length) out.push('Moved ' + mv.join(', '));
  if (Math.round(Math.abs(dw)) >= 1) out.push(`${dw > 0 ? 'Wider' : 'Narrower'} by ${px(dw)}`);
  if (Math.round(Math.abs(dh)) >= 1) out.push(`${dh > 0 ? 'Taller' : 'Shorter'} by ${px(dh)}`);
  return out.length ? out.join(', ') : 'Moved slightly';
}

// A change as lines of plain text (with optional colour swatches); `raw` goes in a hover title.
export function describeChange(c, { noMove = false } = {}) {
  const lines = []; const raw = [];
  if (c.kind === 'text') lines.push({ text: `"${c.oldText ?? ''}" became "${c.newText ?? ''}"` });
  if (c.kind === 'added') lines.push({ text: 'New on screen' });
  if (c.kind === 'removed') lines.push({ text: 'No longer on screen' });
  if (c.kind === 'pixels') lines.push({ text: 'A picture, icon or border looks different' });
  if (c.kind === 'moved') lines.push({ text: describeMove(c) || 'Moved' });
  for (const sc of c.styleChanges || []) { const d = describeStyle(sc); raw.push(`${sc.prop}: ${sc.from} to ${sc.to}`); if (d) lines.push({ text: d.label, swatch: d.swatch }); }
  if (c.kind === 'restyled') {
    const m = noMove ? null : describeMove(c); if (m && m !== 'Moved slightly') lines.push({ text: m });
    if (!lines.length) lines.push({ text: 'Small style change' });
  }
  if (c.kind === 'moved' && c.box && c.beforeBox) raw.push(`before ${JSON.stringify(c.beforeBox)} after ${JSON.stringify(c.box)}`);
  return { lines, raw: raw.join('\n') };
}

const PRIORITY = { text: 0, added: 1, removed: 1, restyled: 2, moved: 3, pixels: 4 };
const ROLE_WORD = { button: 'button', link: 'link', textbox: 'text box', checkbox: 'checkbox', switch: 'switch', slider: 'slider', tab: 'tab' };
const plural = (role, n) => { const w = ROLE_WORD[role] || (role ? role : 'item'); return n === 1 ? w : (w.endsWith('x') ? w + 'es' : w + 's'); };

// Fold repeated changes so 91 cards become a handful. Returns groups sorted wording/added/removed
// first, then restyled, moved, pixels; each has `items` (indices into `changes`).
export function groupChanges(changes) {
  const map = new Map();
  (changes || []).forEach((c, i) => {
    let key;
    if (c.kind === 'text') key = `text#${i}`;
    else if (c.kind === 'restyled') key = 'restyled|' + c.role + '|' + describeChange(c, { noMove: true }).lines.map((l) => l.text).join('|');
    else if (c.kind === 'moved' || c.kind === 'pixels') key = c.kind + '|' + (c.kind === 'moved' ? c.role : '');
    else key = `${c.kind}|${c.role}|${(changes.filter((x) => x.kind === c.kind && x.role === c.role).length > 3) ? '*' : i}`;
    if (!map.has(key)) map.set(key, { kind: c.kind, role: c.role, items: [] });
    map.get(key).items.push(i);
  });
  const groups = [...map.values()];
  groups.forEach((g, id) => {
    g.id = id; const n = g.items.length; const first = changes[g.items[0]];
    const verb = { added: 'added', removed: 'removed', moved: 'moved', restyled: 'restyled', pixels: 'look different' }[g.kind];
    if (g.kind === 'text' || n === 1) { g.title = [first.role, first.name].filter(Boolean).join(' ') || 'Area of the screen'; g.single = true; }
    else if (g.kind === 'pixels') g.title = `${n} other areas look different`;
    else g.title = `${n} ${plural(g.role, n)} ${verb}`;
    // Members of a repeated group share a style signature; where they sit is not part of it.
    g.lines = describeChange(first, { noMove: n > 1 }).lines;
    if (n > 1 && g.kind === 'restyled') {
      // Show swatches only when every member changed identically.
      const same = g.items.every((i) => JSON.stringify(describeChange(changes[i], { noMove: true }).lines) === JSON.stringify(g.lines));
      if (!same) g.lines = g.lines.map((l) => ({ text: l.text }));
    }
    if (n > 1 && (g.kind === 'moved' || g.kind === 'pixels')) g.lines = [];
  });
  return groups.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.id - b.id);
}
