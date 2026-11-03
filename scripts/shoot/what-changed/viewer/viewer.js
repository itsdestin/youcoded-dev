// "What changed" viewer. Reads changes.json from a run folder (served by ../serve.mjs under /run/),
// shows each changed screen before/after with boxes drawn over the changes, and records the owner's
// Keep / Not this answers in <run>/decisions.json. No build step, no dependencies.
import {
  KINDS, kindLabel, categories, boxToPercent, boxSide, aggregateScreens, countStatuses, isReviewable,
  matchesFilter, matchesQuery, groupByArea, wordParts, progress, buildDecisions,
} from './helpers.js';

const $ = (id) => document.getElementById(id);
// Small element builder. Text always goes in as textContent, so words from the app can never be read as HTML.
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid);
  return el;
}

const S = {
  data: null, entries: [], runName: 'run', base: 'run/', mode: 'server',
  filter: 'all', query: '', name: null, themeIdx: 0, view: 'side', mask: false, boxes: true, sel: -1,
  decisions: {}, slider: 50,
};
const FILTERS = [['all', 'All'], ['controls', 'Buttons & controls'], ['wording', 'Wording'], ['other', 'Other look changes']];
const STATUS_LABEL = { changed: 'Changed', new: 'New', removed: 'Removed', unchanged: 'Unchanged', failed: "Couldn't photograph" };

// ---------- loading ----------
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
const src = (p) => S.base + enc(p);

async function init() {
  try {
    const info = await (await fetch('api/info', { cache: 'no-store' })).json();
    S.runName = info.run; S.mode = 'server'; S.base = 'run/';
    S.data = await (await fetch('run/changes.json', { cache: 'no-store' })).json();
    const d = await fetch('run/decisions.json', { cache: 'no-store' });
    if (d.ok) S.decisions = (await d.json()).screens || {};
    start();
  } catch {
    // Opened as a file (or server gone): ask for changes.json by hand and keep answers in this browser.
    S.mode = 'local';
    $('loader').hidden = false;
    $('filePick').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      S.data = JSON.parse(await f.text());
      S.runName = new URLSearchParams(location.search).get('run') || 'run';
      S.base = new URLSearchParams(location.search).get('run') ? new URLSearchParams(location.search).get('run').replace(/\/?$/, '/') : '';
      try { S.decisions = JSON.parse(localStorage.getItem('what-changed:' + S.runName) || '{}'); } catch { S.decisions = {}; }
      $('loader').hidden = true;
      start();
    });
  }
}

function start() {
  S.entries = aggregateScreens(S.data.screens);
  const b = S.data.before || {}; const a = S.data.after || {};
  $('versions').textContent = `${b.label || 'before'} to ${a.label || 'after'}`;
  const first = visibleEntries()[0];
  S.name = first ? first.name : null;
  renderAll();
}

// ---------- derived ----------
const visibleEntries = () => S.entries.filter((e) => isReviewable(e) && matchesFilter(e, S.filter) && matchesQuery(e, S.query));
const current = () => S.entries.find((e) => e.name === S.name) || null;
const currentRow = (e) => (e ? e.rows[Math.min(S.themeIdx, e.rows.length - 1)] : null);
const kindColor = (k) => `var(--k-${k === 'text' ? 'text' : k})`;

// ---------- header + list ----------
function renderHeader() {
  const c = countStatuses(S.entries);
  const chips = [['Changed', c.changed + c.removed], ['New', c.new], ['Unchanged', c.unchanged], ["Couldn't photograph", c.failed]];
  const box = $('counts'); box.textContent = '';
  for (const [l, n] of chips) box.append(h('span', {}, h('b', { text: String(n) }), ' ' + l.toLowerCase().replace(/^c/, 'c')));
  renderProgress();
}
function renderProgress() {
  const p = progress(S.entries, S.decisions);
  $('progressText').textContent = `${p.decided} of ${p.total} decided`;
  $('progressBar').style.width = p.total ? (p.decided / p.total * 100) + '%' : '0';
}

function renderFilters() {
  const box = $('filters'); box.textContent = '';
  for (const [id, label] of FILTERS) {
    box.append(h('button', { type: 'button', class: S.filter === id ? 'on' : '', 'aria-pressed': S.filter === id,
      onclick: () => { S.filter = id; renderList(); ensureSelection(); renderDetail(); } , text: label }));
  }
}

