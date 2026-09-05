/* Review deck v2 — renders DECK (one JSON object the builder inlines) one step at a time.
   Persistence: the serve.py endpoints when the page is served (GET/POST /answers, POST /submit),
   localStorage + a copy box when it is opened as a plain file. */
(function () {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const N = DECK.steps.length, runs = DECK.runs;
  let cur = 0, theme = DECK.themes[0], zoom = 1, loupeOn = true, server = false, stepStart = Date.now();
  // PAGES MODE. A question deck (no pictures anywhere) is not one screen per question: it is one
  // scrolling page per SET of questions. Destin (2026-09-04): "my mindset should stay in the same
  // place for each set of questions, and only shift when moving to a new set." In this mode `cur`
  // is the PAGE index, not the step index — everything that used to read DECK.steps[cur] goes
  // through curStep(), which is deliberately empty here. Picture decks: DECK.pages is absent and
  // every line below behaves exactly as it did.
  const PAGES = DECK.pages || null, LAST = PAGES ? PAGES.length - 1 : N - 1;
  const stepById = id => DECK.steps.find(x => x.id === id);
  const pageSteps = i => (PAGES[i] ? PAGES[i].steps.map(stepById).filter(Boolean) : []);
  const curStep = () => (PAGES ? {} : DECK.steps[cur]) || {};
  const state = { deck: DECK.key, started: new Date().toISOString(), submitted: null, cur: 0, answers: {} };
  const ICON = {
    change: '<svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="m12.5 7.5 4 4"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    warn: '<svg viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3z"/><path d="M12 9v5"/><circle cx="12" cy="17" r=".6"/></svg>' };
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
  // What a pane may be wide, as a range. A width the pane MEASURED for itself beats the one
  // the spec guessed at — the number lives in the registry in the other repo, so the deck can
  // only ever be estimating. A FLUID pane reports a [min, max] range instead of one number.
  const paneRangeOf = (st, i) => {
    const f = $$('#inner iframe')[i];
    if (f && f.dataset.minWidth && f.dataset.maxWidth) return { min: Number(f.dataset.minWidth), max: Number(f.dataset.maxWidth) };
    const w = Number((f && f.dataset.reportedWidth) || st.width);
    return { min: w, max: w };
  };
  const PANE_GAP = 18;
  // THE FIT RULE. A pane is never wider than the stage and the row never scrolls sideways.
  // Try every count of panes per row; a count fits when every pane's `min` fits in its share
  // of the row. Each pane then gets its share, clamped to its range. Choose the count that
  // gives the WIDEST panes; among equals, the most per row (fewer rows to scroll through).
  //   - fixed panes (min = max): as many per row as fit, at their real size, then wrap;
  //   - fluid panes (the session strip, a header row): stacked one per row at their `max`
  //     when the stage is wide enough, at the stage's width when it is not — never three
  //     abreast at a third of their size with both ends cut off (Destin, 2026-09-01).
  function fitPanes(ranges, stageWidth) {
    const n = ranges.length;
    let best = null;
    for (let perRow = n; perRow >= 1; perRow--) {
      const share = Math.floor((stageWidth - PANE_GAP * (perRow - 1)) / perRow);
      if (!ranges.every(r => r.min <= share)) continue;
      const widths = ranges.map(r => Math.max(r.min, Math.min(r.max, share)));
      const score = Math.min(...widths);
      if (!best || score > best.score) best = { perRow, widths, score };
    }
    // Nothing fits even alone: one per row at `min`, and the stage scrolls — the honest
    // failure, and validate() warns about a pane wider than any screen before the build.
    return best || { perRow: 1, widths: ranges.map(r => r.min), score: 0 };
  }
  function layoutLive() {
    const st = DECK.steps[cur], c = $('#content'), step = $('#step');
    // Panes have a DECLARED width (or a range) — there is no natural image size to solve an
    // arrangement from, so none of layout()'s scoring applies; fitPanes() decides instead.
    // A narrow FIXED pane (a dialog) still gets the cards in a side column when it fits
    // beside them — that hands the stage the full height of the page for a tall design.
    const info = Math.max(320, c.clientWidth * 0.30);
    const ranges = st.panes.map((p, i) => paneRangeOf(st, i));
    const fixedRow = ranges.reduce((sum, r, i) => sum + r.max + (i ? PANE_GAP : 0), 0);
    const sideColumn = ranges.every(r => r.min === r.max) && c.clientWidth - info - 40 >= fixedRow;
    c.className = 'content ' + (sideColumn ? 'col-right' : 'row-below live-fit');
    step.classList.remove('compact-step');
    // ALWAYS inline, no width threshold. The theme row is absolutely positioned beside the
    // step, and a live row is wide by nature — two to four panes at real size — so the side
    // column lands outside the window and the buttons get cut in half (seen 2026-08-31).
    // There is no width at which a side column is right here, so don't compute one.
    document.body.classList.add('thumbs-inline');
    // The stage's inner row: its padding (14px a side) and border come off the width.
    const stage = $('.stage');
    const stageWidth = (sideColumn ? c.clientWidth - info - 40 : (stage ? stage.clientWidth : c.clientWidth)) - 30;
    const fit = fitPanes(ranges, stageWidth);
    $$('#inner iframe').forEach((f, i) => {
      const w = fit.widths[i];
      f.style.width = w + 'px';
      if (!f.style.height) f.style.height = (st.height || MIN_PANE_H) + 'px';
      // A fluid pane lays its design out at the width it is given. Told by message, never by
      // reloading (a reload restarts the animation being judged); only when it changes.
      if (ranges[i].min !== ranges[i].max && f.dataset.askedWidth !== String(w)) {
        f.dataset.askedWidth = String(w);
        try { f.contentWindow.postMessage({ type: 'youcoded:pane-width', width: w }, DECK.live.base); } catch (e) { /* not loaded yet */ }
      }
    });
    document.body.dataset.layout = 'live';
    document.body.dataset.scores = '{}';
    // layout() is the ONLY place this is ever set and deck-render.test.mjs polls it for ten
    // seconds before giving up. A live branch that returned early without setting it would
    // hang every test in the suite and explain nothing.
    window.__deckReady = true;
  }
  // ── the cards of one step ───────────────────────────────────────────────────────────────
  // Hoisted out of render() so the scrolling QUESTION PAGE can draw the very same cards per
  // article — one markup, so a question reads identically whether it is on a page of its own
  // or one of several on a scrolling page (design §3.1).
  // An option carries its own pros and cons, and the preferred one wears a badge beside its
  // letter — Destin (2026-09-04): one grey paragraph per option was unreadable, and
  // "(recommended)" written into the label read as part of the option's name.
  const bullets = (o, k) => (o[k] || []).length ? `<ul class="${k}">${o[k].map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
  const optionCard = (o, cls) => `<section class="card variant${cls}" data-pick="${esc(o.id)}" title="Pick ${esc(o.id)}"><span class="key">${esc(o.id)}</span>${o.recommended ? '<span class="badge">Recommended</span>' : ''}<div class="vbody"><h3>${esc(o.label)}</h3>${o.summary ? `<p>${esc(o.summary)}</p>` : ''}${bullets(o, 'pros')}${bullets(o, 'cons')}${o.measured ? `<p class="num">Measured: ${esc(o.measured)}</p>` : ''}${o.cost ? `<p class="cost">${esc(o.cost)}</p>` : ''}${o.risk ? `<p class="r">${esc(o.risk)}</p>` : ''}</div></section>`;
  // The three parts of a question, one card each.
  const partCard = (title, text) => `<section class="card part"><h3>${esc(title)}</h3><p>${esc(text)}</p></section>`;
  const partCards = st => [['Today', st.today], ['The problem', st.problem], ['Proposal', st.proposal]]
    .filter(([, t]) => t).map(([h, t]) => partCard(h, t)).join('');
  const changedCard = st => `<section class="card"><h3>${ICON.change}What changed</h3><p>${esc(st.changed)}</p>${st.measured ? `<p class="num">Measured: ${esc(st.measured)}</p>` : ''}</section>`;
  const noticeCard = st => st.notice ? `<section class="card"><h3>${ICON.eye}You'll notice</h3><p>${esc(st.notice)}</p></section>` : '';
  const riskCard = st => st.risk ? `<section class="card risk"><h3>${ICON.warn}Risk</h3><p>${esc(st.risk)}</p></section>` : '';
  // CONTRACT: the rows as one table, not a card per row — grading (a `verdict` on any row)
  // adds a Verdict column instead of always reserving one nobody has filled in yet.
  const rowsTable = st => {
    const graded = st.rows.some(r => r.verdict);
    return `<section class="card contract"><table><thead><tr><th>#</th><th>Statement</th><th>Checked by</th><th>Threshold</th><th>From</th>${graded ? '<th>Verdict</th>' : ''}</tr></thead><tbody>${st.rows.map(r => `<tr class="${esc(r.verdict)}"><td>${esc(r.id)}</td><td>${esc(r.statement)}${r.note ? `<p class="src">“${esc(r.note)}”</p>` : ''}</td><td>${esc(r.checkedBy)}${r.guard ? `<p class="src">${esc(r.guard)}</p>` : ''}</td><td>${esc(r.threshold || 'pass / fail')}</td><td class="src">${esc(r.source)}</td>${graded ? `<td>${esc(r.verdict || '—')}${r.evidence ? `<p class="src">${esc(r.evidence)}</p>` : ''}</td>` : ''}</tr>`).join('')}</tbody></table></section>`;
  };
  // The body of one step, in the order the cards are read.
  const cardsFor = st => st.kind === 'question' ? partCards(st) + noticeCard(st) + riskCard(st)
    : st.kind === 'contract' ? rowsTable(st) + noticeCard(st) + riskCard(st)
    : pickList(st) ? pickList(st).map(v => optionCard(v, '')).join('') + noticeCard(st) + riskCard(st)
    : st.kind === 'decide' ? partCards(st) + noticeCard(st) + st.options.map(o => optionCard(o, ' option')).join('') + riskCard(st)
    : changedCard(st) + noticeCard(st) + riskCard(st);

  // A one-run deck is a BRIEF (nothing built yet): "keep / revert" would ask about work that does not exist.
  const YES = runs.length === 1 ? 'Yes, build it' : 'Yes, keep it', NO = runs.length === 1 ? 'No, leave it' : 'No, revert it';
  // A words step may relabel the buttons ("Holds / Fails" on an acceptance row): the deck's
  // build/keep wording is about a picture, and a statement has none.
  // Fix: a question (`kind === 'question'`) has no picture to keep or revert either, so its
  // fallback is the plain "Yes" / "No" the buttons already show — not "Yes, keep it". This is
  // now the ONLY place that decides the default; renderAnswers calls it instead of repeating
  // its own `st.yes || 'Yes'`, so the finish-screen read-back can never disagree with the button.
  const yesLabel = st => st.yes || (st.kind === 'question' ? 'Yes' : YES),
    noLabel = st => st.no || (st.kind === 'question' ? 'No' : NO);
  // The things a step offers to pick between, or null if it is a yes/no. A LIVE step's
  // question shape rides in `shape`, because `kind` already says where its picture comes
  // from — so a live pick-one answers exactly like a picture pick-one.
  const pickList = st => st.kind === 'choice' ? st.variants
    : (st.kind === 'live' && st.shape === 'choice') ? st.panes : null;
  // The answer row for one step, as markup. Hoisted so a question on a scrolling page gets
  // exactly the buttons it would get on a screen of its own.
  const answerButtons = st => {
    const picks = pickList(st);
    return st.kind === 'question'
      ? `<button class="btn ans" data-v="yes">${esc(yesLabel(st))}</button><button class="btn ans" data-v="no">${esc(noLabel(st))}</button><button class="btn ans" data-v="other" data-dk="1">Don't know</button>`
      : picks || st.kind === 'decide'
      ? (picks ? `<button class="btn ans" data-v="no">None of these</button>` : '')
        + `<button class="btn ans" data-v="other">Other</button>`
      : `<button class="btn ans" data-v="yes">${esc(yesLabel(st))}</button><button class="btn ans" data-v="no">${esc(noLabel(st))}</button><button class="btn ans" data-v="other">Other</button>`;
  };
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
    // A QUESTION with no options is answered Yes / No / Don't know: a shrug is a real answer
    // and must not have to be typed into Other. It rides as Other with `dk` so the answers
    // file keeps three values, and both summaries print "don't know" for it.
    $('#answers').innerHTML = answerButtons(st);
    if (state.submitted) $$('.ans').forEach(e => e.disabled = true);   // the buttons are rebuilt per step; a submitted deck stays read-only
  }
  // `id` is the step being answered. On a page every question has its own answer row, so the
  // id comes from the button that was clicked; on a one-step screen there is only one step.
  function answer(v, pick, dk, id) {
    if (state.submitted) return;
    id = id || (PAGES ? '' : DECK.steps[cur].id); if (!id) return;
    const a = { ...(state.answers[id] || {}), v }; if (v === 'pick') a.pick = pick; else delete a.pick;
    if (dk) a.dk = true; else delete a.dk;   // "Don't know" is Other with a flag; anything else clears it
    state.answers[id] = a; paintState(); save();
    const n = PAGES ? $(`#cards article.q[data-id="${CSS.escape(id)}"] .note`) : $('#note'); if (n) n.focus();
  }
  $('#deck-title').textContent = DECK.title; document.title = DECK.title;
  document.body.dataset.screen = 'deck';   // 'finished' once submitted — read by deck-render.test.mjs
  // One segment per page when the deck is pages, one per step otherwise.
  $('#steps').innerHTML = (PAGES || DECK.steps).map(() => '<span></span>').join('');
  // Fix: a ONE-page deck (no marker ever split it) has nothing to move BETWEEN — a Prev/Next
  // pair and a single, always-full progress segment would just be dead controls sitting in
  // the header. PAGES is fixed for the life of the page, so this is decided once, not per-paint.
  if (PAGES && PAGES.length === 1) { $('#steps').hidden = true; $('#prev').hidden = true; $('#next').hidden = true; }
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
    if (PAGES) { renderPage(); return; }   // a question deck draws a whole page, not one step
    const st = DECK.steps[cur];
    const themes = st.themes || DECK.themes;   // a real-app capture exists in one theme only — that step lists just that one
    if (st.themes && st !== lastStep) theme = st.themes[0];   // a step with its own theme list opens on the first: that list says which themes matter here
    else if (!themes.includes(theme)) theme = themes[0];
    lastStep = st;
    document.documentElement.dataset.theme = theme;   // before the pictures load, so a theme switch never flashes the old colours
    $('#wtitle').textContent = st.surface; $('#wsub').textContent = st.path;
    $('.top .where .sep').hidden = false;
    // A words step has no frames: the stage is hidden by layout() and the cards fill the row.
    curFrames = st.words ? [] : frames(st);
    inner.innerHTML = curFrames.map(f => `<figure class="frame${f.pickable ? ' pickable' : ''}${st.kind === 'clip' ? ' clip' : ''}" data-run="${esc(f.key)}"${f.pickable ? ` title="Pick ${esc(f.key)}"` : ''}><figcaption>${f.caption}</figcaption><div class="pic">${media(st, f)}</div></figure>`).join('');
    $$('#inner .frame .box').forEach(box => { const b = ((st.boxes || {})[theme] || {})[box.closest('.frame').dataset.run]; if (b) box.style.cssText = `left:${b[0]}%;top:${b[1]}%;width:${b[2]}%;height:${b[3]}%`; else box.style.display = 'none'; });
    // The server EXITS on submit, so a step he never opened has no picture left to fetch. An
    // empty frame under a caption reads as a broken deck; say which of the two it actually is.
    $$('#inner img').forEach(i => i.onerror = () => {
      const f = i.closest('.frame'); if (!f) return; f.classList.add('gone');
      f.querySelector('.pic').textContent = state.submitted
        ? 'This picture is no longer available — the review server stopped when you submitted.'
        : 'This picture did not load (' + i.getAttribute('src') + ').';
    });
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
    $('#cards').innerHTML = cardsFor(st);
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
  // ── the question page: every question of one set, on one scrolling reading column ──────────
  function renderPage() {
    const pg = PAGES[cur], steps = pageSteps(cur);
    document.documentElement.dataset.theme = theme;
    // The header describes what is on screen, and on a page that is the page — its title and
    // its one line of intro, not a step's surface and path.
    $('#wtitle').textContent = pg.title; $('#wsub').textContent = pg.intro;
    // The header's "·" separates two things; with no intro there is only one, and a dangling
    // dot after the title reads as a rendering fault.
    $('.top .where .sep').hidden = !pg.intro;
    lastStep = null; curFrames = []; inner.innerHTML = ''; $('#thumbs').innerHTML = '';
    // Nothing here has a picture, so every picture control is off.
    $('#replay').hidden = true; $('#zoom').hidden = true; $('#livehint').hidden = true;
    $('#headline').hidden = true;   // the page's own eyebrow leads the column instead
    // The eyebrow names the SET of questions. The implicit page (one page, no marker) is named
    // after the deck, which the chip and the header already say twice — so it gets no third.
    const named = pg.intro || pg.title !== DECK.title;
    $('#cards').innerHTML = (named ? `<div class="page-head"><p class="eyebrow">${esc(pg.title)}</p>${pg.intro ? `<p class="intro">${esc(pg.intro)}</p>` : ''}</div>` : '')
      + steps.map(st => `<article class="q" data-id="${esc(st.id)}">`
        + `<h2 class="qh">${esc(st.headline)}</h2>`
        + `<div class="qbody">${cardsFor(st)}</div>`
        + `<div class="qrow"><span class="answers">${answerButtons(st)}</span>`
        + `<input class="note" data-id="${esc(st.id)}" placeholder="Add a note (optional)"></div>`
        + `</article>`).join('');
    // Every control carries the id of the question it belongs to, so one click handler on the
    // column can answer any of them without knowing which article it came from.
    $$('#cards article.q').forEach(art => art.querySelectorAll('.ans').forEach(b => b.dataset.id = art.dataset.id));
    if (state.submitted) $$('#cards .ans,#cards .note').forEach(e => e.disabled = true);
    layout(); paintState();
  }
  // Delegated, and bound once: renderPage() replaces the whole column on every page change.
  $('#cards').addEventListener('click', e => {
    if (!PAGES) return;
    const b = e.target.closest('.ans');
    if (b && !b.disabled) { answer(b.dataset.v, b.dataset.pick, b.dataset.dk === '1', b.dataset.id); return; }
    const c = e.target.closest('.card.variant'), art = c && c.closest('article.q');
    if (art && !state.submitted) answer('pick', c.dataset.pick, false, art.dataset.id);
  });
  $('#cards').addEventListener('input', e => {
    const n = e.target.closest('.note[data-id]'); if (!n || !PAGES) return;
    state.answers[n.dataset.id] = { ...(state.answers[n.dataset.id] || {}), note: n.value };
    paintState(); clearTimeout(noteTimer); noteTimer = setTimeout(save, 300);
  });
  function paintPage() {
    $$('#cards article.q').forEach(art => {
      const a = state.answers[art.dataset.id] || {};
      art.querySelectorAll('.ans').forEach(b => b.classList.toggle('on', b.dataset.v === a.v && (a.v !== 'pick' || b.dataset.pick === a.pick)));
      art.querySelectorAll('.card.variant').forEach(c => c.classList.toggle('on', a.v === 'pick' && c.dataset.pick === a.pick));
      const n = art.querySelector('.note');
      // Never while he is typing in it: assigning `value` puts the caret back at the end.
      if (n && document.activeElement !== n) n.value = a.note || '';
      if (n) n.placeholder = a.v === 'other' ? 'Explain what you’d like instead…' : 'Add a note (optional)';
      // An answered question takes the same green edge the mock-up used for `done`.
      art.classList.toggle('done', !!(a.v && a.v !== 'skip'));
    });
    // A segment is a PAGE: solid once every question on it is answered, half-lit while some are.
    $$('#steps span').forEach((seg, i) => {
      const on = pageSteps(i), n = on.filter(st => { const x = state.answers[st.id]; return x && x.v && x.v !== 'skip'; }).length;
      seg.className = (on.length && n === on.length ? 'done' : n ? 'part' : '') + (i === cur ? ' on' : '');
    });
    const done = Object.values(state.answers).filter(x => x.v && x.v !== 'skip').length;
    $('#count').textContent = 'page ' + (cur + 1) + ' of ' + PAGES.length + ' · ' + done + ' of ' + N + ' answered' + (state.submitted ? ' · submitted, read-only' : '');
    // On a page the forward button is navigation, not "save this answer" — it is never disabled
    // for an unanswered question, because there are several of them on screen.
    $('#save').disabled = !!state.submitted; $('#save').textContent = cur === LAST ? 'Done' : 'Next page ›';
    $('#prev').disabled = cur === 0; $('#next').disabled = cur === LAST; $('#next').textContent = cur === LAST ? 'Last page' : 'Next ›';
  }

  function paintState() {
    if (PAGES) { paintPage(); return; }
    const a = state.answers[DECK.steps[cur].id] || {};
    $$('.ans').forEach(b => b.classList.toggle('on', b.dataset.v === a.v && (a.v !== 'pick' || b.dataset.pick === a.pick)));
    $$('.card.variant').forEach(c => c.classList.toggle('on', a.v === 'pick' && c.dataset.pick === a.pick));
    $$('#inner .frame.pickable').forEach(f => f.classList.toggle('on', a.v === 'pick' && f.dataset.run === a.pick));
    const note = $('#note'); note.value = a.note || ''; note.placeholder = a.v === 'other' ? 'Explain what you’d like instead…' : 'Add a note (optional)';
    $$('#steps span').forEach((s, i) => { const x = state.answers[DECK.steps[i].id]; s.className = (x && x.v ? x.v : '') + (i === cur ? ' on' : ''); });
    const done = Object.values(state.answers).filter(x => x.v && x.v !== 'skip').length;
    $('#count').textContent = 'step ' + (cur + 1) + ' of ' + N + ' · ' + done + ' answered' + (state.submitted ? ' · submitted, read-only' : '');   // survives every repaint (theme clicks included)
    // browsing a submitted deck must never re-arm Save & Next
    $('#save').disabled = !!state.submitted || !(a.v && a.v !== 'skip');
    $('#prev').disabled = cur === 0; $('#next').disabled = cur === N - 1; $('#next').textContent = cur === N - 1 ? 'Last step' : 'Next ›';
  }

  // ── layout: try each arrangement for real, keep the one that shows the pictures largest (spec §3.4) ──
  const PAD = 28, CAP = 24, GAP = 18;
  function layout() {
    if (PAGES) {   // the reading column: a block that scrolls, nothing to size against a picture
      // Fix: a CONTRACT step's table (# / Statement / Checked by / Threshold / From / Verdict)
      // squeezed into the 760px reading column same as a question card — the acceptance deck's
      // screenshot showed two narrow columns stretching across the whole 1440px viewport
      // instead. A page that HOLDS a contract step gets a wider column; the CSS keeps any
      // prose question sharing that page at the normal reading width (`.pages.wide article.q`).
      const wide = pageSteps(cur).some(st => st.kind === 'contract');
      $('#content').className = 'content pages' + (wide ? ' wide' : ''); $('#step').classList.remove('compact-step');
      document.body.classList.remove('thumbs-inline');
      document.body.dataset.layout = 'pages'; document.body.dataset.scores = '{}';
      window.__deckReady = true; return;
    }
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
    const secs = Math.round((Date.now() - stepStart) / 1000);
    if (PAGES) {
      // Every question on the page was on screen for the same stretch of time, and there is no
      // moment that belongs to one of them — so the elapsed seconds are split evenly across them.
      const on = pageSteps(cur), each = on.length ? Math.round(secs / on.length) : 0;
      on.forEach(st => {
        const a = state.answers[st.id] || {};
        if (!a.v) a.v = 'skip';
        a.seconds = (a.seconds || 0) + each; a.theme = theme;
        state.answers[st.id] = a;
      });
      return;
    }
    const id = DECK.steps[cur].id; const a = state.answers[id] || {};
    if (!a.v) a.v = 'skip';
    a.seconds = (a.seconds || 0) + secs; a.theme = theme; a.zoom = zoom;
    state.answers[id] = a;
  }
  function go(i) {
    // Fix: after Submit, arrow keys / progress segments must not keep POSTing answers — but
    // they may still MOVE. A submitted deck is a read-only record he can page back through;
    // record()/save() are what must not run, not the navigation itself.
    if (state.submitted) { cur = Math.max(0, Math.min(LAST, i)); zoom = 1; hideFinished(); render(); return; }
    record(); cur = Math.max(0, Math.min(LAST, i)); state.cur = cur; save(); zoom = 1; stepStart = Date.now(); render();
  }
  // Fix: save on EVERY answer, not only when the step changes — a tab closed on the last
  // answered step used to lose that answer entirely. The note debounces so a sentence typed
  // at speed is one POST, not one per keystroke.
  let noteTimer = null;
  $('#answers').addEventListener('click', e => { const b = e.target.closest('.ans'); if (b && !b.disabled) answer(b.dataset.v, b.dataset.pick, b.dataset.dk === '1'); });
  $('#note').addEventListener('input', e => {
    if (PAGES) return;   // on a page the note lives on the question, not in the shared row
    const id = DECK.steps[cur].id; const a = { ...(state.answers[id] || {}), note: e.target.value };
    state.answers[id] = a; paintState(); clearTimeout(noteTimer); noteTimer = setTimeout(save, 300);
  });
  $('#save').onclick = () => { if (cur === LAST) openDialog(); else go(cur + 1); };
  // From the finish screen, Prev means "back into the deck" — the step he left, not the one
  // before it; and there is nothing after the end, so Next is off there (see showFinished).
  const step = d => go(document.body.dataset.screen === 'finished' ? cur : cur + d);
  $('#next').onclick = () => step(1); $('#prev').onclick = () => step(-1);
  $$('#steps span').forEach((s, i) => s.onclick = () => go(i));

  // ── submit ──
  function summary() {
    const counts = { yes: 0, no: 0, other: 0, skip: 0 }; const lines = [];
    // Mirrors serve.py's summary(): a note prints plainly, right after the answer, same words.
    for (const st of DECK.steps) { const a = state.answers[st.id] || { v: 'skip' }; const v = a.v || 'skip'; counts[v] = (counts[v] || 0) + 1; const what = v === 'pick' ? 'pick ' + (a.pick || '?') : (v === 'no' && pickList(st) ? 'none' : (v === 'other' && a.dk ? "don't know" : v)); lines.push(st.id + ' ' + what + (a.note && a.note.trim() ? ' — "' + a.note.trim() + '"' : '')); }
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
    // The list names steps ("2 steps have no answer") because a question is what he answers;
    // going there means opening the PAGE that question sits on.
    const pageOf = i => PAGES ? Math.max(0, PAGES.findIndex(p => p.steps.includes(DECK.steps[i].id))) : i;
    $('#first').style.display = missing.length ? 'inline-flex' : 'none'; $('#first').onclick = () => { $('#veil').classList.remove('on'); go(pageOf(missing[0] - 1)); };
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
    $('#veil').classList.remove('on'); lockSubmitted(); showFinished();
  };
  // A submitted deck is read-only, and says so — silently ignoring clicks read as "I can't click through the pages".
  // The header button stays LIVE and becomes the way back to the finish screen: after a submit
  // it is the only place the answers can still be read (the server exits on submit).
  function lockSubmitted() {
    $('#done').innerHTML = 'Submitted ✓<span class="long"> — view responses</span>';
    $('#done').onclick = showFinished; $('#done').disabled = false;
    $$('.ans,#save,#note').forEach(e => e.disabled = true); paintState();
  }

  // ── the finish screen ──
  // WHY it exists: Submit used to just close the dialog, leaving him on the last step with a
  // greyed-out button — the same thing a click that did nothing would look like. This is the
  // definitive end of the deck, and the read-back of what was sent.
  const ANS_LABEL = (st, a) => {
    const v = a.v || 'skip';
    if (v === 'skip') return 'No answer';
    if (v === 'pick') { const o = (pickList(st) || []).find(x => x.id === a.pick); return a.pick + (o ? ' — ' + o.label : ''); }
    if (v === 'other') return a.dk ? "Don't know" : 'Something else';
    if (v === 'no') return pickList(st) ? 'None of these' : noLabel(st);
    return yesLabel(st);
  };
  function renderResponses() {
    const counts = { yes: 0, no: 0, other: 0, pick: 0, skip: 0 };
    const rows = DECK.steps.map((st, i) => {
      const a = state.answers[st.id] || {}; const v = a.v || 'skip'; counts[v] = (counts[v] || 0) + 1;
      const note = (a.note || '').trim();
      return `<tr><td class="n">${i + 1}</td>`
        + `<td class="step-cell">${esc(st.surface)}<p class="src">${esc(st.headline)}</p></td>`
        + `<td class="v" data-v="${esc(v)}">${esc(ANS_LABEL(st, a))}</td>`
        + `<td>${note ? esc(note) : '<span class="src">—</span>'}</td></tr>`;
    }).join('');
    $('#responses').querySelector('tbody').innerHTML = rows;
    const when = (state.submitted || '').slice(0, 16).replace('T', ' ');
    const parts = [counts.yes + ' yes', counts.no + ' no', counts.other + ' other'];
    if (counts.pick) parts.splice(2, 0, counts.pick + ' picked');
    if (counts.skip) parts.push(counts.skip + ' with no answer');
    $('#fin-meta').textContent = N + (N === 1 ? ' step' : ' steps') + ' · ' + parts.join(' · ') + (when ? ' · submitted ' + when : '');
  }
  function showFinished() {
    renderResponses(); $('#step').hidden = true; $('#finished').hidden = false; document.body.dataset.screen = 'finished';
    // The header describes what is ON SCREEN. Left saying "Home · chat — step 3 of 3" it would
    // be labelling a step nobody is looking at. The progress strip stays: it is the summary at
    // a glance, and clicking a segment is still the way back into that step (a one-page deck hides the strip; `‹ Back to the deck` is its way back).
    $('#wtitle').textContent = DECK.title; $('#wsub').textContent = 'review complete';
    $('#count').textContent = 'all ' + N + ' steps · read-only';
    $('#prev').disabled = false; $('#next').disabled = true;   // Prev goes back into the deck; nothing follows the end
  }
  function hideFinished() { $('#finished').hidden = true; $('#step').hidden = false; document.body.dataset.screen = 'deck'; }
  $('#fin-back').onclick = () => { hideFinished(); render(); };
  $('#fin-copy').onclick = () => {
    // A scratch textarea, not #feedback: that one lives inside the (display:none) dialog, and
    // execCommand's fallback cannot select text in a hidden element — it would copy nothing.
    const t = document.createElement('textarea'); t.value = summary();
    t.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.appendChild(t); t.select();
    (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).catch(() => document.execCommand('copy')).finally(() => t.remove());
    $('#fin-copy').textContent = 'Copied';
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
  function setZoom(z) {
    if (curStep().kind === 'live') return;   // real size is the point; there is no image to scale
    zoom = Math.max(1, Math.min(4, Math.round(z * 10) / 10)); layout();
  }
  $('#zin').onclick = () => setZoom(zoom + 0.1); $('#zout').onclick = () => setZoom(zoom - 0.1); $('#replay').onclick = replay;
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1);   // go() decides what a submitted deck is allowed to do
    if (e.key === '+' || e.key === '=') setZoom(zoom + 0.1); if (e.key === '-') setZoom(zoom - 0.1); if (e.key === '0') setZoom(1);
    if (e.key === 'r' && curStep().kind === 'clip') replay();
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
    if (d.width > 0) f.dataset.reportedWidth = d.width;
    // A range means a FLUID pane: the deck fits it to the row (fitPanes), rather than taking
    // the width it happened to mount at. A fixed pane keeps what it measured.
    if (d.minWidth > 0 && d.maxWidth >= d.minWidth) { f.dataset.minWidth = d.minWidth; f.dataset.maxWidth = d.maxWidth; }
    else if (d.width > 0) f.style.width = d.width + 'px';
    layoutLive();
  });
  window.addEventListener('resize', layout);
  load().then(() => {
    const q = new URLSearchParams(location.search);
    // An answers file written before this deck had pages can carry a `cur` past the last page;
    // clamping to LAST lands on the last page instead of rendering nothing.
    cur = q.get('step') ? Math.max(0, Math.min(LAST, +q.get('step') - 1)) : Math.max(0, Math.min(LAST, state.cur || 0));
    if (q.get('theme') && DECK.themes.includes(q.get('theme'))) theme = q.get('theme');
    stepStart = Date.now(); render();
    if (state.submitted) { lockSubmitted(); showFinished(); }   // an archived deck re-opened after its submit lands on the finish screen — its answers, read back — instead of a step full of dead buttons
  });
})();
