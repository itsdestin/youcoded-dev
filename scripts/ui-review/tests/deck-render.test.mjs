// scripts/ui-review/tests/deck-render.test.mjs
// Builds the fixture deck, serves it with review-cards.py serve --no-open, and drives headless
// Chrome over raw CDP: no console errors, the layout the page chose at three sizes, the answer
// container on screen, and a Yes + Save & Next that lands in the answers file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url)), RC = join(HERE, '..', 'review-cards.py');
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function cdp(port, w, h) {
  const chrome = spawn('google-chrome-stable', ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', `--window-size=${w},${h}`, '--force-device-scale-factor=1', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'deck-render-'))}`, 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {} await sleep(250); }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl); let id = 0; const pending = new Map(); const errors = [];
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data.toString()); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error ' + m.params.args.map(a => a.value ?? a.description).join(' ')); };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result?.value; };
  return { send, evaluate, errors, close: () => { ws.close(); chrome.kill(); } };
}

test('deck renders at three sizes and records an answer', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-'));
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import make_fixture; print(make_fixture(${JSON.stringify(tmp)}, clip=True))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('deck.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-open', '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let srvOut = ''; srv.stdout.on('data', d => srvOut += d);
  try {
    await sleep(800);
    const url = `http://127.0.0.1:${port}/fixture.html`;
    // The rule from spec §3.4, applied to the scores the page publishes: B/C/D must beat A by >5% to win;
    // best under 50% → compact. At 400 px wide two 400 px crops side by side reach only ~39%, so compact is certain there (at 520 they still fit at 51% — measured 2026-08-27).
    const expected = scores => { let best = 'A'; for (const k of ['B', 'C', 'D']) if (scores[k] > scores[best] * 1.05) best = k; return scores[best] < 0.5 ? 'compact' : best; };
    for (const size of ['1920x1080', '1100x900', '400x760']) {
      const [w, h] = size.split('x').map(Number); const c = await cdp(await freePort(), w, h);
      try {
        await c.send('Page.navigate', { url: url + '?step=2' });
        for (let i = 0; i < 40 && !(await c.evaluate('!!window.__deckReady').catch(() => false)); i++) await sleep(250);
        await sleep(400);
        assert.deepEqual(c.errors, [], size);
        const scores = JSON.parse(await c.evaluate('document.body.dataset.scores'));
        assert.equal(await c.evaluate('document.body.dataset.layout'), expected(scores), size + ' ' + JSON.stringify(scores));
        if (size === '400x760') assert.equal(await c.evaluate('document.body.dataset.layout'), 'compact', size);
        assert.equal(await c.evaluate("getComputedStyle(document.querySelector('.controls')).display !== 'none' && document.querySelector('.controls').getBoundingClientRect().bottom <= innerHeight"), true, size + ' controls on screen');
        // ONE decision card: the question, the options and the answer row share a border.
        // COMPACT is the deliberate exception — the wrapper dissolves there so the sticky
        // answer bar keeps room to move, and the two blocks carry the card themselves.
        const merged = await c.evaluate("(()=>{const d=document.querySelector('.decide'),cs=getComputedStyle(d);"
          + "return cs.display === 'contents' ? 'compact'"
          + " : cs.borderTopWidth !== '0px' && d.contains(document.querySelector('.info')) && d.contains(document.querySelector('.controls'));})()");
        assert.equal(merged, size === '400x760' ? 'compact' : true, size + ' one decision card');
        if (size === '400x760') {
          // Transparent here means the pinned bar renders straight over the question text.
          assert.notEqual(await c.evaluate("getComputedStyle(document.querySelector('.controls')).backgroundColor"), 'rgba(0, 0, 0, 0)', 'compact answer bar is opaque');
          assert.notEqual(await c.evaluate("getComputedStyle(document.querySelector('.info')).backgroundColor"), 'rgba(0, 0, 0, 0)', 'compact question block is opaque');
        }
        assert.equal(await c.evaluate("document.querySelectorAll('#inner .frame').length"), 2, size);
        assert.equal(await c.evaluate("document.querySelector('#inner .box').style.left"), '25%', size + ' measured box');
        if (size === '1100x900') {
          await c.evaluate("document.querySelector('.ans[data-v=yes]').click()");
          assert.equal(await c.evaluate("document.querySelector('#save').disabled"), false);
          await c.evaluate("document.querySelector('#note').value='fine'; document.querySelector('#note').dispatchEvent(new Event('input'))");
          await c.evaluate("document.querySelector('#save').click()"); await sleep(600);
          assert.equal(await c.evaluate("document.querySelector('#wtitle').textContent"), 'Home');
          assert.equal(await c.evaluate("document.querySelector('#count').textContent"), 'step 3 of 4 · 1 answered');
          // Prev/Next state, pinned because it is EASY TO LOSE SILENTLY: on 2026-09-03 an
          // edit ended a line in a `//` comment and swallowed these three assignments into
          // it. Every other assertion in this suite still passed.
          assert.equal(await c.evaluate("document.querySelector('#prev').disabled"), false, 'Prev live off step 1');
          assert.equal(await c.evaluate("document.querySelector('#next').textContent"), 'Next ›');
          await c.send('Page.navigate', { url: url + '?step=1' });
          for (let i = 0; i < 40 && !(await c.evaluate('!!window.__deckReady').catch(() => false)); i++) await sleep(250);
          assert.equal(await c.evaluate("document.querySelector('#prev').disabled"), true, 'Prev dead on the first step');
          await c.send('Page.navigate', { url: url + '?step=4' });
          for (let i = 0; i < 40 && !(await c.evaluate('!!window.__deckReady').catch(() => false)); i++) await sleep(250);
          assert.equal(await c.evaluate("document.querySelector('#next').disabled"), true, 'Next dead on the last step');
          assert.equal(await c.evaluate("document.querySelector('#next').textContent"), 'Last step');
          await c.send('Page.navigate', { url: url + '?step=3' });
          for (let i = 0; i < 40 && !(await c.evaluate('!!window.__deckReady').catch(() => false)); i++) await sleep(250);
          // CLIP step: a <video> per run, the replay button shown, no theme thumbs, no console errors
          await c.send('Page.navigate', { url: url + '?step=4' });
          for (let i = 0; i < 40 && !(await c.evaluate('!!window.__deckReady').catch(() => false)); i++) await sleep(250);
          await sleep(400);
          assert.deepEqual(c.errors, [], 'clip step');
          assert.equal(await c.evaluate("document.querySelectorAll('#inner video').length"), 2, 'clip videos');
          assert.equal(await c.evaluate("document.querySelector('#replay').hidden"), false, 'replay shown');
          assert.equal(await c.evaluate("[...document.querySelectorAll('#inner video')].every(v => v.paused)"), true, 'clips start paused');
          await c.evaluate("document.querySelector('#replay').click()"); await sleep(300);
          assert.equal(await c.evaluate("[...document.querySelectorAll('#inner video')].every(v => !v.paused)"), true, 'replay plays both');
          assert.equal(await c.evaluate("document.querySelectorAll('#thumbs .thumb').length"), 0, 'no theme thumbs on a clip');
        }
      } finally { c.close(); }
    }
    const answers = JSON.parse(readFileSync(join(dirname(spec), 'deck.answers.json'), 'utf8'));
    assert.equal(answers.answers['S-2'].v, 'yes'); assert.equal(answers.answers['S-2'].note, 'fine'); assert.equal(answers.answers['S-2'].theme, 'midnight');
    // submit ends the server with the summary on stdout
    await fetch(`http://127.0.0.1:${port}/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(answers) });
    const code = await new Promise(r => srv.on('exit', r));
    assert.equal(code, 0); assert.match(srvOut, /fixture · submitted .* · 1 yes · 0 no · 0 other · 3 skipped/); assert.match(srvOut, /S-2 yes — "fine"/);
    assert.equal(existsSync(join(dirname(spec), 'deck.serve.json')), false);
  } finally { if (srv.exitCode === null) srv.kill(); }
});

// ── LIVE panes ────────────────────────────────────────────────────────────────────────────
// A stub pane server stands in for the workbench: same two messages the real route sends
// (a height on load, a theme swap in place), no Vite, no app, no ImageMagick. `--no-live`
// keeps `serve` from trying to boot a real workbench for the fixture's imaginary worktree.
test('live step: panes, label theme row that does not reload them, no picking by pane', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-live-'));
  // The stub server has to outlive this process's setup, so it runs in its own python.
  const stub = spawn('python3', ['-c',
    `import sys, time; sys.path.insert(0, ${JSON.stringify(HERE)});\n` +
    `from fixture import LivePaneServer\n` +
    `s = LivePaneServer()\n` +
    `print(s.base, flush=True)\n` +
    `time.sleep(300)`], { stdio: ['ignore', 'pipe', 'pipe'] });
  const base = await new Promise((res, rej) => {
    let out = ''; stub.stdout.on('data', d => { out += d; if (out.includes('\n')) res(out.trim()); });
    stub.stderr.on('data', d => rej(new Error(String(d))));
    setTimeout(() => rej(new Error('stub pane server never printed its address')), 10000);
  });
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import live_spec; print(live_spec(${JSON.stringify(tmp)}, base=${JSON.stringify(base)}))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('live.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-open', '--no-build', '--no-live', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const url = `http://127.0.0.1:${port}/live.html`;
  const c = await cdp(await freePort(), 1600, 1000);
  try {
    await sleep(800);
    // Collect what the panes say about themselves. Installed before navigation so the
    // load-time announcements are not missed.
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__acks=[];addEventListener('message',e=>{if(e.data&&String(e.data.type||'').startsWith('stub:'))window.__acks.push(e.data);});" });
    await c.send('Page.navigate', { url: url + '?step=1' });
    for (let i = 0; i < 40 && !(await c.evaluate('!!window.__deckReady').catch(() => false)); i++) await sleep(250);
    await sleep(700);
    assert.deepEqual(c.errors, [], 'live step console');

    // Its own layout — none of layout()'s natural-size scoring applies, and __deckReady must
    // still be set or this very test would have hung instead of failing.
    assert.equal(await c.evaluate('document.body.dataset.layout'), 'live');
    assert.equal(await c.evaluate("document.querySelectorAll('#inner iframe').length"), 2, 'one pane per variant');
    // The pane MEASURED 420 while the spec declared nothing (so the deck started at its 360
    // default). Measured wins — a deck-level guess that is too small clips the design's right
    // edge with nothing to say so, which is exactly what happened on 2026-08-31.
    assert.equal(await c.evaluate("document.querySelector('#inner iframe').style.width"), '420px', 'width the pane measured for itself');
    assert.equal(await c.evaluate("document.querySelector('#inner iframe').style.height"), '220px', 'height the pane measured for itself');
    // The fit rule: a row of panes wraps rather than scrolling sideways, and the stage takes
    // only the height the panes need so the question sits directly beneath them.
    assert.equal(await c.evaluate("getComputedStyle(document.querySelector('.stage .inner')).flexWrap"), 'wrap', 'panes wrap');
    assert.equal(await c.evaluate("document.querySelector('.stage').scrollWidth <= document.querySelector('.stage').clientWidth"), true, 'no sideways scroll');
    assert.equal(await c.evaluate("document.querySelector('#content').classList.contains('live-fit') || document.querySelector('#content').classList.contains('col-right')"), true, 'live fit layout');
    // The lettered chip must not weld itself to the label ("aCard and row"). Measured as
    // actual space, whichever way it is produced — the first fix used a margin, the caption
    // is now a flex row with a gap, and the test should not care which.
    const air = await c.evaluate("(()=>{const k=document.querySelector('#inner figcaption .key');"
      + "return (parseFloat(getComputedStyle(k).marginRight)||0) + (parseFloat(getComputedStyle(k.parentElement).columnGap)||0);})()");
    assert.ok(air >= 4, `letter chip has air after it (got ${air}px)`);
    // The theme row goes inline on a live step at ANY width — a wide row of panes pushes the
    // absolute side column off the edge of the window and the buttons get cut in half.
    assert.equal(await c.evaluate("document.body.classList.contains('thumbs-inline')"), true, 'theme row inline');
    assert.equal(await c.evaluate("document.querySelector('#thumbs').getBoundingClientRect().right <= innerWidth"), true, 'theme row on screen');

    // Zoom off; the magnifier has no image to work from and hides itself.
    // COMPUTED display, not the .hidden property: `.zoom` sets display:inline-flex, which
    // outranks [hidden], so the property read `true` while the pill stayed on screen.
    assert.equal(await c.evaluate("getComputedStyle(document.querySelector('#zoom')).display"), 'none', 'zoom really hidden');
    assert.equal(await c.evaluate("document.querySelector('#zoom').getBoundingClientRect().width"), 0, 'and takes no space');
    assert.equal(await c.evaluate("getComputedStyle(document.querySelector('#loupe')).display"), 'none', 'no magnifier');
    assert.equal(await c.evaluate("document.querySelector('#livehint').hidden"), false, 'focus hint shown');

    // Pop-out: the same address, in a new tab.
    assert.equal(await c.evaluate("document.querySelectorAll('#inner .popout').length"), 2, 'a pop-out per pane');
    // It opens a window, so it reads and looks like something you press — not bare link text.
    assert.match(await c.evaluate("document.querySelector('#inner .popout').textContent"), /Open in New Window/);
    assert.notEqual(await c.evaluate("getComputedStyle(document.querySelector('#inner .popout')).borderTopWidth"), '0px', 'the pop-out is a button, not a link');
    // "A." reads as a label; a bare capital ran straight into the words after it.
    assert.match(await c.evaluate("document.querySelector('#inner figcaption .key').textContent"), /^\w\.$/, 'lettered and stopped');
    assert.notEqual(await c.evaluate("getComputedStyle(document.querySelector('#inner figcaption .key')).color"), await c.evaluate("getComputedStyle(document.querySelector('#inner figcaption')).color"), 'the letter is coloured, not the caption grey');
    assert.equal(await c.evaluate("document.querySelector('#inner .popout').getAttribute('href') === document.querySelector('#inner iframe').src"), true, 'pop-out opens the pane');
    assert.equal(await c.evaluate("document.querySelector('#inner .popout').target"), '_blank');

    // Theme row is labels, and switching must not rebuild the panes.
    assert.equal(await c.evaluate("document.querySelectorAll('#thumbs .thumb').length"), 2, 'a button per deck theme');
    assert.equal(await c.evaluate("document.querySelectorAll('#thumbs .thumb img').length"), 0, 'labels, not thumbnails');
    // A pane must arrive wearing the DECK's theme, not the one baked into its address at
    // build time — otherwise switching theme on step 1 leaves step 2's panes on the old one.
    assert.deepEqual(await c.evaluate("[...new Set(window.__acks.filter(a=>a.type==='stub:theme').map(a=>a.theme))]"), ['midnight'],
      'panes are told the theme on load, with no click');
    const loadedIds = await c.evaluate("JSON.stringify(window.__acks.filter(a=>a.type==='stub:loaded').map(a=>a.id).sort())");
    assert.equal(JSON.parse(loadedIds).length, 2, 'both panes announced themselves');
    await c.evaluate("[...document.querySelectorAll('#thumbs .thumb')].find(b=>b.dataset.v==='light').click()"); await sleep(500);
    const acks = JSON.parse(await c.evaluate("JSON.stringify(window.__acks)"));
    const themed = acks.filter(a => a.type === 'stub:theme' && a.theme === 'light');
    assert.equal(themed.length, 2, 'the swap reached both panes');
    assert.deepEqual(acks.filter(a => a.type === 'stub:loaded').map(a => a.id).sort(), JSON.parse(loadedIds),
      'panes were NOT reloaded — a reload would mint new ids and re-announce');
    assert.deepEqual(themed.map(a => a.id).sort(), JSON.parse(loadedIds), 'same documents answered');
    assert.equal(await c.evaluate("document.documentElement.dataset.theme"), 'light', 'deck chrome followed');

    // A click inside a pane is an interaction with the candidate, never an answer.
    assert.equal(await c.evaluate("document.querySelectorAll('#inner .frame.pickable').length"), 0, 'panes are not pickable');
    await c.evaluate("document.querySelector('#inner .frame').click()"); await sleep(200);
    assert.equal(await c.evaluate("document.querySelector('#save').disabled"), true, 'clicking a pane recorded nothing');
    // The lettered card does answer, exactly as it does for a picture pick-one.
    assert.equal(await c.evaluate("document.querySelectorAll('.card.variant').length"), 2, 'a card per candidate');
    await c.evaluate("document.querySelector('.card.variant[data-pick=b]').click()"); await sleep(300);
    assert.equal(await c.evaluate("document.querySelector('#save').disabled"), false, 'the card answered');
    assert.equal(await c.evaluate("document.querySelector('.card.variant[data-pick=b]').classList.contains('on')"), true, 'the picked card is marked');
    // ONE decision row, not two. The options live on the cards; the answer row carries only
    // what a card cannot say.
    assert.equal(await c.evaluate("document.querySelectorAll('.ans[data-v=pick]').length"), 0, 'no lettered buttons repeating the cards');
    assert.deepEqual(await c.evaluate("[...document.querySelectorAll('.ans')].map(b=>b.dataset.v)"), ['no', 'other'], 'None of these + Other only');
    // A tall design is never sliced: the pane gets its full measured height and the STAGE scrolls.
    assert.equal(await c.evaluate("document.querySelector('#inner iframe').style.height"), '220px', 'full measured height');
    assert.equal(await c.evaluate("getComputedStyle(document.querySelector('#stage')).overflow"), 'auto', 'the stage is what scrolls');
    assert.equal(await c.evaluate("getComputedStyle(document.querySelector('#inner')).alignItems"), 'flex-start', 'panes top-aligned');

    // The try-this step is a yes/no over one pane.
    await c.send('Page.navigate', { url: url + '?step=2' });
    for (let i = 0; i < 40 && !(await c.evaluate('!!window.__deckReady').catch(() => false)); i++) await sleep(250);
    await sleep(500);
    assert.equal(await c.evaluate("document.querySelectorAll('#inner iframe').length"), 1, 'one pane');
    assert.equal(await c.evaluate("!!document.querySelector('.ans[data-v=yes]')"), true, 'yes/no, not pick');
    assert.deepEqual(c.errors, [], 'try-this console');
  } finally { c.close(); stub.kill(); if (srv.exitCode === null) srv.kill(); }
});

test('live step: a stopped app server says so, with the command that starts it', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-down-'));
  const dead = await freePort();   // nothing is listening here
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import live_spec; print(live_spec(${JSON.stringify(tmp)}, base='http://127.0.0.1:${dead}'))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('live.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-open', '--no-build', '--no-live', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const c = await cdp(await freePort(), 1400, 900);
  try {
    await sleep(800);
    await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/live.html?step=1` });
    for (let i = 0; i < 40 && !(await c.evaluate('!!window.__deckReady').catch(() => false)); i++) await sleep(250);
    await sleep(600);
    // This is also what an ARCHIVED review shows: live panes do not replay.
    const text = await c.evaluate("document.querySelector('#inner .down') && document.querySelector('#inner .down').textContent");
    assert.ok(text && text.trim().length > 40, 'the not-running card renders with text in it, never a blank rectangle');
    assert.match(text, /not running/);
    assert.match(text, new RegExp(String(dead)), 'names the address that did not answer');
    assert.match(text, /run-workbench\.sh/, 'names the command that starts it');
    assert.equal(await c.evaluate("document.querySelectorAll('#inner iframe').length"), 0, 'no dead iframes left behind');
  } finally { c.close(); if (srv.exitCode === null) srv.kill(); }
});

test('a words-only deck renders with no stage and records a pick', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-words-'));
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import words_spec; print(words_spec(${JSON.stringify(tmp)}))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('questions.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-open', '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await sleep(800);
    const c = await cdp(await freePort(), 1400, 900);
    try {
      await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/questions.html` });
      for (let i = 0; i < 40 && !(await c.evaluate('window.__deckReady === true')); i++) await sleep(100);
      assert.equal(await c.evaluate('document.body.dataset.layout'), 'words');
      assert.equal(await c.evaluate("getComputedStyle(document.querySelector('#stage')).display"), 'none');
      assert.equal(await c.evaluate("document.querySelectorAll('.card.option').length"), 1);          // Q-1: one option
      assert.equal(await c.evaluate("[...document.querySelectorAll('.ans')].map(b => b.dataset.v).join(',')"), 'other');
      // A question says what exists, what goes wrong and what would change, one card each —
      // never crammed into the option's summary (design §3.2).
      assert.equal(await c.evaluate("document.querySelectorAll('.card.part').length"), 3, 'today / the problem / the proposal');
      assert.deepEqual(await c.evaluate("[...document.querySelectorAll('.card.part h3')].map(h=>h.textContent)"),
        ['Today', 'The problem', 'Proposal']);
      // The preferred option wears a badge; "(recommended)" written into a label is refused by the builder.
      assert.equal(await c.evaluate("document.querySelectorAll('.card.option[data-pick=a] .badge').length"), 1, 'the recommended option is badged');
      assert.equal(await c.evaluate("document.querySelector('.card.option .badge').textContent"), 'Recommended');
      assert.equal(await c.evaluate("document.querySelectorAll('.card.option ul.pros li').length"), 2, 'both pros listed');
      assert.equal(await c.evaluate("document.querySelectorAll('.card.option ul.cons li').length"), 1, 'the con listed');
      await c.evaluate("document.querySelector('.card.option').click()");
      await c.evaluate("document.querySelector('#save').click()");   // → Q-2
      // Back up to Q-1 and add its note — proves the note field and the pick land together
      // in the saved file (feature-flow design §5). No tag row: a note is a note (Destin, 2026-09-04).
      await c.evaluate("document.querySelector('#prev').click()");   // back to Q-1
      await c.evaluate("const n = document.querySelector('#note'); n.value = 'smaller'; n.dispatchEvent(new Event('input'))");
      assert.equal(await c.evaluate("document.querySelector('#tags')"), null);
      await c.evaluate("document.querySelector('#save').click()");   // → Q-2 again
      await c.evaluate("document.querySelector('#next').click()");   // → Q-3
      await sleep(200);
      assert.equal(await c.evaluate("[...document.querySelectorAll('.ans')].map(b => b.textContent).join(',')"), 'Holds,Fails,Other');
      // Q-4 asks something with nothing to pick between: a shrug is a real answer, so it is a
      // button, not something to type into Other. It rides as Other with a flag.
      await c.evaluate("document.querySelector('#next').click()"); await sleep(200);
      assert.deepEqual(await c.evaluate("[...document.querySelectorAll('.ans')].map(b => b.textContent)"), ['Yes', 'No', "Don't know"]);
      assert.deepEqual(await c.evaluate("[...document.querySelectorAll('.ans')].map(b => b.dataset.v)"), ['yes', 'no', 'other']);
      assert.equal(await c.evaluate("document.querySelector('.ans[data-v=other]').dataset.dk"), '1');
      await c.evaluate("document.querySelector('.ans[data-v=other]').click()"); await sleep(400);
      await sleep(400);
      const answers = JSON.parse(readFileSync(spec.replace(/\.json$/, '.answers.json'), 'utf8'));
      assert.deepEqual([answers.answers['Q-1'].v, answers.answers['Q-1'].pick], ['pick', 'a']);
      assert.equal(answers.answers['Q-1'].note, 'smaller');
      assert.deepEqual([answers.answers['Q-4'].v, answers.answers['Q-4'].dk], ['other', true], "don't know is Other with a flag");
      // Clearing the note removes it from the saved answer.
      await c.evaluate("document.querySelectorAll('#steps span')[0].click()");   // back to Q-1
      await c.evaluate("const n2 = document.querySelector('#note'); n2.value = ''; n2.dispatchEvent(new Event('input'))");
      await c.evaluate("document.querySelector('#save').click()");   // → Q-2, saves the cleared note
      await sleep(400);
      const answers2 = JSON.parse(readFileSync(spec.replace(/\.json$/, '.answers.json'), 'utf8'));
      assert.equal((answers2.answers['Q-1'].note || ''), '');
      assert.deepEqual(c.errors, []);
    } finally { c.close(); }
  } finally { srv.kill(); }
});