function verdictPill(name) {
  const v = (S.decisions[name] || {}).verdict;
  return v ? h('span', { class: 'pill ' + v, text: v === 'keep' ? 'Keep' : 'Not this' }) : null;
}

function renderList() {
  const list = $('list'); list.textContent = '';
  const vis = visibleEntries();
  if (!vis.length) list.append(h('p', { class: 'empty', text: S.entries.some(isReviewable) ? 'Nothing matches.' : 'No screens changed.' }));
  for (const g of groupByArea(vis)) {
    list.append(h('div', { class: 'area', text: g.area }));
    for (const e of g.items) {
      const short = e.name.includes('/') ? e.name.slice(e.name.indexOf('/') + 1) : e.name;
      list.append(h('div', { class: 'row', tabindex: '0', role: 'button', 'data-name': e.name,
        'aria-current': e.name === S.name ? 'true' : 'false',
        onclick: () => selectScreen(e.name), onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectScreen(e.name); } } },
        h('span', { class: 'nm', text: short }),
        e.status === 'new' ? h('span', { class: 'pill new', text: 'New' }) : null,
        e.status !== 'new' && e.changeCount ? h('span', { class: 'pill', text: String(e.changeCount) }) : null,
        verdictPill(e.name)));
    }
  }
  // Screens we could not photograph are counted at the top; the reasons live here so nothing is hidden.
  const failed = S.entries.filter((e) => e.status === 'failed');
  $('failedBox').hidden = !failed.length;
  $('failedSummary').textContent = `Couldn't photograph (${failed.length})`;
  const ul = $('failedList'); ul.textContent = '';
  for (const e of failed) ul.append(h('li', {}, h('b', { text: e.name }), e.reason ? ' ' + e.reason : ''));
}

function ensureSelection() {
  const vis = visibleEntries();
  if (!vis.some((e) => e.name === S.name)) { S.name = vis[0] ? vis[0].name : null; S.themeIdx = 0; S.sel = -1; }
}
function selectScreen(name) {
  S.name = name; S.themeIdx = 0; S.sel = -1; renderList(); renderDetail();
  const row = document.querySelector('.row[aria-current="true"]'); if (row) row.scrollIntoView({ block: 'nearest' });
  if (matchMedia('(max-width: 900px)').matches) $('detail').scrollIntoView({ block: 'start' });
}
function step(d) {
  const vis = visibleEntries(); if (!vis.length) return;
  const i = Math.max(0, vis.findIndex((e) => e.name === S.name));
  selectScreen(vis[Math.min(vis.length - 1, Math.max(0, i + d))].name);
}

// ---------- pictures ----------
// Overlay boxes once the picture's real size is known (percentages of it, so any display size works).
function whenSized(img, fn) {
  const go = () => fn(img.naturalWidth, img.naturalHeight);
  if (img.complete && img.naturalWidth) go(); else img.addEventListener('load', go, { once: true });
}
function overlay(img, items, scale, which) {
  // which: 'before' | 'after' | 'both'. Removed things only exist in the before picture, so their
  // box is drawn on the before picture; a moved thing also shows where it used to be, dashed, on before.
  const ovl = h('div', { class: 'ovl' });
  whenSized(img, (w, hgt) => {
    items.forEach((c, i) => {
      const draw = (box, ghost) => {
        const p = boxToPercent(box, scale, w, hgt); if (!p) return;
        ovl.append(h('div', { class: 'box' + (ghost ? ' ghost' : '') + (i === S.sel ? ' sel' : ''), 'data-i': String(i),
          title: describe(c), style: `--c:${kindColor(c.kind)};left:${p.left}%;top:${p.top}%;width:${p.width}%;height:${p.height}%`,
          onclick: (ev) => { ev.stopPropagation(); selectChange(i); } }));
      };
      const side = boxSide(c);
      if (which === 'both' || which === side) draw(c.box, false);
      if (c.kind === 'moved' && c.beforeBox && (which === 'both' || which === 'before')) draw(c.beforeBox, true);
    });
  });
  return ovl;
}
const describe = (c) => `${kindLabel(c.kind)}: ${[c.role, c.name].filter(Boolean).join(' ') || 'area of the screen'}`;

