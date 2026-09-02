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
  // Mirrors serve.py's NOTE_KIND: an unknown/absent note_kind (an old answers file predating
  // tags) prints nothing in the summary rather than "[undefined]".
  const NOTE_KIND = { now: 'fix now', later: 'fix later', noting: 'just noting' };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  if (window.top !== window) document.body.classList.add('embedded');
  // What the stage shows for a step: one frame per run (before/after, or today), or — for a CHOICE
  // step — one frame per variant, lettered. Destin (2026-08-27): variants of one thing are one
  // question on one page, not a yes/no each.
  // A LIVE pane is NOT pickable: a click inside it is an interaction with the candidate
  // (hover, drag, open a menu), not an answer. Picking stays on the lettered card and the
  // answer button. `open on its own` is the same address in a new tab — room and quiet.
  const popout = url => `<a class="popout" href="${esc(url)}" target="_blank" rel="noopener" title="Open this design alone in a new browser window">Open in New Window ↗</a>`;
  const frames = st => st.kind === 'choice'
    ? st.variants.map(v => ({ key: v.id, caption: `<span class="key">${esc(v.id)}.</span>${esc(v.label)}`, pickable: true }))
    : st.kind === 'live'
    ? st.panes.map(p => ({ key: p.id, url: p.url, pickable: false,
        caption: (p.label ? `<span class="key">${esc(p.id)}.</span>${esc(p.label)}` : '<span class="live-dot"></span>Live') + popout(p.url) }))
    : runs.map(r => ({ key: r, caption: esc(DECK.runLabels[r] || r), pickable: false }));
  // CLIP step: one <video> per run instead of a still. They start PAUSED on their poster
  // (Destin, 2026-08-28) — ↻ or `r` plays both from the start together; native controls
  // so a bug can be paused and scrubbed; muted + looping once started.
  // LIVE: `data-src` rather than `src`, filled in only once the probe says the app server is
  // answering. Pointing an iframe at a dead port paints Chrome's own error page inside the
  // pane, which looks like a broken candidate rather than a stopped server.
  const media = (st, f) => st.kind === 'clip'
    ? `<video src="${esc(st.clips[f.key])}"${st.posters[f.key] ? ` poster="${esc(st.posters[f.key])}"` : ''} muted loop playsinline controls preload="auto"></video>`
    : st.kind === 'live'
    ? `<iframe data-src="${esc(f.url)}" data-pane="${esc(f.key)}" loading="eager" title="Live pane"></iframe>`
    : `<img src="${esc(st.images[theme][f.key])}" alt=""><span class="box"></span>`;
  function replay() { const vs = $$('#inner video'); vs.forEach(v => { v.pause(); v.currentTime = 0; }); vs.forEach(v => v.play().catch(() => {})); }
  let curFrames = frames(DECK.steps[0]), lastStep = null;

  // ── live panes ──────────────────────────────────────────────────────────────────────
  const MIN_PANE_H = 160;   // a pane whose script never reported is visibly empty, not a 0px line
  // One probe per entry to a live step (not one per page): a server started AFTER the deck
  // was opened must be able to recover on the next visit. `no-cors` gives an opaque response
  // — useless to read, but a REJECTION is unambiguous, and it is the only reliable signal
  // here: Chrome fires an iframe `load` event on its own error page too.
  const probeLive = () => fetch(DECK.live.base + '/', { mode: 'no-cors', cache: 'no-store' }).then(() => true, () => false);
  function drawLivePanes() {
    $$('#inner iframe').forEach(f => { if (f.dataset.src) f.src = f.dataset.src; });
  }
  function drawServerDown(st) {
    // Specific and accurate (docs/error-message-standards.md): we know exactly which address
    // did not answer and exactly what starts it. This is also what an ARCHIVED review shows.
    inner.innerHTML = `<div class="down"><h3>The app server for this review is not running</h3>`
      + `<p>Nothing answered at <code>${esc(DECK.live.base)}</code>, so the ${st.panes.length === 1 ? 'pane has' : 'panes have'} nothing to show. Start it with:</p>`
      + `<pre>${esc(DECK.live.command)}</pre>`
      + `<p class="sub">Or re-run <code>review-cards.py serve &lt;spec&gt;</code>, which starts it for you. A review read back later always lands here — live panes do not replay.</p></div>`;
  }
  // Theme WITHOUT render(): render() rebuilds #inner, which reloads every iframe and throws
  // away a half-finished drag or an animation mid-play. The app applies the swap live through
  // __workbenchAppearanceSync, the same path the landing page's embed uses.
  function setLiveTheme() {
    document.documentElement.dataset.theme = theme;
    $$('.thumb').forEach(b => b.classList.toggle('on', b.dataset.v === theme));
    $$('#inner iframe').forEach(f => { try { f.contentWindow.postMessage({ type: 'youcoded:theme', theme }, DECK.live.base); } catch (e) { /* not loaded yet */ } });
  }
  // A width the pane MEASURED for itself beats the one the spec guessed at — the number lives
  // in the registry in the other repo, so the deck can only ever be estimating.
  const paneWidthOf = (st, i) => {
    const f = $$('#inner iframe')[i];
    return Number((f && f.dataset.reportedWidth) || st.width);
  };
  function layoutLive() {
    const st = DECK.steps[cur], c = $('#content'), step = $('#step');
    // Panes have a DECLARED width — there is no natural image size to solve an arrangement
    // from, so none of layout()'s scoring applies. One row at real size; the stage scrolls if
    // the row is wider than it is, which validate() warns about before the deck is ever built.
    // A live step's problem is never horizontal room, it is vertical: one 420px pane left
    // ~800px of empty stage either side while its own content was being cut off at the
    // bottom. So put the cards in a side column whenever the panes still fit beside them,
    // which hands the stage the full height of the page.
    const info = Math.max(320, c.clientWidth * 0.30);
    const paneRow = st.panes.reduce((sum, p, i) => sum + paneWidthOf(st, i) + (i ? 18 : 0), 0);
    c.className = 'content ' + (c.clientWidth - info - 40 >= paneRow ? 'col-right' : 'row-below');
    step.classList.remove('compact-step');
    // ALWAYS inline, no width threshold. The theme row is absolutely positioned beside the
    // step, and a live row is wide by nature — two to four panes at real size — so the side
    // column lands outside the window and the buttons get cut in half (seen 2026-08-31).
    // There is no width at which a side column is right here, so don't compute one.
    document.body.classList.add('thumbs-inline');
    $$('#inner iframe').forEach((f, i) => {
      f.style.width = paneWidthOf(st, i) + 'px';
      if (!f.style.height) f.style.height = (st.height || MIN_PANE_H) + 'px';
    });
    document.body.dataset.layout = 'live';
    document.body.dataset.scores = '{}';
    // layout() is the ONLY place this is ever set and deck-render.test.mjs polls it for ten
    // seconds before giving up. A live branch that returned early without setting it would
    // hang every test in the suite and explain nothing.
    window.__deckReady = true;
  }
  // A one-run deck is a BRIEF (nothing built yet): "keep / revert" would ask about work that does not exist.
  const YES = runs.length === 1 ? 'Yes, build it' : 'Yes, keep it', NO = runs.length === 1 ? 'No, leave it' : 'No, revert it';
  // A words step may relabel the buttons ("Holds / Fails" on an acceptance row): the deck's
  // build/keep wording is about a picture, and a statement has none.
  const yesLabel = st => st.yes || YES, noLabel = st => st.no || NO;
  // The things a step offers to pick between, or null if it is a yes/no. A LIVE step's
  // question shape rides in `shape`, because `kind` already says where its picture comes
  // from — so a live pick-one answers exactly like a picture pick-one.
  const pickList = st => st.kind === 'choice' ? st.variants
    : (st.kind === 'live' && st.shape === 'choice') ? st.panes : null;
  function renderAnswers(st) {
    // A DECIDE step's options ARE its answers, so there is no yes/no: picking one is the answer,
    // and "Other" carries anything he wants instead. No "None of these" — with written options
    // that button and "Other" would mean the same thing twice.
    const picks = pickList(st);
    // Fix: the lettered options used to appear TWICE — once as the cards, once again as
    // buttons repeating the same letter and the same label directly beneath them. Destin
    // (2026-09-01): "two distinct multiple-choice decision rows that kinda offer the same
    // options." The cards are the better of the two (they carry the summary, the measurement
    // and the risk), so they are now the only place you pick. What stays here is only what a
    // card CANNOT say: none of them, or something else entirely.
    $('#answers').innerHTML = picks || st.kind === 'decide'
      ? (picks ? `<button class="btn ans" data-v="no">None of these</button>` : '')
        + `<button class="btn ans" data-v="other">Other</button>`
      : `<button class="btn ans" data-v="yes">${yesLabel(st)}</button><button class="btn ans" data-v="no">${noLabel(st)}</button><button class="btn ans" data-v="other">Other</button>`;
    if (state.submitted) $$('.ans').forEach(e => e.disabled = true);   // the buttons are rebuilt per step; a submitted deck stays read-only
  }
  function answer(v, pick) {
    if (state.submitted) return;
    const id = DECK.steps[cur].id; const a = { ...(state.answers[id] || {}), v }; if (v === 'pick') a.pick = pick; else delete a.pick;
    state.answers[id] = a; paintState(); save(); $('#note').focus();
  }
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
    if (server) { try { await fetch('/answers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) }); } catch (e) { /* server gone — the file has everything up to the last successful POST */ } }
  }

  // ── render the current step ──
  function render() {
    const st = DECK.steps[cur];
    const themes = st.themes || DECK.themes;   // a real-app capture exists in one theme only — that step lists just that one
    if (st.themes && st !== lastStep) theme = st.themes[0];   // a step with its own theme list opens on the first: that list says which themes matter here
    else if (!themes.includes(theme)) theme = themes[0];
    lastStep = st;
    document.documentElement.dataset.theme = theme;   // before the pictures load, so a theme switch never flashes the old colours
    $('#wtitle').textContent = st.surface; $('#wsub').textContent = st.path;
    // A words step has no frames: the stage is hidden by layout() and the cards fill the row.
    curFrames = st.words ? [] : frames(st);
    inner.innerHTML = curFrames.map(f => `<figure class="frame${f.pickable ? ' pickable' : ''}${st.kind === 'clip' ? ' clip' : ''}" data-run="${esc(f.key)}"${f.pickable ? ` title="Pick ${esc(f.key)}"` : ''}><figcaption>${f.caption}</figcaption><div class="pic">${media(st, f)}</div></figure>`).join('');
    $$('#inner .frame .box').forEach(box => { const b = ((st.boxes || {})[theme] || {})[box.closest('.frame').dataset.run]; if (b) box.style.cssText = `left:${b[0]}%;top:${b[1]}%;width:${b[2]}%;height:${b[3]}%`; else box.style.display = 'none'; });
    $('#replay').hidden = st.kind !== 'clip';
    // Zoom is off on a live step: it scales a still image, and a pane at anything but real
    // size stops showing the thing it is there to show. (The magnifier needs no switch — its
    // handler looks for `#inner img`, finds none, and hides itself.)
    $('#zoom').hidden = st.kind === 'live' || !!st.words;
    $('#livehint').hidden = st.kind !== 'live';
    if (st.kind === 'live') {
      // Once a click lands inside a pane, focus is in ITS document and this page stops seeing
      // key presses — so say so rather than leaving arrow keys mysteriously dead. Prev/Next
      // and every answer button still work with the mouse.
      $('#livehint').textContent = 'These panes are the running app — hover, click and drag them. Click the page outside a pane to use ← → again.';
      probeLive().then(up => {
        if (DECK.steps[cur] !== st) return;   // he moved on while we were asking
        if (up) drawLivePanes(); else drawServerDown(st);
        layoutLive();
      });
    }
    if (st.kind === 'clip') $$('#inner video').forEach(v => v.addEventListener('loadedmetadata', layout));
    $$('#inner .frame.pickable').forEach(f => f.onclick = () => answer('pick', f.dataset.run));
    $('#headline').textContent = st.headline;
    const optionCard = (o, cls) => `<section class="card variant${cls}" data-pick="${esc(o.id)}" title="Pick ${esc(o.id)}"><span class="key">${esc(o.id)}</span><div class="vbody"><h3>${esc(o.label)}</h3><p>${esc(o.summary)}</p>${o.measured ? `<p class="num">Measured: ${esc(o.measured)}</p>` : ''}${o.cost ? `<p class="cost">${esc(o.cost)}</p>` : ''}${o.risk ? `<p class="r">${esc(o.risk)}</p>` : ''}</div></section>`;
    // CONTRACT: the rows as one table, not a card per row — grading (a `verdict` on any row)
    // adds a Verdict column instead of always reserving one nobody has filled in yet.
    const graded = st.kind === 'contract' && st.rows.some(r => r.verdict);
    const rowsTable = () => `<section class="card contract"><table><thead><tr><th>#</th><th>Statement</th><th>Checked by</th><th>Threshold</th><th>From</th>${graded ? '<th>Verdict</th>' : ''}</tr></thead><tbody>${st.rows.map(r => `<tr class="${esc(r.verdict)}"><td>${esc(r.id)}</td><td>${esc(r.statement)}${r.note ? `<p class="src">“${esc(r.note)}”</p>` : ''}</td><td>${esc(r.checkedBy)}${r.guard ? `<p class="src">${esc(r.guard)}</p>` : ''}</td><td>${esc(r.threshold || 'pass / fail')}</td><td class="src">${esc(r.source)}</td>${graded ? `<td>${esc(r.verdict || '—')}${r.evidence ? `<p class="src">${esc(r.evidence)}</p>` : ''}</td>` : ''}</tr>`).join('')}</tbody></table></section>`;
    $('#cards').innerHTML = st.kind === 'contract'
      ? rowsTable()
        + (st.notice ? `<section class="card"><h3>${ICON.eye}You'll notice</h3><p>${esc(st.notice)}</p></section>` : '')
        + (st.risk ? `<section class="card risk"><h3>${ICON.warn}Risk</h3><p>${esc(st.risk)}</p></section>` : '')
      : pickList(st)
      ? pickList(st).map(v => optionCard(v, '')).join('')
        + (st.notice ? `<section class="card"><h3>${ICON.eye}You'll notice</h3><p>${esc(st.notice)}</p></section>` : '')
        + (st.risk ? `<section class="card risk"><h3>${ICON.warn}Risk</h3><p>${esc(st.risk)}</p></section>` : '')
      : st.kind === 'decide'
      ? (st.notice ? `<section class="card"><h3>${ICON.eye}You'll notice</h3><p>${esc(st.notice)}</p></section>` : '')
        + st.options.map(o => optionCard(o, ' option')).join('')
        + (st.risk ? `<section class="card risk"><h3>${ICON.warn}Risk</h3><p>${esc(st.risk)}</p></section>` : '')
      : `<section class="card"><h3>${ICON.change}What changed</h3><p>${esc(st.changed)}</p>${st.measured ? `<p class="num">Measured: ${esc(st.measured)}</p>` : ''}</section>`
        + `<section class="card"><h3>${ICON.eye}You'll notice</h3><p>${esc(st.notice)}</p></section>`
        + (st.risk ? `<section class="card risk"><h3>${ICON.warn}Risk</h3><p>${esc(st.risk)}</p></section>` : '');
    // Fix: this ran BEFORE #cards was filled in, so it bound handlers to the PREVIOUS step's
    // cards and the current step's got none — a lettered card looked clickable (pointer
    // cursor, "Pick B" tooltip) and did nothing, on every pick-one step. It matters more on a
    // live step, where the pane deliberately isn't a pick target and the card is the big one.
    $$('.card.variant').forEach(c => c.onclick = () => answer('pick', c.dataset.pick));
    renderAnswers(st);
    const last = curFrames.length ? curFrames[curFrames.length - 1].key : null;
    // A clip is recorded in one theme; there are no per-theme variants to switch between.
    // A words step has no picture of any theme — the theme pills would be empty.
    $('#thumbs').innerHTML = st.words ? '' : st.kind === 'clip' ? ''
      // A live step has no thumbnails to show — there is no picture of the other themes, only
      // the panes themselves, one theme at a time. Same control, rendered as plain labels.
      : st.kind === 'live' ? themes.map(t => `<button class="thumb label-only${t === theme ? ' on' : ''}" data-v="${esc(t)}" title="${esc(DECK.themeNames[t])}"><span>${esc(DECK.themeNames[t])}</span></button>`).join('')
      : themes.map(t => `<button class="thumb${t === theme ? ' on' : ''}" data-v="${esc(t)}" title="${esc(DECK.themeNames[t])}"><img src="${esc(st.images[t][last])}" alt=""><span>${esc(DECK.themeNames[t])}</span></button>`).join('');
    $$('.thumb').forEach(b => b.onclick = () => {
      theme = b.dataset.v;
      if (DECK.steps[cur].kind === 'live') { setLiveTheme(); return; }   // never render(): that reloads every pane
      render();
    });
    $$('#inner img').forEach(i => i.addEventListener('load', layout));
    layout(); paintState();
  }
  function paintState() {
    const a = state.answers[DECK.steps[cur].id] || {};
    $$('.ans').forEach(b => b.classList.toggle('on', b.dataset.v === a.v && (a.v !== 'pick' || b.dataset.pick === a.pick)));
    $$('.card.variant').forEach(c => c.classList.toggle('on', a.v === 'pick' && c.dataset.pick === a.pick));
    $$('#inner .frame.pickable').forEach(f => f.classList.toggle('on', a.v === 'pick' && f.dataset.run === a.pick));
    const note = $('#note'); note.value = a.note || ''; note.placeholder = a.v === 'other' ? 'Explain what you’d like instead…' : 'Add a note (optional)';
    // The tag row is shown only once a note has text — nothing about an empty note is tagged.
    // A visible default, never an inference: an old answer's note (written before tags existed)
    // has no note_kind, so it shows none selected — the default is written only when a note
    // gains text under the #note input handler below, never painted on here.
    const hasNote = !!(a.note && a.note.trim());
    $('#tags').hidden = !hasNote;
    $$('#tags .tag').forEach(b => b.classList.toggle('on', hasNote && b.dataset.kind === a.note_kind));
    $$('#steps span').forEach((s, i) => { const x = state.answers[DECK.steps[i].id]; s.className = (x && x.v ? x.v : '') + (i === cur ? ' on' : ''); });
    const done = Object.values(state.answers).filter(x => x.v && x.v !== 'skip').length;
    $('#count').textContent = 'step ' + (cur + 1) + ' of ' + N + ' · ' + done + ' answered' + (state.submitted ? ' · submitted, read-only' : '');   // survives every repaint (theme clicks included)
    $('#save').disabled = !(a.v && a.v !== 'skip'); $('#prev').disabled = cur === 0; $('#next').disabled = cur === N - 1; $('#next').textContent = cur === N - 1 ? 'Last step' : 'Next ›';
  }

  // ── layout: try each arrangement for real, keep the one that shows the pictures largest (spec §3.4) ──
  const PAD = 28, CAP = 24, GAP = 18;
  function layout() {
    if (DECK.steps[cur].words) {   // no picture to size: one column of cards, answer bar under it
      $('#content').className = 'content words'; $('#step').classList.remove('compact-step');
      document.body.dataset.layout = 'words';
      // Fix: without this, navigating from a picture step to a words step left the PREVIOUS
      // step's scores in the DOM — a stale table the render test (and anyone reading the DOM
      // by hand) could mistake for this step's own layout choice. Match the live branch.
      document.body.dataset.scores = '{}';
      window.__deckReady = true; return;
    }
    if (DECK.steps[cur].kind === 'live') { layoutLive(); return; }
    const c = $('#content'), step = $('#step'); const img = $('#inner img, #inner video'); if (!img) return;
    const natW = img.naturalWidth || img.videoWidth, natH = img.naturalHeight || img.videoHeight; if (!natW) return;
    const margin = (document.querySelector('main').clientWidth - step.clientWidth) / 2; document.body.classList.toggle('thumbs-inline', margin < 150);
    const n = curFrames.length, w = natW, h = natH + CAP;
    const opts = { A: 'row-below', B: 'col-right stacked', C: 'col-right', D: 'row-below stacked' }; const score = {};
    step.classList.remove('compact-step');
    for (const k in opts) {
      if (opts[k].includes('col-right') && (c.clientWidth < 820 || DECK.steps[cur].kind === 'choice')) { score[k] = 0; continue; }   // a side column needs real width; variant PICTURES need the full row (a decide step has only one picture, so it keeps the column)
      if (n === 1 && opts[k].includes('stacked')) { score[k] = 0; continue; }                 // one picture: stacking means nothing
      if (DECK.steps[cur].kind === 'clip' && opts[k].includes('stacked')) { score[k] = 0; continue; }   // clips: side by side, or the two recordings can't be watched together
      c.className = 'content ' + opts[k]; const SW = stage.clientWidth - PAD, SH = stage.clientHeight - PAD; const stacked = opts[k].includes('stacked');
      score[k] = Math.min(stacked ? SW / w : (SW - GAP * (n - 1)) / n / w, stacked ? (SH - GAP * (n - 1)) / n / h : SH / h);
    }
    let best = 'A'; for (const k of ['B', 'C', 'D']) if (score[k] > score[best] * 1.05) best = k;   // A wins ties
    let s;
    // A clip pair is worth watching smaller: compact only under 30% (stills: 50%).
    const floor = DECK.steps[cur].kind === 'clip' ? 0.3 : 0.5;
    if (score[best] < floor) { c.className = 'content compact'; step.classList.add('compact-step'); s = Math.min((c.clientWidth - PAD) / w, 1); }
    else { c.className = 'content ' + opts[best]; s = Math.min(score[best], 1.5); }
    $$('#inner img, #inner video').forEach(i => i.style.width = ((i.naturalWidth || i.videoWidth) * s * zoom) + 'px');
    $('#lvl').textContent = Math.round(zoom * 100) + '%';
    // Read by the render test: the choice, and the scores it was made from (so the test checks the RULE, not a table).
    document.body.dataset.layout = score[best] < floor ? 'compact' : best;
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
  // Fix: save on EVERY answer, not only when the step changes — a tab closed on the last
  // answered step used to lose that answer entirely. The note debounces so a sentence typed
  // at speed is one POST, not one per keystroke.
  let noteTimer = null;
  $('#answers').addEventListener('click', e => { const b = e.target.closest('.ans'); if (b && !b.disabled) answer(b.dataset.v, b.dataset.pick); });
  $('#note').addEventListener('input', e => {
    const id = DECK.steps[cur].id; const a = { ...(state.answers[id] || {}), note: e.target.value };
    // A note that just gained text is "just noting" until he says otherwise — a visible default,
    // not an inference: it is on screen, selected, and one click away from the other two.
    if (a.note.trim() && !a.note_kind) a.note_kind = 'noting';
    if (!a.note.trim()) delete a.note_kind;
    state.answers[id] = a; paintState(); clearTimeout(noteTimer); noteTimer = setTimeout(save, 300);
  });
  $('#tags').addEventListener('click', e => {
    const b = e.target.closest('.tag'); if (!b || state.submitted) return;
    const id = DECK.steps[cur].id; state.answers[id] = { ...(state.answers[id] || {}), note_kind: b.dataset.kind }; paintState(); save();
  });
  $('#save').onclick = () => { if (cur === N - 1) openDialog(); else go(cur + 1); };
  $('#next').onclick = () => go(cur + 1); $('#prev').onclick = () => go(cur - 1);
  $$('#steps span').forEach((s, i) => s.onclick = () => go(i));

  // ── submit ──
  function summary() {
    const counts = { yes: 0, no: 0, other: 0, skip: 0 }; const lines = [];
    // Mirrors serve.py's summary(): the note's tag prints right after its quoted text, same words.
    for (const st of DECK.steps) { const a = state.answers[st.id] || { v: 'skip' }; const v = a.v || 'skip'; counts[v] = (counts[v] || 0) + 1; const what = v === 'pick' ? 'pick ' + (a.pick || '?') : (v === 'no' && pickList(st) ? 'none' : v); const tag = NOTE_KIND[a.note_kind]; lines.push(st.id + ' ' + what + (a.note && a.note.trim() ? ' — "' + a.note.trim() + '"' + (tag ? ' [' + tag + ']' : '') : '')); }
    return DECK.key + ' · ' + (state.submitted ? 'submitted ' + state.submitted.slice(0, 16).replace('T', ' ') : 'not submitted') + ' · ' + counts.yes + ' yes · ' + counts.no + ' no · ' + counts.other + ' other · ' + (counts.pick ? counts.pick + ' picked · ' : '') + counts.skip + ' skipped\n' + lines.join('\n');
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
    // Fix: only a POST the server actually accepted may say "Submitted ✓". Claiming success
    // when the server is gone sends Destin back to the conversation with nothing waiting there.
    let ok = false, why = '';
    try { const r = await fetch('/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) }); ok = r.ok; if (!ok) why = 'HTTP ' + r.status; }
    catch (e) { why = (e && e.message) || String(e); server = false; }   // the server is gone: a re-opened dialog must take the copy/paste branch, not repeat "saving as you went"
    if (!ok) {
      state.submitted = null;   // summary() then labels it "not submitted", which is the truth
      $('#dlg-text').textContent = 'The deck could not reach its server (' + why + '). Your answers up to the last save are in the answers file; copy the feedback below and paste it into the chat.';
      $('#feedback').value = summary(); $('#feedback').style.display = 'block'; $('#copy').style.display = 'inline-flex'; $('#submit').style.display = 'none';
      return;   // veil stays open — there is still something for him to do here
    }
    state.submitted = new Date().toISOString();
    $('#veil').classList.remove('on'); lockSubmitted();
  };
  // A submitted deck is read-only, and says so — silently ignoring clicks read as "I can't click through the pages".
  function lockSubmitted() { $('#done').textContent = 'Submitted ✓'; $('#done').disabled = true; $$('.ans,#save,#note,.tag').forEach(e => e.disabled = true); paintState(); }
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
  function setZoom(z) {
    if (DECK.steps[cur].kind === 'live') return;   // real size is the point; there is no image to scale
    zoom = Math.max(1, Math.min(4, Math.round(z * 10) / 10)); layout();
  }
  $('#zin').onclick = () => setZoom(zoom + 0.1); $('#zout').onclick = () => setZoom(zoom - 0.1); $('#replay').onclick = replay;
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (!state.submitted) { if (e.key === 'ArrowRight') go(cur + 1); if (e.key === 'ArrowLeft') go(cur - 1); }   // Fix: zoom/loupe stay live after Submit, navigation doesn't
    if (e.key === '+' || e.key === '=') setZoom(zoom + 0.1); if (e.key === '-') setZoom(zoom - 0.1); if (e.key === '0') setZoom(1);
    if (e.key === 'r' && DECK.steps[cur].kind === 'clip') replay();
    if (e.key === 'l') { loupeOn = !loupeOn; if (!loupeOn) loupe.style.display = 'none'; document.body.classList.toggle('no-loupe', !loupeOn); }
  });
  // A pane measures its own content and says how tall it is. WHY measured rather than
  // declared: a candidate taller than its box would otherwise be cut off with no sign, and
  // the deck cannot know a candidate's height — it lives in the other repo.
  window.addEventListener('message', e => {
    // Symmetric with the route, which only accepts theme messages from a loopback origin.
    if (!DECK.live || e.origin !== DECK.live.base) return;
    const d = e.data;
    if (!d || d.type !== 'youcoded:pane-height' || !(d.height > 0)) return;
    const st = DECK.steps[cur];
    if (st.kind !== 'live' || st.height) return;   // a declared height is an override, not a suggestion
    // contentWindow identity, not the id in the payload: it is the only thing that cannot be
    // wrong when four panes report independently. The id is the fallback if the frame moved.
    const panes = $$('#inner iframe');
    const f = panes.find(x => x.contentWindow === e.source) || panes.find(x => x.dataset.pane === d.candidate);
    if (!f) return;
    // The pane's address carries the deck's FIRST theme, baked at build time — so a live step
    // opened while the deck is on any other theme (switched on an earlier step, or ?theme= in
    // the URL) showed Midnight panes inside a Light deck. Answering its height report is the
    // right moment to correct that: the pane has MOUNTED and is listening. The iframe's own
    // `load` event is not — it fires before the app's async boot installs the listener, and
    // the message is dropped silently (tried that first, 2026-09-01).
    try { f.contentWindow.postMessage({ type: 'youcoded:theme', theme }, DECK.live.base); } catch (err) { /* gone */ }
    // NOT capped at the stage. It was, and a 494px design in a 380px stage lost its bottom
    // 114px — Destin saw a permissions list sliced mid-item (2026-09-01). A pane that scrolls
    // inside itself is worse than a stage that scrolls: the inner scrollbar reads as part of
    // the design, and a design you cannot see all of is not a design you can judge. The stage
    // is `overflow:auto` already, so a tall pane makes the STAGE scroll and stays whole.
    f.style.height = Math.max(MIN_PANE_H, d.height) + 'px';
    // WIDTH is not capped and not guessed. It comes from the registry in the other repo, so
    // the pane is the only thing that knows it; a deck-level `live.paneWidth` that is too
    // small clips the design's right-hand edge with nothing to say so (permissions-mode-control
    // is 420 while close-prompt-body is 380 — one number cannot serve a review showing both).
    if (d.width > 0) { f.dataset.reportedWidth = d.width; f.style.width = d.width + 'px'; }
  });
  window.addEventListener('resize', layout);
  load().then(() => {
    const q = new URLSearchParams(location.search);
    cur = q.get('step') ? Math.max(0, Math.min(N - 1, +q.get('step') - 1)) : Math.max(0, Math.min(N - 1, state.cur || 0));
    if (q.get('theme') && DECK.themes.includes(q.get('theme'))) theme = q.get('theme');
    stepStart = Date.now(); render();
    if (state.submitted) lockSubmitted();   // an archived (file://) deck opened after its submit shows its locked state instead of dead buttons
  });
})();