// ── the finish screen ──────────────────────────────────────────────────────────────────────
// WHY pinned: before it existed, Submit closed the dialog and left Destin on the last step
// with a greyed-out button — indistinguishable from a click that did nothing. The screen is
// also the ONLY read-back of the answers, because serve.py exits the moment a submit lands.
test('submit lands on a finish screen that reads the answers back, and the deck stays read-only', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-fin-'));
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import make_fixture; print(make_fixture(${JSON.stringify(tmp)}))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('deck.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-open', '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const c = await cdp(await freePort(), 1440, 900);
  try {
    await sleep(800);
    await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/fixture.html` });
    for (let i = 0; i < 40 && !(await c.evaluate('!!window.__deckReady').catch(() => false)); i++) await sleep(250);
    assert.equal(await c.evaluate('document.body.dataset.screen'), 'deck');

    // step 1: yes + a note. step 3: "other". step 2 is left with no answer on purpose.
    await c.evaluate("document.querySelector('.ans[data-v=yes]').click(); const n=document.querySelector('#note'); n.value='amber is strong'; n.dispatchEvent(new Event('input'));");
    await sleep(400);
    await c.evaluate("document.querySelector('#steps span:nth-child(3)').click()"); await sleep(600);
    await c.evaluate("document.querySelector('.ans[data-v=other]').click()"); await sleep(300);
    await c.evaluate("document.querySelector('#done').click()"); await sleep(300);
    await c.evaluate("document.querySelector('#submit').click()"); await sleep(1200);

    assert.equal(await c.evaluate('document.body.dataset.screen'), 'finished', 'submit shows the finish screen');
    assert.equal(await c.evaluate("document.querySelector('#step').hidden"), true, 'the step is put away');
    // The sentence Destin asked for, verbatim — it is the whole point of the screen.
    assert.equal(await c.evaluate("document.querySelector('.finished .lede').textContent.trim()"),
      'The Assistant should receive your responses in just a moment.');
    // Every step is read back, including the one with no answer.
    const rows = JSON.parse(await c.evaluate("JSON.stringify([...document.querySelectorAll('#responses tbody tr')].map(r=>[...r.cells].map(c=>c.textContent.trim())))"));
    assert.equal(rows.length, 3);
    assert.equal(rows[0][2], 'Yes, keep it'); assert.match(rows[0][3], /amber is strong/);
    assert.equal(rows[1][2], 'No answer');
    assert.equal(rows[2][2], 'Something else');
    assert.equal(await c.evaluate("document.querySelectorAll('#responses .kind').length"), 0);   // no tag pill left to render
    assert.match(await c.evaluate("document.querySelector('#fin-meta').textContent"), /3 steps · 1 yes · 0 no · 1 other · 1 with no answer · submitted /);
    assert.deepEqual(c.errors, []);

    // Back to the deck: browsable, but nothing on it can be changed and nothing is re-sent.
    await c.evaluate("document.querySelector('#fin-back').click()"); await sleep(500);
    await c.evaluate("document.querySelector('#steps span:nth-child(2)').click()"); await sleep(800);
    assert.equal(await c.evaluate('document.body.dataset.screen'), 'deck');
    assert.match(await c.evaluate("document.querySelector('#count').textContent"), /^step 2 of 3 .* submitted, read-only$/, 'moved, and says it is read-only');
    assert.equal(await c.evaluate("[...document.querySelectorAll('.ans')].every(b=>b.disabled) && document.querySelector('#save').disabled && document.querySelector('#note').disabled"), true, 'nothing answerable');
    // The header button is the way back — disabling it would strand the answers behind a dead control.
    assert.equal(await c.evaluate("document.querySelector('#done').disabled"), false);
    await c.evaluate("document.querySelector('#done').click()"); await sleep(400);
    assert.equal(await c.evaluate('document.body.dataset.screen'), 'finished', 'the header button returns to it');

    // The submitted answers file is what the server banked at submit — browsing did not rewrite it.
    const answers = JSON.parse(readFileSync(join(dirname(spec), 'deck.answers.json'), 'utf8'));
    assert.ok(answers.submitted, 'file carries the submit stamp');
    assert.equal(answers.answers['S-1'].v, 'yes'); assert.equal(answers.answers['S-3'].v, 'other');
    assert.equal(answers.answers['S-2'], undefined, 'a step never opened has no entry — the finish screen still lists it as "No answer"');
    // NOT `srv.on('exit')`: the server exited seconds ago, back at the submit, and 'exit' is
    // emitted once — a listener attached afterwards would wait for a event that already fired.
    for (let i = 0; i < 60 && srv.exitCode === null; i++) await sleep(100);
    assert.equal(srv.exitCode, 0, 'the server exits on submit');
    assert.deepEqual(c.errors, []);
  } finally { c.close(); if (srv.exitCode === null) srv.kill(); }
});
