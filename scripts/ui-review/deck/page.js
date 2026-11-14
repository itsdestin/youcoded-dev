/* Review deck v2 — renders DECK (one JSON object the builder inlines) one step at a time.
   Persistence: the serve.py endpoints when the page is served (GET/POST /answers, POST /submit),
   localStorage + a copy box when it is opened as a plain file. */
(function () {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const N = DECK.steps.length, runs = DECK.runs;
  // WHY (review 2026-11-10): a background-only list asks nothing, so it is never counted as answered or as missing.
  const asked = DECK.steps.filter(x => !x.context), NA = asked.length;
  let cur = 0, theme = DECK.themes[0], zoom = 1, loupeOn = true, server = false, stepStart = Date.now();
  // PAGES MODE. A question deck (no pictures anywhere) is not one screen per question: it is one
  // scrolling page per SET of questions. Destin (2026-09-04): "my mindset should stay in the same
  // place for each set of questions, and only shift when moving to a new set." In this mode `cur`
  // is the PAGE index, not the step index — everything that used to read DECK.steps[cur] goes
  // through curStep(), which is deliberately empty here. Picture decks: DECK.pages is absent and
  // every line below behaves exactly as it did.
  // WHY (Destin, round 11: "we're not editing prior sections of the deck once we've gotten to post build"): a deck that grows is AT
  // one stage. Its pages, navigation and counts are the CURRENT stage's pages only; pages of earlier stages are the record, shown on
  // request and read-only (renderRecord). Every other deck: PAGES is simply DECK.pages, as before.
  const ALLPAGES = DECK.pages || null;
  const RECORD = DECK.grows && ALLPAGES ? ALLPAGES.filter(p => p.record) : [];
  const PAGES = DECK.grows && ALLPAGES ? ALLPAGES.filter(p => !p.record) : ALLPAGES, LAST = PAGES ? PAGES.length - 1 : N - 1;
  const stepById = id => DECK.steps.find(x => x.id === id);
  const pageSteps = i => (PAGES[i] ? PAGES[i].steps.map(stepById).filter(Boolean) : []);
  const curStep = () => (PAGES ? {} : DECK.steps[cur]) || {};
  const state = { deck: DECK.key, started: new Date().toISOString(), submitted: null, cur: 0, answers: {} };
  // ── A DECK THAT GROWS (spec "grows": true; deck/grows.py) ──────────────────────────────
  // WHY (Destin, rounds 1, 8, 10: "a single deck that kind of 'evolves'… keeps my earlier responses"; "I don't like
  // the history button"): one deck per feature. A topic he already answered in an earlier round is SETTLED: it sinks
  // to an "Answered" list at the foot of its page, and is never counted, summed or asked again unless he presses
  // Reopen (kept in state.reopened so it survives a reload). Decks without DECK.grows never touch any of this.
  const GROWS = DECK.grows || null;
  const settled = st => !!(GROWS && st.grow && st.grow.answered && !(state.reopened || {})[st.id]);
  const askedNow = () => asked.filter(st => !settled(st));
  const ICON = {
    change: '<svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="m12.5 7.5 4 4"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    warn: '<svg viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3z"/><path d="M12 9v5"/><circle cx="12" cy="17" r=".6"/></svg>' };
  const clock = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  if (window.top !== window) document.body.classList.add('embedded');
  // What the stage shows for a step: one frame per run (before/after, or today), or — for a CHOICE
  // step — one frame per variant, lettered. Destin (2026-08-27): variants of one thing are one
  // question on one page, not a yes/no each.
  // A LIVE pane is NOT pickable: a click inside it is an interaction with the candidate
  // (hover, drag, open a menu), not an answer. Picking stays on the lettered card and the
  // answer button. `open on its own` is the same address in a new tab — room and quiet.
  // Which captures THIS slide shows. A slide that names its own wins; otherwise the deck's.
  // WHY per slide (Destin, 2026-09-06): one deck can now hold a single-picture "build it?" point
  // and a before/after "keep it?" point, so neither the frames nor the buttons can be decided once.
  const stepRuns = st => (st && st.runs && st.runs.length ? st.runs : runs);
  const popout = url => `<a class="popout" href="${esc(url)}" target="_blank" rel="noopener" title="Open this design alone in a new browser window">Open in New Window ↗</a>`;
  const frames = st => st.kind === 'choice'
    ? st.variants.map(v => ({ key: v.id, caption: `<span class="key">${esc(v.id)}.</span>${esc(v.label)}`, pickable: true }))
    : st.kind === 'live'
    ? st.panes.map(p => ({ key: p.id, url: p.url, pickable: false,
        caption: (p.label ? `<span class="key">${esc(p.id)}.</span>${esc(p.label)}` : '<span class="live-dot"></span>Live') + popout(p.url) }))
    : stepRuns(st).map(r => ({ key: r, caption: esc((st.labels || {})[r] || DECK.runLabels[r] || r), pickable: false }));
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
  // A pane's address is normally root-relative (`/app/index.html?…`) — THIS deck's own server
  // built and serves it, so it is same-origin, and postMessage needs a real origin rather than
  // the empty string DECK.live.base then is. `live.base` only carries a value when a spec names
  // an EXTERNAL server (a test's stub, standing in for one this deck did not start).
  const LIVE_ORIGIN = (DECK.live && DECK.live.base) || location.origin;
  // One probe per entry to a live step (not one per page): a server started AFTER the deck
  // was opened must be able to recover on the next visit. `no-cors` gives an opaque response
  // — useless to read, but a REJECTION is unambiguous, and it is the only reliable signal
  // here: Chrome fires an iframe `load` event on its own error page too.
  const probeLive = () => fetch(DECK.live.base ? DECK.live.base + '/' : '/app/index.html',
    { mode: 'no-cors', cache: 'no-store' }).then(() => true, () => false);
  function drawLivePanes() {
    $$('#inner iframe').forEach(f => {
      if (!f.dataset.src) return;
      // WHY: an offscreen renderer can finish loading AFTER its first size
      // report; an early theme message then lands before its listener exists.
      // Re-send at frame load, when the renderer is listening, so every pane
      // uses the chosen theme even before the reviewer scrolls it into view.
      f.addEventListener('load', () => {
        if (!f.isConnected) return;
        delete f.dataset.appliedTheme;
        try { f.contentWindow.postMessage({ type: 'youcoded:theme', theme }, LIVE_ORIGIN); } catch (e) { /* gone */ }
      }, { once: true });
      f.src = f.dataset.src;
    });
  }
  function drawServerDown(st) {
    // Specific and accurate (docs/error-message-standards.md): we know exactly which address
    // did not answer. This is also what an ARCHIVED review shows.
    // Two different failures wear this card: an EXTERNAL server (a test's stub) that never
    // started — Start it with: <command> — versus this deck's OWN /app/, which it just tried
    // to build; nothing external to start, so the fix is to read the build error and reload.
    const external = !!DECK.live.base;
    inner.innerHTML = `<div class="down"><h3>The app server for this review is not running</h3>`
      + `<p>Nothing answered at <code>${esc(external ? DECK.live.base : '/app/index.html')}</code>, so the `
      + `${st.panes.length === 1 ? 'pane has' : 'panes have'} nothing to show.`
      + (external
        ? ` Start it with:</p><pre>${esc(DECK.live.command)}</pre>`
        : ` The practice app failed to build.</p><p class="sub">Check the terminal that ran <code>review-cards.py serve</code> for the error, then reload this page.</p>`)
      + `<p class="sub">Or re-run <code>review-cards.py serve &lt;spec&gt;</code>, which builds and serves it for you. A review read back later always lands here — live panes do not replay.</p></div>`;
  }
  // Theme WITHOUT render(): render() rebuilds #inner, which reloads every iframe and throws
  // away a half-finished drag or an animation mid-play. The app applies the swap live through
  // __workbenchAppearanceSync, the same path the landing page's embed uses.
  function setLiveTheme() {
    document.documentElement.dataset.theme = theme;
    $$('.thumb').forEach(b => b.classList.toggle('on', b.dataset.v === theme));
    $$('#inner iframe').forEach(f => {
      delete f.dataset.appliedTheme;
      try { f.contentWindow.postMessage({ type: 'youcoded:theme', theme }, LIVE_ORIGIN); } catch (e) { /* not loaded yet */ }
    });
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
    const sideColumn = !st.fill && ranges.every(r => r.min === r.max) && c.clientWidth - info - 40 >= fixedRow;
    // FILL: one screen of the app takes the whole stage, so it can be used rather than scrolled.
    // `live-fit` sizes the stage to its content (right for a row of fixed-size designs); a
    // filling pane needs the opposite, so the stage takes the row and the pane takes the stage.
    c.className = 'content ' + (sideColumn ? 'col-right' : 'row-below live-fit') + (st.fill ? ' live-fill' : '');
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
      // A FILLING pane is sized by CSS, not here: the frame is a column (caption above, pane
      // below) and the pane takes what is left. Measuring it in JS meant subtracting the
      // caption's height by hand, and the first version got it wrong and clipped the app's
      // bottom strip. Clear any size a previous step left on the element.
      if (st.fill) { f.style.width = ''; f.style.height = ''; return; }
      const w = fit.widths[i];
      f.style.width = w + 'px';
      if (!f.style.height) f.style.height = (st.height || MIN_PANE_H) + 'px';
      // A fluid pane lays its design out at the width it is given. Told by message, never by
      // reloading (a reload restarts the animation being judged); only when it changes.
      if (ranges[i].min !== ranges[i].max && f.dataset.askedWidth !== String(w)) {
        f.dataset.askedWidth = String(w);
        try { f.contentWindow.postMessage({ type: 'youcoded:pane-width', width: w }, LIVE_ORIGIN); } catch (e) { /* not loaded yet */ }
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
  // WHY no id chip at the right of a written option (round 7: "also remove the small option-id chips
  // shown at the right of written options (e.g. lead, trail)" - approved for removal in an earlier
  // round): the ids are for the answers file and the printed summary, which still carry them in full;
  // on the page the heading (Option A, Option B) already names the option.
  // Fix (Destin, 2026-09-06): "add big ass clear 'Option A. Option B.' headers on the
  // selectable options". The option's own id (`all-three`) was doing that job in a small chip,
  // which named the thing without announcing that it is the thing you pick. The heading is now
  // the position — Option A, Option B — and the id follows it quietly, because the answers file,
  // the summary and any contract row still speak in ids.
  const LETTERS = 'ABCDEFGH';
  const optionCard = (o, cls, i) => `<section class="card variant${cls}" data-pick="${esc(o.id)}" title="Pick ${esc(o.id)}"><h3 class="ohead"><span class="oletter">Option ${LETTERS[i] || String(i + 1)}</span>${o.recommended ? '<span class="badge">Recommended</span>' : ''}${reuseTip(o)}</h3><div class="vbody"><h4 class="oname">${esc(o.label)}</h4>${pictureFig(o, ' opt')}${o.summary ? `<p>${esc(o.summary)}</p>` : ''}${bullets(o, 'pros')}${bullets(o, 'cons')}${o.measured ? `<p class="num">Measured: ${esc(o.measured)}</p>` : ''}${o.cost ? `<p class="cost">${esc(o.cost)}</p>` : ''}${o.risk ? `<p class="r">${esc(o.risk)}</p>` : ''}</div></section>`;
  // WHY (Destin, 2026-11-04: "i want to visualize some of these options better"): a written
  // question about how something LOOKS drew "Other — need to see it" seven times out of ten.
  // A question, and each of its options, may now carry a picture; a click opens it full size.
  const pictureFig = (x, cls) => x.picture ? `<figure class="qpic${cls || ''}"><a href="${esc(x.picture)}" title="Open larger"><img src="${esc(x.picture)}" alt=""></a>${x.caption ? `<figcaption>${esc(x.caption)}</figcaption>` : ''}</figure>` : '';
  // The three parts of a question, one card each.
  // WHY the little (i) (Destin, 2026-11-09, rethink Q-7): stale "Today" facts were the worst
  // fault in past decks. A question may say how and when its Today was checked (`checked`);
  // he asked for it tucked behind a hover mark beside the header, not as more copy to read.
  const partCard = (title, text, how) => `<section class="card part"><h3>${esc(title)}${how ? `<span class="how" tabindex="0" aria-label="How this was checked"><i>i</i><span class="tip">${esc(how)}</span></span>` : ''}</h3><p>${esc(text)}</p></section>`;
  // Fix (Destin, 2026-09-06): "do 3 cards side-by-side horizontally". Stacked, the three
  // explanations were three screens of scrolling before the first thing he can answer.
  const partCards = st => {
    const cards = [['Today', st.today], ['The problem', st.problem], ['Proposal', st.proposal]]
      .filter(([, t]) => t).map(([h, t], i) => partCard(h, t, h === 'Today' ? st.checked : '')).join('');
    return cards ? `<div class="parts">${cards}</div>` : '';
  };
  // No card at all when there is nothing to put in it: a slide showing a REAL screen of the app
  // has no "what changed", and an empty titled box reads as a rendering fault.
  const changedCard = st => !st.changed && !st.measured ? ''
    : `<section class="card"><h3>${ICON.change}What changed</h3>${st.changed ? `<p>${esc(st.changed)}</p>` : ''}${st.measured ? `<p class="num">Measured: ${esc(st.measured)}</p>` : ''}</section>`;
  const noticeCard = st => st.notice ? `<section class="card"><h3>${ICON.eye}You'll notice</h3><p>${esc(st.notice)}</p></section>` : '';
  // "Also changes" (close-session friction, proposal 15): the other screens a shared change
  // reaches, listed with the notice so a yes here is a yes to all of them.
  const alsoCard = st => st.alsoChanges && st.alsoChanges.length ? `<section class="card also"><h3>${ICON.eye}Also changes</h3><ul>${st.alsoChanges.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>` : '';
  const riskCard = st => st.risk ? `<section class="card risk"><h3>${ICON.warn}Risk</h3><p>${esc(st.risk)}</p></section>` : '';
  // CONTRACT: the rows as one table, not a card per row — grading (a `verdict` on any row)
  // adds a Verdict column instead of always reserving one nobody has filled in yet.
  // A verdict's evidence is a forensic note — a command, a path, what was compared against
  // what — and the full text belongs in the verdicts FILE, which is committed and readable.
  // In the table it is one cell competing for width with the statement he is deciding about.
  // Measured on the remote-access acceptance deck at 1512px: evidence took 498px and the
  // Statement column was starved to 105px, one word per line. The column shares this table
  // deliberately does NOT use (see page.css) cannot fix that — the content is the problem.
  const EVIDENCE_CHARS = 150;
  const shortEvidence = text => {
    const one = String(text).replace(/\s+/g, ' ').trim();
    if (one.length <= EVIDENCE_CHARS) return one;
    // Cut on a word boundary so the tail is not half a path.
    const cut = one.slice(0, EVIDENCE_CHARS);
    return cut.slice(0, cut.lastIndexOf(' ') > 60 ? cut.lastIndexOf(' ') : EVIDENCE_CHARS) + '… (full note in the verdicts file)';
  };
  const rowsTable = st => {
    const graded = st.rows.some(r => r.verdict);
    return `<section class="card contract"><table><thead><tr><th>#</th><th>Statement</th><th>Checked by</th><th>Threshold</th><th>From</th>${graded ? '<th>Verdict</th>' : ''}</tr></thead><tbody>${st.rows.map(r => `<tr class="${esc(r.verdict)}"><td>${esc(r.id)}</td><td>${esc(r.statement)}${r.note ? `<p class="src">“${esc(r.note)}”</p>` : ''}</td><td>${esc(r.checkedBy)}${r.guard ? `<p class="src">${esc(r.guard)}</p>` : ''}</td><td>${esc(r.threshold || 'pass / fail')}</td><td class="src">${esc(r.source)}${r.found === 'review' ? '<p class="src"><strong>found in review</strong> — not on a deck you answered</p>' : ''}</td>${graded ? `<td>${esc(r.verdict || '—')}${r.evidence ? `<p class="src">${esc(shortEvidence(r.evidence))}</p>` : ''}</td>` : ''}</tr>`).join('')}</tbody></table></section>`;
  };
  // SEVERAL looks exactly like pick-one until it says so — the cards, the borders and the
  // lettering are the same. One line above them is what tells him he may tick more than one.
  const pickHint = st => st.pick === 'several'
    ? '<p class="pickhint">Pick as many as you like — click one again to unpick it.</p>' : '';
  // TRY IT IN THE REAL APP. The deck cannot hold the real app — it is a desktop program, not
  // a page — so this card carries the exact command instead, and the slide carries the verdict.
  // The safety line is fixed copy, not the author's: a dev window is a SEPARATE app, and the
  // one thing nobody may be told to poke is Destin's own running copy.
  const devCard = st => `<section class="card dev"><h3>${ICON.change}Open the app to try it</h3>`
    + `<div class="devrow">`
    // Served: a button, because a line to copy into a terminal is a chore he asked to be rid
    // of (2026-09-06). Opened as a plain file there is no server to ask, so the command stays.
    + `<button type="button" class="btn primary opendev" data-id="${esc(st.id)}">Open the dev window</button>`
    + `<button type="button" class="btn copycmd">Copy the command</button></div>`
    + `<pre class="cmd"><code>${esc(st.command)}</code></pre>`
    + `<p class="src devnote">This opens a separate dev window on your desktop, alongside your own app — never your own app itself. It takes a few seconds to appear. Close it when you are done.</p></section>`;
  // CALLS I MADE FOR YOU (Destin, 2026-11-09, rethink Q-10: "super helpful. but i think each
  // item i choose to change should have its own little text box underneath"). Small choices
  // the assistant made itself, one line each with its reason. Each stands unless he opens its
  // pencil, which opens a box under THAT line for what he wants instead (round 3 replaced the
  // worded "Change this" and "More context" buttons with that one pencil).
  // Round 2 widened the row so a WALKTHROUGH is built from the same list: a row may show a
  // picture (areas work on it), the words of his it came from (`decided`), and a check's
  // result. (Round 2 also had a "More context" button; round 3 folded it into the pencil, so
  // a question about a row is just a comment in that row's box.)
  // WHY `todo` and a pill he can press (Destin, 2026-11-10, on the Checks page: "these should
  // probably all be more similar and i should be able to update the statuses myself for all
  // including the ones you put unclear for"): a check I ran, one I could not settle and one
  // left for him to try were three different-looking rows, and only I could set the status.
  // Every such row now carries the same pill at its top right; pressing it opens the four
  // statuses. His choice is saved as answers[step].results[row] and shown in place of mine.
  // `run` / `skip` (round 5, Q-1: "could i just request or enable our various agent-reviewers for a
  // build from a single menu in the pre-build deck?"): before a build the Checks list is that
  // menu — each suggested check or reviewer carries a Will run / Skip pill he flips.
  const RESULT = { pass: 'Passed', fail: 'Failed', unclear: 'Unclear', todo: 'Not tried', run: 'Will run', skip: 'Skip' };
  const PLAN = ['run', 'skip'];
  const resultOf = (sid, c) => ((state.answers[sid] || {}).results || {})[c.id] || c.result;
  const resultPill = (st, c) => c.result ? `<button type="button" class="result pillbtn" data-sid="${esc(st.id)}" data-call="${esc(c.id)}" data-own="${esc(c.result)}" aria-haspopup="menu"></button>` : '';
  function setResult(sid, cid, own, val) {
    if (state.submitted) return;
    const a = { ...(state.answers[sid] || {}) }; const rs = { ...(a.results || {}) };
    if (val === own) delete rs[cid]; else rs[cid] = val;
    if (Object.keys(rs).length) a.results = rs; else delete a.results;
    // WHY any status he changed counts (UX review 2026-11-10): only fail/run/skip did, so changing a
    // status to "Passed" showed "1 change" on the box but left the header's answered count behind.
    if (Object.keys(rs).length) { a.v = 'other'; delete a.dk; }
    else if (a.v === 'other' && !openRows(a) && !(a.marks || []).length) delete a.v;
    state.answers[sid] = a; paintState(); save();
  }
  function closeResultMenu() { const m = $('.resultmenu'); if (m) m.remove(); }
  document.addEventListener('click', e => {
    const opt = e.target.closest('.resultmenu button');
    if (opt) { setResult(opt.dataset.sid, opt.dataset.call, opt.dataset.own, opt.dataset.v); closeResultMenu(); return; }
    const pill = e.target.closest('.result.pillbtn');
    const was = $('.resultmenu'); closeResultMenu();
    if (!pill || state.submitted || (was && was.dataset.for === pill.dataset.sid + '/' + pill.dataset.call)) return;
    const m = document.createElement('div'); m.className = 'resultmenu'; m.setAttribute('role', 'menu'); m.dataset.for = pill.dataset.sid + '/' + pill.dataset.call;
    const now = pill.dataset.now;
    m.innerHTML = Object.keys(RESULT).filter(k => PLAN.includes(k) === PLAN.includes(pill.dataset.own)).map(k => `<button type="button" role="menuitemradio" aria-checked="${k === now}" data-v="${k}" data-sid="${esc(pill.dataset.sid)}" data-call="${esc(pill.dataset.call)}" data-own="${esc(pill.dataset.own)}"><span class="result ${k}">${RESULT[k]}</span>${k === pill.dataset.own ? `<span class="mine">${PLAN.includes(k) ? 'Suggested' : 'my result'}</span>` : ''}</button>`).join('');
    document.body.appendChild(m);
    const r = pill.getBoundingClientRect();
    m.style.top = (r.bottom + scrollY + 4) + 'px'; m.style.left = Math.max(8, r.right + scrollX - m.offsetWidth) + 'px';
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeResultMenu(); });
  // WHY one pencil (Destin, 2026-11-10, round 3: "simplify down to a single pencil/edit icon on
  // each of these rows that opens the comment box. and i can steer myself instead of the
  // separate change/more context buttons"). Two worded buttons per row were noise; the box says
  // whatever he wants — change it, explain it, or a stray thought.
  const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-4-4L4 16v4z"/><path d="m14 6 4 4"/></svg>';
  // ── ROUND 8: grouping instead of badges, and ONE "Details" fold per row ──────────────────────
  // WHY (Destin, 2026-11-10, round 7: "i feel like this has suddently become VERYY busy and
  // confusing… these 'new this round' and 'changed from your comment' badges don't really make much
  // sense, not to mention the colors make them visually confusing next to the unclear/pass/fail
  // chips… we don't use the bare > dropdowns anywhere"). The design guide says "a state is shown by a
  // pill, a dot or its group". Here it is the GROUP: a list draws small headings (New, Changed,
  // Already settled) and the rows sit under them, so the only coloured pills left on a page are real
  // statuses. What used to be three bare "> How this changed / More / (i) Built from" openers is now
  // ONE fold row per list row, drawn like the app's fold-out row (components/ui/FoldRow.tsx and the
  // Deliverables header): a box, the label on the left, small fact chips for what is inside, a
  // chevron at the right.
  const STATE_GROUPS = [['new', 'New'], ['changed', 'Changed'], ['settled', 'Already settled']];
  // ChevronIcon (components/Icons.tsx): a down chevron that turns up when its box is open.
  const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>';
  // The app's bin, for taking a row's own comment away (guide: "a remove is a bin, never a ✕ — a ✕ means close").
  const BIN = '<svg class="bin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/></svg>';
  // Which folds he opened, kept outside the markup because the page redraws on every page change.
  const openMap = {};
  const okey = (kind, sid, cid) => kind + '|' + sid + '|' + (cid || '');
  const isOpen = (kind, sid, cid) => !!openMap[okey(kind, sid, cid)];
  const quoted = t => /^["“]/.test(t.trim()) ? t.trim() : '“' + t.trim() + '”';
  const MORE_LABELS = { does: 'What it does', returns: 'What comes back', why: 'Why, for this build' };
  // ── ROUND 9: no "Details" fold ────────────────────────────────────────────────────────────
  // WHY (Destin, 2026-11-11, round 8, on the fold: "this is still genuinely terrible. what even is the point of
  // this?… poorly styled text dropped into a dropdown with no visual heirarchy"; round 9, K-1: yes to removing
  // it). Each of the three things it hid now sits where it is used, in the open:
  //   - the story (what he asked, what was built, what he said) is a few plain lines ABOVE the row's words;
  //   - a check's fuller explanation is labelled lines UNDER the row's words;
  //   - which app parts a design reuses is behind a small (i) beside the words (his round-6 answer).
  const storyLines = x => !(x.trail || []).length ? '' : `<dl class="story">` + x.trail.map(t => {
    const r = t.round || '';
    return (t.asked ? `<div class="sline you"><dt>${esc(r)} · you</dt><dd>${esc(quoted(t.asked))}</dd></div>` : '')
      + (t.built ? `<div class="sline"><dt>${esc(r)} · built</dt><dd>${esc(t.built)}</dd></div>` : '')
      + (t.said ? `<div class="sline you"><dt>${esc(r)} · you</dt><dd>${esc(quoted(t.said))}</dd></div>` : '');
  }).join('') + `</dl>`;
  const moreLines = c => {
    if (!c.more) return '';
    const parts = typeof c.more === 'string' ? { does: c.more } : c.more;
    return `<dl class="morelines">` + ['does', 'returns', 'why'].filter(k => parts[k]).map(k => `<div class="mline"><dt>${MORE_LABELS[k]}</dt><dd>${esc(parts[k])}</dd></div>`).join('') + `</dl>`;
  };
  // The (i) explainer (the app's AnchorTip: a small round (i), the words open beside it on hover or focus). Used where a
  // fold would fight a click: an option card (the whole card picks) and a design's headline.
  const infoTip = (label, body) => `<span class="how" tabindex="0" aria-label="${esc(label)}"><i>i</i><span class="tip">${body}</span></span>`;
  const reuseTip = x => {
    const r = x && x.reuse; if (!r) return '';
    const list = (h, a) => a && a.length ? `<b class="tiph">${h}</b><ul class="tipl">${a.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
    return infoTip('Built from', list('Reused from the app', r.from) + list('New in this design', r.new) + (r.note ? `<p class="tipnote">${esc(r.note)}</p>` : ''));
  };
  document.addEventListener('click', e => {
    const h = e.target.closest && e.target.closest('.foldhead'); if (!h) return;
    const fold = h.closest('.fold'), k = okey(h.dataset.kind, h.dataset.sid, h.dataset.call), on = !openMap[k]; openMap[k] = on;
    fold.classList.toggle('open', on); h.setAttribute('aria-expanded', on); fold.querySelector(':scope > .foldbody').hidden = !on;
  });
  // ── ATTACHMENTS: a row's pictures are the app's Deliverables card ───────────────────────
  // WHY (Destin, 2026-11-10, round 7, on a list page: "these attachements also aren't what i
  // imagined. i said i wanted these too look like 'deliverables' which meant a single card for each
  // image. clicking that should open our popup image screen/comment menu"). This copies
  // components/DeliverablesCard.tsx for real: one card, a header (document glyph | label, a count, a
  // chevron at the right); opened, a sideways filmstrip of fixed-width TILES — each tile the picture
  // on top, then its name and a small outlined open-arrow, the whole tile pressable. Pressing a tile
  // opens the deck's picture window (the picture large, its comments beside it, where he drags to
  // comment). Closed by default like the app's card, except on a `gallery` list (the page that is
  // about the pictures).
  const ATT_GLYPH = '<svg class="attglyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
  const ATT_ARROW = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>';
  const attOpenMap = {};
  const attKey = (sid, cid) => sid + '/' + cid;
  const attIsOpen = (st, c) => { const k = attKey(st.id, c.id); return k in attOpenMap ? attOpenMap[k] : !!st.gallery; };
  // Proof may be a short video (Destin, round 2, "with proof"): its tile shows the first frame; the
  // picture window plays it with controls. A rectangle on moving picture would point at nothing, so
  // a video has no area-dragging.
  const isVideo = src => /\.(webm|mp4)(\?|#|$)/i.test(src);
  const fileName = src => { try { return decodeURIComponent(String(src).split(/[?#]/)[0].split('/').pop() || src); } catch (e) { return String(src); } };
  const attTile = (st, c, src, pk, name) => `<button type="button" class="atttile" data-sid="${esc(st.id)}" data-call="${esc(c.id)}" data-pk="${esc(pk)}" data-src="${esc(src)}" data-name="${esc(name)}" data-video="${isVideo(src) ? 1 : 0}" title="Open ${esc(name)}">`
    + `<span class="tilepv">${isVideo(src) ? `<video src="${esc(src)}#t=0.1" preload="metadata" muted playsinline tabindex="-1"></video>` : `<img src="${esc(src)}" alt="" loading="lazy">`}<span class="tilecm" hidden></span></span>`
    + `<span class="tilefoot"><span class="tiletext"><span class="tilename">${esc(name)}</span></span><span class="tileopen" aria-hidden="true">${ATT_ARROW}</span></span></button>`;
  const attCard = (st, c) => {
    if (!(c.picture || c.before)) return '';
    const open = attIsOpen(st, c), n = (c.before ? 1 : 0) + (c.picture ? 1 : 0);
    return `<div class="attcard${open ? ' open' : ''}" data-sid="${esc(st.id)}" data-call="${esc(c.id)}"><button type="button" class="atthead" aria-expanded="${open}">${ATT_GLYPH}<span class="attbar" aria-hidden="true">|</span><span class="attlabel">Attachments</span><span class="attn">${n}</span><span class="attfill"></span>${CHEV}</button>`
      + `<div class="attbody"${open ? '' : ' hidden'}><div class="attstrip scroll-mask-x">`
      + (c.before ? attTile(st, c, c.before, 'row ' + c.id + ' before', 'Before') : '')
      + (c.picture ? attTile(st, c, c.picture, 'row ' + c.id, c.before ? 'After' : fileName(c.picture)) : '')
      + `</div></div></div>`;
  };
  // A tile says how many comments he has left on its picture, so a closed strip still shows where he has written.
  function paintAtt() {
    $$('.atttile').forEach(t => {
      const n = (((state.answers[t.dataset.sid] || {}).marks) || []).filter(m => m.pic === t.dataset.pk).length;
      const cm = t.querySelector('.tilecm'); cm.hidden = !n; cm.textContent = n + (n === 1 ? ' comment' : ' comments');
    });
    $$('.attcard').forEach(card => card.classList.toggle('has', !!card.querySelector('.tilecm:not([hidden])')));
  }
  document.addEventListener('click', e => {
    const h = e.target.closest && e.target.closest('.atthead'); if (!h) return;
    const card = h.closest('.attcard'), on = !card.classList.contains('open');
    attOpenMap[attKey(card.dataset.sid, card.dataset.call)] = on;
    card.classList.toggle('open', on); h.setAttribute('aria-expanded', on); card.querySelector('.attbody').hidden = !on;
  });
  // WHY `context` (round 5, E-1: "was this supposed to be context or questions? it has edit arrows"):
  // a list of facts for him to read looked exactly like a list of choices to change. A context
  // list says so and carries no pencils; a correction goes in the page's comment box.
  // WHY a tick beside the pencil (Destin, round 10, R-1 "Tick or change"; round 9: "i want to eliminate
  // the scenario where a row gets accidentally taken as approved just because i didnt read or see it"):
  // on a "Yours to change" list nothing counts as fine until he presses the tick. Python twin: spec.tickable.
  const tickable = st => st.kind === 'calls' && !st.context && !!st.calls.length && !st.calls.some(c => c.result);
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  // 'changed' | 'ok' | 'unlooked'. Twin of spec.row_states, including its reading of decks answered before
  // round 10 (accepted, or changes with no `ok` at all: the untouched rows were fine).
  const rowState = (a, cid) => {
    a = a || {}; const legacy = !!a.accepted || (!('ok' in a) && a.v === 'other');
    return cid in (a.changes || {}) ? 'changed' : ((a.ok || {})[cid] || legacy) ? 'ok' : 'unlooked';
  };
  const unlooked = st => tickable(st) ? st.calls.filter(c => rowState(state.answers[st.id], c.id) === 'unlooked') : [];
  // Answered, for the counts: a "Yours to change" list only when EVERY row is ticked or changed.
  const isAnswered = st => { const y = state.answers[st.id]; return tickable(st) ? !!y && !unlooked(st).length : !!(y && y.v && y.v !== 'skip'); };
  const callLi = (st, c) => {
    // A row is: its story (if it has one), its words, its status pill and pencil, then at most one Attachments card.
    return `<li class="call${c.before ? ' pair' : ''}" data-call="${esc(c.id)}">${storyLines(c)}<div class="callrow"><div class="calltext"><div class="callhead"><p class="callwhat">${esc(c.call)}</p>${reuseTip(c)}</div><p class="src">${esc(c.why)}</p>${c.decided ? `<p class="decided">${esc(c.decided)}</p>` : ''}${moreLines(c)}</div><div class="callflags">${resultPill(st, c)}</div>${tickable(st) ? `<button type="button" class="iconbtn calltick" aria-pressed="false" data-sid="${esc(st.id)}" data-call="${esc(c.id)}" title="This is fine" aria-label="This is fine">${CHECK}</button>` : ''}<button type="button" class="iconbtn calledit"${st.context ? ' hidden' : ''}${tickable(st) ? ' aria-pressed="false"' : ''} data-sid="${esc(st.id)}" data-call="${esc(c.id)}" title="Comment on this, or say what to change" aria-label="Comment on this, or say what to change">${PENCIL}</button></div><div class="callbox" hidden><textarea class="callt" rows="1" data-sid="${esc(st.id)}" data-call="${esc(c.id)}" placeholder="Your comment, or what it should be instead"></textarea><button type="button" class="markx callx" data-sid="${esc(st.id)}" data-call="${esc(c.id)}" title="Take this comment away" aria-label="Take this comment away">${BIN}</button></div>${attCard(st, c)}</li>`;
  };
  // WHY groups (round 8): a row's state is shown by WHERE it sits — under a small heading "New", "Changed"
  // or "Already settled" — not by a badge. Rows keep the order they were written in inside a group. With
  // `fold_settled` the settled group is one fold row (the same fold as Details), shut by default
  // (Destin, round 6, "new first, settled folded below"). A list where no row has a state has no headings.
  // Round 10: the kind is ONE quiet label above the list's title; the controls on the rows say the rest.
  const listKind = st => st.context ? 'For your information' : st.calls.some(c => c.result === 'run' || c.result === 'skip') ? 'Checks' : st.calls.some(c => c.result) ? 'Results' : 'Yours to change';
  const groupHead = (label, n) => `<h4 class="grph">${label}<span class="grpn">${n}</span></h4>`;
  const callsCard = st => {
    const ul = rows => `<ul>${rows.map(c => callLi(st, c)).join('')}</ul>`;
    const cls = `card calls${st.context ? ' context' : ''}${tickable(st) ? ' tickable' : ''}${st.numbered ? ' numbered' : ''}${st.gallery ? ' gallery' : ''}`;
    // WHY a kind line (round 9, K-1): every list says which of the three kinds it is and what, if anything, it
    // wants from him — facts, rows that are his to change, or results (and, before a build, checks to switch).
    if (!st.calls.some(c => c.state)) return `<section class="${cls}">${ul(st.calls)}</section>`;
    const by = k => st.calls.filter(c => c.state === k);
    const plain = st.calls.filter(c => !STATE_GROUPS.some(([k]) => k === c.state));
    const blocks = [];
    STATE_GROUPS.forEach(([k, label]) => {
      const rows = by(k); if (!rows.length) return;
      if (k === 'settled' && st.fold_settled) {
        const open = isOpen('fold', st.id);
        blocks.push(`<div class="grp"><div class="fold settledfold${open ? ' open' : ''}"><button type="button" class="foldhead" data-kind="fold" data-sid="${esc(st.id)}" data-call="" aria-expanded="${open}"><span class="foldtitle">${label}</span><span class="foldchips"><span class="fchip">${rows.length}</span></span><span class="foldfill"></span>${CHEV}</button><div class="foldbody"${open ? '' : ' hidden'}>${ul(rows)}</div></div></div>`);
      } else blocks.push(`<div class="grp">${groupHead(label, rows.length)}${ul(rows)}</div>`);
    });
    // Rows with no state while others have one come first, under no heading: nothing happened to them.
    return `<section class="${cls}">${plain.length ? `<div class="grp">${ul(plain)}</div>` : ''}${blocks.join('')}</section>`;
  };

  // ── Edit the words on the real screen (round 4) ─────────────────────────────────────────
  // WHY (Destin, 2026-11-10): wording rows — a text box per label beside a small picture —
  // came back "this system is terrible… directly edit text on the real ui surface so i can see
  // it in context". A `screen` step shows a still copy of the app screen (shoot --page,
  // scripts/shoot/freeze.mjs: the app's own elements and styling, no code) in a frame, and
  // every piece of text in it can be clicked and retyped, so a longer label wraps, pushes and
  // clips exactly as it would in the app. Each change is saved as {from, to} and listed under
  // the frame with a way to put it back.
  // WHY a switch and a second frame (Destin, 2026-11-10, on the frozen About popup: "i think the
  // dropdown menus in that about popup should probably still work?"; he picked "a switch above the
  // screen: Use it / Edit words — the practice app runs for real in the frame: open any dropdown,
  // then switch to Edit words and it freezes as it stands", asking for "the best/simplest way
  // possible"): a step that names `liveScreen` gets, when the deck is served, a running copy of the
  // app opened on that screen next to the still copy. Edit words freezes the running copy with the
  // SAME function `shoot --page` uses (DECK.live.freeze = scripts/shoot/freeze.mjs) and shows that.
  // Opened as a plain file, or served without the practice app, the switch never appears and the
  // saved file is shown exactly as before.
  const screenCard = st => `<section class="card screen" data-sid="${esc(st.id)}" data-live-name="${esc(st.liveScreen || '')}"><div class="screenbar"><p class="hint">${esc(EDIT_HINT)}</p><div class="seg" role="tablist" aria-label="How to use this screen" hidden><button type="button" role="tab" data-mode="use">Use it</button><button type="button" role="tab" data-mode="edit">Edit words</button></div><button type="button" class="btn sm screenbig" data-sid="${esc(st.id)}">Whole screen</button></div><p class="editcount" hidden><button type="button" class="linkbtn editjump" data-sid="${esc(st.id)}"></button></p><p class="screennote" hidden></p><div class="screenwrap"><iframe class="screenframe" sandbox="allow-same-origin" data-sid="${esc(st.id)}"${st.screen ? ` src="${esc(st.screen)}"` : ''} title="${esc(st.headline)}" scrolling="no" tabindex="-1"></iframe></div><ul class="screenedits" id="edits-${esc(st.id)}" data-sid="${esc(st.id)}"></ul></section>`;
  const EDIT_HINT = 'Click any words on this screen and retype them. Nothing on it can be pressed.';
  const USE_HINT = 'This is the running app: open menus and fold rows as you like. Then choose Edit words and it freezes just as it stands. Your changes show only in Edit words.';
  const listy = st => st.kind === 'calls' || st.kind === 'screen';
  // A change is kept only while it differs from the words the screen came with.
  // WHY keyed by the original words (+ which occurrence) and not by position (Destin, 2026-11-10:
  // the screen can now be frozen in different states, so "the 7th piece of text" means different
  // things in each): the same words found on a later freeze take the same change. `legacy` is the
  // old position key of an answers file from before this — read, and replaced when that text is
  // edited again. `state` says what was open when he made it, for the session reading the answers.
  function setScreenEdit(sid, k, from, to, legacy) {
    if (state.submitted) return;
    const fr = $(`.screenframe:not(.liveframe)[data-sid="${CSS.escape(sid)}"]`);
    const a = { ...(state.answers[sid] || {}) }; const ed = { ...(a.edits || {}) };
    if (legacy != null) delete ed[legacy];
    if (to === null || to === from) delete ed[k]; else ed[k] = { from: from.trim(), to: to.trim(), ...(fr && fr._state ? { state: fr._state } : {}) };
    if (Object.keys(ed).length) { a.edits = ed; a.v = 'other'; delete a.dk; }
    else { delete a.edits; if (a.v === 'other' && !openRows(a) && !(a.marks || []).length) delete a.v; }
    state.answers[sid] = a; paintState(); clearTimeout(noteTimer); noteTimer = setTimeout(save, 300);
  }
  // The saved change for one piece of text: by its words, else by the position an old file used.
  const editOf = (ed, el) => Object.hasOwn(ed, el.dataset.k) ? el.dataset.k
    : (Object.hasOwn(ed, el.dataset.w) && ed[el.dataset.w].from === el.dataset.orig.trim() ? el.dataset.w : null);
  // WHY (round 5: "things that would be specific to a session/user state shouldn't be editable in
  // this view, like the quick chips, status bar chips, or message bubble text"): beyond the panel
  // rule below, a screen with no popup of its own (the chat itself) still holds one person's
  // messages, chips and status chips. These are the app's own markers for them — message rows
  // (`data-entry-key`, which only the running copy still has: the saved file drops it), the quick
  // chips, the status bar and its model chip, the typing box and the session strip.
  const USER_STATE = '[data-entry-key],.quick-chip,.quick-chip-edit,.status-bar,[data-model-chip],.input-bar-container,[data-session-strip]';
  // What was open on the screen, in a few words, so a change can be put back in context.
  function describeState(doc, pb) {
    const seen = el => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
      if (pb.length !== 4) return true; const x = r.left + r.width / 2, y = r.top + r.height / 2; return x >= pb[0] && x <= pb[0] + pb[2] && y >= pb[1] && y <= pb[1] + pb[3]; };
    const say = el => (el.getAttribute('aria-label') || (el.innerText || el.textContent || '').split('\n').find(l => l.trim()) || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const dlg = [...doc.querySelectorAll('[role=dialog]')].filter(seen).pop();
    const title = dlg ? (dlg.getAttribute('aria-label') || say(dlg.querySelector('h1,h2,h3') || dlg)) : '';
    const tabs = [...doc.querySelectorAll('[role=tab][aria-selected=true]')].filter(seen).map(e => say(e) + ' tab');
    const open = [...doc.querySelectorAll('[aria-expanded=true]')].filter(seen).map(e => say(e) + ' open');
    return [title, ...tabs, ...open].filter(x => x.trim() && x !== ' tab' && x !== ' open').join(', ').slice(0, 160);
  }
  const wordOf = el => el.matches('input,textarea') ? el.value : el.textContent;
  // Called once per loaded frame: sizes it, puts scrolled parts back where they were, and
  // makes each run of text its own editable piece, numbered in page order (the file never
  // changes, so the numbers are the same on every load and saved changes find their place).
  function armScreen(fr) {
    let doc; try { doc = fr.contentDocument; } catch (e) { doc = null; }
    // WHY say so (review 2026-11-10): opened as a plain file, the browser keeps a saved screen out of
    // reach, so nothing could be edited while the hint still said "click any words".
    if (!doc && fr.getAttribute('src') && !fr._warned) { fr._warned = true; screenNote(fr.closest('.card.screen'), 'The words on this screen cannot be edited here: the deck was opened as a plain file. Open it from its served link (review-cards.py serve) to edit.', true); return; }
    if (!doc) return;
    if (!doc || !doc.body || !doc.body.childElementCount || fr._armed === doc) return;
    fr._armed = doc; const sid = fr.dataset.sid;
    // A freshly frozen copy takes the stage BEFORE it is measured: what is covered is judged by
    // what is drawn, and a frame that is still faded out would be judged as if nothing covered it.
    const card = fr.closest('.card.screen');
    if (fr._want) { card.dataset.mode = fr._want; fr._want = ''; void fr.offsetHeight; }
    const size = (doc.documentElement.getAttribute('data-frozen') || '1440x900').split('x').map(Number);
    fr.dataset.panel = doc.documentElement.getAttribute('data-frozen-panel') || '';
    if (card.dataset.live && !card._zoom && fr.dataset.panel) card._zoom = fr.dataset.panel;   // the frame keeps ONE zoom across Use it / Edit words, so switching never jumps
    fr.dataset.w = size[0]; fr.dataset.h = size[1]; fr.style.width = size[0] + 'px'; fr.style.height = size[1] + 'px';
    doc.querySelectorAll('[data-frozen-scroll]').forEach(el => { const p = el.getAttribute('data-frozen-scroll').split(',').map(Number); el.scrollLeft = p[0]; el.scrollTop = p[1]; });
    const css = doc.createElement('style');
    css.textContent = '[data-w]{cursor:text;outline:1px dashed transparent;outline-offset:2px;border-radius:2px}[data-w]:hover{outline-color:rgba(120,160,255,.8)}[data-w]:focus{outline:2px solid rgb(90,140,255)}[data-w].chg{outline:2px solid rgb(240,170,60);background:rgba(240,170,60,.16)}a,button,label,select{cursor:default!important}';
    doc.head.appendChild(css);
    const tw = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT); const texts = []; while (tw.nextNode()) texts.push(tw.currentNode);
    // WHY only inside the screen's own panel (round 5: "things that would be specific to a
    // session/user state shouldn't be editable in this view, like the quick chips, status bar
    // chips, or message bubble text. editable elements should be limited to menus/copy that all
    // users will see the same"): around a popup sits the chat behind it — one person's messages,
    // not the app's wording. With a panel, only text whose middle falls inside it is editable.
    const pb = (fr.dataset.panel || '').split(',').map(Number);
    const inPanel = el => { if (el.closest(USER_STATE)) return false; if (pb.length !== 4) return true; const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; if (!(x >= pb[0] && x <= pb[0] + pb[2] && y >= pb[1] && y <= pb[1] + pb[3])) return false;
      // …and it must be what is actually SEEN there: chat text lying behind the popup has its middle
      // inside the popup's box too, but the popup covers it.
      const top = doc.elementFromPoint(x, y); return !top || top === el || el.contains(top) || top.contains(el); };
    fr._state = describeState(doc, pb);
    let n = 0; const occ = {};
    // Each piece of text is known by its own words (the same words twice: first, second…).
    const keyOf = o => { let b = o.trim().replace(/\s+/g, ' '); if (b.length > 80) b = b.slice(0, 60) + '… (' + b.length + ' characters)'; occ[b] = (occ[b] || 0) + 1; return occ[b] > 1 ? b + ' #' + occ[b] : b; };
    texts.forEach(t => {
      const p = t.parentElement;
      if (!t.nodeValue.trim() || !p || p.closest('svg,textarea,select,option,style,script,title') || !inPanel(p)) return;
      const s = doc.createElement('span'); s.dataset.w = String(n++); s.dataset.orig = t.nodeValue; s.spellcheck = false;
      s.dataset.k = keyOf(t.nodeValue); t.replaceWith(s); s.appendChild(t);
    });
    // The grey hint in an empty box is wording too: shown as the box's text, in the hint's colour.
    doc.querySelectorAll('input,textarea').forEach(el => {
      const texty = el.tagName === 'TEXTAREA' || /^(text|search|email|url|tel|password|)$/.test(el.getAttribute('type') || '');
      if (texty && el.placeholder && !el.value && inPanel(el)) {
        el.style.color = getComputedStyle(el, '::placeholder').color;
        el.dataset.w = String(n++); el.dataset.k = keyOf(el.placeholder); el.dataset.orig = el.placeholder; el.value = el.placeholder; el.removeAttribute('placeholder');
      } else el.readOnly = true;
    });
    // Nothing on a still screen acts: a click only places the caret.
    ['click', 'submit', 'dragstart', 'auxclick'].forEach(ev => doc.addEventListener(ev, e => e.preventDefault(), true));
    doc.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.target.blur && e.target.blur(); } }, true);
    // A space typed inside a button would otherwise press it instead of being typed.
    doc.addEventListener('keyup', e => { if (e.key === ' ' && e.target.closest && e.target.closest('[data-w]')) e.preventDefault(); }, true);
    doc.addEventListener('input', e => { const el = e.target.closest ? e.target.closest('[data-w]') : null; if (el) { const ed = (state.answers[sid] || {}).edits || {}; const old = editOf(ed, el); setScreenEdit(sid, el.dataset.k, el.dataset.orig, wordOf(el), old && old !== el.dataset.k ? old : null); } }, true);
    doc.addEventListener('focusout', () => paintScreens(), true);
    paintScreens();
  }
  // Frame at its real size, scaled to the width it is given, so nothing re-wraps by being shown smaller.
  function fitScreens() {
    $$('.screenframe:not(.liveframe)').forEach(fr => {
      const w = +fr.dataset.w, h = +fr.dataset.h, wrap = fr.parentElement; if (!w || !wrap.clientWidth) return;
      // The running copy (when there is one) sits over the still one and is fitted identically.
      const lf = fr.closest('.card.screen').querySelector('.liveframe'); const place = (tf, ht) => { fr.style.transform = tf; wrap.style.height = ht; if (lf) { lf.style.transform = tf; lf.style.width = w + 'px'; lf.style.height = h + 'px'; } };
      const big = !!fr.closest('.card.screen.big'); const p = ((fr.closest('.card.screen')._zoom) || fr.dataset.panel || '').split(',').map(Number);
      // Opened large, or a screen with no panel of its own: the whole window, fitted to the width.
      if (big || p.length !== 4 || p[2] > w * 0.8) {
        const k = Math.min(1.25, wrap.clientWidth / w);
        place('scale(' + k + ')', Math.round(h * k) + 'px'); return;
      }
      // WHY zoomed on the panel (Destin, round 4: pictures "rendered far too small to be
      // useful"): a popup is a small part of a 1440-wide window; shown whole, its words are
      // tiny. The frame opens on the popup with some of the screen around it, enlarged up to
      // 1.5×; "Whole screen" shows the rest.
      const M = 70; let rx = Math.max(0, p[0] - M), ry = Math.max(0, p[1] - M);
      let rw = Math.min(w, p[0] + p[2] + M) - rx; // A card that can run the app lets the popup GROW (a folded row opened) without clipping it: 200px more below.
      const rh = Math.min(h, p[1] + p[3] + M + (fr.closest('.card.screen').dataset.live ? 200 : 0)) - ry;
      // WHY also capped by the window's height (UX review 2026-11-10): zoomed to the width alone, a tall popup
      // was taller than the window and its foot was cut off; now the whole popup fits what he can see.
      const k = Math.min(1.5, wrap.clientWidth / rw, Math.max(0.4, (innerHeight - 300) / rh));
      const want = Math.min(w, wrap.clientWidth / k);            // spare width shows more of the screen either side
      rx = Math.max(0, Math.min(w - want, rx - (want - rw) / 2)); rw = want;
      place('translate(' + (-rx * k) + 'px,' + (-ry * k) + 'px) scale(' + k + ')', Math.round(rh * k) + 'px');
    });
  }
  function paintScreens() {
    $$('.screenframe:not(.liveframe)').forEach(fr => {
      if (!fr._hooked) { fr._hooked = true; fr.addEventListener('load', () => armScreen(fr)); setupLive(fr); }
      armScreen(fr);
      const doc = fr._armed; const card = fr.closest('.card.screen');
      const ed = (state.answers[fr.dataset.sid] || {}).edits || {};
      const shown = new Set();
      if (doc) doc.querySelectorAll('[data-w]').forEach(el => {
        const key = editOf(ed, el); const on = key !== null; if (on) shown.add(key);
        el.classList.toggle('chg', on);
        if (el.matches('input,textarea')) el.readOnly = !!state.submitted; else el.contentEditable = state.submitted ? 'false' : 'plaintext-only';
        if (doc.activeElement === el) return;   // never under his caret
        // Whitespace around the words is the screen's own spacing: kept from the original.
        const lead = el.dataset.orig.match(/^\s*/)[0], tail = el.dataset.orig.match(/\s*$/)[0];
        const want = on ? (el.matches('input,textarea') ? ed[key].to : lead + ed[key].to + tail) : el.dataset.orig;
        if (wordOf(el) !== want) { if (el.matches('input,textarea')) el.value = want; else el.textContent = want; }
      });
      // A change made in a state he has left stays listed (dimmed while its words are not on the screen).
      const list = $(`.screenedits[data-sid="${CSS.escape(fr.dataset.sid)}"]`);
      // WHY a count above the frame (UX review 2026-11-10): the list of his edits sits below a tall frame, out of sight.
      { const ec = card.querySelector('.editcount'), n = Object.keys(ed).length; if (ec) { ec.hidden = !n; ec.querySelector('button').textContent = n + (n === 1 ? ' change' : ' changes') + ' made — see the list below'; } }
      if (list) list.innerHTML = Object.entries(ed).map(([k, x]) => `<li${doc && card.dataset.mode !== 'use' && !shown.has(k) ? ' class="away" title="These words are not on the screen as it is frozen now"' : ''}><span class="from">${esc(x.from)}</span><span class="arrow" aria-hidden="true">→</span><span class="to">${x.to ? esc(x.to) : '<i>(removed)</i>'}</span>${state.submitted ? '' : `<button type="button" class="linkbtn screenundo" data-sid="${esc(fr.dataset.sid)}" data-n="${esc(k)}">Put back</button>`}</li>`).join('');
    });
    fitScreens();
  }
  // ── the running copy of the screen (Use it) ────────────────────────────────────────────
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const screenNote = (card, text, bad) => { const p = card.querySelector('.screennote'); p.hidden = !text; p.textContent = text || ''; p.classList.toggle('bad', !!bad); };
  const liveUrl = extra => '/app/index.html?' + new URLSearchParams({ mode: 'workbench', child: '1', latency: '0', theme, scenario: 'default', ...extra });
  // The panel on the running copy, the way `shoot` finds it (scripts/shoot/shoot.mjs MARK_CHECK):
  // the screen's own mark, else the top-most dialog, that is really showing and not covered; a
  // menu opened over it is part of it. Null when there is none — the whole screen is then the panel.
  function livePanel(doc, name) {
    const win = doc.defaultView, W = win.innerWidth, H = win.innerHeight;
    const box = s => { const r = s.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.right <= 0 || r.bottom <= 0 || r.left >= W || r.top >= H) return null;
      for (let e = s; e && e !== doc.body; e = e.parentElement) { const cs = win.getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return null; }
      const x = Math.min(Math.max(r.left + r.width / 2, 1), W - 2), y = Math.min(Math.max(r.top + Math.min(r.height / 2, 60), 1), H - 2); const hit = doc.elementFromPoint(x, y);
      return hit && s.contains(hit) ? r : null; };
    const sel = '[role=dialog], .layer-surface, .settings-drawer';
    const marks = [...doc.querySelectorAll('[data-screen]')], mine = new Set(marks.filter(m => m.getAttribute('data-screen') === String(name).split('#')[0]).map(m => m.closest(sel) || m.parentElement));
    const all = new Set(marks.map(m => m.closest(sel) || m.parentElement)); doc.querySelectorAll('[role=dialog]').forEach(d => all.add(d));
    const good = [...all].filter(el => el && box(el)); const named = good.filter(el => mine.has(el));
    const top = (named.length ? named : good).pop(); if (!top) return null;
    let r = top.getBoundingClientRect(), x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
    doc.querySelectorAll('[role=menu],[role=listbox]').forEach(m => { const b = box(m); if (b) { x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top); x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom); } });
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    return [x0, y0, Math.min(W, x1) - x0, Math.min(H, y1) - y0].map(Math.round);
  }
  // Called once per card. The switch appears only when the practice app is really being served
  // by this deck — opened as a plain file, served with --no-live, or with an app that failed to
  // build, there is nothing to run and the saved file is all there is (a live-only step says so).
  function setupLive(fr) {
    const card = fr.closest('.card.screen'), name = card.dataset.liveName; if (!name || card._liveInit) return; card._liveInit = true;
    if (!fr.dataset.w) { fr.dataset.w = 1440; fr.dataset.h = 900; fr.style.width = '1440px'; fr.style.height = '900px'; }
    const off = () => { if (!fr.getAttribute('src')) screenNote(card, 'This step runs the app itself, so it needs the deck opened from its served link (review-cards.py serve), with the app available.', true); };
    if (location.protocol === 'file:' || !DECK.live || DECK.live.base || !DECK.live.freeze) return off();
    // `probe.txt` is no file: the server answers the app's own page without rebuilding it, so asking costs nothing.
    fetch('/app/probe.txt', { cache: 'no-store' }).then(r => r.ok, () => false).then(ok => {
      if (!ok) return off();
      if (fr.dataset.panel && !card._zoom) card._zoom = fr.dataset.panel;
      card.dataset.live = '1'; card.querySelector('.seg').hidden = false;
      setMode(card, fr.getAttribute('src') ? 'edit' : 'use');
    });
  }
  function setMode(card, mode) {
    const fr = card.querySelector('.screenframe:not(.liveframe)');
    card.querySelectorAll('.seg [data-mode]').forEach(b => { const on = b.dataset.mode === mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    card.querySelector('.screenbar .hint').textContent = mode === 'use' ? USE_HINT : EDIT_HINT;
    if (mode === 'use') { card.dataset.mode = 'use'; openLive(card); fitScreens(); }
    else freezeLive(card, fr);
  }
  function openLive(card) {
    if (card._lf) { fitScreens(); return; }
    const name = card.dataset.liveName, lf = document.createElement('iframe');
    lf.className = 'screenframe liveframe'; lf.dataset.sid = card.dataset.sid; lf.title = 'The running app'; lf.scrolling = 'no';
    lf.addEventListener('load', () => liveLoaded(card, lf, name));
    card.querySelector('.screenwrap').appendChild(lf); card._lf = lf; screenNote(card, 'Starting the app…');
    lf.src = liveUrl({});
  }
  async function liveLoaded(card, lf, name) {
    try {
      const win = lf.contentWindow;
      for (const t0 = Date.now(); !(win.__youcodedScreens && win.document.body && win.document.body.innerText.trim().length > 20); await sleep(200)) if (Date.now() - t0 > 40000) throw new Error('the app did not start within 40 seconds');
      const entry = (win.__youcodedScreens.list() || []).find(e => e.name === name);
      if (!entry) throw new Error('“' + name + '” is not in the app’s screen list');
      // A screen that needs other practice data (a scenario, a switch) reloads the app once under it.
      const extra = { ...(entry.scenario && entry.scenario !== 'default' ? { scenario: entry.scenario } : {}), ...(entry.params || {}) };
      if (Object.keys(extra).length && !lf._cfg) { lf._cfg = 1; lf.src = liveUrl(extra); return; }
      screenNote(card, 'Opening the screen…');
      let box = null;
      for (let i = 0; i < 3 && !box; i++) { const r = await win.__youcodedScreens.open(name); if (!r.ok) throw new Error(r.reason); await sleep(1500); box = livePanel(win.document, name); }
      if (!box) throw new Error('it did not show on screen');
      lf._ready = true; if (!card._zoom) card._zoom = box.join(',');
      screenNote(card, ''); fitScreens();
    } catch (e) {
      screenNote(card, 'The app could not open this screen: ' + (e && e.message || e) + '.' + (card.querySelector('.screenframe:not(.liveframe)').getAttribute('src') ? ' Edit words still works on the saved copy.' : ''), true);
    }
  }
  // Freeze the running copy as it stands and show it as the still copy (Edit words).
  async function freezeLive(card, fr) {
    const lf = card._lf;
    if (!lf || !lf._ready) { card.dataset.mode = 'edit'; fitScreens(); paintScreens(); return; }   // nothing running: the saved copy
    if (fr._busy) return; fr._busy = true; screenNote(card, 'Freezing the screen as it stands…');
    try {
      const doc = lf.contentDocument, box = livePanel(doc, card.dataset.liveName);
      let html = await lf.contentWindow.eval(DECK.live.freeze);
      if (box) html = html.replace(' data-frozen="', ' data-frozen-panel="' + box.join(',') + '" data-frozen="');
      if (fr._blob) URL.revokeObjectURL(fr._blob);
      fr._blob = URL.createObjectURL(new Blob([html], { type: 'text/html' })); fr._want = 'edit'; fr.src = fr._blob;
      screenNote(card, '');
    } catch (e) {
      screenNote(card, 'Could not freeze the screen: ' + (e && e.message || e) + '.', true);
      setMode(card, 'use');
    } finally { fr._busy = false; }
  }
  function closeScreenBig() { const b = $('.card.screen.big'); if (!b) return false; b.classList.remove('big'); b.querySelector('.screenbig').textContent = 'Whole screen'; fitScreens(); return true; }
  document.addEventListener('click', e => {
    const big = e.target.closest('.screenbig');
    if (big) { const card = big.closest('.card.screen'); const on = !card.classList.contains('big'); closeScreenBig(); card.classList.toggle('big', on); big.textContent = on ? 'Close' : 'Whole screen'; fitScreens(); return; }
    const sw = e.target.closest('.seg [data-mode]'); if (sw) { setMode(sw.closest('.card.screen'), sw.dataset.mode); return; }
    const jump = e.target.closest('.editjump'); if (jump) { const l = $(`.screenedits[data-sid="${CSS.escape(jump.dataset.sid)}"]`); if (l) l.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    const u = e.target.closest('.screenundo');
    if (u) { const ed = (state.answers[u.dataset.sid] || {}).edits || {}; if (Object.hasOwn(ed, u.dataset.n)) setScreenEdit(u.dataset.sid, u.dataset.n, ed[u.dataset.n].from, null); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeScreenBig(); });
  window.addEventListener('resize', fitScreens);
  // The body of one step, in the order the cards are read.
  const cardsFor = st => st.kind === 'calls' ? callsCard(st) + noticeCard(st)
    : st.kind === 'screen' ? screenCard(st) + noticeCard(st)
    : st.kind === 'question' ? pictureFig(st) + partCards(st) + noticeCard(st) + alsoCard(st) + riskCard(st)
    : st.kind === 'dev' ? devCard(st) + changedCard(st) + noticeCard(st) + alsoCard(st) + riskCard(st)
    : st.kind === 'contract' ? rowsTable(st) + noticeCard(st) + alsoCard(st) + riskCard(st)
    : pickList(st) ? pickHint(st) + pickList(st).map((v, i) => optionCard(v, '', i)).join('') + noticeCard(st) + alsoCard(st) + riskCard(st)
    : st.kind === 'decide' ? (st.words ? pictureFig(st) : '') + partCards(st) + pickHint(st) + noticeCard(st) + alsoCard(st) + st.options.map((o, i) => optionCard(o, ' option', i)).join('') + riskCard(st)
    : changedCard(st) + noticeCard(st) + alsoCard(st) + riskCard(st);

  // A one-picture slide is a BRIEF (nothing built yet): "keep / revert" would ask about work that
  // does not exist. Decided per slide, because a deck may hold both kinds.
  const YES = st => stepRuns(st).length === 1 ? 'Yes, build it' : 'Yes, keep it',
    NO = st => stepRuns(st).length === 1 ? 'No, leave it' : 'No, revert it';
  // A words step may relabel the buttons ("Holds / Fails" on an acceptance row): the deck's
  // build/keep wording is about a picture, and a statement has none.
  // Fix: a question (`kind === 'question'`) has no picture to keep or revert either, so its
  // fallback is the plain "Yes" / "No" the buttons already show — not "Yes, keep it". This is
  // now the ONLY place that decides the default; renderAnswers calls it instead of repeating
  // its own `st.yes || 'Yes'`, so the finish-screen read-back can never disagree with the button.
  const yesLabel = st => st.yes || (st.kind === 'question' ? 'Yes' : YES(st)),
    noLabel = st => st.no || (st.kind === 'question' ? 'No' : NO(st));
  // The things a step offers to pick between, or null if it is a yes/no. A LIVE step's
  // question shape rides in `shape`, because `kind` already says where its picture comes
  // from — so a live pick-one answers exactly like a picture pick-one.
  const pickList = st => st.kind === 'choice' ? st.variants
    : (st.kind === 'live' && st.shape === 'choice') ? st.panes : null;
  // The answer row for one step, as markup. Hoisted so a question on a scrolling page gets
  // exactly the buttons it would get on a screen of its own.
  // WRITE: the answer IS words he types, not one of a list. Destin (2026-09-06): naming and
  // wording decisions had to be faked as a pick-one from options invented in advance, so an
  // answer that was not on the list was never heard.
  // WHY no "Don't know" button (Destin, 2026-11-09, round 2: "Don't know" and "Other"
  // "basically serve the same purpose in my mind"): the box is the answer; a shrug is typed.
  const writeBox = st => `<textarea class="write ans-write" data-id="${esc(st.id)}" rows="2" placeholder="${esc(st.prompt || 'Type your answer…')}"></textarea>`;
  const answerButtons = st => {
    const picks = pickList(st);
    if (st.answer === 'words') return writeBox(st);
    // WHY no button (Destin, 2026-11-10, round 3: "i honestly dont even know if we need it,
    // could probably integrate with the next page button"): a list he leaves untouched is
    // accepted when he moves on (acceptLists); a row he wants changed has its own pencil.
    if (listy(st)) return '';
    // Fix (2026-09-10): every answer label goes in a <span>. `.ans` hides its overflow and
    // centres its content, and the ellipsis rule beside it (page.css) targets `.ans>span` —
    // so a label written as bare text was clipped at BOTH ends with no ellipsis, reading as
    // one button overlapping the next. A contract deck hit it every time: its default "No,
    // something is missing" is the longest label the builder has.
    return st.kind === 'question'
      ? `<button class="btn ans" data-v="yes"><span>${esc(yesLabel(st))}</span></button><button class="btn ans" data-v="no"><span>${esc(noLabel(st))}</span></button><button class="btn ans" data-v="other"><span>Other</span></button>`
      : picks || st.kind === 'decide'
      ? (picks ? `<button class="btn ans" data-v="no"><span>None of these</span></button>` : '')
        + `<button class="btn ans" data-v="other"><span>Other</span></button>`
      : `<button class="btn ans" data-v="yes"><span>${esc(yesLabel(st))}</span></button><button class="btn ans" data-v="no"><span>${esc(noLabel(st))}</span></button><button class="btn ans" data-v="other"><span>Other</span></button>`;
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
    // A QUESTION with no options is answered Yes / No / Other (round 2 dropped the third button,
    // "Don't know"). `dk` is still READ — an answers file from before round 2 may carry it, and
    // both summaries print "don't know" for it — but no button writes it any more.
    $('#answers').innerHTML = answerButtons(st);
    // WHY (Destin, 2026-11-09): one text field per question — a typed answer hides the note box.
    $('#note').hidden = st.answer === 'words' || listy(st);
    addMics();
    if (state.submitted) $$('.ans,.ans-write').forEach(e => e.disabled = true);   // the buttons are rebuilt per step; a submitted deck stays read-only
  }
  // `id` is the step being answered. On a page every question has its own answer row, so the
  // id comes from the button that was clicked; on a one-step screen there is only one step.
  function answer(v, pick, dk, id) {
    if (state.submitted) return;
    id = id || (PAGES ? '' : DECK.steps[cur].id); if (!id) return;
    const st = stepById(id) || {};
    // A list's `yes` (accepted by moving on, see acceptLists) cannot sit beside a row with a
    // comment — a yes that contradicts its own note was a real fault in past decks. Backstop.
    if (listy(st) && v === 'yes' && openRows(state.answers[id])) return;
    // SEVERAL: the same click toggles membership instead of replacing the answer, so "A and C,
    // not B" is a real answer rather than a sentence in the note box (Destin, 2026-09-06).
    if (v === 'pick' && st.pick === 'several') {
      const had = (state.answers[id] || {}).picks || [];
      const picks = had.includes(pick) ? had.filter(x => x !== pick) : had.concat([pick]);
      const b = { ...(state.answers[id] || {}), v: picks.length ? 'picks' : 'skip', picks };
      delete b.pick; delete b.dk;
      if (!picks.length) { delete b.picks; delete b.v; }
      state.answers[id] = b; paintState(); save(); return;
    }
    const a = { ...(state.answers[id] || {}), v }; if (v === 'pick') a.pick = pick; else delete a.pick;
    if (v !== 'picks') delete a.picks;
    if (dk) a.dk = true; else delete a.dk;   // only an old answers file carries `dk` (see renderAnswers); nothing passes it now
    state.answers[id] = a; paintState(); save();
    const n = PAGES ? $(`#cards article.q[data-id="${CSS.escape(id)}"] .note`) : $('#note'); if (n) n.focus();
  }
  $('#deck-title').textContent = DECK.title; document.title = DECK.title;
  // WHY (Destin, 2026-11-09, rethink Q-6): which version of the work a deck was built from,
  // and when, proves its value on every deck — stale decks were his top complaint. It sits
  // quietly in the chip, and rides into the answers file so the record says what he was shown.
  if (GROWS) {
    const r = document.createElement('span'); r.className = 'roundtag'; r.textContent = 'Round ' + GROWS.round; $('.chip').append(r);
  }
  if (DECK.built) {
    const b = DECK.built, when = new Date(b.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const el = document.createElement('span'); el.className = 'built'; el.textContent = 'built ' + when + (b.commit ? ' · ' + b.commit : '');
    el.title = 'This deck was built ' + when + (b.branch ? ' from the work on ' + b.branch : '') + (b.commit ? ' (version ' + b.commit + ')' : '') + '.';
    $('.chip').append(el); state.built = b;
  }
  document.body.dataset.screen = 'deck';   // 'finished' once submitted — read by deck-render.test.mjs
  // One segment per page when the deck is pages, one per step otherwise.
  $('#steps').innerHTML = (PAGES || DECK.steps).map(() => '<span></span>').join('');
  // Fix: a ONE-page deck (no marker ever split it) has nothing to move BETWEEN — a Prev/Next
  // pair and a single, always-full progress segment would just be dead controls sitting in
  // the header. PAGES is fixed for the life of the page, so this is decided once, not per-paint.
  if (PAGES && PAGES.length === 1) { $('#steps').hidden = true; $('#prev').hidden = true; $('#next').hidden = true; }
  const stage = $('#stage'), inner = $('#inner'), loupe = $('#loupe');

  // ── persistence ──
  // WHY each answer carries its own time (`t`) and nothing is ever just overwritten (2026-09-25):
  // two PC shutdowns on 2026-09-23 lost answers Destin had given. The page kept a backup in the
  // browser but never read it back while served, a refused save (409) looked like a saved one,
  // and a restarted server moved the deck to a new address where that backup was out of reach.
  // Now: every save is confirmed or retried and says which on screen; a refusal folds the file's
  // answers in and saves again; loading merges the browser's backup with the file, the newer
  // answer winning. serve.py keeps the deck on one address (pick_port) so the backup is found.
  const LS = 'deck:' + DECK.key;
  const stamped = {};   // step id → that answer as last stamped, so only a changed answer gets a new time
  function stamp() {
    const now = Date.now();
    for (const [id, a] of Object.entries(state.answers || {})) {
      if (!a) continue;
      const { t, ...rest } = a; const k = JSON.stringify(rest);
      if (stamped[id] !== k) { if (stamped[id] !== undefined || !t) a.t = now; stamped[id] = k; }
    }
  }
  // `extra`'s answers join `base`'s; where both hold one, the newer wins (a missing time is oldest).
  // WHY the notes are folded in too (review 2026-11-10): only `answers` used to be merged, so after
  // a crash recovery or a refused save the page notes, general notes and pasted-picture pills he had
  // typed were dropped for whichever side was not the base. Notes carry no time, so where both sides
  // hold words the longer wins (nothing typed is thrown away); a pill is kept if either side has it.
  const longer = (x, y) => (!x ? y : !y ? x : y.length > x.length ? y : x);
  const unionPills = (x, y) => { const out = [...(x || [])]; for (const p of y || []) if (!out.some(q => q.path === p.path)) out.push(p); return out; };
  function merged(base, extra) {
    const out = { ...base, answers: { ...(base.answers || {}) } };
    for (const [id, a] of Object.entries((extra && extra.answers) || {})) {
      const b = out.answers[id];
      if (a && (!b || (a.t || 0) > (b.t || 0))) out.answers[id] = a;
    }
    if (extra) {
      const pn = { ...(base.pageNotes || {}) };
      for (const [k, v] of Object.entries(extra.pageNotes || {})) { const w = longer(pn[k], v); if (w) pn[k] = w; }
      if (Object.keys(pn).length) out.pageNotes = pn;
      const gn = longer(base.notes, extra.notes); if (gn) out.notes = gn;
      if (base.reopened || extra.reopened) out.reopened = { ...(base.reopened || {}), ...(extra.reopened || {}) };   // a topic he reopened stays reopened
      const pa = { ...(base.pageAttach || {}) };
      for (const [k, v] of Object.entries(extra.pageAttach || {})) { const u = unionPills(pa[k], v); if (u.length) pa[k] = u; }
      if (Object.keys(pa).length) out.pageAttach = pa;
      const na = unionPills(base.notesAttach, extra.notesAttach); if (na.length) out.notesAttach = na;
    }
    return out;
  }
  function showSaved(ok, why) {
    const el = $('#saved'); if (!el || !server) return;
    el.hidden = false; el.dataset.ok = ok ? '1' : '0';
    el.textContent = ok ? 'Saved ✓' : 'NOT saved — retrying';
    el.title = ok ? 'Your answers are in the file next to this deck.' : 'Could not save (' + why + '). Retrying every 2 seconds; your answers are also kept in this browser.';
  }
  async function load() {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { /* no storage */ }
    try {
      const r = await fetch('/answers', { cache: 'no-store' });
      if (r.ok) {
        server = true; document.body.dataset.served = '1';
        const disk = await r.json();
        // The browser's copy only counts for THIS round: a submitted round, or one the file says
        // started at another time, belongs to an earlier review of the same deck.
        const sameRound = local && local.answers && !local.submitted && (!disk.started || !local.started || disk.started === local.started);
        const next = sameRound ? merged(disk && disk.answers ? disk : { ...local, answers: {} }, local) : disk;
        if (next && next.answers) Object.assign(state, next);
        for (const [id, a] of Object.entries(state.answers || {})) if (a) { const { t, ...rest } = a; stamped[id] = JSON.stringify(rest); }
        if (sameRound && JSON.stringify([next.answers, next.pageNotes, next.notes, next.pageAttach, next.notesAttach]) !== JSON.stringify([disk && disk.answers || {}, disk && disk.pageNotes, disk && disk.notes, disk && disk.pageAttach, disk && disk.notesAttach])) save();   // the backup held something the file lost
        else showSaved(true);   // what is on screen is what is in the file, so say so from the start
        return;
      }
    } catch (e) { /* not served */ }
    if (local && local.answers) Object.assign(state, local);
  }
  let retry = null, lastSig = '', loaded = false;
  const post = () => fetch('/answers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) });
  async function save() {
    stamp(); lastSig = JSON.stringify(state);
    try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) { /* no storage */ }
    if (!server) return;
    clearTimeout(retry);
    try {
      let r = await post();
      if (r.status === 409) {
        // This page is older than the file (it was open across a server restart). Fold the
        // file's answers in — the newer of each wins — and save the union, instead of losing either.
        const disk = await (await fetch('/answers', { cache: 'no-store' })).json();
        Object.assign(state, merged(state, disk)); paintState(); if (PAGES) { const pn = $('#pnote'); if (pn && document.activeElement !== pn) pn.value = (state.pageNotes || {})[PAGES[cur].id] || ''; }
        r = await post();
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      lastSig = JSON.stringify(state);   // what is on disk now (a refused save folds the file in first)
      showSaved(true);
    } catch (e) {
      showSaved(false, (e && e.message) || String(e));
      retry = setTimeout(save, 2000);
    }
  }

  // ── render the current step ──
  function render() {
    if (GROWS && viewRecord) { renderRecord(); return; }   // the record of earlier stages (read-only)
    document.body.classList.remove('recordview');
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
      $('#livehint').textContent = (st.hint ? st.hint + ' ' : '')
        + 'These panes are the running app. Click outside a pane to use ← → again.';
      probeLive().then(up => {
        if (DECK.steps[cur] !== st) return;   // he moved on while we were asking
        if (up) drawLivePanes(); else drawServerDown(st);
        layoutLive();
      });
    }
    if (st.kind === 'clip') $$('#inner video').forEach(v => v.addEventListener('loadedmetadata', layout));
    $$('#inner .frame.pickable').forEach(f => f.onclick = () => answer('pick', f.dataset.run));
    $('#headline').textContent = st.headline;
    if (st.reuse) $('#headline').insertAdjacentHTML('beforeend', reuseTip(st));   // round 7: what this design reuses
    $('#cards').innerHTML = storyLines(st) + cardsFor(st);
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
    layout(); paintState(); wireMarks();
  }
  // ── the question page: every question of one set, on one scrolling reading column ──────────
  function renderPage() {
    const pg = PAGES[cur], all = pageSteps(cur);
    // On a deck that grows, topics answered in an earlier round sink to an "Answered" list below the open ones.
    const steps = all.filter(st => !settled(st)), sunk = all.filter(settled);
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
    // WHY no title here (Destin, round 2 R-12, "title once"): the header already names the
    // page; printed again above the first question it was the same words twice in one screen.
    $('#cards').innerHTML = (named && pg.intro ? `<div class="page-head"><p class="intro">${esc(pg.intro)}</p></div>` : '')
      + (cur === 0 ? topNotes() : '')
      + steps.map((st, i) => `<article class="q" data-id="${esc(st.id)}">`
        // Fix (Destin, 2026-09-06): "too hard to quickly navigate between questions and tell
        // them apart". A page of questions had nothing between one and the next but a 14px gap,
        // so on a tall question you cannot see where you are. Each one now names itself.
        // A calls list asks nothing, so it is not called a "Question" (rethink round 2).
        + `<p class="qnum"><span class="n">${st.kind === 'calls' ? `<span class="kindline">${listKind(st)}</span>` : listy(st) ? '' : 'Question ' + (steps.filter(x => !listy(x)).indexOf(st) + 1) + ' of ' + steps.filter(x => !listy(x)).length}</span></span></p><span class="qstate" aria-live="polite"></span>`
        + `<h2 class="qh">${esc(st.headline)}</h2>`
        // WHY (Destin, round 10: "one summary line of its past, the full story opens on request"): on a deck that
        // grows the story is ONE fold line under the title, never always-visible lines.
        + growPast(st)
        + (listy(st) ? '' : (GROWS ? '' : storyLines(st)) + moreLines(st) + (st.reuse ? `<div class="builtfrom">Built from the app's own parts${reuseTip(st)}</div>` : ''))
        + `<div class="qbody">${cardsFor(st)}</div>`
        + leaveButton(st)
        + (listy(st) ? '' : `<div class="qrow"><span class="answers">${answerButtons(st)}</span>`
        // WHY (Destin, 2026-11-09): "there should never be two text fields in an answer". A
        // question answered by typing already has its box, so it gets no second note box.
        + (st.answer === 'words' ? '' : `<textarea class="note" rows="1" data-id="${esc(st.id)}" placeholder="Add a note (optional)"></textarea>`) + `</div>`)
        + `</article>`).join('')
      + answeredList(sunk)
      // WHY (Destin, round 4, on the header Notes button: "nah i wanted like an extra more
      // visible input region at the bottom of each page"): a thought about the page as a whole
      // gets a box he cannot miss, where he ends up after reading it — one per page, saved as
      // pageNotes[page id].
      + `<section class="pagenote"><label for="pnote">Anything else about this page</label><div class="pnotebox"><textarea class="pnote" id="pnote" rows="2" data-page="${esc(pg.id)}" placeholder="A comment on the page as a whole, or anything no row or question covers"></textarea></div></section>`;
    { const pn = $('#pnote'); pn.value = (state.pageNotes || {})[pg.id] || ''; pn.disabled = !!state.submitted; }
    // Every control carries the id of the question it belongs to, so one click handler on the
    // column can answer any of them without knowing which article it came from.
    $$('#cards article.q').forEach(art => art.querySelectorAll('.ans').forEach(b => b.dataset.id = art.dataset.id));
    if (state.submitted) $$('#cards .ans,#cards .note,#cards .ans-write').forEach(e => e.disabled = true);   // WHY .ans-write too (review 2026-11-10): the typed-answer box stayed live after Submit and looked saved
    layout(); paintState(); addMics(); wireMarks();
  }
  // ── growing decks: a topic's past, the Answered list, Reopen ───────────────────────────────
  const noteLines = (label, answer, notes) => `<dl class="story">`
    + [answer ? [label, answer] : null, ...(notes || []).map(n => [answer ? '' : label, quoted(n)])].filter(Boolean).map((r, i, a) => `<div class="sline you"><dt>${i === 0 ? esc(r[0]) : ''}</dt><dd>${esc(r[1])}</dd></div>`).join('') + `</dl>`;
  // An open topic with a past: ONE small plain muted line under the title, then a text link "More" that opens the story.
  // WHY (Destin, round 11: "what is that little dropdown section at the top of the questions? It doesn't seem to be related
  // to any specific question"): it was drawn as a full-width box with a chevron, like a row. Now it is one line of words.
  function growPast(st) {
    if (!GROWS || !st.grow) return '';
    const g = st.grow, mine = !!(state.reopened || {})[st.id];
    const line = g.line || (mine && g.round ? 'Answered in ' + g.round : '');
    if (!line) return '';
    const body = storyLines(st) + (g.story || []).map(x => noteLines(x.round + ' · you', x.answer, x.notes)).join('');
    const open = isOpen('past', st.id);
    return `<div class="pastline" data-reveal><p class="pasttext">${esc(line)}${body ? ` <button type="button" class="tlink revealbtn" data-kind="past" data-sid="${esc(st.id)}" data-on="More" data-off="Less" aria-expanded="${open}">${open ? 'Less' : 'More'}</button>` : ''}</p>`
      + (body ? `<div class="revealbody"${open ? '' : ' hidden'}>${body}</div>` : '') + `</div>`;
  }
  // "More" / "Show the full question": one handler for every small text link that opens a body beside it.
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.revealbtn'); if (!b) return;
    const k = okey(b.dataset.kind, b.dataset.sid), on = !openMap[k]; openMap[k] = on;
    b.closest('[data-reveal]').querySelector(':scope > .revealbody').hidden = !on;
    b.setAttribute('aria-expanded', on); b.textContent = on ? b.dataset.off : b.dataset.on;
  });
  const touchedStep = st => { const a = state.answers[st.id] || {}; return !!(isAnswered(st) || (a.note || '').trim() || openRows(a) || (a.marks || []).length || Object.keys(a.ok || {}).length); };
  // The small button on a topic he reopened and has not yet answered: put it back.
  function leaveButton(st) {
    if (!GROWS || !(state.reopened || {})[st.id] || state.submitted) return '';
    return touchedStep(st) ? '' : `<div class="growact"><button type="button" class="btn sm ghost leavebtn" data-sid="${esc(st.id)}">Leave as answered</button></div>`;
  }
  // One answered topic as a compact card: the question, what he answered, his words in full, what was done about it, its round.
  // WHY (Destin, round 11: "It doesn't look like a traditional card that I've answered. It's not clear what the question was and
  // how my response differed"): the old one-line strip said neither. Quieter than an open card (no accent), still readable.
  // `record`: drawn in the record of earlier stages, where nothing can be changed, so there is no Reopen.
  function ansCard(st, record) {
    const g = st.grow, open = isOpen('full', st.id);
    const list = st.kind === 'calls' ? `<ul class="plainrows">${st.calls.map(c => `<li>${esc(c.call)}</li>`).join('')}</ul>` : '';
    const para = (k, t) => st[k] ? `<p><span class="youlabel">${t}</span> ${esc(st[k])}</p>` : '';
    const opts = (st.options || []).length ? `<ul class="plainrows">${st.options.map(o => `<li><b>${esc(o.label || '')}</b>${o.summary ? ' — ' + esc(o.summary) : ''}</li>`).join('')}</ul>` : '';
    const full = list + para('today', 'Today') + para('problem', 'Problem') + para('proposal', 'Proposal') + opts;
    // A tick-or-change list: how many rows he ticked (his comments on rows are in `notes`).
    const said = g.ticked != null ? `${g.ticked} of ${g.rows} rows ticked as fine` : g.answer;
    return `<section class="anscard" data-id="${esc(st.id)}" data-reveal><div class="anshead"><h3 class="anstitle">${esc(st.headline)}</h3><span class="ansround">${esc(g.round || '')}</span></div>`
      + (said ? `<p class="ansline"><span class="youlabel">You answered</span> <span class="ansval">${esc(said)}</span></p>` : '')
      + (g.notes || []).map(n => `<p class="decided">${esc(quoted(n))}</p>`).join('')
      + (g.resolved ? `<p class="ansline"><span class="youlabel">Done about it</span> ${esc(g.resolved)}</p>` : '')
      // WHY nothing when empty: a record card with no full question and no Reopen has no controls, so it gets no empty row (dead space).
      + (full || !record ? `<div class="ansacts">${full ? `<button type="button" class="tlink revealbtn" data-kind="full" data-sid="${esc(st.id)}" data-on="Show the full question" data-off="Hide the full question" aria-expanded="${open}">${open ? 'Hide the full question' : 'Show the full question'}</button>` : '<span></span>'}`
      + (record ? '' : `<button type="button" class="btn sm reopenbtn" data-sid="${esc(st.id)}"${state.submitted ? ' disabled' : ''}>Reopen</button>`) + `</div>` : '')
      + (full ? `<div class="revealbody"${open ? '' : ' hidden'}>${full}</div>` : '') + `</section>`;
  }
  const answeredList = list => list.length ? `<div class="grp answeredgrp"><h4 class="grph">Answered<span class="grpn">${list.length}</span></h4>` + list.map(st => ansCard(st, false)).join('') + `</div>` : '';
  // ── the record of earlier stages ───────────────────────────────────────────────────────────
  // WHY (Destin, round 11: "In my mind we're not editing prior sections of the deck once we've gotten to post build"): earlier
  // stages are history. One quiet link opens them read-only: no answer buttons, no comment boxes, no Reopen, nothing counted.
  let viewRecord = false;
  const stageName = k => (GROWS.stages || {})[k] || k;
  function renderRecord() {
    document.body.classList.add('recordview');
    document.documentElement.dataset.theme = theme;
    $('#wtitle').textContent = 'Earlier stages'; $('#wsub').textContent = 'The record'; $('.top .where .sep').hidden = false;
    lastStep = null; curFrames = []; inner.innerHTML = ''; $('#thumbs').innerHTML = '';
    $('#replay').hidden = true; $('#zoom').hidden = true; $('#livehint').hidden = true; $('#headline').hidden = true;
    const pages = ALLPAGES.map((p, i) => [p, i]).filter(x => x[0].record);
    $('#cards').innerHTML = `<div class="recordbanner"><p>This is the record of earlier stages. Nothing here needs an answer.</p><button type="button" class="btn sm" id="recback">Back to ${esc(stageName(GROWS.stage))}</button></div>`
      + pages.map(([p]) => {
        const ss = p.steps.map(stepById).filter(Boolean);
        // A background list (facts) is drawn as plain lines; every other topic is an answered card without Reopen.
        const body = ss.map(st => st.context ? `<section class="anscard"><div class="anshead"><h3 class="anstitle">${esc(st.headline)}</h3></div><ul class="plainrows">${(st.calls || []).map(c => `<li>${esc(c.call)}</li>`).join('')}</ul></section>` : st.grow && st.grow.answered ? ansCard(st, true) : '').join('');
        return `<section class="recpage"><div class="stagehead"><span class="recstage">${esc(stageName(p.stage))}</span><h2 class="rectitle">${esc(p.title)}</h2></div>${p.intro ? `<p class="intro">${esc(p.intro)}</p>` : ''}${body}</section>`;
      }).join('');
    layout(); paintStages();
    const t = $('.content') || document.scrollingElement; if (t) t.scrollTop = 0;
  }
  $('#cards').addEventListener('click', e => {
    if (!e.target.closest('#recback')) return;
    viewRecord = false; render(); const t = $('.content') || document.scrollingElement; if (t) t.scrollTop = 0;
  });
  $('#cards').addEventListener('click', e => {
    const ro = e.target.closest('.reopenbtn'), lv = e.target.closest('.leavebtn');
    if (!(ro || lv) || state.submitted) return;
    const id = (ro || lv).dataset.sid, t = $('.content') || document.scrollingElement, y = t ? t.scrollTop : 0;
    state.reopened = { ...(state.reopened || {}) };
    if (ro) state.reopened[id] = true; else delete state.reopened[id];
    if (!Object.keys(state.reopened).length) delete state.reopened;
    save(); renderPage(); if (t) t.scrollTop = y;
  });
  // The stage the deck is AT, as a plain progress indicator in the header: earlier stages done, this one lit, later ones dimmed.
  // WHY not buttons (Destin, round 11: "it's very confusing that I can click around the different sections at the top and it
  // jumps me between the sides… What section of the deck is this on?"): a deck is at ONE stage, so the four names are a picture
  // of where it is, not tabs. The only control is the quiet "Earlier stages" link, which opens the read-only record.
  const STAGE_KEYS = ['understanding', 'design', 'before', 'after'];
  const needsAnswer = st => !st.context && !settled(st) && !isAnswered(st);
  function paintStages() {
    if (!GROWS || !PAGES) return;
    const box = $('#stages'); box.hidden = false;
    const at = Math.max(0, STAGE_KEYS.indexOf(GROWS.stage)), name = stageName(STAGE_KEYS[at]);
    if (!box.children.length) {
      box.innerHTML = `<ol class="stageflow" aria-label="Stage ${at + 1} of 4: ${esc(name)}">` + STAGE_KEYS.map((k, i) => `<li class="${i < at ? 'done' : i === at ? 'on' : 'later'}"${i === at ? ' aria-current="step"' : ''}>${esc(stageName(k))}</li>`).join('') + `</ol>`
        + `<span class="stagetext">Stage ${at + 1} of 4</span><span class="stagecompact">${at + 1} of 4 · ${esc(name)}</span>`
        + (RECORD.length ? `<button type="button" class="tlink recordlink">Earlier stages</button>` : '');
    }
    const rl = box.querySelector('.recordlink'); if (rl) rl.hidden = viewRecord;
  }
  $('#stages').addEventListener('click', e => {
    if (!e.target.closest('.recordlink')) return;
    viewRecord = true; render();
  });
  // Delegated, and bound once: renderPage() replaces the whole column on every page change.
  $('#cards').addEventListener('click', e => {
    if (!PAGES) return;
    const b = e.target.closest('.ans');
    if (b && !b.disabled) { answer(b.dataset.v, b.dataset.pick, b.dataset.dk === '1', b.dataset.id); return; }
    const c = e.target.closest('.card.variant'), art = c && c.closest('article.q');
    if (art && !state.submitted) answer('pick', c.dataset.pick, false, art.dataset.id);
  });
  $('#cards').addEventListener('click', e => {
    const open = e.target.closest('.opendev');
    if (open) { openDev(open); return; }
    const cx = e.target.closest('.callx'); if (cx) { toggleCall(cx.dataset.sid, cx.dataset.call, true); return; }
    const tk = e.target.closest('.calltick'); if (tk) { toggleTick(tk.dataset.sid, tk.dataset.call); return; }
    const chg = e.target.closest('.calledit');
    if (chg) { toggleCall(chg.dataset.sid, chg.dataset.call); return; }
    const mx = e.target.closest('.markx:not(.callx)');
    if (mx) { removeMark(mx.dataset.sid, +mx.dataset.i); return; }
    const b = e.target.closest('.copycmd'); if (!b) return;
    const code = b.parentElement.querySelector('code');
    navigator.clipboard.writeText(code.textContent).then(
      () => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy the command'; }, 1500); },
      // No clipboard (an insecure origin, a locked-down browser): select it so it can be
      // copied by hand, rather than a button that silently does nothing.
      () => { const r = document.createRange(); r.selectNodeContents(code); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Selected — copy it'; });
  });
  $('#cards').addEventListener('input', e => {
    const w = e.target.closest('.ans-write[data-id]');
    if (w) { writeAnswer(w.dataset.id, w.value); return; }
    const ct = e.target.closest('.callt');
    if (ct && !state.submitted) { const a = state.answers[ct.dataset.sid] || {}; if (a.changes && ct.dataset.call in a.changes) { a.changes[ct.dataset.call] = ct.value; clearTimeout(noteTimer); noteTimer = setTimeout(save, 300); } return; }
    const mt = e.target.closest('.markt');
    if (mt && !state.submitted) { const m = ((state.answers[mt.dataset.sid] || {}).marks || [])[+mt.dataset.i]; if (m) { m.text = mt.value; clearTimeout(noteTimer); noteTimer = setTimeout(save, 300); } return; }
    const n = e.target.closest('.note[data-id]'); if (!n || !PAGES) return;
    state.answers[n.dataset.id] = { ...(state.answers[n.dataset.id] || {}), note: n.value };
    paintState(); clearTimeout(noteTimer); noteTimer = setTimeout(save, 300);
  });
  // The button that opens the dev window. It posts the STEP, never a command: the server
  // rebuilds the line from the spec on disk, so the page cannot ask it to run anything else.
  function openDev(btn) {
    const card = btn.closest('.card.dev'), note = card.querySelector('.devnote');
    btn.disabled = true; btn.textContent = 'Opening…';
    fetch('/dev', { method: 'POST', headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ step: btn.dataset.id }) })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d.error || 'it did not start');
        btn.textContent = d.already ? 'Already open' : 'Opening — watch for the window';
        note.textContent = d.already
          ? 'The window this slide opened is still running. Find it in your taskbar; close it when you are done.'
          : 'It takes a few seconds to appear, and it is a separate window from your own app. Close it when you are done.';
        // Re-enabled so a window he closed can be opened again without reloading the deck.
        setTimeout(() => { btn.disabled = false; btn.textContent = 'Open the dev window'; }, 8000);
      })
      .catch(err => {
        btn.disabled = false; btn.textContent = 'Open the dev window';
        // Never a silent no-op: say what failed and leave the command, which still works.
        note.textContent = 'It did not start: ' + err.message + ' — the command above still works.';
      });
  }
  // Typing IS the answer on a write slide. Emptying the box unanswers it, the way clicking a
  // chosen option off does — otherwise a cleared box would still count as answered.
  function writeAnswer(id, text) {
    if (state.submitted) return;
    const a = { ...(state.answers[id] || {}) };
    if (text.trim()) { a.v = 'wrote'; a.text = text; delete a.dk; } else { delete a.v; delete a.text; }
    state.answers[id] = a; paintState(); clearTimeout(noteTimer); noteTimer = setTimeout(save, 300);
  }
  function toggleCall(sid, cid, remove) {
    if (state.submitted) return;
    const a = { ...(state.answers[sid] || {}) }; const ch = { ...(a.changes || {}) };
    { const st0 = stepById(sid); if (st0 && tickable(st0)) legacyToTicks(st0, a); }
    // WHY (UX review 2026-11-10): a second press of the pencil on a row with a saved comment used to
    // delete it with no warning. Now it only goes back to the box; taking a comment away is the
    // small x beside it. An EMPTY box may still be closed by the pencil.
    if (remove && !(cid in ch)) return;   // the x only ever takes an existing comment away
    if (!remove && cid in ch && String(ch[cid] || '').trim()) {
      const box = $(`.callt[data-sid="${CSS.escape(sid)}"][data-call="${CSS.escape(cid)}"]`); if (box) box.focus(); return;
    }
    if (cid in ch) {
      delete ch[cid];
      // WHY: pictures and paths pasted into that change's box belong to it; leaving them would
      // print "attached to change x" for a change he took back.
      if (a.attach) { a.attach = { ...a.attach }; delete a.attach['change:' + cid]; if (!Object.keys(a.attach).length) delete a.attach; }
    } else { ch[cid] = ''; if (a.ok && cid in a.ok) { a.ok = { ...a.ok }; delete a.ok[cid]; } }   // WHY: a row cannot be both fine and changed — writing a comment takes the tick off (round 10)
    // Any line marked for change makes the answer "something else"; none left, and an answer
    // that only existed because of a change is withdrawn rather than left as a bare Other.
    if (Object.keys(ch).length) { a.changes = ch; a.v = 'other'; delete a.dk; }
    else { delete a.changes; if (a.v === 'other' && !openRows(a) && !(a.marks || []).length) delete a.v; }
    { const st = stepById(sid); if (st && tickable(st)) { a.ok = a.ok || {}; settleList(st, a); } }
    state.answers[sid] = a; paintState(); save();
    const box = $(`.callt[data-sid="${CSS.escape(sid)}"][data-call="${CSS.escape(cid)}"]`); if (box && cid in ch) box.focus();
  }
  // The tick. WHY a tick on a commented row does nothing (round 10): the comment is his words and must not
  // vanish from a stray press; the bin beside the comment is how a comment is taken away. Pressing a
  // lit tick again takes it off.
  // A deck answered before round 10 meant "rows I did not touch are fine" (accepted). Reopened, the
  // first press on it writes those rows as real ticks, so editing one row never turns the others into "not looked at".
  function legacyToTicks(st, a) {
    if (!(a.accepted || (!('ok' in a) && a.v === 'other'))) return;
    a.ok = {}; st.calls.forEach(c => { if (!(c.id in (a.changes || {}))) a.ok[c.id] = true; });
  }
  function toggleTick(sid, cid) {
    if (state.submitted) return;
    const st = stepById(sid); if (!st || !tickable(st)) return;
    const a = { ...(state.answers[sid] || {}) };
    if (cid in (a.changes || {})) return;
    legacyToTicks(st, a);
    const ok = { ...(a.ok || {}) };
    if (ok[cid]) delete ok[cid]; else ok[cid] = true;
    a.ok = ok; settleList(st, a);
    state.answers[sid] = a; paintState(); save();
  }
  // What `v` says for a "Yours to change" list: other if any row has a change; yes only when every row is
  // ticked and none changed; otherwise no answer, so a half-read list is never taken as approved.
  function settleList(st, a) {
    const ch = Object.keys(a.changes || {}).length, ok = Object.keys(a.ok || {}).length;
    delete a.accepted; delete a.dk;
    if (ch) a.v = 'other';
    else if (ok && ok === st.calls.length) a.v = 'yes';
    else if (a.v === 'other' || a.v === 'yes') delete a.v;
  }
  // `asks` is read for answers saved before the pencil replaced "More context" (round 2 decks).
  const openRows = a => Object.keys((a || {}).changes || {}).length + ((a || {}).asks || []).length + Object.keys((a || {}).edits || {}).length;
  // A list he read and left alone is accepted by moving on — the job "All fine" used to do.
  // Only lists on the page he is LEAVING: one he never opened stays unanswered, honestly.
  function acceptLists() {
    if (state.submitted || !PAGES) return;
    pageSteps(cur).forEach(st => {
      // WHY not a background-only list (review 2026-11-10): `context: true` rows ask nothing, so
      // leaving the page must never count as answering them.
      if (!listy(st) || st.context || settled(st)) return;   // a settled topic is not his to answer this round
      // WHY not a "Yours to change" list (round 10, R-2): moving on no longer means "fine"; only a tick does.
      if (tickable(st)) return;
      const a = state.answers[st.id] || {};
      // `accepted` marks a list that stands because he moved on — the only thing that lets its pill
      // say "Accepted" (review 2026-11-10: the pill showed on a group he had not left or touched).
      if (!a.v || a.v === 'skip') state.answers[st.id] = { ...a, v: 'yes', accepted: true };
    });
  }
  function paintCalls() {
    $$('.result.pillbtn').forEach(p => {
      const now = ((state.answers[p.dataset.sid] || {}).results || {})[p.dataset.call] || p.dataset.own;
      p.dataset.now = now; p.className = 'result pillbtn ' + now + (now !== p.dataset.own ? ' yours' : '');
      p.textContent = RESULT[now]; p.disabled = !!state.submitted;
      p.title = now !== p.dataset.own ? 'You set this. ' + (PLAN.includes(p.dataset.own) ? 'The suggestion was: ' : 'My result was: ') + RESULT[p.dataset.own] : 'Press to change this status';
      // WHY a visible "changed from" line and outline (UX review 2026-11-10): a status he changed
      // looked the same as one that was always Skip. The row now says what it was and wears the accent.
      const li = p.closest('li.call'); if (li) {
        const was = now !== p.dataset.own; li.classList.toggle('reschg', was);
        let w = li.querySelector('.reswas');
        if (was && !w) { w = document.createElement('p'); w.className = 'reswas'; li.querySelector('.calltext').appendChild(w); }
        if (w) { w.hidden = !was; w.textContent = was ? 'changed from: ' + RESULT[p.dataset.own] : ''; }
      }
    });
    $$('.card.calls .call').forEach(li => {
      const btn = li.querySelector('.calledit');
      if (btn) {
        const box = li.querySelector('.callt'), wrap = li.querySelector('.callbox');
        const ch = (state.answers[btn.dataset.sid] || {}).changes || {}; const on = btn.dataset.call in ch;
        li.classList.toggle('chg', on); wrap.hidden = !on; btn.classList.toggle('on', on); btn.disabled = !!state.submitted; box.disabled = !!state.submitted;
        btn.title = on ? 'Go to your comment' : 'Comment on this, or say what to change';
        // The two controls show the row's state themselves (round 10): no words, no dots, no edge bar.
        btn.setAttribute('aria-pressed', on);
        { const tk = li.querySelector('.calltick'); if (tk) {
          const ticked = rowState(state.answers[btn.dataset.sid], btn.dataset.call) === 'ok';
          tk.classList.toggle('on', ticked); tk.setAttribute('aria-pressed', ticked); tk.disabled = !!state.submitted;
          tk.title = on ? 'Take your comment away first' : ticked ? 'Undo: this is fine' : 'This is fine';
        } }
        { const x = li.querySelector('.callx'); if (x) x.disabled = !!state.submitted; }
        if (document.activeElement !== box) { box.value = on ? ch[btn.dataset.call] : ''; grow(box); }
      }
    });
    addMics();
  }
  // (Painting note: a button carrying `dk` — "Don't know" — lights only for a real shrug. An
  // area or a changed call also stores "other", with no button pressed, and must not light it.)
  // Chosen, whichever shape the answer has: one pick, or one of several.
  const chosen = (a, id) => a.v === 'picks' ? (a.picks || []).includes(id) : (a.v === 'pick' && a.pick === id);
  function paintPage() {
    $$('#cards article.q').forEach(art => {
      const a = state.answers[art.dataset.id] || {};
      art.querySelectorAll('.ans').forEach(b => b.classList.toggle('on', b.dataset.v === a.v && (a.v !== 'pick' || b.dataset.pick === a.pick) && (b.dataset.dk !== '1' || !!a.dk)));
      art.querySelectorAll('.card.variant').forEach(c => c.classList.toggle('on', chosen(a, c.dataset.pick)));
      const n = art.querySelector('.note');
      // Never while he is typing in it: assigning `value` puts the caret back at the end.
      if (n && document.activeElement !== n) n.value = a.note || '';
      if (n) n.placeholder = a.v === 'other' ? 'Explain what you’d like instead…' : 'Add a note (optional)';
      const w = art.querySelector('.ans-write');
      if (w && document.activeElement !== w) w.value = a.text || '';
      // An answered question takes the same green edge the mock-up used for `done`.
      art.classList.toggle('done', !!(a.v && a.v !== 'skip'));
      // Once he answers a topic he reopened, "Leave as answered" has nothing left to undo: it goes away at once.
      { const lv = art.querySelector(':scope > .growact'); if (lv) lv.hidden = touchedStep(stepById(art.dataset.id) || {}); }
      // WHY the time (Destin, 2026-11-09, rethink Q-6): when each question was answered is
      // worth more than cover-page copy. It is already in the answers file; this shows it.
      // WHY a pill (Destin, round 4: "answered status could be a top-right status pill instead
      // of plaintext and checkmark"): the design guide's shape for a status is a small tinted
      // pill; it now also says what a LIST's state is, which the old tick could not.
      const tk = art.querySelector('.qstate');
      if (tk) {
        const on = !!(a.v && a.v !== 'skip'), st = stepById(art.dataset.id) || {}, n = openRows(a) + (a.marks || []).length + Object.keys(a.results || {}).length;
        // WHY a list carries no pill until it has something to say (Destin, round 7: "this was an odd
        // interactive 'not reviewed' card i hadnt seen before?" and "this page also has 'not reviewed'
        // in the top right. what that mean?"). A list he has not touched is not "waiting" for anything:
        // it stands unless he changes it, so "Not reviewed" invented a task. It shows "2 changes" once
        // he has written something, or "Accepted" after he moves on. A background-only (`context`) list
        // never has a pill: there is nothing on it to accept or change. A QUESTION still says
        // "Not answered" / "Answered 12:47", because it does ask for something.
        // Round 10: a "Yours to change" list says nothing until he has ticked or changed a row, then "3 of 5 looked at" / "All looked at".
        const tk10 = tickable(st), seen10 = tk10 ? st.calls.length - unlooked(st).length : 0;
        const quiet = tk10 ? !seen10 : listy(st) && (!!st.context || (!n && !(a.accepted && a.v === 'yes')));
        tk.hidden = quiet; art.classList.toggle('nostate', quiet);
        tk.className = 'qstate ' + (tk10 ? (seen10 === st.calls.length ? 'ok' : 'none') : !on && !n ? 'none' : listy(st) && n ? 'chg' : 'ok');
        tk.textContent = quiet ? '' : tk10 ? (seen10 === st.calls.length ? 'All looked at' : seen10 + ' of ' + st.calls.length + ' looked at') : !on && !n ? 'Not answered' : listy(st) ? (n ? n + (n === 1 ? ' change' : ' changes') : 'Accepted') : 'Answered' + (a.t ? ' ' + clock(a.t) : '');
      }
    });
    // A segment is a PAGE: solid once every question on it is answered, half-lit while some are.
    $$('#steps span').forEach((seg, i) => {
      const on = pageSteps(i).filter(st => !st.context && !settled(st)), n = on.filter(isAnswered).length;
      // A page whose topics are all answered already (nothing asked) shows as complete.
      seg.className = ((on.length && n === on.length) || (!on.length && pageSteps(i).length) ? 'done' : n ? 'part' : '') + (i === cur ? ' on' : '');
    });
    const done = askedNow().filter(isAnswered).length;
    $('#count').textContent = 'page ' + (cur + 1) + ' of ' + PAGES.length + ' · ' + done + ' of ' + askedNow().length + ' answered' + (state.submitted ? ' · submitted, read-only' : '');
    // On a page the forward button is navigation, not "save this answer" — it is never disabled
    // for an unanswered question, because there are several of them on screen.
    $('#save').disabled = !!state.submitted; $('#save').textContent = cur === LAST ? 'Done' : 'Next page ›';
    $('#back').hidden = PAGES.length === 1; $('#back').disabled = cur === 0;
    $('#prev').disabled = cur === 0; $('#next').disabled = cur === LAST; $('#next').textContent = cur === LAST ? 'Last page' : 'Next ›';
  }

  // ── NOTES ABOUT ANYTHING ELSE ──────────────────────────────────────────────────────────
  // WHY (Destin, 2026-11-10, round 3: "there is no additional/separate notes button for me to
  // leave misc/unrelated comments/notes. so we should add something like that"): a thought
  // that belongs to no question had to be typed under whichever question was nearest. One
  // box saved as `notes` beside the answers. (Only picture-style decks show the header Notes button; question decks use the foot-of-page box.)
  document.addEventListener('input', e => {
    const pn = e.target.closest && e.target.closest('.pnote'); if (!pn || state.submitted) return;
    const all = { ...(state.pageNotes || {}) };
    if (pn.value.trim()) all[pn.dataset.page] = pn.value; else delete all[pn.dataset.page];
    if (Object.keys(all).length) state.pageNotes = all; else delete state.pageNotes;
    grow(pn); clearTimeout(noteTimer); noteTimer = setTimeout(save, 300);
  });
  const pageNoteList = () => (PAGES || []).map(p => [p.title, ((state.pageNotes || {})[p.id] || '').trim()]).filter(x => x[1]);
  const gnote = $('#gnote');
  $('#notesbtn').onclick = () => {
    const p = $('#notespanel'); p.hidden = !p.hidden;
    if (!p.hidden) { gnote.value = state.notes || ''; gnote.disabled = !!state.submitted; addMics(); grow(gnote); gnote.focus(); }
  };
  $('#notesx').onclick = () => { $('#notespanel').hidden = true; };
  gnote.addEventListener('input', () => {
    if (state.submitted) return;
    if (gnote.value.trim()) state.notes = gnote.value; else delete state.notes;
    paintNotes(); clearTimeout(noteTimer); noteTimer = setTimeout(save, 300);
  });
  const paintNotes = () => $('#notesbtn').classList.toggle('has', !!(state.notes || '').trim());
  function paintState() {
    paintNotes();
    if (PAGES) { paintPage(); paintStages(); paintCalls(); paintScreens(); paintPills(); return; }
    const a = state.answers[DECK.steps[cur].id] || {};
    $$('.ans').forEach(b => b.classList.toggle('on', b.dataset.v === a.v && (a.v !== 'pick' || b.dataset.pick === a.pick) && (b.dataset.dk !== '1' || !!a.dk)));
    $$('.card.variant').forEach(c => c.classList.toggle('on', chosen(a, c.dataset.pick)));
    $$('#inner .frame.pickable').forEach(f => f.classList.toggle('on', chosen(a, f.dataset.run)));
    const note = $('#note'); note.value = a.note || ''; note.placeholder = a.v === 'other' ? 'Explain what you’d like instead…' : 'Add a note (optional)';
    // Never while he is typing in it: assigning `value` would put the caret back at the end.
    const w = $('#answers .ans-write'); if (w && document.activeElement !== w) w.value = a.text || '';
    $$('#steps span').forEach((s, i) => { const x = state.answers[DECK.steps[i].id]; s.className = (x && x.v ? x.v : '') + (i === cur ? ' on' : ''); });
    const done = asked.filter(isAnswered).length;
    $('#count').textContent = 'step ' + (cur + 1) + ' of ' + N + ' · ' + done + ' answered' + (state.submitted ? ' · submitted, read-only' : '');   // survives every repaint (theme clicks included)
    // browsing a submitted deck must never re-arm Save & Next
    $('#save').disabled = !!state.submitted || !(a.v && a.v !== 'skip');
    $('#prev').disabled = cur === 0; $('#next').disabled = cur === N - 1; $('#next').textContent = cur === N - 1 ? 'Last step' : 'Next ›';
    paintCalls(); paintPills();
  }

  // ── layout: try each arrangement for real, keep the one that shows the pictures largest (spec §3.4) ──
  const PAD = 28, CAP = 24, GAP = 18;
  function layout() {
    if (PAGES) {   // the reading column: a block that scrolls, nothing to size against a picture
      // A contract step never reaches this branch: spec.pages() refuses a deck that defines or
      // grades done, so a contract is always drawn one step per screen (`.content.words`, whose
      // own `:has(.contract)` rule gives its table the full width). The `.pages.wide` column
      // this used to switch on was removed with it, 2026-09-05.
      $('#content').className = 'content pages'; $('#step').classList.remove('compact-step');
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
      // A side column needs real width; variant PICTURES need the full row (a decide step has only
      // one picture, so it keeps the column) — except three or more TALL designs, which the row's
      // cards below squeeze to ~180px each (close-session friction, proposal 16): beside a side
      // column they get the stage's whole height, so the column is scored for them too.
      if (opts[k].includes('col-right') && (c.clientWidth < 820 || (DECK.steps[cur].kind === 'choice' && !(n >= 3 && natH > natW)))) { score[k] = 0; continue; }
      if (n === 1 && opts[k].includes('stacked')) { score[k] = 0; continue; }                 // one picture: stacking means nothing
      if (DECK.steps[cur].kind === 'clip' && opts[k].includes('stacked')) { score[k] = 0; continue; }   // clips: side by side, or the two recordings can't be watched together
      c.className = 'content ' + opts[k]; const SW = stage.clientWidth - PAD, SH = stage.clientHeight - PAD; const stacked = opts[k].includes('stacked');
      score[k] = Math.min(stacked ? SW / w : (SW - GAP * (n - 1)) / n / w, stacked ? (SH - GAP * (n - 1)) / n / h : SH / h);
    }
    let best = 'A'; for (const k of ['B', 'C', 'D']) if (score[k] > score[best] * 1.05) best = k;   // A wins ties
    let s;
    // A clip pair is worth watching smaller: compact only under 30% (stills: 50%).
    // Two or more TALL pictures likewise: compact stacks them at full size, so only the top of
    // the first is on screen until you scroll — worse than both, shrunk, side by side (zoom
    // brings detail back). WHY (submit-ticket friction, proposal 10): every slide of a ~740px
    // popup shot at 1.5× scored ~40% side by side and stacked. Stacked layouts are not offered
    // to them, for the same reason.
    // A CHOICE likewise (close-session friction, proposal 8): its designs are only compared side
    // by side — stacked, a composite design (folded + opened) filled the width, the second sat
    // under the answer bar, and only one could be seen.
    const tall = n >= 2 && (natH > natW || DECK.steps[cur].kind === 'choice');
    if (tall) for (const k in opts) if (opts[k].includes('stacked')) score[k] = 0;
    if (tall) { best = 'A'; for (const k of ['C']) if (score[k] > score[best] * 1.05) best = k; }
    const floor = DECK.steps[cur].kind === 'clip' || tall ? 0.3 : 0.5;
    if (score[best] < floor) { c.className = 'content compact'; step.classList.add('compact-step'); s = Math.min((c.clientWidth - PAD) / w, 1); }
    else { c.className = 'content ' + opts[best]; s = Math.min(score[best], 1.5); }
    // Three or more TALL designs open at the width that fills the row, not the height: fitted
    // to the height they came out ~180-250px wide, readable only through the zoom (close-session
    // friction, proposal 16). Side by side, their tops line up; the stage scrolls for the rest.
    const wide3 = DECK.steps[cur].kind === 'choice' && n >= 3 && natH > natW && score[best] >= floor;
    if (wide3) { const SW = stage.clientWidth - PAD; s = Math.min(Math.max(s, (SW - GAP * (n - 1)) / n / w), 1.5); }
    document.body.dataset.fit = wide3 ? 'width' : '';
    $$('#inner img, #inner video').forEach(i => i.style.width = ((i.naturalWidth || i.videoWidth) * s * zoom) + 'px');
    $('#lvl').textContent = Math.round(zoom * 100) + '%';
    // Read by the render test: the choice, and the scores it was made from (so the test checks the RULE, not a table).
    // Fix (Destin, 2026-09-06): "option B seems to get cut off by other visually?" — the side
    // column scrolls, and its last card ended exactly at the answer row with no sign of more.
    // The class drives a fade over that row; re-checked whenever the column is laid out.
    markMore();
    document.body.dataset.layout = score[best] < floor ? 'compact' : best;
    document.body.dataset.scores = JSON.stringify(score);
    const b = $('#inner .frame .box'); if (b && zoom > 1) b.scrollIntoView({ block: 'center', inline: 'center' });
    window.__deckReady = true;   // the render test waits for this — set only once a real layout has been chosen
  }

  function markMore() {
    const info = $('#content .info'), dec = $('#content .decide');
    if (!info || !dec) return;
    const more = info.scrollHeight > info.clientHeight + 2 && info.scrollTop + info.clientHeight < info.scrollHeight - 2;
    dec.classList.toggle('more', more);
    if (!info.dataset.moreBound) { info.dataset.moreBound = '1'; info.addEventListener('scroll', markMore, { passive: true }); }
  }
  // ── navigation & answers ──
  function record() {
    const secs = Math.round((Date.now() - stepStart) / 1000);
    if (PAGES) {
      // Every question on the page was on screen for the same stretch of time, and there is no
      // moment that belongs to one of them — so the elapsed seconds are split evenly across them.
      const on = pageSteps(cur), each = on.length ? Math.round(secs / on.length) : 0;
      on.forEach(st => {
        if (settled(st)) return;   // no answer is written for a topic that is already answered
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
    if (GROWS && viewRecord) { viewRecord = false; }   // any page move leaves the record
    // Fix: after Submit, arrow keys / progress segments must not keep POSTing answers — but
    // they may still MOVE. A submitted deck is a read-only record he can page back through;
    // record()/save() are what must not run, not the navigation itself.
    if (state.submitted) { cur = Math.max(0, Math.min(LAST, i)); zoom = 1; hideFinished(); render(); return; }
    acceptLists(); record(); cur = Math.max(0, Math.min(LAST, i)); state.cur = cur; save(); zoom = 1; stepStart = Date.now(); render();
  }
  // Fix: save on EVERY answer, not only when the step changes — a tab closed on the last
  // answered step used to lose that answer entirely. The note debounces so a sentence typed
  // at speed is one POST, not one per keystroke.
  let noteTimer = null;
  $('#answers').addEventListener('click', e => { const b = e.target.closest('.ans'); if (b && !b.disabled) answer(b.dataset.v, b.dataset.pick, b.dataset.dk === '1'); });
  $('#answers').addEventListener('input', e => { const w = e.target.closest('.ans-write[data-id]'); if (w) writeAnswer(w.dataset.id, w.value); });
  $('#note').addEventListener('input', e => {
    if (PAGES) return;   // on a page the note lives on the question, not in the shared row
    const id = DECK.steps[cur].id; const a = { ...(state.answers[id] || {}), note: e.target.value };
    state.answers[id] = a; paintState(); clearTimeout(noteTimer); noteTimer = setTimeout(save, 300);
  });
  $('#save').onclick = () => { if (cur === LAST) openDialog(); else go(cur + 1); };
  $('#back').onclick = () => go(cur - 1);
  // From the finish screen, Prev means "back into the deck" — the step he left, not the one
  // before it; and there is nothing after the end, so Next is off there (see showFinished).
  const step = d => go(document.body.dataset.screen === 'finished' ? cur : cur + d);
  $('#next').onclick = () => step(1); $('#prev').onclick = () => step(-1);
  $$('#steps span').forEach((s, i) => s.onclick = () => go(i));

  // ── submit ──
  // WHY ONE function over a state (review 2026-11-10): the page and serve.py each printed their own
  // summary and they disagreed (counts in the header, the order of notes, "undefined" for an unknown
  // status). This mirrors serve.py's summary() line for line, takes the state as an argument, and is
  // exposed as window.__deckSummaryOf so a test can feed the SAME state to both and compare.
  function summaryOf(S) {
    const counts = { yes: 0, no: 0, other: 0, pick: 0, picks: 0, wrote: 0, skip: 0 }; const lines = [];
    const reopenedIn = S.reopened || {};
    for (const st of DECK.steps) {
      if (st.context) continue;   // a background-only list asks nothing: no answer, no line
      if (GROWS && st.grow && st.grow.answered && !reopenedIn[st.id]) continue;   // answered in an earlier round: nothing is asked, so nothing is summed
      const a = (S.answers || {})[st.id] || {}; const v = a.v || 'skip'; counts[v] = (counts[v] || 0) + 1;
      const what = v === 'pick' ? 'pick ' + (a.pick || '?') : v === 'picks' ? 'picks ' + (a.picks || []).join(', ') : v === 'wrote' ? 'wrote "' + String(a.text || '').trim() + '"' : (v === 'no' && st.variants ? 'none' : (v === 'other' && a.dk ? "don't know" : v));
      lines.push(st.id + ' ' + what + (a.note && a.note.trim() ? ' — "' + a.note.trim() + '"' : '') + extras(a) + tickWords(st, a));
    }
    const when = (S.submitted || '').slice(0, 16).replace('T', ' ');
    const head = DECK.key + ' · ' + (when ? 'submitted ' + when : 'not submitted') + ' · ' + counts.yes + ' yes · ' + counts.no + ' no · ' + counts.other + ' other · '
      + (counts.pick ? counts.pick + ' picked · ' : '') + (counts.picks ? counts.picks + ' multi-picked · ' : '') + (counts.wrote ? counts.wrote + ' written · ' : '') + counts.skip + ' skipped';
    // Page order, then any key the deck no longer has a page for (as serve.py does).
    const ids = (PAGES || []).map(pg => pg.id), titleOf = k => { const pg = (PAGES || []).find(x => x.id === k); return pg ? pg.title : k; };
    const keysOf = o => ids.filter(k => k in (o || {})).concat(Object.keys(o || {}).filter(k => !ids.includes(k)));
    let paged = keysOf(S.pageNotes).filter(k => String((S.pageNotes || {})[k] || '').trim()).map(k => 'about the page "' + titleOf(k) + '" — "' + String(S.pageNotes[k]).trim() + '"\n').join('');
    paged += keysOf(S.pageAttach).map(k => ((S.pageAttach || {})[k] || []).map(x => 'about the page "' + titleOf(k) + '" attached — ' + pillWords(x) + '\n').join('')).join('');
    const general = String(S.notes || '').trim();
    const gattached = (S.notesAttach || []).map(x => 'general notes attached — ' + pillWords(x) + '\n').join('');
    return head + '\n' + paged + (general ? 'general notes — "' + general + '"\n' : '') + gattached + lines.join('\n');
  }
  const summary = () => summaryOf(state);
  window.__deckSummaryOf = summaryOf;
  const pillWords = p => p.kind === 'image' ? 'picture "' + p.name + '" saved at ' + p.path : 'file ' + p.path;
  const attachLabel = k => k === 'note' ? 'his note' : k === 'text' ? 'his typed answer' : k.startsWith('change:') ? 'change ' + k.slice(7) : k;
  // Mirrors serve.py's extras(): lines he marked for change, and areas he marked on a picture.
  // Twin of serve.py tick_lines(): rows ticked as fine, and each row NOT looked at, by its own words.
  // WHY (round 10, R-2): a row he never ticked or changed is reported as "not looked at", never as approved.
  function tickWords(st, a) {
    if (!tickable(st)) return '';
    const n = st.calls.filter(c => rowState(a, c.id) === 'ok').length;
    return (n ? '\n    ticked as fine — ' + n + (n === 1 ? ' row' : ' rows') : '')
      + st.calls.filter(c => rowState(a, c.id) === 'unlooked').map(c => '\n    not looked at — "' + c.call + '"').join('');
  }
  function extras(a) {
    const out = [];
    for (const [k, v] of Object.entries(a.results || {})) out.push('\n    status ' + k + ' — he set it to ' + (RESULT[v] || v));
    for (const [k, t] of Object.entries(a.changes || {})) out.push('\n    change ' + k + ' — "' + String(t || '').trim() + '"');
    (a.asks || []).forEach(k => out.push('\n    more context wanted on ' + k));
    // {from, to} from a screen he retyped words on; a plain string from a round-3 wording row.
    for (const [k, t] of Object.entries(a.edits || {})) out.push(t && typeof t === 'object' ? '\n    reword "' + t.from + '" → "' + t.to + '"' + (t.state ? ' — seen with: ' + t.state : '') : '\n    reword ' + k + ' — "' + String(t || '').trim() + '"');
    (a.marks || []).forEach((m, i) => out.push('\n    area ' + (i + 1) + ' on ' + m.pic + ' (left ' + m.x + '%, top ' + m.y + '%, ' + m.w + '% wide, ' + m.h + '% tall) — "' + String(m.text || '').trim() + '"'));
    // Pictures and file paths he pasted into a box (round 7): the path is what a session opens.
    for (const [k, l] of Object.entries(a.attach || {})) (l || []).forEach(p => out.push('\n    attached to ' + attachLabel(k) + ' — ' + pillWords(p)));
    (a.marks || []).forEach((m, i) => (m.attach || []).forEach(p => out.push('\n    attached to area ' + (i + 1) + ' — ' + pillWords(p))));
    return out.join('');
  }
  function openDialog() {
    acceptLists(); paintState();
    record(); save();
    // Fix: record() already banked elapsed seconds into the current step's answer; without resetting
    // stepStart, a Done -> Keep reviewing -> Done round trip would add those seconds a second time.
    // paintState() repaints so a step that record() just marked "skip" turns grey immediately.
    stepStart = Date.now(); paintState();
    // Context lists are never "missing"; each missing one is named the way the page names it.
    // A "Yours to change" list is not a missing STEP; its unticked rows are named in their own warning below (round 10, R-2).
    const missing = askedNow().filter(st => { if (tickable(st)) return false; const v = (state.answers[st.id] || {}).v; return !v || v === 'skip'; });
    const lists = askedNow().filter(st => unlooked(st).length), nU = lists.reduce((n, st) => n + unlooked(st).length, 0);
    { const box = $('#unlooked'); box.style.display = nU ? 'flex' : 'none';
      // WHY plain names and the row's own words (round 10, R-2: "warn, list them, let me send anyway"): grouped by the page and list the screen shows; he can still send.
      const pt = st => PAGES ? ((PAGES.find(p => p.steps.includes(st.id)) || {}).title || '') : '';
      $('#unlookedn').textContent = nU + (nU === 1 ? ' row' : ' rows') + ' not looked at. They are sent as "not looked at", never as approved.';
      $('#unlookedl').innerHTML = lists.map(st => `<li><b>${esc(pt(st) ? pt(st) + ' · ' + st.headline : st.headline)}</b><ul>${unlooked(st).map(c => `<li>${esc(c.call)}</li>`).join('')}</ul></li>`).join(''); }
    $('#skipped').style.display = missing.length ? 'flex' : 'none';
    $('#skipn').textContent = missing.length + (missing.length === 1 ? ' step has' : ' steps have') + ' no answer (' + missing.map(whereOf).join('; ') + ').';
    // The list names steps ("2 steps have no answer") because a question is what he answers;
    // going there means opening the PAGE that question sits on.
    const pageOf = st => PAGES ? Math.max(0, PAGES.findIndex(p => p.steps.includes(st.id))) : DECK.steps.indexOf(st);
    const firstTo = missing.concat(lists).sort((x, y) => pageOf(x) - pageOf(y))[0];
    $('#first').style.display = firstTo ? 'inline-flex' : 'none'; $('#first').onclick = () => { $('#veil').classList.remove('on'); go(pageOf(firstTo)); };
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
    $$('.ans,.ans-write,#save,#note').forEach(e => e.disabled = true); $$('.pnote').forEach(e => e.disabled = true); paintState(); drawMarks();
  }

  // ── the finish screen ──
  // WHY it exists: Submit used to just close the dialog, leaving him on the last step with a
  // greyed-out button — the same thing a click that did nothing would look like. This is the
  // definitive end of the deck, and the read-back of what was sent.
  const ANS_LABEL = (st, a) => {
    const v = a.v || 'skip';
    if (tickable(st)) {
      const ch = openRows(a), un = st.calls.filter(c => rowState(a, c.id) === 'unlooked').length;
      return (ch ? ch + (ch === 1 ? ' change' : ' changes') : 'No changes') + (un ? ' · ' + un + ' not looked at' : '');
    }
    if (v === 'skip') return 'No answer';
    // Fix: a words QUESTION offers `options`, not the `variants`/`panes` pickList knows about, so
    // its answers read back on the finish screen as a bare id ("all-five-plus-new"). Look in both.
    // WHY the label alone (UX review 2026-11-10): the finish table printed the internal option id ("lead — …").
    const label = id => { const o = (pickList(st) || st.options || []).find(x => x.id === id); return o ? o.label : id; };
    if (v === 'pick') return label(a.pick);
    if (v === 'picks') return (a.picks || []).map(label).join('; ');
    if (v === 'wrote') return '“' + String(a.text || '').trim() + '”';
    if (listy(st) && v === 'other') { const n = openRows(a) + (a.marks || []).length + Object.keys(a.results || {}).length; return n + (n === 1 ? ' change' : ' changes'); }
    if (v === 'other' && (a.changes || a.asks)) return openRows(a) + ' flagged';
    if (v === 'other') return a.dk ? "Don't know" : 'Something else';
    if (v === 'no') return pickList(st) ? 'None of these' : noLabel(st);
    // WHY (UX review 2026-11-10): a list he moved past untouched was printed as "Yes, build it".
    if (listy(st)) return 'Left as listed';
    return yesLabel(st);
  };
  // Where a step is, in the numbering the page itself shows ("Question 3 of 3"), never a bare index.
  const whereOf = st => {
    if (!PAGES) return 'Step ' + (DECK.steps.indexOf(st) + 1);
    const pi = PAGES.findIndex(p => p.steps.includes(st.id)), qs = pageSteps(pi).filter(x => !listy(x));
    return 'Page ' + (pi + 1) + (listy(st) ? '' : ', Question ' + (qs.indexOf(st) + 1) + ' of ' + qs.length);
  };
  function renderResponses() {
    const counts = { yes: 0, no: 0, other: 0, pick: 0, skip: 0 };
    const rows = askedNow().map((st, i) => {
      const a = state.answers[st.id] || {}; const v = a.v || 'skip'; counts[v] = (counts[v] || 0) + 1;
      const note = [(a.note || '').trim()].concat(Object.entries(a.changes || {}).map(([k, t]) => k + ': ' + String(t || '').trim()), (a.asks || []).map(k => 'More context: ' + k), Object.entries(a.edits || {}).map(([k, t]) => t && typeof t === 'object' ? '“' + t.from + '” → “' + t.to + '”' + (t.state ? ' (seen with: ' + t.state + ')' : '') : k + ' reworded: ' + String(t || '').trim()),
        (a.marks || []).map((m, j) => 'Area ' + (j + 1) + ' on ' + m.pic + ': ' + String(m.text || '').trim()),
        Object.values(a.attach || {}).flat().concat((a.marks || []).flatMap(m => m.attach || [])).map(p => 'Attached: ' + p.name)).filter(Boolean).join(' · ');
      return `<tr><td class="n">${esc(whereOf(st))}</td>`
        + `<td class="step-cell">${esc(st.surface)}<p class="src">${esc(st.headline)}</p></td>`
        + `<td class="v" data-v="${esc(v)}">${esc(ANS_LABEL(st, a))}</td>`
        // WHY its own column (rethink Q-6): when he answered each one, without altering the answer text.
        + `<td>${note ? esc(note) : '<span class="src">—</span>'}</td>`
        + `<td class="src when">${a.t && v !== 'skip' ? esc(clock(a.t)) : '—'}</td>`
        + `</tr>`;
    }).join('');
    const general = (state.notes || '').trim();
    $('#responses').querySelector('tbody').innerHTML = pageNoteList().map(([t, n]) => `<tr><td class="n">+</td><td class="step-cell">About the page “${esc(t)}”</td><td class="v">—</td><td>${esc(n)}</td><td class="src when">—</td></tr>`).join('') + rows
      + (general ? `<tr><td class="n">+</td><td class="step-cell">Notes about anything else</td><td class="v">—</td><td>${esc(general)}</td><td class="src when">—</td></tr>` : '');
    const when = (state.submitted || '').slice(0, 16).replace('T', ' ');
    const parts = [counts.yes + ' yes', counts.no + ' no', counts.other + ' other'];
    if (counts.pick) parts.splice(2, 0, counts.pick + ' picked');
    if (counts.skip) parts.push(counts.skip + ' with no answer');
    const NA = askedNow().length; $('#fin-meta').textContent = NA + (NA === 1 ? ' step' : ' steps') + ' · ' + parts.join(' · ') + (when ? ' · submitted ' + when : '');
  }
  function showFinished() {
    renderResponses(); $('#step').hidden = true; $('#finished').hidden = false; document.body.dataset.screen = 'finished';
    // The header describes what is ON SCREEN. Left saying "Home · chat — step 3 of 3" it would
    // be labelling a step nobody is looking at. The progress strip stays: it is the summary at
    // a glance, and clicking a segment is still the way back into that step (a one-page deck hides the strip; `‹ Back to the deck` is its way back).
    $('#wtitle').textContent = DECK.title; $('#wsub').textContent = 'review complete';
    $('#count').textContent = 'all ' + askedNow().length + ' steps · read-only';
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
    // WHY more than boxes (review 2026-11-10): a focused proof video uses the arrows to seek; they paged the deck away (and accepted the lists left behind).
    if (e.target.closest && e.target.closest('input,textarea,select,video,audio,[contenteditable],[role=menu],[role=listbox]')) return;
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
    if (!DECK.live || e.origin !== LIVE_ORIGIN) return;
    const d = e.data;
    if (d?.type === 'youcoded:pane-theme' && typeof d.theme === 'string') {
      // WHY: mounting does not imply the requested palette has painted. The
      // renderer acknowledges after ThemeProvider writes it, so preview can
      // refuse a pane whose first screenshot still wears its URL's old theme.
      const f = $$('#inner iframe').find(x => x.contentWindow === e.source);
      if (f && d.theme === theme) {
        f.dataset.appliedTheme = d.theme;
      } else if (f && Number(f.dataset.themeRetries || 0) < 3) {
        // WHY: an offscreen pane can acknowledge its initial default AFTER
        // our load-time theme request; ThemeProvider's async initial restore
        // overwrites that request. Retry on its painted-theme acknowledgement,
        // never claim readiness from the earlier size report.
        f.dataset.themeRetries = String(Number(f.dataset.themeRetries || 0) + 1);
        try { f.contentWindow.postMessage({ type: 'youcoded:theme', theme }, LIVE_ORIGIN); } catch (err) { /* gone */ }
      }
      return;
    }
    if (!d || d.type !== 'youcoded:pane-height' || !(d.height > 0)) return;
    const st = DECK.steps[cur];
    if (st.kind !== 'live') return;
    // contentWindow identity, not the id in the payload: it is the only thing that cannot be
    // wrong when four panes report independently. The id is the fallback if the frame moved.
    const panes = $$('#inner iframe');
    const f = panes.find(x => x.contentWindow === e.source) || panes.find(x => x.dataset.pane === d.candidate);
    if (!f) return;
    // WHY: layout readiness predates the async app in each frame. Preview must
    // wait for THIS mounted report before photographing a live pane, including
    // a pane whose height is explicitly fixed by its deck.
    const firstMount = f.dataset.mounted !== 'true';
    // The pane's address carries the deck's FIRST theme, baked at build time — so a live step
    // opened while the deck is on any other theme (switched on an earlier step, or ?theme= in
    // the URL) showed Midnight panes inside a Light deck. Answering its height report is the
    // right moment to correct that: the pane has MOUNTED and is listening. The iframe's own
    // `load` event is not — it fires before the app's async boot installs the listener, and
    // the message is dropped silently (tried that first, 2026-09-01).
    try { f.contentWindow.postMessage({ type: 'youcoded:theme', theme }, LIVE_ORIGIN); } catch (err) { /* gone */ }
    f.dataset.mounted = 'true';
    // WHY: the first layout sent fluid width before the iframe installed its
    // listener. Its requested-width cache must be cleared ONCE after mount, or
    // the candidate stays at min width inside a wider allocated pane.
    if (firstMount) delete f.dataset.askedWidth;
    // NOT capped at the stage. It was, and a 494px design in a 380px stage lost its bottom
    // 114px — Destin saw a permissions list sliced mid-item (2026-09-01). A pane that scrolls
    // inside itself is worse than a stage that scrolls: the inner scrollbar reads as part of
    // the design, and a design you cannot see all of is not a design you can judge. The stage
    // is `overflow:auto` already, so a tall pane makes the STAGE scroll and stays whole.
    if (!st.height) f.style.height = Math.max(MIN_PANE_H, d.height) + 'px'; // declared height wins
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
  // ── AREAS: drag a rectangle on any picture and comment on it ───────────────────────────
  // WHY (Destin, 2026-11-09, rethink Q-5: "rectangular drag-regions instead of single-dot
  // pins? so i could highlight any size rectangle within an image and comment on it"). A note
  // box cannot say WHERE. Dragging on a picture draws a numbered rectangle and opens a comment
  // box for it; the answers file keeps the rectangle as percentages of the picture, so the
  // session reading it knows exactly which part he meant. A plain click still does what it
  // did (open the picture, pick a design); only a drag makes an area.
  function wireMarks() {
    const one = (box, sid, pic) => { box.classList.add('markable'); box.dataset.sid = sid; box.dataset.pk = pic; };
    $$('.qpic > a').forEach(a => {
      if (a.closest('.card.calls') && !a.dataset.pk) return;
      const art = a.closest('article.q'), opt = a.closest('.card.variant');
      one(a, art ? art.dataset.id : DECK.steps[cur].id, a.dataset.pk || (opt ? 'option ' + opt.dataset.pick : 'the picture'));
    });
    if (!PAGES && !['clip', 'live'].includes(DECK.steps[cur].kind))
      $$('#inner .frame .pic').forEach(p => { if (p.querySelector('img')) one(p, DECK.steps[cur].id, p.closest('.frame').dataset.run); });
    // One list of comments per step: before the answer row on a page, atop the cards otherwise.
    // WHY not for pictures inside an Attachments card (round 7): their comments sit under the
    // picture itself, so a second list at the top of the page would show every comment twice.
    [...new Set($$('.markable').filter(b => !b.closest('.attcard')).map(b => b.dataset.sid))].forEach(sid => {
      if ($(`.marklist[data-sid="${CSS.escape(sid)}"]`)) return;
      const l = document.createElement('div'); l.className = 'marklist'; l.dataset.sid = sid;
      const art = $(`#cards article.q[data-id="${CSS.escape(sid)}"]`);
      if (art) art.insertBefore(l, art.querySelector('.qrow')); else $('#cards').prepend(l);
    });
    drawMarks();
  }
  function drawMarks() {
    $$('.markable .mark').forEach(m => m.remove());
    $$('.markable').forEach(box => ((state.answers[box.dataset.sid] || {}).marks || []).forEach((m, i) => {
      if (m.pic !== box.dataset.pk) return;
      const el = document.createElement('span'); el.className = 'mark';
      el.style.cssText = `left:${m.x}%;top:${m.y}%;width:${m.w}%;height:${m.h}%`; el.innerHTML = `<b>${i + 1}</b>`;
      box.appendChild(el);
    }));
    $$('.marklist').forEach(l => {
      const sid = l.dataset.sid, marks = (state.answers[sid] || {}).marks || [];
      l.innerHTML = marks.length
        ? marks.map((m, i) => `<div class="markrow"><b>${i + 1}</b><textarea class="markt" rows="1" data-sid="${esc(sid)}" data-i="${i}" placeholder="What about this area?"${state.submitted ? ' disabled' : ''}>${esc(m.text || '')}</textarea><button type="button" class="markx" data-sid="${esc(sid)}" data-i="${i}" title="Remove this area" aria-label="Remove this area"${state.submitted ? ' disabled' : ''}>${BIN}</button></div>`).join('')
        : (state.submitted ? '' : '<p class="markhint">Drag across any part of the picture to comment on that area.</p>');
    });
    paintViewer(); paintAtt();
    addMics(); paintPills();
  }
  function removeMark(sid, i) {
    if (state.submitted) return;
    const a = state.answers[sid]; if (!a || !a.marks) return;
    a.marks.splice(i, 1); if (!a.marks.length) delete a.marks;
    // WHY (review 2026-11-10): the last area gone left the answer stuck on "Other" with nothing
    // behind it. Same rule every other way of taking a thing back already follows.
    if (a.v === 'other' && !openRows(a) && !(a.marks || []).length && !Object.keys(a.results || {}).length) delete a.v;
    paintState(); drawMarks(); save();
  }
  // ── A picture opens large INSIDE the deck ──────────────────────────────────────────────
  // WHY (Destin, 2026-11-10, round 3: "tapping the image briefly once opens it in a separate
  // tab, which is strange/unexpected behaviour"). The large view sits over the page; areas can
  // be dragged on it exactly as on the small one — easier, in fact, since it is bigger — and the
  // Close button, or Esc, closes it.
  // ── The top of the first page: what changed since last round, and the related decks ────────
  // WHY (Destin, rounds 2 and 6: "new first, settled folded below", new items marked, and on return
  // "only what changed"; and "a list at the top of a deck, with one line on how each relates"). One
  // line counts the items by state and each count jumps to the first such item; the related decks
  // follow, each with its one line.
  const stateItems = () => {
    const out = [];
    DECK.steps.forEach(st => {
      if (st.kind === 'calls') st.calls.forEach(c => { if (c.state) out.push({ state: c.state, sid: st.id, cid: c.id }); });
      else if (st.state) out.push({ state: st.state, sid: st.id, cid: '' });
    });
    return out;
  };
  // WHY one plain sentence (round 8, Destin: "the linked underline text at the top of the page" is not an app part):
  // the group headings inside each list do the navigating now, so this is only a count.
  function topNotes() {
    const items = stateItems(), n = k => items.filter(i => i.state === k).length;
    const parts = [n('new') + ' new', n('changed') + ' changed', n('settled') + ' settled'].filter((_, i) => n(['new', 'changed', 'settled'][i]));
    const rel = DECK.related || [];
    if (!parts.length && !rel.length) return '';
    return `<section class="topnotes">`
      + (parts.length ? `<p class="since">Since last round: ${parts.join(', ')}.</p>` : '')
      + (rel.length ? `<div class="reltop"><p class="dh">Related decks</p><ul>${rel.map(r => `<li><a class="btn sm" href="${esc(r.href)}" target="_blank" rel="noopener">${esc(r.title)}</a>${r.how ? `<span class="relhow">${esc(r.how)}</span>` : ''}</li>`).join('')}</ul></div>` : '')
      + `</section>`;
  }
  // ── HISTORY: earlier rounds of this topic, and related decks ───────────────────────────
  // WHY (Destin, round 2 R-10 "evolving deck, new first", R-11 "Related list"; round 4 N-1
  // "build it next"): each round was a separate link and what he had already said was out of
  // sight. The header's History button opens every earlier round (newest first) with each
  // question and his own answer and comments, and the list of related decks. Read-only.
  if ((DECK.history || []).length || (DECK.related || []).length) {
    const hb = $('#histbtn'); hb.hidden = false;
    hb.textContent = 'History' + ((DECK.history || []).length ? ' (' + DECK.history.length + ')' : '');
    hb.onclick = () => {
      if ($('.histpanel')) { $('.histpanel').remove(); return; }
      const p = document.createElement('div'); p.className = 'histpanel';
      const round = (r, i) => {
        let page = null;
        const rows = r.items.map(it => {
          const head = it.page !== page ? `<h4>${esc(page = it.page)}</h4>` : '';
          return head + `<div class="histrow"><p class="hq">${esc(it.headline)}</p>${it.answer ? `<span class="hans">${esc(it.answer)}</span>` : ''}${it.notes.map(n => `<p class="decided">${esc(n)}</p>`).join('')}</div>`;
        }).join('');
        return `<details class="fold"${i === 0 ? ' open' : ''}><summary class="foldhead"><span class="foldtitle">${esc(r.title)}</span><span class="foldchips"><span class="fchip">${r.when ? 'answered ' + esc(r.when) : 'not submitted'}</span></span><span class="foldfill"></span>${CHEV}</summary>${rows || '<p class="hint">Nothing was answered.</p>'}</details>`;
      };
      p.innerHTML = `<div class="vbar"><span class="vtitle">History of this topic</span><button type="button" class="btn sm histx">Close</button></div><div class="histbody">`
        + ((DECK.related || []).length ? `<section><h3>Related</h3><ul class="histrel">${DECK.related.map(r => `<li><a class="btn sm" href="${esc(r.href)}" target="_blank" rel="noopener">${esc(r.title)}</a></li>`).join('')}</ul></section>` : '')
        + ((DECK.history || []).length ? `<section><h3>Earlier rounds, newest first</h3>${DECK.history.map(round).join('')}</section>` : '') + `</div>`;
      document.body.appendChild(p);
      p.querySelector('.histx').onclick = () => p.remove();
    };
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('.histpanel')) $('.histpanel').remove(); });
  }
  // ── THE PICTURE VIEWER ──────────────────────────────────────────────────────────────────
  // WHY (Destin, round 4: pictures "rendered far too small to be useful… i just need to have
  // more space and a better surface to actually leave/manage comments and such and quickly
  // scan through all of the changes at once"; and on the old large view, which closed as soon
  // as an area was drawn: "we can make a much better and more useful/intuitive surface for
  // image comments to be edited/saved/viewed"). A click on any picture opens the viewer over
  // the whole window: the picture as large as fits, its comments beside it (drawn areas, each
  // with its box, added and taken away without leaving), and a strip of every picture on the
  // page underneath, so he can go through all of them with the arrow keys.
  // WHY one picture, no arrows, no strip (Destin, 2026-11-10, round 7: the viewer was "still deeply
  // odd… the arrows that let me click between pictures are weird cuz they fully lose the context
  // of the question each picture is connected to and its purpose"). Pictures in a row now live in
  // that row's Attachments card, large, so this window only enlarges ONE picture of a written
  // question — with the question's own words as its title and its comments beside it — and
  // never walks on to another question's picture.
  let viewA = null, armed = false;
  // A finger (or a pen on a tablet), as opposed to a mouse. `?touch=1` lets a test or a desktop preview act as one.
  const COARSE = /[?&]touch=1/.test(location.search) || (window.matchMedia && matchMedia('(pointer:coarse)').matches);
  const picTitle = a => {
    const cap = a.parentElement.querySelector('figcaption'), art = a.closest('article.q');
    return { what: art ? art.querySelector('.qh').textContent : '', cap: cap ? cap.textContent : '' };
  };
  // WHY one description for both openers (round 8, Destin: a tile "should open our popup image
  // screen/comment menu"): an Attachments tile is a button carrying its picture's address; a
  // question's picture is a link. The window needs the same six facts from either.
  const picOf = el => el.classList.contains('atttile')
    ? { sid: el.dataset.sid, pk: el.dataset.pk, src: el.dataset.src, video: el.dataset.video === '1',
        // A clip cannot be pointed at (the area would point at nothing), and a background-only list is never answered.
        markable: el.dataset.video !== '1' && !el.closest('.card.calls.context'),
        what: (el.closest('.call').querySelector('.callwhat') || {}).textContent || '', cap: el.dataset.name }
    : Object.assign({ sid: el.dataset.sid || '', pk: el.dataset.pk || '', src: el.getAttribute('href'), video: false, markable: el.classList.contains('markable') }, picTitle(el));
  function openBig(a) {
    viewA = a;
    let v = $('.viewer');
    if (!v) {
      v = document.createElement('div'); v.className = 'viewer';
      // WHY true size (Destin, 2026-11-11, round 8: "it's literally completely impossible to read any of this
      // text… far too small and zoomed out… 90% of this popup page is unused dead space"; round 9, V-1: he
      // picked "comments in a strip at the right"). The picture used to be shrunk until all of it fitted the
      // window, so a tall screenshot became a thin unreadable column. It now opens at its real size and the
      // picture area scrolls; "Fit" squeezes it back to the window's width for an overview. Before/After is a
      // switch in the header instead of two separate popups, and the close is the app's ×.
      v.innerHTML = `<div class="vbar"><span class="vtitle"></span><span class="vpair seg" hidden></span>`
        + `<span class="vzoom seg"><button type="button" class="segb on" data-zoom="true">True size</button><button type="button" class="segb" data-zoom="fit">Fit</button></span>`
        + `<button type="button" class="iconbtn vclose" title="Close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`
        + `<div class="vmain"><div class="vstage"><div class="lbbox"></div></div>`
        + `<aside class="vside"><p class="vabout"></p><h3>Comments on this picture</h3><button type="button" class="btn sm varm" hidden>Comment on an area</button><div class="vcomments"></div></aside></div>`;
      document.body.appendChild(v);
    }
    paintViewer(); drawMarks();
  }
  function paintViewer() {
    const v = $('.viewer'); if (!v) return;
    if (!viewA || !viewA.isConnected) { closeBig(); return; }
    const a = picOf(viewA), box = v.querySelector('.lbbox');
    if (box.dataset.src !== a.src) {
      box.dataset.src = a.src;
      box.innerHTML = a.video ? `<video src="${esc(a.src)}" controls preload="metadata" playsinline></video>` : `<img src="${esc(a.src)}" alt="">`;
    }
    box.classList.toggle('markable', a.markable); box.dataset.sid = a.sid; box.dataset.pk = a.pk;
    // WHY (round 10, on the popup's top line: "what is this? a title? desctption?… if its a title, should be
    // shorter. if description, should be in its own spot"): the title is the picture's short name; the row or
    // question it belongs to is said once, in its own box at the head of the comments strip.
    v.querySelector('.vtitle').textContent = a.cap || 'Picture';
    v.querySelector('.vabout').textContent = a.what;
    // The row's other picture (Before beside After) is one press away, in the same popup.
    const sibs = viewA.classList.contains('atttile') ? [...viewA.parentElement.querySelectorAll('.atttile')] : [];
    const pair = v.querySelector('.vpair'); pair.hidden = sibs.length < 2;
    pair.innerHTML = sibs.length < 2 ? '' : sibs.map((t, i) => `<button type="button" class="segb${t === viewA ? ' on' : ''}" data-sib="${i}">${esc(t.dataset.name)}</button>`).join('');
    // WHY a button on touch screens (Destin, round 9, Q-4: "Tap a 'Comment on an area' button, then drag"):
    // with a finger, any drag on a picture drew an area, so scrolling a large picture meant aiming for the gaps.
    const arm = v.querySelector('.varm'); arm.hidden = !(COARSE && a.markable && !state.submitted);
    arm.classList.toggle('on', armed); arm.textContent = armed ? 'Now drag on the picture' : 'Comment on an area';
    box.classList.toggle('armed', armed);
    v.querySelector('.vside h3').textContent = a.video ? 'Comments on this clip' : 'Comments on this picture';
    const marks = (state.answers[a.sid] || {}).marks || [];
    // Only this picture's areas, under the numbers they carry on the picture.
    const mine = marks.map((m, i) => [m, i]).filter(x => x[0].pic === a.pk);
    const side = v.querySelector('.vcomments'), act = document.activeElement;
    // Never rebuilt under his caret: typing in a comment repaints the page, and would lose his place.
    if (!(act && act.closest && act.closest('.vcomments') && side.querySelectorAll('.markrow').length === mine.length))
      side.innerHTML = mine.map(([m, i]) => `<div class="markrow"><b>${i + 1}</b><textarea class="markt" rows="2" data-sid="${esc(a.sid)}" data-i="${i}" placeholder="What about this area?"${state.submitted ? ' disabled' : ''}>${esc(m.text || '')}</textarea><button type="button" class="markx" data-sid="${esc(a.sid)}" data-i="${i}" title="Take this comment away" aria-label="Take this comment away"${state.submitted ? ' disabled' : ''}>${BIN}</button></div>`).join('')
        + `<p class="markhint">${a.video ? 'To comment on a clip, use the pencil on its row.' : !a.markable || state.submitted ? '' : mine.length ? (COARSE ? 'Tap the button, then drag, to add another.' : 'Drag across another part to add a comment.') : (COARSE ? 'Tap the button above, then drag across a part of the picture.' : 'Drag across any part of the picture to comment on it.')}</p>`;
  }
  function closeBig() { const v = $('.viewer'); if (v) v.remove(); viewA = null; armed = false; }
  document.addEventListener('click', e => {
    if (!e.target.closest) return;
    const v = e.target.closest('.viewer');
    if (v) {
      const x = e.target.closest('.markx');
      const sib = e.target.closest('.vpair .segb'), zm = e.target.closest('.vzoom .segb');
      if (e.target.closest('.vclose')) { closeBig(); drawMarks(); }
      else if (sib) { viewA = [...viewA.parentElement.querySelectorAll('.atttile')][+sib.dataset.sib] || viewA; paintViewer(); drawMarks(); v.querySelector('.vstage').scrollTo(0, 0); }
      else if (zm) { v.classList.toggle('fit', zm.dataset.zoom === 'fit'); v.querySelectorAll('.vzoom .segb').forEach(b => b.classList.toggle('on', b === zm)); }
      else if (e.target.closest('.varm')) { armed = !armed; paintViewer(); }
      else if (x && !x.disabled) { removeMark(x.dataset.sid, +x.dataset.i); }   // WHY no early clearing (review 2026-11-10): removeMark repaints the list; clearing first emptied the view even when the removal was refused after Submit
      return;
    }
    const tile = e.target.closest('.atttile'); if (tile) { openBig(tile); return; }
    const a = e.target.closest('.qpic > a'); if (!a) return;
    e.preventDefault();
    openBig(a);
  });
  document.addEventListener('input', e => {
    const mt = e.target.closest && e.target.closest('.viewer .markt'); if (!mt || state.submitted) return;
    const m = ((state.answers[mt.dataset.sid] || {}).marks || [])[+mt.dataset.i];
    if (m) { m.text = mt.value; grow(mt); clearTimeout(noteTimer); noteTimer = setTimeout(save, 300); }
  });
  document.addEventListener('keydown', e => { if ($('.viewer') && e.key === 'Escape') { closeBig(); drawMarks(); } });
  let drag = null, swallowClick = false;
  const pct = n => Math.round(n * 10) / 10;
  document.addEventListener('pointerdown', e => {
    if (state.submitted || e.button !== 0 || !e.target.closest) return;
    const img = e.target.closest('.markable img'); if (!img) return;
    // On a touch screen a drag scrolls, unless he tapped "Comment on an area" first (round 9, Q-4).
    if (COARSE && !armed) return;
    drag = { box: img.closest('.markable'), r: img.getBoundingClientRect(), x0: e.clientX, y0: e.clientY, el: null, id: e.pointerId };
    e.preventDefault();   // otherwise the browser starts dragging the image itself
  });
  document.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.el) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;   // a shaky click is still a click
      drag.el = document.createElement('span'); drag.el.className = 'mark live'; drag.box.appendChild(drag.el);
      loupe.style.display = 'none';
    }
    const r = drag.r, cx = v => Math.max(r.left, Math.min(r.right, v)), cy = v => Math.max(r.top, Math.min(r.bottom, v));
    const x1 = cx(drag.x0), x2 = cx(e.clientX), y1 = cy(drag.y0), y2 = cy(e.clientY);
    drag.rect = { x: pct((Math.min(x1, x2) - r.left) / r.width * 100), y: pct((Math.min(y1, y2) - r.top) / r.height * 100),
                  w: pct(Math.abs(x2 - x1) / r.width * 100), h: pct(Math.abs(y2 - y1) / r.height * 100) };
    drag.el.style.cssText = `left:${drag.rect.x}%;top:${drag.rect.y}%;width:${drag.rect.w}%;height:${drag.rect.h}%`;
  });
  // WHY (review 2026-11-10): a touch the browser took over for scrolling ends in pointercancel; without
  // this the drag stayed "on" and the next move anywhere drew a stray area.
  document.addEventListener('pointercancel', () => { const d = drag; drag = null; if (d && d.el) d.el.remove(); });
  document.addEventListener('pointerup', () => {
    const d = drag; drag = null; if (!d || !d.el) return;
    armed = false;   // one tap of the button buys one area
    d.el.remove(); swallowClick = true; setTimeout(() => { swallowClick = false; }, 0);
    // WHY 3% (UX review 2026-11-10): a 1% x 2% slip left a barely visible dot that counted as an answer.
    if (!d.rect || d.rect.w < 3 || d.rect.h < 3) return;
    const sid = d.box.dataset.sid, a = { ...(state.answers[sid] || {}) };
    a.marks = (a.marks || []).concat([{ pic: d.box.dataset.pk, ...d.rect, text: '' }]);
    // An area with a comment IS a response; with no button pressed it counts as "something else".
    if (!a.v || a.v === 'skip') a.v = 'other';
    state.answers[sid] = a; paintState(); drawMarks(); save();
    // Drawn in the viewer: it stays open and the new comment's box, beside the picture, takes the caret.
    const boxes = $$(`${$('.viewer') ? '.viewer ' : ''}.markt[data-sid="${CSS.escape(sid)}"]`); if (boxes.length) boxes[boxes.length - 1].focus();
  });
  // The click that ends a drag must not also open the picture or pick the design under it.
  document.addEventListener('click', e => { if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); } }, true);
  // ── PICTURES AND FILE PATHS IN ANY COMMENT BOX, AS PILLS ──────────────────────────────
  // WHY (Destin, 2026-11-10, round 7: "i need to be able to attach/paste images/filepaths in these
  // input boxes and have them work as pills like youcoded"). The app's message box turns a picture
  // into a small card with its name and an x (AttachmentChip.tsx) and a file path into a recessed
  // pill with the file's name (FilepathToken.tsx); the deck's boxes now do the same. A pasted or
  // dropped picture is saved by the deck server beside the spec (POST /attach) and the pill keeps
  // where it is; a pasted path becomes a pill showing the file's name, the full path on hover.
  // The pills are saved WITH the box they sit under, so the session reading the answers sees them:
  //   answers[step].attach["note" | "text" | "change:<row id>"] = [pill, ...]
  //   answers[step].marks[i].attach = [pill, ...]      (an area's own box)
  //   pageAttach[page id] = [pill, ...]   notesAttach = [pill, ...]
  //   pill = {kind: "image", name, path, url} | {kind: "path", name, path}
  const BOX_SEL = 'textarea.note, input.note, textarea.ans-write, textarea.callt, textarea.markt, textarea.pnote';
  const baseName = p => String(p).replace(/\\/g, '/').split('/').filter(Boolean).pop() || String(p);
  const FILE_GLYPH = '<svg class="pg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
  const IMG_GLYPH = '<svg class="pg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.5-3.5L11 18"/></svg>';
  // Where a box keeps its pills, found from the box alone, so a paste needs no bookkeeping.
  function slotOf(el) {
    if (el.id === 'gnote') return { get: () => state.notesAttach || [], set: l => { if (l.length) state.notesAttach = l; else delete state.notesAttach; } };
    if (el.classList.contains('pnote')) {
      const p = el.dataset.page;
      return { get: () => (state.pageAttach || {})[p] || [], set: l => {
        const all = { ...(state.pageAttach || {}) }; if (l.length) all[p] = l; else delete all[p];
        if (Object.keys(all).length) state.pageAttach = all; else delete state.pageAttach; } };
    }
    if (el.classList.contains('markt')) {
      const sid = el.dataset.sid, i = +el.dataset.i, m = () => ((state.answers[sid] || {}).marks || [])[i];
      return { get: () => (m() || {}).attach || [], set: l => { const x = m(); if (!x) return; if (l.length) x.attach = l; else delete x.attach; } };
    }
    let sid, key;
    if (el.classList.contains('callt')) { sid = el.dataset.sid; key = 'change:' + el.dataset.call; }
    else if (el.classList.contains('ans-write')) { sid = el.dataset.id; key = 'text'; }
    else if (el.classList.contains('note')) { sid = el.dataset.id || (PAGES ? '' : DECK.steps[cur].id); key = 'note'; }
    if (!sid || !key) return null;
    return { get: () => ((state.answers[sid] || {}).attach || {})[key] || [], set: l => {
      const a = { ...(state.answers[sid] || {}) }, at = { ...(a.attach || {}) };
      if (l.length) at[key] = l; else delete at[key];
      if (Object.keys(at).length) a.attach = at; else delete a.attach;
      state.answers[sid] = a; } };
  }
  const pillHtml = (p, i, ro) => {
    const x = ro ? '' : `<button type="button" class="px" data-i="${i}" title="Take this away" aria-label="Take ${esc(p.name)} away">×</button>`;
    return p.kind === 'image'
      ? `<span class="attpill img" title="${esc(p.path)}"><span class="pthumb">${IMG_GLYPH}<img src="${esc(p.url || '')}" alt=""></span><span class="nm">${esc(p.name)}</span>${x}</span>`
      : `<span class="attpill file" title="${esc(p.path)}">${FILE_GLYPH}<span class="nm">${esc(p.name)}</span>${x}</span>`;
  };
  function pillsWrap(box, make) {
    let w = box._pills;
    if (w && w.isConnected) return w;
    if (!make) return null;
    w = document.createElement('div'); w.className = 'attpills'; w._box = box; box._pills = w;
    (box.closest('.pnotebox') ? box.closest('.pagenote') : box.parentElement).appendChild(w);
    return w;
  }
  function paintPills() {
    $$(BOX_SEL).forEach(box => {
      const slot = slotOf(box); if (!slot) return;
      const list = slot.get(), w = pillsWrap(box, list.length > 0 || !!box._pillMsg); if (!w) return;
      const sig = JSON.stringify(list) + (state.submitted ? '|ro|' : '|') + (box._pillMsg || '');
      if (w._sig === sig) return; w._sig = sig;
      w.hidden = !list.length && !box._pillMsg;
      w.innerHTML = list.map((p, i) => pillHtml(p, i, !!state.submitted)).join('') + (box._pillMsg ? `<p class="micerr">${esc(box._pillMsg)}</p>` : '');
    });
  }
  const pillMsg = (box, msg) => { box._pillMsg = msg; paintPills(); };
  async function addImage(box, file) {
    const slot = slotOf(box); if (!slot) return;
    // Said plainly: a deck opened as a plain file has no server to keep a picture, and a paste
    // that silently did nothing would look broken.
    if (!server) { pillMsg(box, 'This page is open as a plain file, not from the deck server, so a pasted picture has nowhere to be saved. Open the deck from its link to paste pictures; a file path can still be pasted.'); return; }
    pillMsg(box, 'Adding the picture…');
    try {
      const r = await fetch('/attach?name=' + encodeURIComponent(file.name || 'pasted picture'), { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'the server answered ' + r.status);
      slot.set(slot.get().concat([{ kind: 'image', name: d.name, path: d.path, url: d.url }]));
      box._pillMsg = ''; paintPills(); save();
    } catch (e) { pillMsg(box, 'The picture was not added: ' + ((e && e.message) || e)); }
  }
  // A path starts with / or ~/, runs on one line, and has a name straight after the slash
  // ("/ and then some words" is a sentence, not a path).
  const looksLikePath = t => t.length > 1 && t.length <= 1024 && !/[\r\n]/.test(t) && /^(~\/|\/)[^\s/]/.test(t);
  function addPath(box, text) {
    const slot = slotOf(box); if (!slot) return;
    const have = slot.get(); if (have.some(p => p.path === text)) return;
    slot.set(have.concat([{ kind: 'path', name: baseName(text), path: text }])); box._pillMsg = ''; paintPills(); save();
  }
  document.addEventListener('paste', e => {
    const box = e.target.closest && e.target.closest(BOX_SEL); if (!box || state.submitted || !slotOf(box) || !e.clipboardData) return;
    const imgs = [...(e.clipboardData.files || [])].filter(f => /^image\//.test(f.type));
    if (imgs.length) { e.preventDefault(); imgs.forEach(f => addImage(box, f)); return; }
    const t = (e.clipboardData.getData('text') || '').trim();
    if (looksLikePath(t)) { e.preventDefault(); addPath(box, t); }
  }, true);
  // WHY every file drag is claimed (review 2026-11-10): a file dropped anywhere but a box made the
  // browser open it in this tab, taking the deck (and an unsaved note) away.
  const hasFiles = e => [...(e.dataTransfer ? e.dataTransfer.types : [])].includes('Files');
  document.addEventListener('dragover', e => { if (hasFiles(e)) { e.preventDefault(); const box = e.target.closest && e.target.closest(BOX_SEL); if (!(box && !state.submitted && slotOf(box)) && e.dataTransfer) e.dataTransfer.dropEffect = 'none'; } });
  document.addEventListener('drop', e => {
    if (hasFiles(e)) e.preventDefault();
    const box = e.target.closest && e.target.closest(BOX_SEL); if (!box || state.submitted || !slotOf(box) || !e.dataTransfer) return;
    const files = [...(e.dataTransfer.files || [])];
    if (files.length) {
      e.preventDefault();
      const imgs = files.filter(f => /^image\//.test(f.type));
      imgs.forEach(f => addImage(box, f));
      if (!imgs.length) pillMsg(box, 'Only pictures can be dropped here. For another kind of file, paste its path.');
      return;
    }
    const t = (e.dataTransfer.getData('text') || '').trim();
    if (looksLikePath(t)) { e.preventDefault(); addPath(box, t); }
  });
  document.addEventListener('click', e => {
    const x = e.target.closest && e.target.closest('.attpills .px'); if (!x || state.submitted) return;
    const box = x.closest('.attpills')._box, slot = box && slotOf(box); if (!slot) return;
    slot.set(slot.get().filter((_, i) => i !== +x.dataset.i)); paintPills(); save();
  });
  // After submit the server stops, so a thumbnail may no longer load: fall back to the glyph.
  document.addEventListener('error', e => { if (e.target.matches && e.target.matches('.attpill img')) e.target.classList.add('gone'); }, true);
  // ── VOICE: speak into any text box ─────────────────────────────────────────────────────
  // WHY (Destin, 2026-11-09): "I want to be able to respond to these decks with my voice, and
  // typing is really frustrating sometimes." Every text box gets a microphone button. The page
  // only says start/stop: serve.py's helper listens on this computer's microphone and runs the
  // app's own Parakeet model (voice-helper.mjs says why the page does not open the microphone
  // itself). Words appear in the box as he speaks and are saved exactly like typed ones,
  // because the box is sent the same `input` event typing sends.
  const MIC_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
  const grow = box => { if (box.tagName === 'TEXTAREA') { box.style.height = 'auto'; box.style.height = (box.scrollHeight + 2) + 'px'; } };
  function addMics() {
    $$('textarea.note, input.note, textarea.ans-write, textarea.callt, textarea.markt, textarea.pnote').forEach(box => {
      grow(box);
      // A box the layout is not showing (the shared note row on a question page) gets no button.
      const off = box.hidden || box.offsetParent === null;
      if (box.nextElementSibling && box.nextElementSibling.classList.contains('mic')) { box.nextElementSibling.hidden = off; return; }
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mic'; b.title = 'Speak instead of typing'; b.setAttribute('aria-label', 'Speak instead of typing');
      b.innerHTML = MIC_SVG; b.hidden = off;
      box.insertAdjacentElement('afterend', b);
    });
  }
  const voice = { box: null, btn: null, base: '', timer: null, seq: -1 };
  const voicePost = cmd => fetch('/voice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cmd }) }).then(r => r.json());
  function voiceSay(btn, msg, quiet) {
    // Never a silent failure: what went wrong is written under the box it belongs to.
    let p = btn.nextElementSibling; if (!p || !p.classList.contains('micerr')) { p = document.createElement('p'); p.className = 'micerr'; btn.insertAdjacentElement('afterend', p); }
    p.textContent = msg; p.hidden = !msg; p.classList.toggle('quiet', !!quiet);
  }
  function voiceEnd() {
    clearInterval(voice.timer); voice.timer = null;
    if (voice.btn) { voice.btn.classList.remove('rec', 'wait'); voice.btn.innerHTML = MIC_SVG; voice.btn.title = 'Speak instead of typing'; }
    if (voice.box) voice.box.classList.remove('hearing');
    voice.box = voice.btn = null;
  }
  function voiceApply(st) {
    // WHY (review 2026-11-10): if the page was redrawn while recording, the box he was speaking into is
    // gone — words would go into a dead node and nothing be saved. Stop the microphone instead.
    if (voice.box && !voice.box.isConnected) { voicePost('cancel').catch(() => {}); voiceEnd(); return; }
    // WHY four bars and a clock (Destin, round 3: "more like how it actually works in
    // youcoded"): the app's own microphone shows exactly this while it listens (VoiceMeter in
    // VoiceButton.tsx — same four gates, same heights). They sit INSIDE the box's right edge,
    // so nothing beside the box moves (the round-2 fault was a line that squeezed the box).
    if (voice.btn && st.status === 'recording') {
      if (!voice.btn.querySelector('.bars')) { voice.btn.innerHTML = '<span class="bars"><i></i><i></i><i></i><i></i></span><span class="secs">0:00</span>'; voice.t0 = Date.now(); voice.box.classList.add('hearing'); }
      const lv = Math.min(1, st.level || 0);
      voice.btn.querySelectorAll('.bars i').forEach((b, i) => { b.style.height = (4 + Math.round(Math.max(0, Math.min(1, (lv - [0.15, 0.35, 0.6, 0.85][i] * 0.6) / 0.5)) * 10)) + 'px'; });
      const sec = Math.floor((Date.now() - voice.t0) / 1000);
      voice.btn.querySelector('.secs').textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    }
    if (!voice.box || st.seq === voice.seq) return;
    voice.seq = st.seq;
    if (st.status === 'recording' || st.status === 'finishing' || st.final) {
      // WHY re-base when he typed (review 2026-11-10): every poll used to rewrite the box from the
      // words heard, wiping anything he typed meanwhile. If the box is no longer what we wrote, his
      // text becomes the base and only words heard AFTER this point are added to it.
      if (voice.lastSet != null && voice.box.value !== voice.lastSet) { voice.base = voice.box.value.trim(); voice.heard = voice.lastText || ''; }
      const heard = voice.heard || '', fresh = (st.text || '').startsWith(heard) ? (st.text || '').slice(heard.length).trim() : (st.text || '');
      const text = voice.base + (voice.base && fresh ? ' ' : '') + fresh;
      if (voice.box.value !== text) { voice.box.value = text; voice.box.dispatchEvent(new Event('input', { bubbles: true })); grow(voice.box); }
      voice.lastSet = voice.box.value; voice.lastText = st.text || '';
    }
    voice.btn.classList.toggle('rec', st.status === 'recording');
    // Fix (Destin, round 2: "it kinda bugged out … made the size/shape of the text box wonky"):
    // the "Listening" line was a new item in the same row as the box, so the box was squeezed
    // and jumped each time the line appeared. The state is now the button's tooltip only.
    voice.btn.title = st.status === 'recording' ? 'Listening — press to stop, or just stop talking' : st.status === 'loading' ? 'Getting voice ready…' : st.status === 'finishing' ? 'Finishing…' : 'Speak instead of typing';
    voice.btn.classList.toggle('wait', st.status === 'finishing' || st.status === 'loading');
    if (st.error) voiceSay(voice.btn, st.error);
    if (st.status === 'idle' || st.status === 'off') voiceEnd();
  }
  document.addEventListener('click', e => {
    const btn = e.target.closest('.mic'); if (!btn || state.submitted) return;
    const box = btn.previousElementSibling; if (!box) return;
    if (voice.box) {
      // A press while listening stops it — on this box or any other; one recording at a time.
      voice.btn.classList.remove('rec'); voice.btn.classList.add('wait');
      voicePost('stop').then(voiceApply).catch(err => { voiceSay(voice.btn, 'Voice input did not stop: ' + err.message); voiceEnd(); });
      return;
    }
    // His words are added after what is already typed.
    voice.box = box; voice.btn = btn; voice.seq = -1; voice.lastSet = null; voice.heard = ''; voice.lastText = '';
    voice.base = box.value.trim();
    voiceSay(btn, ''); btn.classList.add('wait'); box.focus();
    voicePost('start').then(st => {
      voiceApply(st);
      if (voice.box) voice.timer = setInterval(() => voicePost('poll').then(voiceApply).catch(() => {}), 150);
    }).catch(err => { voiceSay(btn, 'Voice input did not start: ' + err.message); voiceEnd(); });
  });
  document.addEventListener('input', e => { if (e.target.matches && e.target.matches('textarea.note, textarea.ans-write, textarea.callt, textarea.markt')) grow(e.target); });
  // WHY on leaving (review 2026-11-10): the 300 ms wait before saving a note was never flushed when the
  // tab closed, so a note typed in that window was lost; and a microphone could stay recording after
  // the page went away. The server also cancels a recording whose polls stop (serve.py VoiceBridge).
  function flush() {
    if (!loaded || state.submitted) return;
    stamp();
    const sig = JSON.stringify(state); if (sig === lastSig) return;
    try { localStorage.setItem(LS, sig); } catch (e) { /* no storage */ }
    if (server) { lastSig = sig; try { fetch('/answers', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: sig }).catch(() => {}); } catch (e) { /* too large for a keepalive send */ } }
  }
  window.addEventListener('pagehide', () => {
    flush();
    if (voice.box && navigator.sendBeacon) navigator.sendBeacon('/voice', new Blob([JSON.stringify({ cmd: 'cancel' })], { type: 'application/json' }));
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  load().then(() => {
    // WHY (Destin, round 9, Q-3): a deck he already sent reopens with his answers, still editable. One plain
    // line above the page says when he sent them, so nothing looks lost and nothing looks locked.
    if (state.sent_before && !state.submitted) {
      const when = new Date(state.sent_before).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const p = document.createElement('p'); p.className = 'sentline';
      p.textContent = 'You sent these answers on ' + when + '. Change anything and send again; the earlier copy is kept.';
      const cards = $('#cards'); cards.parentElement.insertBefore(p, cards.parentElement.firstChild);
    }
    const q = new URLSearchParams(location.search);
    // An answers file written before this deck had pages can carry a `cur` past the last page;
    // clamping to LAST lands on the last page instead of rendering nothing.
    cur = q.get('step') ? Math.max(0, Math.min(LAST, +q.get('step') - 1)) : Math.max(0, Math.min(LAST, state.cur || 0));
    // A deck that grows opens on the first page with a topic still open, not on page 1 (answered pages are behind him).
    if (GROWS && !q.get('step') && !state.cur) { const i = PAGES.findIndex((p, k) => pageSteps(k).some(needsAnswer)); if (i > 0) cur = i; }
    if (q.get('theme') && DECK.themes.includes(q.get('theme'))) theme = q.get('theme');
    stepStart = Date.now(); stamp(); lastSig = JSON.stringify(state); loaded = true; render();   // WHY lastSig now: a page that has changed nothing must not rewrite the browser backup when it closes
    if (state.submitted) { lockSubmitted(); showFinished(); }   // an archived deck re-opened after its submit lands on the finish screen — its answers, read back — instead of a step full of dead buttons
  });
})();