function picture(row, which, changes, scale) {
  const img = h('img', { class: 'base', src: src(row[which]), loading: 'lazy', alt: which === 'before' ? 'Before' : 'After' });
  const wrap = h('div', { class: 'pic' }, img);
  if (S.boxes) wrap.append(overlay(img, changes, scale, which));
  if (S.mask && row.mask && which === 'after') wrap.append(h('img', { class: 'mask', src: src(row.mask), alt: '' }));
  return wrap;
}

function stage(row) {
  const scale = row.scale || 1;
  const changes = row.changes || [];
  if (row.status === 'new' || row.status === 'unchanged') {
    return h('div', {}, row.status === 'new' ? h('div', { class: 'notice', text: row.reason ? `New screen: ${row.reason}` : 'New screen. It did not exist in the last release, so there is nothing to compare.' }) : null,
      h('div', { class: 'cap', text: 'After' }), row.after ? picture(row, 'after', [], scale) : null);
  }
  if (row.status === 'removed') return h('div', {}, h('div', { class: 'notice', text: row.reason || 'This screen no longer exists.' }), h('div', { class: 'cap', text: 'Before' }), picture(row, 'before', [], scale));
  if (row.status === 'failed') return h('div', { class: 'notice', text: row.reason ? `Couldn't photograph this one: ${row.reason}` : "Couldn't photograph this one." });
  if (!row.before || !row.after) return h('div', { class: 'notice', text: 'A picture is missing for this screen.' });

  if (S.view === 'side') {
    return h('div', { class: 'pair' },
      h('div', {}, h('div', { class: 'cap', text: 'Before' }), picture(row, 'before', changes, scale)),
      h('div', {}, h('div', { class: 'cap', text: 'After' }), picture(row, 'after', changes, scale)));
  }
  // Slider and fade stack both pictures; one overlay (after-side boxes + removed boxes) sits on top.
  const after = h('img', { class: 'base', src: src(row.after), loading: 'lazy', alt: 'After' });
  const before = h('img', { class: 'layer', src: src(row.before), loading: 'lazy', alt: 'Before' });
  const wrap = h('div', { class: 'pic' }, after, before);
  const handle = S.view === 'slider' ? h('div', { class: 'slider-handle' }) : null;
  const apply = () => {
    if (S.view === 'slider') { before.style.clipPath = `inset(0 ${100 - S.slider}% 0 0)`; handle.style.left = S.slider + '%'; }
    else before.style.opacity = String(1 - S.slider / 100);
  };
  if (handle) wrap.append(handle);
  wrap.append(h('span', { class: 'lbl', style: 'left:6px', text: 'Before' }), h('span', { class: 'lbl', style: 'right:6px', text: 'After' }));
  if (S.boxes) wrap.append(overlay(after, changes, scale, 'both'));
  if (S.mask && row.mask) wrap.append(h('img', { class: 'mask', src: src(row.mask), alt: '' }));
  apply();
  const range = h('input', { class: 'range', type: 'range', min: '0', max: '100', value: String(S.slider),
    'aria-label': S.view === 'slider' ? 'Slide between before and after' : 'Fade between before and after',
    oninput: (e) => { S.slider = +e.target.value; apply(); } });
  return h('div', {}, wrap, range);
}

