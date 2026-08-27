/* Review deck v2 — renders DECK (one JSON object the builder inlines) one step at a time.
   Persistence: the serve.py endpoints when the page is served (GET/POST /answers, POST /submit),
   localStorage + a copy box when it is opened as a plain file. */
(function () {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const N = DECK.steps.length, runs = DECK.runs;
  let cur = 0, theme = DECK.themes[0], zoom = 1, loupeOn = true, server = false, stepStart = Date.now();
  const state = { deck: DECK.key, started: new Date().toISOString(), submitted: null, cur: 0, answers: {} };
  const ICON = {
    change: '<svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="m12.5 7.5 4 4"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    warn: '<svg viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3z"/><path d="M12 9v5"/><circle cx="12" cy="17" r=".6"/></svg>' };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  if (window.top !== window) document.body.classList.add('embedded');
  $('#deck-title').textContent = DECK.title; document.title = DECK.title;
  $('#steps').innerHTML = DECK.steps.map(() => '<span></span>').join('');
  const stage = $('#stage'), inner = $('#inner'), loupe = $('#loupe');

  // ── persistence ──
  const LS = 'deck:' + DECK.key;
  async function load() {
    try { const r = await fetch('/answers', { cache: 'no-store' }); if (r.ok) { server = true; const j = await r.json(); if (j && j.answers) Object.assign(state, j); return; } } catch (e) { /* not served */ }
    try { const j = JSON.parse(localStorage.getItem(LS) || 'null'); if (j && j.answers) Object.assign(state, j); } catch (e) { /* no storage */ }
  }
  async function save() {
    try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) { /* no storage */ }
    if (server) { try { await fetch('/answers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) }); } catch (e) { /* server gone; localStorage still has it */ } }
  }

  // ── render the current step ──
  function render() {
    const st = DECK.steps[cur];
    document.documentElement.dataset.theme = theme;   // before the pictures load, so a theme switch never flashes the old colours
    $('#wtitle').textContent = st.surface; $('#wsub').textContent = st.path;
    inner.innerHTML = runs.map(r => `<figure class="frame" data-run="${esc(r)}"><figcaption>${esc(DECK.runLabels[r] || r)}</figcaption><div class="pic"><img src="${esc(st.images[theme][r])}" alt=""><span class="box"></span></div></figure>`).join('');
    $$('#inner .frame').forEach(f => { const b = (st.boxes[theme] || {})[f.dataset.run]; const box = f.querySelector('.box'); if (b) box.style.cssText = `left:${b[0]}%;top:${b[1]}%;width:${b[2]}%;height:${b[3]}%`; else box.style.display = 'none'; });
    $('#headline').textContent = st.headline;
    $('#cards').innerHTML = `<section class="card"><h3>${ICON.change}What changed</h3><p>${esc(st.changed)}</p>${st.measured ? `<p class="num">Measured: ${esc(st.measured)}</p>` : ''}</section>`
      + `<section class="card"><h3>${ICON.eye}You'll notice</h3><p>${esc(st.notice)}</p></section>`
      + (st.risk ? `<section class="card risk"><h3>${ICON.warn}Risk</h3><p>${esc(st.risk)}</p></section>` : '');
    const last = runs[runs.length - 1];
    $('#thumbs').innerHTML = DECK.themes.map(t => `<button class="thumb${t === theme ? ' on' : ''}" data-v="${esc(t)}" title="${esc(DECK.themeNames[t])}"><img src="${esc(st.images[t][last])}" alt=""><span>${esc(DECK.themeNames[t])}</span></button>`).join('');
    $$('.thumb').forEach(b => b.onclick = () => { theme = b.dataset.v; render(); });
    $$('#inner img').forEach(i => i.addEventListener('load', layout));
    layout(); paintState();
  }
  function paintState() {
    const a = state.answers[DECK.steps[cur].id] || {};
    $$('.ans').forEach(b => b.classList.toggle('on', b.dataset.v === a.v));
    const note = $('#note'); note.value = a.note || ''; note.placeholder = a.v === 'other' ? 'Explain what you’d like instead…' : 'Add a note (optional)';
    $$('#steps span').forEach((s, i) => { const x = state.answers[DECK.steps[i].id]; s.className = (x && x.v ? x.v : '') + (i === cur ? ' on' : ''); });
    const done = Object.values(state.answers).filter(x => x.v && x.v !== 'skip').length;
    $('#count').textContent = 'step ' + (cur + 1) + ' of ' + N + ' · ' + done + ' answered';
    $('#save').disabled = !(a.v && a.v !== 'skip'); $('#prev').disabled = cur === 0; $('#next').disabled = cur === N - 1; $('#next').textContent = cur === N - 1 ? 'Last step' : 'Next ›';
  }

  // ── layout: try each arrangement for real, keep the one that shows the pictures largest (spec §3.4) ──
  const PAD = 28, CAP = 24, GAP = 18;
  function layout() {
    const c = $('#content'), step = $('#step'); const img = $('#inner img'); if (!img || !img.naturalWidth) return;
    const margin = (document.querySelector('main').clientWidth - step.clientWidth) / 2; document.body.classList.toggle('thumbs-inline', margin < 150);
    const n = runs.length, w = img.naturalWidth, h = img.naturalHeight + CAP;
    const opts = { A: 'row-below', B: 'col-right stacked', C: 'col-right', D: 'row-below stacked' }; const score = {};
    step.classList.remove('compact-step');
    for (const k in opts) {
      if (opts[k].includes('col-right') && c.clientWidth < 820) { score[k] = 0; continue; }   // a side column needs real width
      if (n === 1 && opts[k].includes('stacked')) { score[k] = 0; continue; }                 // one picture: stacking means nothing
      c.className = 'content ' + opts[k]; const SW = stage.clientWidth - PAD, SH = stage.clientHeight - PAD; const stacked = opts[k].includes('stacked');
      score[k] = Math.min(stacked ? SW / w : (SW - GAP * (n - 1)) / n / w, stacked ? (SH - GAP * (n - 1)) / n / h : SH / h);
    }
    let best = 'A'; for (const k of ['B', 'C', 'D']) if (score[k] > score[best] * 1.05) best = k;   // A wins ties
    let s;
    if (score[best] < 0.5) { c.className = 'content compact'; step.classList.add('compact-step'); s = Math.min((c.clientWidth - PAD) / w, 1); }
    else { c.className = 'content ' + opts[best]; s = Math.min(score[best], 1.5); }
    $$('#inner img').forEach(i => i.style.width = (i.naturalWidth * s * zoom) + 'px');
    $('#lvl').textContent = Math.round(zoom * 100) + '%';
    // Read by the render test: the choice, and the scores it was made from (so the test checks the RULE, not a table).
    document.body.dataset.layout = score[best] < 0.5 ? 'compact' : best;
    document.body.dataset.scores = JSON.stringify(score);
    const b = $('#inner .frame .box'); if (b && zoom > 1) b.scrollIntoView({ block: 'center', inline: 'center' });
    window.__deckReady = true;   // the render test waits for this — set only once a real layout has been chosen
  }

  // ── navigation & answers ──
  function record() {
    const id = DECK.steps[cur].id; const a = state.answers[id] || {};
    if (!a.v) a.v = 'skip';
    a.seconds = (a.seconds || 0) + Math.round((Date.now() - stepStart) / 1000); a.theme = theme; a.zoom = zoom;
    state.answers[id] = a;
  }
  function go(i) {
    if (state.submitted) return;   // Fix: after Submit, arrow keys / progress segments must not keep POSTing answers
    record(); cur = Math.max(0, Math.min(N - 1, i)); state.cur = cur; save(); zoom = 1; stepStart = Date.now(); render();
  }
  $$('.ans').forEach(b => b.onclick = () => { const id = DECK.steps[cur].id; state.answers[id] = { ...(state.answers[id] || {}), v: b.dataset.v }; paintState(); $('#note').focus(); });
  $('#note').addEventListener('input', e => { const id = DECK.steps[cur].id; state.answers[id] = { ...(state.answers[id] || {}), note: e.target.value }; });
  $('#save').onclick = () => { if (cur === N - 1) openDialog(); else go(cur + 1); };
  $('#next').onclick = () => go(cur + 1); $('#prev').onclick = () => go(cur - 1);
  $$('#steps span').forEach((s, i) => s.onclick = () => go(i));

  // ── submit ──
  function summary() {
    const counts = { yes: 0, no: 0, other: 0, skip: 0 }; const lines = [];
    for (const st of DECK.steps) { const a = state.answers[st.id] || { v: 'skip' }; const v = a.v || 'skip'; counts[v] = (counts[v] || 0) + 1; lines.push(st.id + ' ' + v + (a.note && a.note.trim() ? ' — "' + a.note.trim() + '"' : '')); }
    return DECK.key + ' · ' + (state.submitted ? 'submitted ' + state.submitted.slice(0, 16).replace('T', ' ') : 'not submitted') + ' · ' + counts.yes + ' yes · ' + counts.no + ' no · ' + counts.other + ' other · ' + counts.skip + ' skipped\n' + lines.join('\n');
  }
  function openDialog() {
    record(); save();
    // Fix: record() already banked elapsed seconds into the current step's answer; without resetting
    // stepStart, a Done -> Keep reviewing -> Done round trip would add those seconds a second time.
    // paintState() repaints so a step that record() just marked "skip" turns grey immediately.
    stepStart = Date.now(); paintState();
    const missing = DECK.steps.map((st, i) => [(state.answers[st.id] || {}).v, i]).filter(([v]) => !v || v === 'skip').map(([, i]) => i + 1);
    $('#skipped').style.display = missing.length ? 'flex' : 'none';
    $('#skipn').textContent = missing.length + (missing.length === 1 ? ' step has' : ' steps have') + ' no answer (step' + (missing.length > 1 ? 's ' : ' ') + missing.join(', ') + ').';
    $('#first').style.display = missing.length ? 'inline-flex' : 'none'; $('#first').onclick = () => { $('#veil').classList.remove('on'); go(missing[0] - 1); };
    $('#dlg-text').innerHTML = server
      ? 'Your answers have been saving to a file next to this deck as you went. Submitting tells Claude you\'re finished — it picks them up in the session and replies there. <b>Nothing to copy or paste</b>: close this tab and go back to the conversation.'
      : 'This deck is not being served, so Claude is not watching it. Copy the feedback below and paste it into the chat.';
    $('#feedback').style.display = server ? 'none' : 'block'; $('#copy').style.display = server ? 'none' : 'inline-flex'; $('#submit').style.display = server ? 'inline-flex' : 'none';
    $('#feedback').value = summary(); $('#veil').classList.add('on');
  }
  $('#done').onclick = openDialog; $('#cancel').onclick = () => $('#veil').classList.remove('on');
  $('#submit').onclick = async () => {
    state.submitted = new Date().toISOString();
    try { await fetch('/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) }); } catch (e) { /* server already gone */ }
    $('#veil').classList.remove('on'); $('#done').textContent = 'Submitted ✓'; $('#done').disabled = true; $$('.ans,#save,#note').forEach(e => e.disabled = true);
  };
  $('#copy').onclick = () => { const t = $('#feedback'); t.select(); (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).catch(() => document.execCommand('copy')); $('#copy').textContent = 'Copied'; };

  // ── loupe, zoom, keys ──
  const K = 2.5, R = 90;
  stage.addEventListener('mousemove', e => {
    if (!loupeOn) { loupe.style.display = 'none'; return; }
    const img = $$('#inner img').find(i => { const r = i.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; });
    if (!img) { loupe.style.display = 'none'; return; }
    const r = img.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
    loupe.style.display = 'block'; loupe.style.left = (e.clientX - R) + 'px'; loupe.style.top = (e.clientY - R) + 'px';
    loupe.style.backgroundImage = 'url("' + img.src + '")'; loupe.style.backgroundSize = (r.width * K) + 'px ' + (r.height * K) + 'px'; loupe.style.backgroundPosition = (-x * K + R) + 'px ' + (-y * K + R) + 'px';
  });
  stage.addEventListener('mouseleave', () => loupe.style.display = 'none');
  function setZoom(z) { zoom = Math.max(1, Math.min(4, Math.round(z * 10) / 10)); layout(); }
  $('#zin').onclick = () => setZoom(zoom + 0.1); $('#zout').onclick = () => setZoom(zoom - 0.1);
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (!state.submitted) { if (e.key === 'ArrowRight') go(cur + 1); if (e.key === 'ArrowLeft') go(cur - 1); }   // Fix: zoom/loupe stay live after Submit, navigation doesn't
    if (e.key === '+' || e.key === '=') setZoom(zoom + 0.1); if (e.key === '-') setZoom(zoom - 0.1); if (e.key === '0') setZoom(1);
    if (e.key === 'l') { loupeOn = !loupeOn; if (!loupeOn) loupe.style.display = 'none'; document.body.classList.toggle('no-loupe', !loupeOn); }
  });
  window.addEventListener('resize', layout);
  load().then(() => {
    const q = new URLSearchParams(location.search);
    cur = q.get('step') ? Math.max(0, Math.min(N - 1, +q.get('step') - 1)) : Math.max(0, Math.min(N - 1, state.cur || 0));
    if (q.get('theme') && DECK.themes.includes(q.get('theme'))) theme = q.get('theme');
    stepStart = Date.now(); render();
  });
})();