// ---------- changes list + wording ----------
function changeList(row) {
  const box = h('div', { class: 'changes' });
  const changes = row.changes || [];
  if (!changes.length) box.append(h('p', { class: 'muted', text: 'No individual changes listed.' }));
  changes.forEach((c, i) => {
    const bits = [];
    if (c.kind === 'text') bits.push(`"${c.oldText ?? ''}" to "${c.newText ?? ''}"`);
    for (const s of c.styleChanges || []) bits.push(`${s.prop}: ${s.from} to ${s.to}`);
    if (c.kind === 'moved' && c.beforeBox && c.box) bits.push(`moved from ${Math.round(c.beforeBox.x)},${Math.round(c.beforeBox.y)} to ${Math.round(c.box.x)},${Math.round(c.box.y)}`);
    box.append(h('button', { type: 'button', class: 'chg' + (i === S.sel ? ' sel' : ''), 'data-i': String(i), style: `--c:${kindColor(c.kind)}`, onclick: () => selectChange(i) },
      h('span', { class: 'k', text: kindLabel(c.kind) }), ' ', [c.role, c.name].filter(Boolean).join(' ') || 'Area of the screen',
      bits.length ? h('small', { text: bits.join(' · ') }) : null));
  });
  return box;
}
function selectChange(i) {
  S.sel = S.sel === i ? -1 : i;
  document.querySelectorAll('[data-i]').forEach((el) => el.classList.toggle('sel', +el.dataset.i === S.sel));
  const target = document.querySelector(`.box[data-i="${S.sel}"]`);
  if (target) target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function wordingTable(row) {
  const rows = (row.changes || []).filter((c) => c.kind === 'text');
  if (!rows.length) return null;
  const cell = (parts, cls) => h('td', {}, parts.map((p, i) => [i ? ' ' : '', p.mark ? h('mark', { class: cls, text: p.text }) : p.text]));
  return h('div', { class: 'card' }, h('h2', { text: 'Wording' }),
    h('table', { class: 'words' }, h('thead', {}, h('tr', {}, h('th', { text: 'What it is' }), h('th', { text: 'Old' }), h('th', { text: 'New' }))),
      h('tbody', {}, rows.map((c) => {
        // Fall back to whole-string marking if the comparer gave no word breakdown.
        const w = c.words && c.words.length ? wordParts(c.words) : { oldParts: [{ text: c.oldText ?? '', mark: true }], newParts: [{ text: c.newText ?? '', mark: true }] };
        return h('tr', {}, h('td', { text: [c.role, c.name].filter(Boolean).join(' ') || 'Text' }), cell(w.oldParts, 'o'), cell(w.newParts, 'n'));
      }))));
}

// ---------- detail ----------
function renderDetail() {
  const d = $('detail'); d.textContent = '';
  const e = current();
  if (!e) { d.append(h('div', { class: 'card empty', text: S.entries.length ? 'Pick a screen from the list.' : 'No screens in this run.' })); return; }
  const row = currentRow(e);
  const dec = S.decisions[e.name] || {};
  const head = h('div', { class: 'card' },
    h('div', { class: 'head' }, h('h2', { text: e.name }), h('span', { class: 'pill ' + (e.status === 'new' ? 'new' : ''), text: STATUS_LABEL[e.status] }),
      h('div', { class: 'verdict' },
        h('button', { type: 'button', class: 'keep' + (dec.verdict === 'keep' ? ' on' : ''), 'aria-pressed': dec.verdict === 'keep', text: 'Keep', onclick: () => decide('keep') }),
        h('button', { type: 'button', class: 'notthis' + (dec.verdict === 'not-this' ? ' on' : ''), 'aria-pressed': dec.verdict === 'not-this', text: 'Not this', onclick: () => decide('not-this') }))),
    h('textarea', { class: 'note', placeholder: 'Note (optional)', 'aria-label': 'Note', value: dec.note || '',
      oninput: (ev) => { setDecision(e.name, { note: ev.target.value }); } }));
  head.querySelector('textarea').value = dec.note || '';
  d.append(head);

  const compare = (row.status === 'changed') && row.before && row.after;
  const bar = h('div', { class: 'bar2' });
  if (e.rows.length > 1) {
    bar.append(h('div', { class: 'seg', role: 'group', 'aria-label': 'Theme' }, e.rows.map((r, i) =>
      h('button', { type: 'button', class: i === S.themeIdx ? 'on' : '', text: r.theme, onclick: () => { S.themeIdx = i; S.sel = -1; renderDetail(); } }))));
  }
  if (compare) {
    bar.append(h('div', { class: 'seg', role: 'group', 'aria-label': 'View' }, [['side', 'Side by side'], ['slider', 'Slider'], ['fade', 'Fade']].map(([id, l]) =>
      h('button', { type: 'button', class: S.view === id ? 'on' : '', text: l, onclick: () => { S.view = id; renderDetail(); } }))));
    bar.append(h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: S.boxes, onchange: (ev) => { S.boxes = ev.target.checked; renderDetail(); } }), 'Show boxes'));
  }
  if (row.mask) bar.append(h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: S.mask, onchange: (ev) => { S.mask = ev.target.checked; renderDetail(); } }), 'Changed pixels'));
  if (e.rows.length > 1 && row.status === 'failed') bar.append(h('span', { class: 'muted', text: 'This theme could not be photographed.' }));

  const legend = h('div', { class: 'legend' }, KINDS.map((k) => h('span', {}, h('i', { class: 'sw', style: `background:${kindColor(k.kind)}` }), k.label)));
  const side = compare || (row.changes || []).length ? h('div', {}, h('div', { class: 'cap', text: `${(row.changes || []).length} changes` }), changeList(row)) : null;
  d.append(h('div', { class: 'card' }, bar, compare ? legend : null,
    h('div', { class: side ? 'stage' : '', style: 'margin-top:10px' }, h('div', { class: 'pics' }, stage(row)), side)));
  const w = wordingTable(row); if (w) d.append(w);
}

// ---------- decisions ----------
let saveTimer = null;
function setDecision(name, patch) {
  const cur = S.decisions[name] || { verdict: '', note: '' };
  const next = { verdict: cur.verdict || '', note: cur.note || '', ...patch };
  if (!next.verdict && !next.note) delete S.decisions[name]; else S.decisions[name] = next;
  renderHeader(); renderListPills(); scheduleSave();
}
function renderListPills() {
  document.querySelectorAll('.row').forEach((r) => {
    r.querySelector('.pill.keep, .pill.not-this')?.remove();
    const p = verdictPill(r.dataset.name); if (p) r.append(p);
  });
}
function decide(verdict) {
  const was = (S.decisions[S.name] || {}).verdict;
  setDecision(S.name, { verdict: was === verdict ? '' : verdict });
  renderDetail();
}
function doc() { return buildDecisions(S.runName, S.decisions); }
function scheduleSave() {
  $('saveState').textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 350);
}
async function save() {
  try { localStorage.setItem('what-changed:' + S.runName, JSON.stringify(S.decisions)); } catch { /* private window: fine */ }
  if (S.mode !== 'server') { $('saveState').textContent = 'Kept in this browser. Use Copy or Download to keep a file.'; return; }
  try {
    const r = await fetch('api/decisions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc()) });
    if (!r.ok) throw new Error(String(r.status));
    $('saveState').textContent = 'Saved';
  } catch { $('saveState').textContent = "Couldn't save. Use Copy answers."; }
}
async function copyAnswers() {
  const text = JSON.stringify(doc(), null, 2);
  try { await navigator.clipboard.writeText(text); $('saveState').textContent = 'Copied'; }
  catch { const t = h('textarea', { style: 'position:fixed;opacity:0' }); t.value = text; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); $('saveState').textContent = 'Copied'; }
}
function downloadAnswers() {
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(doc(), null, 2)], { type: 'application/json' })), download: 'decisions.json' });
  document.body.append(a); a.click(); a.remove();
}

// ---------- keys ----------
document.addEventListener('keydown', (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const t = ev.target;
  if (t && (t.tagName === 'INPUT' && t.type !== 'checkbox' && t.type !== 'range' || t.tagName === 'TEXTAREA')) { if (ev.key === 'Escape') t.blur(); return; }
  const e = current();
  switch (ev.key) {
    case 'j': case 'ArrowDown': if (ev.key === 'ArrowDown' && t.tagName === 'INPUT') return; ev.preventDefault(); step(1); break;
    case 'k': case 'ArrowUp': if (ev.key === 'ArrowUp' && t.tagName === 'INPUT') return; ev.preventDefault(); step(-1); break;
    case 'y': if (e) { decide('keep'); step(1); } break;
    case 'n': if (e) { decide('not-this'); step(1); } break;
    case 'u': if (e) { setDecision(e.name, { verdict: '' }); renderDetail(); } break;
    case 'v': S.view = { side: 'slider', slider: 'fade', fade: 'side' }[S.view]; renderDetail(); break;
    case 't': if (e && e.rows.length > 1) { S.themeIdx = (S.themeIdx + 1) % e.rows.length; S.sel = -1; renderDetail(); } break;
    case 'm': S.mask = !S.mask; renderDetail(); break;
    case '/': ev.preventDefault(); $('search').focus(); break;
    case '?': $('keysBtn').click(); break;
    default:
  }
});

function renderAll() { renderHeader(); renderFilters(); renderList(); renderDetail(); }
$('search').addEventListener('input', (ev) => { S.query = ev.target.value; renderList(); ensureSelection(); renderDetail(); });
$('copyBtn').addEventListener('click', copyAnswers);
$('dlBtn').addEventListener('click', downloadAnswers);
$('keysBtn').addEventListener('click', () => { const k = $('keys'); k.hidden = !k.hidden; $('keysBtn').setAttribute('aria-expanded', String(!k.hidden)); });
init();
