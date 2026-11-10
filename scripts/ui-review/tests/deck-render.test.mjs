// scripts/ui-review/tests/deck-render.test.mjs
// Builds the fixture deck, serves it with review-cards.py serve, and drives headless
// Chrome over raw CDP: no console errors, the layout the page chose at three sizes, the answer
// container on screen, and a Yes + Save & Next that lands in the answers file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
// WHY the driver is not in this file any more: `review-cards.py preview` needs the same
// headless-Chrome driver, and two copies would drift. deck/render.mjs owns it now.
import { cdp, renderDeck } from '../deck/render.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), RC = join(HERE, '..', 'review-cards.py');
// WHY: review-cards.py opens a deck on the theme the live app is on, read from
// ~/.claude/youcoded-appearance.json. Point every python3 child (they inherit this env) at a
// file that does not exist, so these renders assert the fixture's own first theme instead of
// whichever theme this machine happens to be using today.
process.env.YOUCODED_APPEARANCE_FILE = join(tmpdir(), 'deck-render-no-appearance.json');
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('deck renders at three sizes and records an answer', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-'));
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import make_fixture; print(make_fixture(${JSON.stringify(tmp)}, clip=True))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('deck.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
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

// Two defects seen in real decks at 1440x900 on 2026-09-04 (Task 4): (1) a long step `path`
// (the uppercase eyebrow beside the surface title) ran under the progress bar and the Next
// button — reproduced below, and confirmed RED against the pre-fix CSS (`.nav`'s own
// `min-width:0` let it collapse to a literal 0px box once `.where` had nothing capping how
// much of the row it could claim; `.nav`'s children then overflowed it, centered on the
// collapsed point, sliding backward under the path text). (2) a picture DECIDE step's side
// column sliced its third option and the Risk card off below the fold, with the answer
// buttons scrolling away too. The column assertions below did NOT reproduce against any
// fixture built for this task, including far more option/risk text than a real deck would
// carry — `.info`'s pre-existing `overflow:auto` already lets it shrink and scroll on its own
// (see the CSS comment on `.col-right .decide`). They stay as a pinning test for the stated
// invariant (info scrolls, controls never leaves the viewport, the third card is reachable)
// rather than as a demonstrated regression.
test('header never runs under the nav, and the side column scrolls instead of slicing', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-longpath-'));
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import make_fixture; print(make_fixture(${JSON.stringify(tmp)}, long_path=True))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('deck.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await sleep(800);
    const url = `http://127.0.0.1:${port}/fixture.html`;
    // The header measurement: at both sizes, #wsub (the eyebrow) must never run past .nav's
    // left edge — checked on step 1, which carries the 90-character path. At 1280 the existing
    // <1400px media query hides #wsub entirely, so the check there is trivially true; it stays
    // in the loop because the fix must hold at both sizes it is asked for.
    //
    // Fix (2026-09-05): `.nav`'s OWN bounding box is not enough on its own — `.nav` has
    // `min-width:0`, so when the row runs out of room .nav can be shrunk to a LITERAL 0px box
    // (confirmed by measurement: navL === navR pre-fix at this path length) while its children
    // (`.steps`, `#prev`, `#next`) keep their real widths and, centered on that now-degenerate
    // point, spill out past it in both directions — sitting UNDER #wsub on the left and under
    // #count on the right. `.nav.left` is always `#wsub`'s own right edge plus one gap by
    // construction of a flex row, so comparing against it alone is trivially true whether or
    // not the row actually collapsed — it never catches this. `#prev` (the first real content
    // inside `.nav`) is what actually slides under #wsub, so it is the one that must clear it.
    for (const [w, h] of [[1440, 900], [1280, 800]]) {
      const c = await cdp(await freePort(), w, h);
      try {
        await c.send('Page.navigate', { url: url + '?step=1' });
        for (let i = 0; i < 40 && !(await c.evaluate('!!window.__deckReady').catch(() => false)); i++) await sleep(250);
        await sleep(300);
        assert.deepEqual(c.errors, [], `${w}x${h} step 1`);
        const clear = await c.evaluate("document.querySelector('#wsub').getBoundingClientRect().right <= document.querySelector('.nav').getBoundingClientRect().left");
        assert.equal(clear, true, `${w}x${h}: the header (#wsub) never runs under the nav`);
        const prevClear = await c.evaluate("document.querySelector('#wsub').getBoundingClientRect().right <= document.querySelector('#prev').getBoundingClientRect().left");
        assert.equal(prevClear, true, `${w}x${h}: the Prev button (the nav's real leftmost content) never sits under #wsub`);
        if (w === 1440) {
          assert.notEqual(await c.evaluate("getComputedStyle(document.querySelector('#wsub')).display"), 'none', '#wsub is still visible at 1440');
        }
      } finally { c.close(); }
    }
    // The column measurement: S-5 is the fixture's decide step (three long options + a Risk
    // card) — open it at 1440x900 and check the side column scrolls instead of slicing.
    const c = await cdp(await freePort(), 1440, 900);
    try {
      await c.send('Page.navigate', { url: url + '?step=5' });
      for (let i = 0; i < 40 && !(await c.evaluate('!!window.__deckReady').catch(() => false)); i++) await sleep(250);
      await sleep(300);
      assert.deepEqual(c.errors, [], 'S-5 console');
      const layout = await c.evaluate('document.body.dataset.layout');
      assert.ok(layout === 'B' || layout === 'C', `S-5 should keep the side column (B or C), got ${layout}`);
      assert.equal(await c.evaluate("document.querySelector('.controls').getBoundingClientRect().bottom <= innerHeight"), true, 'the answer row stays inside the viewport');
      assert.equal(await c.evaluate("document.querySelector('.info').scrollHeight > document.querySelector('.info').clientHeight"), true, '.info has more content than it can show — it scrolls');
      // Scroll .info to the bottom and confirm the third option card is fully inside it —
      // "reachable", not sliced off past the column's own bottom edge.
      const reachable = await c.evaluate(`(() => {
        const info = document.querySelector('.info');
        info.scrollTop = info.scrollHeight;
        const cards = document.querySelectorAll('.card.option');
        const third = cards[cards.length - 1];
        return third.getBoundingClientRect().bottom <= info.getBoundingClientRect().bottom + 1;
      })()`);
      assert.equal(reachable, true, 'the third option card is reachable by scrolling .info');
    } finally { c.close(); }
  } finally { if (srv.exitCode === null) srv.kill(); }
});

// The SHORT case of the same header. A 14ch min-width floor on `.id` reserved 91.3px for the
// word "Home" (33.6px of text) and, because `.where` clips its overflow, left the subtitle
// "Chat" rendered at 0px wide — Destin: "a bunch of unnecessary empty blank space in the
// header?" (2026-09-05). Both halves are pinned: no dead space, and no truncation of a
// subtitle that fits.
test('a short surface name takes only its own width, and the subtitle beside it is not clipped', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-shorthead-'));
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import make_fixture; print(make_fixture(${JSON.stringify(tmp)}))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('deck.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const c = await cdp(await freePort(), 1440, 900);
  try {
    await sleep(800);
    await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/fixture.html?step=1` });
    for (let i = 0; i < 40 && !(await c.evaluate('!!window.__deckReady').catch(() => false)); i++) await sleep(250);
    await sleep(300);
    // The name's box must be its own text, not a reserved minimum: measure the text itself.
    const m = JSON.parse(await c.evaluate(`(() => {
      const t = document.querySelector('#wtitle'), s = document.querySelector('#wsub');
      const p = document.createElement('span');
      p.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:' + getComputedStyle(t).font;
      p.textContent = t.textContent; document.body.appendChild(p);
      const natTitle = p.getBoundingClientRect().width; p.remove();
      return JSON.stringify({ titleW: t.getBoundingClientRect().width, natTitle,
        subW: s.getBoundingClientRect().width, subClipped: s.scrollWidth > s.clientWidth + 1 });
    })()`));
    assert.ok(m.titleW < m.natTitle + 4, `the surface name reserves no dead space: box ${m.titleW}px for ${m.natTitle}px of text`);
    assert.equal(m.subClipped, false, 'a subtitle that fits is not ellipsized');
    assert.ok(m.subW > 0, `the subtitle is actually drawn (got ${m.subW}px wide)`);
    assert.deepEqual(c.errors, []);
  } finally { c.close(); srv.kill(); }
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
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--no-live', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
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
    assert.equal(await c.evaluate("document.querySelectorAll('#inner iframe[data-applied-theme=midnight]').length"), 2,
      'both panes acknowledge painted theme before a preview claims they are ready');
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
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--no-live', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
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

test('a question deck opens as pages and answers every question on one', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-words-'));
  // Fix (2026-09-05): the pages rewrite (task 3) dropped the finish-screen "Yes" pin — Q-4 is
  // the fixture's only `question`-kind step (Yes/No/Don't know), and it already answers Don't
  // know here, so a SECOND question-kind step (Q-5) is added just for this test so the finish
  // screen has to show one cell reading "Yes" and a different cell reading "Don't know" at the
  // same time, instead of one step's answer overwritten by the other's (which is all a single
  // step could ever prove). Kept local to this test — the shared words_spec fixture (and every
  // other test's step counts) is untouched.
  const py = `import sys, json; sys.path.insert(0, ${JSON.stringify(HERE)});
from fixture import words_spec
p = words_spec(${JSON.stringify(tmp)})
raw = json.load(open(p))
raw['steps'].append({'id': 'Q-5', 'words': True, 'surface': 'Games', 'path': 'Questions',
    'headline': 'Should an unanswered invite expire on its own?',
    'today': 'An invite waits forever until it is accepted or declined.',
    'problem': 'A stale invite from weeks ago still shows up as new.',
    'proposal': 'Invites disappear on their own after a day.'})
json.dump(raw, open(p, 'w'))
print(p)`;
  const fx = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('questions.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await sleep(800);
    const c = await cdp(await freePort(), 1440, 900);
    try {
      await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/questions.html` });
      for (let i = 0; i < 40 && !(await c.evaluate('window.__deckReady === true')); i++) await sleep(100);
      // A words-only deck is PAGES now: the fixture's marker splits Q-1/Q-2 from Q-3/Q-4.
      assert.equal(await c.evaluate('document.body.dataset.layout'), 'pages');
      assert.equal(await c.evaluate("getComputedStyle(document.querySelector('#stage')).display"), 'none');
      assert.equal(await c.evaluate("document.querySelectorAll('#steps span').length"), 2, 'one segment per page');
      assert.equal(await c.evaluate("document.querySelectorAll('article.q').length"), 2, 'both questions of page 1');
      assert.deepEqual(await c.evaluate("[...document.querySelectorAll('article.q')].map(a=>a.dataset.id)"), ['Q-1', 'Q-2']);
      // The column is capped, and wide enough for the three explanations to sit side by side —
      // Destin, 2026-09-06: "do 3 cards side-by-side horizontally". At 760px they were three
      // screens of scrolling before the first thing he can answer.
      assert.ok(await c.evaluate("document.querySelector('#cards').getBoundingClientRect().width <= 1121"), 'the column is capped');
      const partTops = await c.evaluate("JSON.stringify([...document.querySelectorAll('article.q[data-id=\"Q-1\"] .card.part')].map(e=>Math.round(e.getBoundingClientRect().top)))");
      assert.equal(new Set(JSON.parse(partTops)).size, 1, 'the three explanations share one row');
      // Everything he reads starts on one left edge: the option name, its bullets, and the
      // explanation text above them ("strange left/right margins", same review).
      const edges = JSON.parse(await c.evaluate("JSON.stringify(['.card.part p','.card.variant .oname','.card.variant li'].map(s=>Math.round(document.querySelector(s).getBoundingClientRect().left)))"));
      assert.ok(Math.max(...edges) - Math.min(...edges) <= 2, 'one left edge, got ' + edges.join(','));
      assert.equal(await c.evaluate("document.querySelectorAll('article.q[data-id=\"Q-1\"] .card.part').length"), 3, 'today / the problem / the proposal');
      assert.equal(await c.evaluate("document.querySelectorAll('article.q[data-id=\"Q-1\"] .card.option .badge').length"), 1, 'the recommended option is badged');
      // Every question carries its own answer row and its own note; the shared one is put away.
      assert.equal(await c.evaluate("document.querySelectorAll('article.q .qrow .note[data-id]').length"), 2);
      assert.equal(await c.evaluate("getComputedStyle(document.querySelector('#answers')).display"), 'none', 'the shared answer row is hidden');
      assert.equal(await c.evaluate("document.querySelector('#save').textContent"), 'Next page ›');

      // Pick on Q-1 and on Q-2 without the screen changing under him.
      await c.evaluate("document.querySelector('article.q[data-id=\"Q-1\"] .card.option').click()"); await sleep(200);
      await c.evaluate("document.querySelector('article.q[data-id=\"Q-2\"] .card.option[data-pick=b]').click()"); await sleep(200);
      assert.equal(await c.evaluate("document.querySelectorAll('article.q.done').length"), 2, 'both answered questions take the done edge');
      assert.match(await c.evaluate("document.querySelector('#count').textContent"), /^page 1 of 2 · 2 of 5 answered/);
      await c.evaluate("const n=document.querySelector('article.q[data-id=\"Q-1\"] .note'); n.value='smaller'; n.dispatchEvent(new Event('input', {bubbles:true}))");
      await sleep(500);

      // Next page: the statement and TWO yes/no/don't-know questions (Q-4, and Q-5 added above
      // just for this test), all on one page.
      await c.evaluate("document.querySelector('#save').click()"); await sleep(300);
      assert.match(await c.evaluate("document.querySelector('#count').textContent"), /^page 2 of 2 /);
      assert.equal(await c.evaluate("document.querySelector('#wtitle').textContent"), 'What we promise');
      assert.equal(await c.evaluate("document.querySelector('#wsub').textContent"), 'Statements, not questions.');
      assert.deepEqual(await c.evaluate("[...document.querySelectorAll('article.q')].map(a=>a.dataset.id)"), ['Q-3', 'Q-4', 'Q-5']);
      assert.equal(await c.evaluate("[...document.querySelectorAll('article.q[data-id=\"Q-3\"] .ans')].map(b=>b.textContent).join(',')"), 'Holds,Fails,Other');
      assert.deepEqual(await c.evaluate("[...document.querySelectorAll('article.q[data-id=\"Q-4\"] .ans')].map(b=>b.textContent)"), ['Yes', 'No', 'Other']);
      assert.deepEqual(await c.evaluate("[...document.querySelectorAll('article.q[data-id=\"Q-5\"] .ans')].map(b=>b.textContent)"), ['Yes', 'No', 'Other']);
      assert.equal(await c.evaluate("document.querySelector('#save').textContent"), 'Done', 'the last page finishes the deck');
      // Q-4 answers Don't know; Q-5 answers Yes — two DIFFERENT question-kind steps in two
      // different states, so the finish screen has to tell them apart, not just echo one value.
      await c.evaluate("document.querySelector('article.q[data-id=\"Q-4\"] .ans[data-v=other]').click()"); await sleep(300);
      await c.evaluate("document.querySelector('article.q[data-id=\"Q-5\"] .ans[data-v=yes]').click()"); await sleep(500);

      const answers = JSON.parse(readFileSync(spec.replace(/\.json$/, '.answers.json'), 'utf8'));
      assert.deepEqual([answers.answers['Q-1'].v, answers.answers['Q-1'].pick], ['pick', 'a']);
      assert.equal(answers.answers['Q-1'].note, 'smaller');
      assert.deepEqual([answers.answers['Q-2'].v, answers.answers['Q-2'].pick], ['pick', 'b']);
      // Round 2 (2026-11-09): "Don't know" became plain "Other" — one button, no flag.
      assert.deepEqual([answers.answers['Q-4'].v, answers.answers['Q-4'].dk], ['other', undefined]);
      assert.equal(answers.answers['Q-5'].v, 'yes', 'the second question-kind step answers yes');
      // A page marker is not a step: it is never in the deck's steps and never gets an answer.
      assert.equal(await c.evaluate('DECK.steps.some(s => s.id === "P-2")'), false);
      assert.equal(answers.answers['P-2'], undefined);

      // Prev returns to page 1 with both picks still painted on.
      await c.evaluate("document.querySelector('#prev').click()"); await sleep(300);
      assert.deepEqual(await c.evaluate("[...document.querySelectorAll('article.q')].map(a=>a.classList.contains('done'))"), [true, true]);
      assert.equal(await c.evaluate("document.querySelectorAll('article.q .card.variant.on').length"), 2, 'both picks still lit');

      // Fix (2026-09-05): restore the note-clearing pin the pages rewrite dropped — page.js's
      // #cards input handler writes `note: n.value` verbatim, so clearing the box must clear
      // (or blank) the saved field too, not leave the earlier text sitting in the answers file.
      // Blocks, not bare `const n = …` again: Runtime.evaluate shares ONE top-level scope
      // across calls, and line 297's `const n` above is still declared in it — a second bare
      // `const n` throws "Identifier 'n' has already been declared" instead of clearing anything.
      await c.evaluate("{ const n=document.querySelector('article.q[data-id=\"Q-1\"] .note'); n.value=''; n.dispatchEvent(new Event('input', {bubbles:true})); }");
      await sleep(500);
      const cleared = JSON.parse(readFileSync(spec.replace(/\.json$/, '.answers.json'), 'utf8'));
      assert.equal((cleared.answers['Q-1'].note || ''), '', 'clearing the note clears (or blanks) the saved field');
      // Put the note back so the rest of this test (and the finish screen) still reads it.
      await c.evaluate("{ const n=document.querySelector('article.q[data-id=\"Q-1\"] .note'); n.value='smaller'; n.dispatchEvent(new Event('input', {bubbles:true})); }");
      await sleep(500);

      // The finish screen still names STEPS, not pages.
      await c.evaluate("document.querySelector('#done').click()"); await sleep(300);
      await c.evaluate("document.querySelector('#submit').click()"); await sleep(1200);
      assert.equal(await c.evaluate('document.body.dataset.screen'), 'finished');
      const rows = JSON.parse(await c.evaluate(
        "JSON.stringify([...document.querySelectorAll('#responses tbody tr')].map(r=>[...r.cells].map(c=>c.textContent.trim())))"));
      assert.equal(rows.length, 5, 'five steps, not two pages');
      assert.equal(rows[3][2], 'Something else');
      assert.equal(rows[4][2], 'Yes', 'a question answered yes reads back as "Yes", not the picture deck\'s "Yes, keep it"');
      assert.deepEqual(c.errors, []);
    } finally { c.close(); }
  } finally { srv.kill(); }
});

// A CONTRACT deck is picture-free, but it is NOT a pages deck: it stays one step per screen.
// It became one long scroll when words_only() alone decided pages — the acceptance deck was
// 5,884px tall with its first question at y=3739 (measured 2026-09-05). The table still needs
// real width, which the words layout's own `:has(.contract)` rule gives it.
test('a contract deck is step-per-screen, and its table still gets real width', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-contract-wide-'));
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import contract_spec; print(contract_spec(${JSON.stringify(tmp)}))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('arcade.contract.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const c = await cdp(await freePort(), 1440, 900);
  try {
    await sleep(800);
    await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/arcade.contract.html` });
    for (let i = 0; i < 40 && !(await c.evaluate('window.__deckReady === true')); i++) await sleep(100);
    assert.equal(await c.evaluate('document.body.dataset.layout'), 'words', 'a contract deck keeps one step per screen');
    assert.equal(await c.evaluate("document.querySelector('#content').classList.contains('pages')"), false, 'a contract deck is never paged');
    const cardsW = await c.evaluate("document.querySelector('#cards').getBoundingClientRect().width");
    assert.ok(cardsW > 800, `cards should be wider than 800px at 1440x900, got ${cardsW}`);
    assert.deepEqual(c.errors, []);
  } finally { c.close(); srv.kill(); }
});

// A shot's FILENAME must name the palette the picture is actually in. `page.js` overrides
// `?theme=` for a step carrying its own `themes` list, so a narrowly-themed step requested as
// midnight was shot in its own palette and saved as `p2-midnight-….png` — a filename that lies.
test('a step with its own themes is named for the palette it was actually shot in', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-themename-'));
  const py = `import sys, json; sys.path.insert(0, ${JSON.stringify(HERE)});
from fixture import make_fixture
p = make_fixture(${JSON.stringify(tmp)})
raw = json.load(open(p)); raw['steps'][1]['themes'] = ['light']
json.dump(raw, open(p, 'w'))
print(p)`;
  const fx = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('deck.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await sleep(800);
    const out = mkdtempSync(join(tmpdir(), 'deck-themeshots-'));
    const r = await renderDeck({ url: `http://127.0.0.1:${port}/fixture.html`, out, sizes: ['1440x900'], themes: ['midnight'], pages: 3 });
    // Step 1 and 3 carry no themes of their own and are shot in the requested midnight.
    assert.ok(r.files.some(f => f.endsWith('p1-midnight-1440x900.png')), r.files.join('\n'));
    assert.ok(r.files.some(f => f.endsWith('p3-midnight-1440x900.png')), r.files.join('\n'));
    // Step 2 lists only `light`, so the page opens in light — and the file says light.
    assert.ok(r.files.some(f => f.endsWith('p2-light-1440x900.png')), r.files.join('\n'));
    assert.ok(!r.files.some(f => f.endsWith('p2-midnight-1440x900.png')), 'no file claims a palette the page was not in');
    // And the caller is told, so `preview` can print it.
    assert.equal(r.themeSwaps.length, 1, JSON.stringify(r.themeSwaps));
    assert.match(r.themeSwaps[0], /shot in light, not midnight/);
    assert.deepEqual(r.errors, []);
  } finally { srv.kill(); }
});

// A deck with ONE page and no markers: the whole question set on one screen, and the forward
// button is the end of the deck rather than a page turn.
test('a question deck with no markers is one page whose button reads Done', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-onepage-'));
  const py = `import sys, json; sys.path.insert(0, ${JSON.stringify(HERE)});
from fixture import words_spec
p = words_spec(${JSON.stringify(tmp)})
raw = json.load(open(p)); raw['steps'].pop(2)
json.dump(raw, open(p, 'w'))
print(p)`;
  const fx = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('questions.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const c = await cdp(await freePort(), 1440, 900);
  try {
    await sleep(800);
    await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/questions.html` });
    for (let i = 0; i < 40 && !(await c.evaluate('window.__deckReady === true')); i++) await sleep(100);
    assert.equal(await c.evaluate("document.querySelectorAll('#steps span').length"), 1, 'one page, one segment');
    assert.equal(await c.evaluate("document.querySelectorAll('article.q').length"), 4, 'every question on it');
    assert.equal(await c.evaluate("document.querySelector('#save').textContent"), 'Done');
    assert.equal(await c.evaluate("document.querySelector('#wtitle').textContent"), 'Questions fixture', 'the implicit page wears the deck title');
    // Fix (2026-09-05): a one-page deck has nothing to move BETWEEN — Prev/Next and the single
    // (always-full) progress segment used to sit there as dead controls.
    assert.equal(await c.evaluate("document.querySelector('#prev').hidden"), true, 'nothing to move between on a one-page deck');
    assert.equal(await c.evaluate("document.querySelector('#next').hidden"), true);
    assert.equal(await c.evaluate("document.querySelector('#steps').hidden"), true);
    assert.deepEqual(c.errors, []);
  } finally { c.close(); srv.kill(); }
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
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
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

// `preview` is the whole point of render.mjs: a session looks at the deck as pictures before
// it hands Destin the link. Four sessions in one day served a deck with a visible header
// defect because nobody had looked. The words fixture is two pages; two sizes and two themes
// make eight shots plus the contact sheet that a session actually reads.
test('preview writes one png per page × size × theme and a contact sheet', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-preview-'));
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import words_spec; print(words_spec(${JSON.stringify(tmp)}))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('.json'), fx.stderr);
  const out = join(tmp, 'shots');
  const r = spawnSync('python3', [RC, 'preview', spec, '--sizes', '1440x900,1024x768', '--themes', 'midnight,light', '--out', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const size of ['1440x900', '1024x768'])
    for (const n of [1, 2])
      for (const theme of ['midnight', 'light']) {
        const f = join(out, `p${n}-${theme}-${size}.png`);
        assert.ok(existsSync(f), `missing ${f}\n${r.stdout}${r.stderr}`);
        assert.ok(statSync(f).size > 1000, `empty ${f}`);
        assert.match(r.stdout, new RegExp(`p${n}-${theme}-${size}\\.png`), 'every file is named on stdout');
      }
  assert.ok(existsSync(join(out, 'contact.png')), 'contact sheet');
  assert.ok(statSync(join(out, 'contact.png')).size > 1000, 'contact sheet is not blank');
  assert.match(r.stdout, /contact: /);
  // The server preview starts must not outlive it, and must never take the serve lock —
  // a session that previews a deck then serves it would otherwise be refused as "already served".
  assert.equal(existsSync(join(dirname(spec), 'questions.serve.json')), false, 'preview takes no serve lock');
});

test('a server-down live pane makes preview fail instead of accepting a text-only shot', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-live-down-'));
  const deadBase = `http://127.0.0.1:${await freePort()}`;
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import live_spec; print(live_spec(${JSON.stringify(tmp)}, base=${JSON.stringify(deadBase)}))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('live.json'), fx.stderr);
  const build = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' });
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--no-live', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await sleep(800);
    const r = await renderDeck({ url: `http://127.0.0.1:${port}/live.html`, out: join(tmp, 'shots'), sizes: ['640x480'], themes: ['midnight'], pages: 1 });
    assert.ok(r.errors.some(e => e.includes('live app server unavailable')), JSON.stringify(r.errors));
  } finally { srv.kill(); }
});

// A page that never sets window.__deckReady used to be screenshotted silently: the bounded
// poll (40 × 250ms) would just time out and renderDeck would shoot whatever was on screen with
// no sign anything was wrong. A plain, no-JS HTML file served over file:// is the simplest
// fixture that never sets the flag — no deck, no server, nothing else that could go wrong.
test('a page that never becomes ready is reported, not screenshotted silently', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-neverready-'));
  const html = join(tmp, 'never-ready.html');
  writeFileSync(html, '<!doctype html><html><body>this page never sets __deckReady</body></html>');
  const out = join(tmp, 'shots');
  const { files, errors } = await renderDeck({ url: `file://${html}`, out, sizes: ['640x480'], themes: ['x'], pages: 1 });
  // The function returns (rather than hanging forever on a page that will never be ready) and
  // still writes the shot — a session should be able to see what WAS on screen — but the run
  // now says, in the errors list, that this exact page never finished.
  assert.equal(files.length, 1, 'still writes the shot');
  assert.ok(existsSync(files[0]));
  assert.equal(errors.length, 1, 'exactly one error, naming this page');
  assert.equal(errors[0], 'p1 x 640x480: the page never finished laying out (window.__deckReady was never set)');
});

// The FIXTURE DECK behind `review-cards.py selfie`: one deck carrying every kind of step, a
// one-run brief, and a two-page question deck. It is the thing the deck's own changes are
// reviewed against, so if a kind stops building — or a page throws while it draws — the
// selfie is measuring the wrong thing and says nothing about the change. `--dry-run` lays the
// fixture out without checking anything out or rendering; this test then builds and opens it.
test('the selfie fixture holds every kind of step and every page opens clean', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-selfie-'));
  const lay = spawnSync('python3', [RC, 'selfie', '--dry-run', '--out', tmp], { encoding: 'utf8' });
  assert.equal(lay.status, 0, lay.stdout + lay.stderr);
  const deck = join(tmp, 'deck');
  // Every kind at once: approve, choice, decide, contract and (when ffmpeg made the
  // recordings) clip in one spec; a one-run brief; a question deck with a page marker.
  const kinds = JSON.parse(readFileSync(join(deck, 'selfie.json'), 'utf8')).steps;
  assert.ok(kinds.some(s => s.changed && s.crop), 'an approve step');
  assert.ok(kinds.some(s => s.variants), 'a choice step');
  assert.ok(kinds.some(s => s.options), 'a decide step');
  assert.ok(kinds.some(s => s.rows), 'a contract step');
  const pageCounts = {};
  for (const stem of ['selfie', 'selfie-brief', 'selfie-questions']) {
    const spec = join(deck, `${stem}.json`);
    const b = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' });
    assert.equal(b.status, 0, `${stem} does not build:\n${b.stdout}${b.stderr}`);
    const n = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(join(HERE, '..'))});
from deck.preview import page_count
from deck.spec import load_spec
print(page_count(load_spec(${JSON.stringify(spec)})))`], { encoding: 'utf8' });
    pageCounts[stem] = Number(n.stdout.trim());
    assert.ok(pageCounts[stem] >= 1, `${stem} page count: ${n.stdout}${n.stderr}`);
  }
  // The three built pages share one folder, so one server reaches all of them.
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', join(deck, 'selfie.json'), '--no-build', '--port', String(port), '--timeout', '3'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let srvOut = ''; srv.stdout.on('data', d => srvOut += d);
  try {
    await sleep(800);
    for (const stem of ['selfie', 'selfie-brief', 'selfie-questions']) {
      const out = join(tmp, 'shots', stem);
      const { files, errors } = await renderDeck({
        url: `http://127.0.0.1:${port}/${stem}.html`, out,
        sizes: ['1440x900'], themes: ['midnight'], pages: pageCounts[stem],
      });
      assert.deepEqual(errors, [], `${stem} logged an error while being shot\n${srvOut}`);
      assert.equal(files.length, pageCounts[stem], `${stem}: one picture per page`);
      for (const f of files) assert.ok(statSync(f).size > 1000, `blank ${f}`);
    }
    // Finding 1: the settle knob used to stand in for a real event — Chrome's spinning
    // loading ring over a video it had not finished fetching, at a different angle every
    // shot, which selfie then boxed as a false change. render.mjs now polls screenshots
    // until the picture itself stops changing (the real event `selfie` cares about) instead
    // of guessing a duration. Prove it at the DEFAULT settle: render the clip page twice and
    // assert the two PNGs read the same picture. `-fuzz 1%` tolerates the 1-unit-of-255
    // antialiasing noise Chrome's own rounded-corner rasterizer produces around a page that
    // holds a <video>, measured on this same fix (2026-09-05) and unrelated to the spinner
    // bug being guarded against — a real regression (the spinner mid-spin) differs by
    // hundreds of thousands of pixels, nowhere near this margin.
    const clipPage = kinds.findIndex(s => 'clip' in s) + 1;
    if (clipPage > 0) {
      const outA = join(tmp, 'clip-a'), outB = join(tmp, 'clip-b');
      const rA = await renderDeck({ url: `http://127.0.0.1:${port}/selfie.html`, out: outA, sizes: ['1440x900'], themes: ['midnight'], pages: clipPage });
      const rB = await renderDeck({ url: `http://127.0.0.1:${port}/selfie.html`, out: outB, sizes: ['1440x900'], themes: ['midnight'], pages: clipPage });
      assert.deepEqual(rA.errors, [], `clip render A logged an error: ${JSON.stringify(rA.errors)}`);
      assert.deepEqual(rB.errors, [], `clip render B logged an error: ${JSON.stringify(rB.errors)}`);
      const fileA = rA.files.at(-1), fileB = rB.files.at(-1);
      const cmp = spawnSync('magick', ['compare', '-metric', 'AE', '-fuzz', '1%', fileA, fileB, join(tmp, 'clip-diff.png')], { encoding: 'utf8' });
      assert.equal(cmp.status, 0, `clip page differed between two renders of the same code at the default settle: ${cmp.stderr}`);
    }
  } finally { if (srv.exitCode === null) srv.kill(); }
});

// One deck, three slides that used to need two decks. Destin, 2026-09-06: the capture set is a
// property of the PICTURE, not of the deck, and he should never be handed two links for one ask.
test('one deck holds a single-picture slide, a before/after slide and a written question', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-mixed-'));
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import mixed_spec; print(mixed_spec(${JSON.stringify(tmp)}))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('mixed.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const c = await cdp(await freePort(), 1440, 900);
  const open = async step => {
    await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/mixed.html?step=${step}` });
    for (let i = 0; i < 40 && !(await c.evaluate('window.__deckReady === true').catch(() => false)); i++) await sleep(150);
    await sleep(300);
  };
  try {
    await sleep(800);
    // Slide 1 names one capture out of the deck's pair: one frame, its own caption, and the
    // buttons of something not built yet.
    await open(1);
    assert.equal(await c.evaluate("document.querySelectorAll('#inner .frame').length"), 1, 'a one-capture slide shows one frame');
    assert.match(await c.evaluate("document.querySelector('#inner .frame figcaption').textContent"), /Today/, 'the slide captions its own capture');
    assert.match(await c.evaluate("document.querySelector('.ans[data-v=\"yes\"]').textContent"), /build it/, 'one picture asks whether to build it');
    // Slide 2 names none, so it shows the deck's pair and asks whether to keep it.
    await open(2);
    assert.equal(await c.evaluate("document.querySelectorAll('#inner .frame').length"), 2, 'a slide with no runs of its own shows the pair');
    assert.match(await c.evaluate("document.querySelector('.ans[data-v=\"yes\"]').textContent"), /keep it/, 'two pictures ask whether to keep it');
    // Slide 3 is a written question on a screen of its own: the three explanations are one
    // full-width row, not three slivers beside the options (Destin saw ~90px columns).
    await open(3);
    const parts = JSON.parse(await c.evaluate("JSON.stringify([...document.querySelectorAll('.parts .card.part')].map(e => Math.round(e.getBoundingClientRect().width)))"));
    assert.equal(parts.length, 3, 'today, the problem and the proposal');
    for (const w of parts) assert.ok(w > 240, `each explanation should be readable, got ${JSON.stringify(parts)}`);
    const partsW = await c.evaluate("document.querySelector('.parts').getBoundingClientRect().width");
    const cardsW = await c.evaluate("document.querySelector('#cards').getBoundingClientRect().width");
    assert.ok(partsW > cardsW * 0.9, `the explanations take the full row (${partsW} of ${cardsW})`);
    assert.deepEqual(c.errors, []);
  } finally { c.close(); srv.kill(); }
});
// The two answer shapes that are about HOW he answers, not what he is looking at. Destin,
// 2026-09-06: "A and C, drop B" and "call it this" both had nowhere to go but the note box.
test('a slide can take several picks, and a slide can take an answer he types', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-shapes-'));
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import shapes_spec; print(shapes_spec(${JSON.stringify(tmp)}, paged=False))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('shapes.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const c = await cdp(await freePort(), 1440, 900);
  const open = async step => {
    await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/shapes.html?step=${step}` });
    for (let i = 0; i < 40 && !(await c.evaluate('window.__deckReady === true').catch(() => false)); i++) await sleep(150);
    await sleep(300);
  };
  try {
    await sleep(800);
    await open(1);
    assert.match(await c.evaluate("document.querySelector('.pickhint').textContent"), /as many as you like/);
    // Two clicks, two chosen — a pick-one would have replaced the first with the second.
    await c.evaluate("document.querySelector('.card.variant[data-pick=\"a\"]').click()");
    await c.evaluate("document.querySelector('.card.variant[data-pick=\"c\"]').click()");
    await sleep(200);
    assert.equal(await c.evaluate("document.querySelectorAll('.card.variant.on').length"), 2, 'two options chosen at once');
    // Clicking a chosen one again unpicks it, and unpicking the last one unanswers the slide.
    await c.evaluate("document.querySelector('.card.variant[data-pick=\"c\"]').click()");
    await sleep(200);
    assert.equal(await c.evaluate("document.querySelectorAll('.card.variant.on').length"), 1, 'clicking again unpicks');
    // Unpicking the LAST one leaves the slide unanswered, rather than answered with nothing.
    await c.evaluate("document.querySelector('.card.variant[data-pick=\"a\"]').click()");
    await sleep(200);
    assert.equal(await c.evaluate("document.querySelectorAll('.card.variant.on').length"), 0);
    assert.match(await c.evaluate("document.querySelector('#count').textContent"), /0 answered/);
    await c.evaluate("document.querySelector('.card.variant[data-pick=\"a\"]').click()");
    await sleep(200);
    await open(2);
    const box = "document.querySelector('#answers .ans-write')";
    assert.ok(await c.evaluate(`!!${box}`), 'a write slide answers with a box, not buttons');
    assert.equal(await c.evaluate(`${box}.placeholder`), 'What should it be called?');
    await c.evaluate(`(()=>{const t=${box};t.value='The shelf';t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await sleep(500);
    assert.deepEqual(c.errors, []);
    // What he chose and what he wrote both survive the round trip to the answers file.
    const ans = JSON.parse(await c.evaluate("fetch('/answers').then(r=>r.text())"));
    assert.equal(ans.answers['Q-1'].v, 'picks');
    assert.deepEqual(ans.answers['Q-1'].picks, ['a']);
    assert.equal(ans.answers['Q-2'].v, 'wrote');
    assert.equal(ans.answers['Q-2'].text, 'The shelf');
    // The TRY-IT slide: the deck cannot hold the real app, so it holds the exact command and
    // takes the verdict. The command must be readable in full, not scrolling inside a column.
    await open(3);
    const cmd = await c.evaluate("document.querySelector('.card.dev .cmd code').textContent");
    assert.equal(cmd, 'bash scripts/run-dev.sh feat/shapes --label "Shapes" --offset 130 --profile shapes');
    assert.match(await c.evaluate("document.querySelector('.ans[data-v=\"yes\"]').textContent"), /it works/);
    const cardW = await c.evaluate("document.querySelector('.card.dev').getBoundingClientRect().width");
    const rowW = await c.evaluate("document.querySelector('#cards').getBoundingClientRect().width");
    assert.ok(cardW > rowW * 0.9, `the command takes the full row (${cardW} of ${rowW})`);
    assert.ok(await c.evaluate("!!document.querySelector('.card.dev .copycmd')"), 'a copy button');
  } finally { c.close(); srv.kill(); }
});

// The button that OPENS the dev window (Destin, 2026-09-06: "can we possibly just make a button
// that launches it instead of a command I have to copy-paste?"). Never launches the real thing
// here: YOUCODED_WORKSPACE points the server at a temp workspace whose run-dev.sh is a stub that
// records its arguments and sleeps, so this test can never paint a window on anyone's desktop.
test('the try-it slide opens the dev window from a button, and the server builds the command', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-dev-'));
  const ws = join(tmp, 'ws');
  mkdirSync(join(ws, 'scripts'), { recursive: true });
  const marker = join(ws, 'launched.txt');
  writeFileSync(join(ws, 'scripts', 'run-dev.sh'),
    `#!/bin/bash\nprintf '%s\\n' "$@" > ${JSON.stringify(marker)}\nsleep 30\n`);
  spawnSync('chmod', ['+x', join(ws, 'scripts', 'run-dev.sh')]);
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import shapes_spec; print(shapes_spec(${JSON.stringify(tmp)}, paged=False))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('shapes.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const env = { ...process.env, YOUCODED_WORKSPACE: ws };
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'], env });
  const c = await cdp(await freePort(), 1440, 900);
  try {
    await sleep(800);
    await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/shapes.html?step=3` });
    for (let i = 0; i < 40 && !(await c.evaluate('window.__deckReady === true').catch(() => false)); i++) await sleep(150);
    await sleep(600);
    // The button is revealed only once a server has answered — as a plain file there is
    // nothing to ask, and the command stays as the way through.
    assert.equal(await c.evaluate("document.body.dataset.served"), '1');
    assert.equal(await c.evaluate("getComputedStyle(document.querySelector('.opendev')).display !== 'none'"), true);
    await c.evaluate("document.querySelector('.opendev').click()");
    for (let i = 0; i < 40 && !existsSync(marker); i++) await sleep(150);
    assert.ok(existsSync(marker), 'the server started the dev window');
    // The command is rebuilt from the SPEC, never taken from the page.
    assert.deepEqual(readFileSync(marker, 'utf8').trim().split('\n'),
      ['feat/shapes', '--label', 'Shapes', '--offset', '130', '--profile', 'shapes']);
    await sleep(400);
    assert.match(await c.evaluate("document.querySelector('.opendev').textContent"), /Opening|Already/);
    // Pressing it again does not start a second one on the same profile.
    await c.evaluate("(()=>{const b=document.querySelector('.opendev');b.disabled=false;b.click();})()");
    await sleep(600);
    assert.match(await c.evaluate("document.querySelector('.card.dev .devnote').textContent"), /still running|separate window/);
    assert.deepEqual(c.errors, []);
  } finally { c.close(); srv.kill(); }
});

// ONE screen of the app fills the stage — Destin, 2026-09-06: "better fitted in the window so I
// can use the whole thing without scrolling." A first version measured the pane in JS, forgot
// the caption above it, and clipped the app's bottom strip; CSS sizes it now, so this pins the
// box rather than the arithmetic.
test('a single app pane fills the stage instead of taking a declared height', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-fill-'));
  const stub = spawn('python3', ['-c',
    `import sys, time; sys.path.insert(0, ${JSON.stringify(HERE)});\n` +
    `from fixture import LivePaneServer\n` +
    `s = LivePaneServer()\n` +
    `print(s.base, flush=True)\n` +
    `time.sleep(300)`], { stdio: ['ignore', 'pipe', 'pipe'] });
  const base = await new Promise((res, rej) => {
    let out = ''; stub.stdout.on('data', d => { out += d; if (out.includes('\n')) res(out.trim()); });
    setTimeout(() => rej(new Error('stub pane server never printed its address')), 10000);
  });
  const py = `import sys, json; sys.path.insert(0, ${JSON.stringify(HERE)});
from fixture import live_spec
p = live_spec(${JSON.stringify(tmp)}, base=${JSON.stringify(base)})
r = json.load(open(p))
r['steps'] = [{'id': 'A-1', 'surface': 'Chat', 'path': 'The whole screen',
               'headline': 'This is the real screen — look around.',
               'notice': 'Everything here is the app itself.',
               'live': {'app': 'site'}}]
json.dump(r, open(p, 'w'))
print(p)`;
  const fx = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('live.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--no-live', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const c = await cdp(await freePort(), 1440, 900);
  try {
    await sleep(800);
    await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/live.html` });
    for (let i = 0; i < 40 && !(await c.evaluate('window.__deckReady === true').catch(() => false)); i++) await sleep(150);
    await sleep(600);
    assert.equal(await c.evaluate("document.querySelector('#content').classList.contains('live-fill')"), true);
    const box = JSON.parse(await c.evaluate("(()=>{const s=document.querySelector('.stage').getBoundingClientRect(),"
      + "f=document.querySelector('#inner iframe').getBoundingClientRect(),"
      + "cap=document.querySelector('#inner figcaption').getBoundingClientRect(),"
      + "hint=document.querySelector('#livehint'), hs=getComputedStyle(hint);"
      + "return JSON.stringify({s:{w:s.width,h:s.height,b:s.bottom},f:{w:f.width,h:f.height,b:f.bottom},"
      + "cap:cap.height,hint:hint.getBoundingClientRect().height+parseFloat(hs.marginTop)+parseFloat(hs.marginBottom)});})()"));
    // Tall: everything the stage has, minus its padding, the now-before-pane
    // operating hint, and the caption. Neither hint nor the app may be clipped.
    assert.ok(box.f.h > box.s.h - box.cap - box.hint - 40,
      `pane ${box.f.h} should fill stage ${box.s.h} (caption ${box.cap}, hint ${box.hint})`);
    // And never past it — the clipped bottom strip is exactly what this guards.
    assert.ok(box.f.b <= box.s.b + 1, `pane bottom ${box.f.b} must stay inside the stage ${box.s.b}`);
    assert.ok(box.f.w > box.s.w - 40, `pane ${box.f.w} should fill stage ${box.s.w}`);
    assert.ok(box.s.h > 300, `the stage should claim the free row, got ${box.s.h}`);
    assert.deepEqual(c.errors, []);
  } finally { c.close(); srv.kill(); stub.kill(); }
});

// Lost answers (2026-09-23: two shutdowns cost Destin answers he had given). Every save now
// shows whether it landed and retries until it does; a page older than the file folds the file
// in instead of being refused silently; a reload merges the browser's backup with the file.
test('a save that fails says so and retries, and a restart or a stale page loses nothing', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-save-'));
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import make_fixture; print(make_fixture(${JSON.stringify(tmp)}))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); const answersFile = join(dirname(spec), 'deck.answers.json');
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const start = () => spawn('python3', [RC, 'serve', spec, '--no-build', '--port', String(port), '--timeout', '2'], { stdio: 'ignore' });
  const onDisk = () => JSON.parse(readFileSync(answersFile, 'utf8')).answers;
  const until = async (f, what) => { for (let i = 0; i < 60; i++) { if (await f()) return; await sleep(100); } assert.fail('timed out waiting for ' + what); };
  let srv = start(); const c = await cdp(await freePort(), 1280, 800);
  const url = `http://127.0.0.1:${port}/fixture.html`;
  const open = async (step) => { await c.send('Page.navigate', { url: url + '?step=' + step }); await until(() => c.evaluate('!!window.__deckReady').catch(() => false), 'the deck'); };
  const savedText = () => c.evaluate("document.querySelector('#saved').hidden ? '' : document.querySelector('#saved').textContent");
  await sleep(800); await open(2);
  await c.evaluate("document.querySelector('.ans[data-v=yes]').click()");
  await until(async () => (await savedText()) === 'Saved ✓', '"Saved"');
  // Fix (2026-11-10): "Saved ✓" is already on screen from the page LOAD, so the wait above can
  // return before this click's save has landed — the file was then read too early (ENOENT),
  // and the failed test left its browser open, hanging the whole run. Wait for the file itself.
  await until(async () => { try { return onDisk()['S-2'].v === 'yes'; } catch { return false; } }, 'the first answer to reach the file');
  assert.equal(onDisk()['S-2'].v, 'yes');
  // The server dies while the page is open: the next answer says it is NOT saved.
  await open(1);
  srv.kill(); await new Promise(r => srv.on('exit', r));
  await c.evaluate("document.querySelector('.ans[data-v=no]').click()");
  await until(async () => (await savedText()).startsWith('NOT saved'), '"NOT saved"');
  assert.equal(await c.evaluate("document.querySelector('#saved').dataset.ok"), '0');
  // It comes back on the same address; the retry lands without anyone touching the page.
  srv = start();
  try {
    await until(async () => (await savedText()) === 'Saved ✓', 'the retry to land');
    assert.equal(onDisk()['S-1'].v, 'no'); assert.equal(onDisk()['S-2'].v, 'yes');

    // A stale page: something else saved S-3 after this page loaded. The page's next save is
    // refused by the server (it would drop S-3), so the page folds the file in and saves both.
    const disk = JSON.parse(readFileSync(answersFile, 'utf8'));
    disk.answers['S-3'] = { v: 'other', note: 'from elsewhere', t: Date.now() };
    await fetch(`http://127.0.0.1:${port}/answers`, { method: 'POST', headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}` }, body: JSON.stringify(disk) });
    await c.evaluate("document.querySelector('.ans[data-v=yes]').click()");   // S-1 changes to yes
    await until(async () => onDisk()['S-1'].v === 'yes', 'the merged save');
    assert.equal(onDisk()['S-3'].note, 'from elsewhere', 'the answer saved elsewhere survives');
    assert.equal(await savedText(), 'Saved ✓');

    // A crash between the click and the save: the answer is only in the browser's backup.
    // Reloading the deck puts it back in the file.
    await c.evaluate(`(() => { const k = 'deck:fixture'; const s = JSON.parse(localStorage.getItem(k)); s.answers['S-4'] = { v: 'yes', t: Date.now() }; localStorage.setItem(k, JSON.stringify(s)); })()`);
    await open(1);
    await until(async () => onDisk()['S-4']?.v === 'yes', 'the backup to reach the file');
    assert.deepEqual(c.errors, []);
  } finally { c.close(); srv.kill(); }
});

// WHY (submit-ticket friction, proposal 10): a tall popup's before/after (a 620×750 close-up
// shot at 1.5×) scored under the 50% floor side by side, so the page fell back to COMPACT and
// stacked the two pictures at full size — only the top of "Today" was on screen until you
// scrolled, on every ticket slide. Two tall pictures now stay side by side, shrunk to fit.
test('two tall pictures sit side by side and fit the screen instead of stacking', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-tall-'));
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import make_fixture; print(make_fixture(${JSON.stringify(tmp)}))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('deck.json'), fx.stderr);
  const mk = spawnSync('python3', ['-c', `import sys, os; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import shoot_run
for run, rect in (('before', None), ('after', (500, 300, 100, 40))):
    shoot_run(os.path.join(${JSON.stringify(tmp)}, 'sruns', run), [{'name': 'settings/sound', 'theme': t, 'rect': rect, 'scale': 1.5} for t in ('midnight', 'light')])`], { encoding: 'utf8' });
  assert.equal(mk.status, 0, mk.stderr);
  const s = JSON.parse(readFileSync(spec, 'utf8'));
  s.runs = { before: join(tmp, 'sruns', 'before'), after: join(tmp, 'sruns', 'after') };
  s.steps = [{ id: 'T-1', surface: 'Submit a ticket', path: 'Settings', crop: 'settings/sound@620x750+410+75', headline: 'A tall popup changed.', changed: 'A block was painted.', notice: 'You see it.' }];
  writeFileSync(spec, JSON.stringify(s));
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await sleep(800);
    for (const size of ['1440x900', '1512x860']) {
      const [w, h] = size.split('x').map(Number); const c = await cdp(await freePort(), w, h);
      try {
        await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/fixture.html?step=1` });
        for (let i = 0; i < 40 && !(await c.evaluate('!!window.__deckReady').catch(() => false)); i++) await sleep(250);
        await sleep(300);
        const m = JSON.parse(await c.evaluate(`JSON.stringify({ layout: document.body.dataset.layout, ih: innerHeight,
          imgs: [...document.querySelectorAll('#inner img')].map((i) => { const r = i.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), bottom: Math.round(r.bottom) }; }) })`));
        assert.notEqual(m.layout, 'compact', size);
        assert.equal(m.imgs.length, 2);
        assert.equal(m.imgs[0].top, m.imgs[1].top, `${size}: side by side, not stacked ${JSON.stringify(m.imgs)}`);
        assert.ok(m.imgs.every((i) => i.bottom <= m.ih), `${size}: both pictures whole on screen ${JSON.stringify(m)}`);
        assert.deepEqual(c.errors, [], size);
      } finally { c.close(); }
    }
  } finally { srv.kill(); }
});

// Close-session friction, proposals 8 and 16: a choice's designs are compared side by side.
// Composite designs (folded + opened) used to stack full width with the second under the answer
// bar; three tall designs were fitted to the height and came out ~250px wide.
async function choiceDeck(mode) {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-choice-'));
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import make_fixture; print(make_fixture(${JSON.stringify(tmp)}))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('deck.json'), fx.stderr);
  const mk = spawnSync('python3', ['-c', `import sys, os; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import shoot_run
shoot_run(os.path.join(${JSON.stringify(tmp)}, 'sruns', 'after'), [{'name': n, 'theme': t, 'rect': (500, 300, 100, 40), 'scale': 1.5} for n in ('a/x', 'a/y', 'a/z') for t in ('midnight', 'light')])`], { encoding: 'utf8' });
  assert.equal(mk.status, 0, mk.stderr);
  const s = JSON.parse(readFileSync(spec, 'utf8'));
  s.runs = { after: join(tmp, 'sruns', 'after') };
  const ids = mode === 'composite' ? ['x', 'y'] : ['x', 'y', 'z'];
  s.steps = [{ id: 'C-1', surface: 'Popup', path: 'Settings', headline: 'Which design?', variants: ids.map((id) => ({ id, label: `Design ${id}`, summary: 'A short summary of this design.',
    crop: mode === 'composite' ? [{ crop: `a/${id}@420x500+500+100`, label: 'Folded' }, { crop: `a/${id}@420x500+500+100`, label: 'Open' }] : `a/${id}@420x740+500+100` })) }];
  writeFileSync(spec, JSON.stringify(s));
  const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr + r.stdout);
  return spec;
}
async function measureChoice(spec, w, h) {
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const c = await cdp(await freePort(), w, h);
  try {
    await sleep(800);
    await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/fixture.html?step=1` });
    for (let i = 0; i < 40 && !(await c.evaluate('!!window.__deckReady').catch(() => false)); i++) await sleep(250);
    await sleep(300);
    assert.deepEqual(c.errors, []);
    return JSON.parse(await c.evaluate(`JSON.stringify({ layout: document.body.dataset.layout, imgs: [...document.querySelectorAll('#inner img')].map((i) => { const r = i.getBoundingClientRect(); return { top: Math.round(r.top), width: Math.round(r.width) }; }) })`));
  } finally { c.close(); srv.kill(); }
}

test('two composite designs on a choice sit side by side, not stacked', async () => {
  const spec = await choiceDeck('composite');
  for (const [w, h] of [[1440, 900], [1024, 768]]) {
    const m = await measureChoice(spec, w, h);
    assert.notEqual(m.layout, 'compact', `${w}x${h}`);
    assert.equal(m.imgs.length, 2);
    assert.equal(m.imgs[0].top, m.imgs[1].top, `${w}x${h}: side by side ${JSON.stringify(m.imgs)}`);
  }
});

test('three tall designs on a choice open at the width that fills the row', async () => {
  const spec = await choiceDeck('tall');
  const m = await measureChoice(spec, 1440, 900);
  assert.equal(m.imgs.length, 3);
  assert.ok(m.imgs.every((i) => i.top === m.imgs[0].top), JSON.stringify(m.imgs));
  assert.ok(m.imgs.every((i) => i.width >= 330), `each design at least 330px wide: ${JSON.stringify(m.imgs)}`);
});

// Close-session friction, proposal 15: a slide names the other screens a shared change reaches.
test('a slide lists the other screens its change also reaches', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-also-'));
  const fx = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(HERE)}); from fixture import make_fixture; print(make_fixture(${JSON.stringify(tmp)}))`], { encoding: 'utf8' });
  const spec = fx.stdout.trim();
  const s = JSON.parse(readFileSync(spec, 'utf8')); s.steps[0].alsoChanges = ['Session details', 'Resume → Organize']; writeFileSync(spec, JSON.stringify(s));
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const c = await cdp(await freePort(), 1440, 900);
  try {
    await sleep(800);
    await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/fixture.html?step=1` });
    for (let i = 0; i < 40 && !(await c.evaluate('!!window.__deckReady').catch(() => false)); i++) await sleep(250);
    const got = JSON.parse(await c.evaluate(`JSON.stringify({ head: document.querySelector('.card.also h3')?.textContent, items: [...document.querySelectorAll('.card.also li')].map((l) => l.textContent) })`));
    assert.deepEqual(got, { head: 'Also changes', items: ['Session details', 'Resume → Organize'] });
    assert.deepEqual(c.errors, []);
  } finally { c.close(); srv.kill(); }
});

// The 2026-11-09 rethink, driven like a hand would: drag an area on a picture, mark one call
// for change. Pins what Destin asked for — "rectangular drag-regions … comment on it", and a
// calls list where "each item i choose to change should have its own little text box".
test('an area dragged on a picture and a changed call are saved, and neither lights Don\'t know', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-rethink-'));
  const py = `import sys, json, zlib, struct, os; sys.path.insert(0, ${JSON.stringify(HERE)});
from fixture import words_spec
p = words_spec(${JSON.stringify(tmp)})
raw = json.load(open(p))
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
row = b'\\x00' + b'\\x40\\x60\\x80' * 400
png = b'\\x89PNG\\r\\n\\x1a\\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 400, 300, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(row * 300)) + chunk(b'IEND', b'')
open(os.path.join(os.path.dirname(p), 'pic.png'), 'wb').write(png)
raw['steps'] = [{'id': 'Q-9', 'words': True, 'surface': 'Games', 'path': 'Questions', 'headline': 'Keep this layout?',
    'today': 'The board sits left of the chat.', 'problem': 'It is cramped.', 'proposal': 'Move it above.',
    'checked': 'Opened the games screen today.', 'picture': 'pic.png', 'caption': 'The board today.'},
  {'id': 'K-1', 'words': True, 'surface': 'Games', 'path': 'Questions', 'headline': 'Calls I made for you',
    'calls': [{'id': 'size', 'call': 'The board is five rows tall.', 'why': 'It matches the other games.', 'result': 'unclear'},
              {'id': 'sound', 'call': 'A win plays no sound.', 'why': 'Nothing else plays one.', 'picture': 'pic.png', 'before': 'pic.png'}]},
  {'id': 'S-1', 'words': True, 'surface': 'Games', 'path': 'Questions', 'headline': 'The words on the games menu', 'screen': 'menu.html'}]
# A still copy of a screen, as \`shoot --page\` saves one: the size it was laid out at, where its panel sits.
open(os.path.join(os.path.dirname(p), 'menu.html'), 'w').write('<!doctype html><html data-frozen-panel="10,10,200,120" data-frozen="400x300"><head><meta charset="utf-8"></head><body><h1>Pick a game</h1><button>Start</button><input placeholder="Search games"></body></html>')
json.dump(raw, open(p, 'w'))
print(p)`;
  const fx = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('questions.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await sleep(800);
    const c = await cdp(await freePort(), 1440, 900);
    try {
      await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/questions.html` });
      for (let i = 0; i < 40 && !(await c.evaluate("!!window.__deckReady && !!document.querySelector('.markable img') && document.querySelector('.markable img').complete").catch(() => false)); i++) await sleep(250);
      assert.equal(await c.evaluate("document.querySelectorAll('.how .tip').length"), 1, 'Today carries its how-it-was-checked note');
      assert.equal(await c.evaluate("document.querySelector('article.q[data-id=\"K-1\"] .n').textContent"), '', 'a list carries no "Question n of m" label');
      assert.equal(await c.evaluate("document.querySelectorAll('article.q[data-id=\"K-1\"] .note').length"), 0, 'a calls list has no shared note box');
      await c.evaluate(`(()=>{const img=document.querySelector('.markable img'),r=img.getBoundingClientRect();
        img.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:r.left+40,clientY:r.top+30}));
        document.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+200,clientY:r.top+150}));
        document.dispatchEvent(new PointerEvent('pointerup',{}));})()`);
      await sleep(100);
      await c.evaluate(`(()=>{const t=document.querySelector('.markt');t.value='too cramped';t.dispatchEvent(new Event('input',{bubbles:true}));
        document.querySelectorAll('.calledit')[1].click();
        const b=document.querySelectorAll('.callt')[1];b.value='play the chime';b.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await sleep(900);
      assert.equal(await c.evaluate("document.querySelectorAll('.markable .mark').length"), 1, 'the area is drawn on the picture');
      assert.equal(await c.evaluate("document.querySelector('article.q[data-id=\"Q-9\"] .ans[data-v=other]').classList.contains('on')"), true, 'an area with no button pressed reads as Other');
      // Round 3: one pencil per row, no "All fine", no second button.
      assert.equal(await c.evaluate("document.querySelectorAll('article.q[data-id=\"K-1\"] .ans').length"), 0, 'a list has no answer button');
      assert.equal(await c.evaluate("document.querySelectorAll('article.q[data-id=\"K-1\"] .calledit').length"), 2, 'one pencil per row');
      // Round 4: the words are retyped on a still copy of the real screen, not in a list of boxes.
      for (let i = 0; i < 40 && !(await c.evaluate("document.querySelector('.screenframe').contentDocument.querySelectorAll('[data-w]').length === 3").catch(() => false)); i++) await sleep(250);
      assert.equal(await c.evaluate("[...document.querySelector('.screenframe').contentDocument.querySelectorAll('[data-w]')].map(e=>e.matches('input')?e.value:e.textContent).join('|')"), 'Pick a game|Start|Search games', 'every piece of text, and a box hint, is editable');
      assert.equal(await c.evaluate("document.querySelectorAll('article.q[data-id=\"S-1\"] .ans, article.q[data-id=\"S-1\"] .note').length"), 0, 'a screen has no answer buttons or note box');
      await c.evaluate(`(()=>{const t=document.querySelector('.screenframe').contentDocument.querySelector('h1 [data-w]');t.textContent='Choose a game';t.dispatchEvent(new Event('input',{bubbles:true}));
        const b=document.querySelector('.screenframe').contentDocument.querySelector('button [data-w]');b.textContent='Go';b.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await sleep(100);
      assert.equal(await c.evaluate("document.querySelectorAll('.screenedits li').length"), 2, 'each change is listed under the screen');
      await c.evaluate("document.querySelectorAll('.screenundo')[1].click()"); await sleep(100);
      assert.equal(await c.evaluate("document.querySelector('.screenframe').contentDocument.querySelector('button').textContent"), 'Start', 'Put back restores the words on the screen');
      // A picture opens large inside the deck, not in a new tab; a click closes it.
      assert.equal(await c.evaluate("document.querySelectorAll('.qpic a[target]').length"), 0, 'no picture opens a browser tab');
      // Round 7: a row's pictures are NOT small right-hand thumbnails; they live in an Attachments card.
      assert.equal(await c.evaluate("document.querySelectorAll('.callpics, .qpic.row').length"), 0, 'no row thumbnails');
      assert.equal(await c.evaluate("document.querySelectorAll('article.q[data-id=\"K-1\"] .attcard').length"), 1, 'the row with pictures has one Attachments card');
      assert.equal(await c.evaluate("document.querySelector('.attcard.open')"), null, 'a list that is not a gallery starts with its card closed');
      assert.equal(await c.evaluate("document.querySelector('.attlabel').textContent + ' ' + document.querySelector('.attn').textContent + ' ' + document.querySelector('.attcm').hidden"), 'Attachments 2 true', 'closed: the word, how many pictures, and no comment count yet');
      await c.evaluate("document.querySelector('.atthead').click()"); await sleep(100);
      assert.equal(await c.evaluate("[...document.querySelectorAll('.attcard figcaption')].map(f=>f.textContent).join()"), 'Before,After', 'a pair is labelled');
      assert.ok(await c.evaluate("(()=>{const im=[...document.querySelectorAll('.attcard img')],b=document.querySelector('.attbody').getBoundingClientRect();return im.length===2&&Math.abs(im[0].width-im[1].width)<3&&im[0].width>b.width*0.4})()"), 'a before/after pair is side by side, equal and large');
      // An area dragged on the "before" picture: its comment box sits right under THAT picture, inside the card.
      await c.evaluate(`(()=>{const img=document.querySelector('.attcard img'),r=img.getBoundingClientRect();
        img.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:r.left+20,clientY:r.top+20}));
        document.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+120,clientY:r.top+90}));
        document.dispatchEvent(new PointerEvent('pointerup',{}));})()`);
      await sleep(150);
      assert.equal(await c.evaluate("document.querySelectorAll('.attcard figure:first-child .attmarks .markt').length"), 1, 'the comment for an area sits under its own picture');
      assert.equal(await c.evaluate("document.querySelectorAll('.marklist[data-sid=\"K-1\"] .markt').length"), 0, 'and is not repeated in a list at the top of the question');
      await c.evaluate("document.querySelector('.attcard .markt').value='the old one'; document.querySelector('.attcard .markt').dispatchEvent(new Event('input',{bubbles:true}))");
      await c.evaluate("document.querySelector('.atthead').click()"); await sleep(50);
      assert.equal(await c.evaluate("document.querySelector('.attbody').hidden"), true, 'the card closes again');
      assert.equal(await c.evaluate("(()=>{const e=document.querySelector('.attcm');return !e.hidden&&e.textContent})()"), '1 comment', 'closed, it still says how many comments are on its pictures');
      // A written question's own picture still enlarges, one picture only.
      await c.evaluate("document.querySelector('article.q[data-id=\"Q-9\"] .qpic > a').click()"); await sleep(100);
      assert.equal(await c.evaluate("document.querySelectorAll('.viewer .vstage img').length"), 1, 'the picture opens in the viewer, over the page');
      assert.equal(await c.evaluate("document.querySelectorAll('.viewer .vthumb, .viewer .vnav, .viewer .vstrip').length"), 0, 'no arrows, no strip of other pictures');
      // Round 4: an area drawn in the viewer keeps it open, with its comment box beside the picture.
      await c.evaluate(`(()=>{const img=document.querySelector('.viewer .lbbox img'),r=img.getBoundingClientRect();
        img.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:r.left+20,clientY:r.top+20}));
        document.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+120,clientY:r.top+90}));
        document.dispatchEvent(new PointerEvent('pointerup',{}));})()`);
      await sleep(150);
      assert.equal(await c.evaluate("document.querySelectorAll('.viewer .vcomments .markt').length"), 2, 'the earlier area and the new one both have their boxes in the viewer');
      await c.evaluate("[...document.querySelectorAll('.viewer .markx')].pop().click()"); await sleep(100);
      assert.equal(await c.evaluate("document.querySelectorAll('.viewer .vcomments .markt').length"), 1, 'a comment can be taken away in the viewer');
      await c.evaluate("document.querySelector('.viewer .vclose').click()"); await sleep(100);
      assert.equal(await c.evaluate("document.querySelectorAll('.viewer').length"), 0, 'Close closes it');
      // Notes tied to no question.
      await c.evaluate(`(()=>{const g=document.querySelector('.pnote');g.value='header is busy';g.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      // Round 4: every status pill is his to change.
      await c.evaluate("document.querySelector('.result.pillbtn').click()"); await sleep(50);
      await c.evaluate("document.querySelector('.resultmenu button[data-v=fail]').click()"); await sleep(50);
      assert.equal(await c.evaluate("document.querySelector('.result.pillbtn').textContent"), 'Failed', 'the pill shows the status he set');
      assert.equal(await c.evaluate("document.querySelector('article.q[data-id=\"K-1\"] .qstate').textContent"), '3 changes', 'the card says how much he changed (a comment, an area, a status)');
      await sleep(700);
      assert.deepEqual(c.errors, []);
    } finally { await c.close(); }
    const saved = JSON.parse(readFileSync(spec.replace(/\.json$/, '.answers.json'), 'utf8'));
    assert.equal(saved.answers['Q-9'].marks[0].text, 'too cramped');
    assert.ok(saved.answers['Q-9'].marks[0].w > 30 && saved.answers['Q-9'].marks[0].h > 30, JSON.stringify(saved.answers['Q-9'].marks[0]));
    assert.deepEqual(saved.answers['K-1'].changes, { sound: 'play the chime' });
    assert.equal(saved.answers['K-1'].marks[0].pic, 'row sound before', 'an area on a row picture is named for its row and which picture');
    assert.equal(saved.answers['K-1'].marks[0].text, 'the old one');
    assert.deepEqual(saved.answers['S-1'].edits, { 0: { from: 'Pick a game', to: 'Choose a game' } }, 'words retyped on the screen are saved as from and to');
    assert.equal(Object.values(saved.pageNotes)[0], 'header is busy', 'the comment at the foot of the page is saved beside the answers');
    assert.deepEqual(saved.answers['K-1'].results, { size: 'fail' }, 'a status he changed is saved against its row');
    assert.ok(saved.built && saved.built.at, 'the answers file records which build he was shown');
  } finally { srv.kill(); }
});

// Round 7 (2026-11-10): the Attachments card, pills in comment boxes, buttons that follow the design
// guide, and the card state pill. Driven like a hand would: open a card, change page and come back,
// paste a picture and a path, press an answer.
test('round 7: attachments card, pasted pills, guide-following buttons, and a state pill that is only shown when it has something to say', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-r7-'));
  const py = `import sys, json, zlib, struct, os; sys.path.insert(0, ${JSON.stringify(HERE)});
from fixture import words_spec
p = words_spec(${JSON.stringify(tmp)})
raw = json.load(open(p))
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
row = b'\\x00' + b'\\x40\\x60\\x80' * 400
png = b'\\x89PNG\\r\\n\\x1a\\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 400, 300, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(row * 300)) + chunk(b'IEND', b'')
open(os.path.join(os.path.dirname(p), 'pic.png'), 'wb').write(png)
def lst(i, h, calls, **kw): return {'id': i, 'words': True, 'surface': 'Games', 'path': 'Rows', 'headline': h, 'calls': calls, **kw}
raw['steps'] = [{'id': 'P-1', 'page': 'Rows', 'intro': 'Judge the rows.'},
  lst('G-1', 'Every screen that changed', [{'id': 'g', 'call': 'Board moved.', 'why': 'Matches.', 'before': 'pic.png', 'picture': 'pic.png'}], gallery=True),
  lst('L-2', 'Calls I made', [{'id': 'a', 'call': 'No sound.', 'why': 'None else.', 'picture': 'pic.png'}, {'id': 'b', 'call': 'Five rows.', 'why': 'Matches.'}]),
  lst('C-1', 'What exists today', [{'id': 'x', 'call': 'Fact one.', 'why': 'Read.'}, {'id': 'y', 'call': 'Fact two.', 'why': 'Read.'}], context=True),
  {'id': 'P-2', 'page': 'Questions', 'intro': 'Answer.'},
  {'id': 'Q-1', 'words': True, 'surface': 'Chats', 'path': 'Rules', 'headline': 'Which one?', 'today': 'Five run.', 'problem': 'Slow.', 'proposal': 'Pick.', 'checked': 'Read today.',
   'options': [{'id': 'lead', 'label': 'First', 'pros': ['Good.'], 'cons': ['Bad.']}, {'id': 'trail', 'label': 'Second', 'pros': ['Good.'], 'cons': ['Bad.']}]},
  {'id': 'Q-2', 'words': True, 'surface': 'Chats', 'path': 'Rules', 'headline': 'Run twice?', 'today': 'Twice.', 'problem': 'Slow.', 'proposal': 'Once.', 'checked': 'Read today.'},
  {'id': 'Q-3', 'words': True, 'surface': 'Chats', 'path': 'Rules', 'headline': 'Describe it', 'today': 'None.', 'problem': 'Unknown.', 'proposal': 'Tell me.', 'checked': 'Read today.', 'answer': 'words'}]
json.dump(raw, open(p, 'w'))
print(p)`;
  const fx = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('questions.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const ready = async c => { for (let i = 0; i < 40 && !(await c.evaluate("!!window.__deckReady").catch(() => false)); i++) await sleep(250); await sleep(300); };
  const png = `(async()=>{const c=document.createElement('canvas');c.width=90;c.height=60;const x=c.getContext('2d');x.fillStyle='#c33';x.fillRect(0,0,90,60);const b=await new Promise(r=>c.toBlob(r,'image/png'));return new File([b],'my screenshot.png',{type:'image/png'})})()`;
  const paste = (sel, kind) => `(async()=>{const el=document.querySelector(${JSON.stringify(sel)});const dt=new DataTransfer();
    ${kind === 'image' ? `dt.items.add(await ${png});` : `dt.setData('text', ${JSON.stringify(kind)});`}
    el.focus();el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));})()`;
  try {
    await sleep(800);
    const c = await cdp(await freePort(), 1440, 1000);
    try {
      await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/questions.html` });
      await ready(c);
      // ── the card state pill: nothing until there is something to say; never on a background list ──
      const vis = sel => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});return !!e && getComputedStyle(e).display!=='none' && !e.hidden})()`;
      assert.equal(await c.evaluate(vis('article.q[data-id="G-1"] .qstate')), false, 'an untouched list carries no pill');
      assert.equal(await c.evaluate(vis('article.q[data-id="L-2"] .qstate')), false);
      assert.equal(await c.evaluate(vis('article.q[data-id="C-1"] .qstate')), false, 'a background list never has one');
      assert.equal(await c.evaluate("document.body.innerText.includes('Not reviewed')"), false);
      // a background-only list: dashed from the FIRST row, nothing to press
      assert.equal(await c.evaluate("[...document.querySelectorAll('article.q[data-id=\"C-1\"] .call')].map(e=>getComputedStyle(e).borderTopStyle).join()"), 'dashed,dashed', 'the first row is dashed like the rest');
      assert.equal(await c.evaluate("[...document.querySelectorAll('article.q[data-id=\"C-1\"] .calledit')].every(e=>getComputedStyle(e).display==='none') && getComputedStyle(document.querySelector('article.q[data-id=\"C-1\"] .call')).cursor"), 'default', 'no pencil, no pointer');
      // ── attachments: a gallery's card is open by itself; another stays closed until opened ──
      assert.equal(await c.evaluate("document.querySelector('article.q[data-id=\"G-1\"] .attcard').classList.contains('open')"), true, 'the "every screen that changed" list opens its cards');
      assert.equal(await c.evaluate("document.querySelector('article.q[data-id=\"L-2\"] .attcard').classList.contains('open')"), false);
      await c.evaluate("document.querySelector('article.q[data-id=\"L-2\"] .atthead').click()");
      // typing a comment gives the list a pill that says how much it holds
      await c.evaluate("document.querySelector('article.q[data-id=\"L-2\"] .calledit').click()"); await sleep(60);
      await c.evaluate("(()=>{const b=document.querySelector('article.q[data-id=\"L-2\"] .callt');b.value='add a chime';b.dispatchEvent(new Event('input',{bubbles:true}))})()");
      assert.equal(await c.evaluate("document.querySelector('article.q[data-id=\"L-2\"] .qstate').textContent"), '1 change');
      assert.equal(await c.evaluate("(()=>{const s=getComputedStyle(document.querySelector('article.q[data-id=\"L-2\"] .qstate'));return s.pointerEvents+' '+s.borderTopWidth})()"), 'none 0px', 'the pill cannot be pressed and is not drawn as a bordered control');
      // ── pictures and paths pasted into boxes become pills, saved under their box ──
      await c.evaluate(paste('article.q[data-id="L-2"] .callt', 'image')); await sleep(900);
      await c.evaluate(paste('article.q[data-id="L-2"] .callt', '/home/destin/youcoded-dev/docs/MAP.md')); await sleep(100);
      await c.evaluate(paste('article.q[data-id="L-2"] .callt', '/ this is a sentence, not a path')); await sleep(100);
      assert.equal(await c.evaluate("[...document.querySelectorAll('article.q[data-id=\"L-2\"] .attpill')].map(p=>p.textContent.replace('×','').trim()).join('|')"), 'my screenshot.png|MAP.md', 'a picture and a path are pills; a sentence that starts with a slash is left as text');
      assert.equal(await c.evaluate("document.querySelector('article.q[data-id=\"L-2\"] .attpill.file').title"), '/home/destin/youcoded-dev/docs/MAP.md', 'the full path is the tooltip');
      assert.equal(await c.evaluate("document.querySelector('article.q[data-id=\"L-2\"] .callt').value"), 'add a chime', 'the pasted path did not also land as raw text');
      assert.equal(await c.evaluate("(()=>{const i=document.querySelector('article.q[data-id=\"L-2\"] .attpill.img img');return i.complete&&i.naturalWidth>0})()"), true, 'the thumbnail loads from the deck server');
      // leave the page and come back: the open card and the pills are still there
      await c.evaluate("document.querySelector('#save').click()"); await sleep(300);
      // ── buttons follow the design guide ──
      assert.equal(await c.evaluate("document.querySelectorAll('.card.variant .ohead .key').length"), 0, 'no option-id chips on written options');
      assert.equal(await c.evaluate("[...document.querySelectorAll('button.btn.primary')].filter(b=>b.offsetParent).length"), 1, 'one filled button in view');
      assert.equal(await c.evaluate("(()=>{const y=getComputedStyle(document.querySelector('article.q[data-id=\"Q-2\"] .ans[data-v=yes]')),n=getComputedStyle(document.querySelector('article.q[data-id=\"Q-2\"] .ans[data-v=no]')),b=getComputedStyle(document.querySelector('#back'));return y.borderTopColor===n.borderTopColor&&y.borderTopColor===b.borderTopColor&&y.backgroundColor===n.backgroundColor&&y.backgroundColor!==getComputedStyle(document.querySelector('#save')).backgroundColor})()"), true, 'answer buttons are outlined alike, in the same full-strength outline as Back, and not filled');
      assert.equal(await c.evaluate("(()=>{const q=document.querySelector('article.q[data-id=\"Q-2\"]');return q.querySelector('.ans[data-v=yes]').getBoundingClientRect().left>q.querySelector('.note').getBoundingClientRect().right-1})()"), true, 'the answer buttons sit at the right of their line');
      await c.evaluate("document.querySelector('article.q[data-id=\"Q-2\"] .ans[data-v=yes]').click()"); await sleep(100);
      assert.equal(await c.evaluate("(()=>{const on=document.querySelector('article.q[data-id=\"Q-2\"] .ans.on');return !!on && on.dataset.v==='yes' && getComputedStyle(on).backgroundColor!==getComputedStyle(document.querySelector('#save')).backgroundColor && getComputedStyle(on,'::before').content.includes('✓')})()"), true, 'the chosen answer shows a tick and does not become a second filled button');
      assert.match(await c.evaluate("document.querySelector('article.q[data-id=\"Q-2\"] .qstate').textContent"), /^Answered/);
      assert.equal(await c.evaluate("document.querySelector('article.q[data-id=\"Q-1\"] .qstate').textContent"), 'Not answered', 'a question still says so');
      // a picture in the typed answer, a path in the page-foot box
      await c.evaluate(paste('article.q[data-id="Q-3"] .ans-write', 'image')); await sleep(900);
      await c.evaluate(paste('#pnote', '~/system/global.md')); await sleep(100);
      assert.equal(await c.evaluate("document.querySelectorAll('article.q[data-id=\"Q-3\"] .attpill.img').length + ',' + document.querySelectorAll('.pagenote .attpill.file').length"), '1,1');
      await c.evaluate("document.querySelector('#back').click()"); await sleep(300);
      assert.equal(await c.evaluate("document.querySelector('article.q[data-id=\"G-1\"] .attcard').classList.contains('open') + ',' + document.querySelector('article.q[data-id=\"L-2\"] .attcard').classList.contains('open')"), 'true,true', 'cards he opened stay open when the page is redrawn');
      assert.equal(await c.evaluate("document.querySelectorAll('article.q[data-id=\"L-2\"] .attpill').length"), 2, 'pills come back with the page');
      await sleep(700);
    } finally { await c.close(); }
    const saved = JSON.parse(readFileSync(spec.replace(/\.json$/, '.answers.json'), 'utf8'));
    const l2 = saved.answers['L-2'].attach['change:a'];
    assert.deepEqual(l2.map(p => [p.kind, p.name]), [['image', 'my screenshot.png'], ['path', 'MAP.md']]);
    assert.equal(l2[1].path, '/home/destin/youcoded-dev/docs/MAP.md');
    assert.ok(existsSync(l2[0].path) && l2[0].path.includes('.attachments'), 'the picture is kept beside the spec');
    assert.equal(saved.answers['Q-3'].attach.text[0].kind, 'image');
    assert.equal(Object.values(saved.pageAttach)[0][0].path, '~/system/global.md');
    // a reload restores them
    const c2 = await cdp(await freePort(), 1440, 1000);
    try {
      await c2.send('Page.navigate', { url: `http://127.0.0.1:${port}/questions.html` }); await ready(c2);
      assert.equal(await c2.evaluate("document.querySelectorAll('article.q[data-id=\"L-2\"] .attpill').length"), 2, 'pills are restored on reload');
      if (await c2.evaluate("!document.querySelector('.pagenote .attpill')")) { await c2.evaluate("document.querySelector('#save').click()"); await sleep(300); }
      await c2.evaluate("document.querySelector('.pagenote .px').click()"); await sleep(100);
      assert.equal(await c2.evaluate("document.querySelectorAll('.pagenote .attpill').length"), 0, 'the x takes a pill away');
      await sleep(700);
    } finally { await c2.close(); }
    // opened as a plain file there is no server to keep a picture: say so
    const c3 = await cdp(await freePort(), 1440, 1000);
    try {
      await c3.send('Page.navigate', { url: 'file://' + spec.replace(/\.json$/, '.html') }); await ready(c3);
      await c3.evaluate("(()=>{const b=[...document.querySelectorAll('.pnote')][0];window.__box=b})()");
      await c3.evaluate(paste('.pnote', 'image')); await sleep(300);
      assert.match(await c3.evaluate("document.querySelector('.attpills .micerr').textContent"), /plain file.*deck server/, 'image paste says plainly that it needs the served deck');
      assert.equal(await c3.evaluate("document.querySelectorAll('.attpill').length"), 0);
    } finally { await c3.close(); }
  } finally { srv.kill(); }
});

// Round 7, second half (2026-11-10): history woven into the deck (state pill, trail, Settled fold,
// "Since last round" line, related decks with a line each), a row's More, "Built from", and video proof.
test('round 7: trail, state pill, settled fold, since-last-round line, More, Built from, and a video that cannot be dragged on', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deck-r7b-'));
  const py = `import sys, json, os; sys.path.insert(0, ${JSON.stringify(HERE)});
from fixture import words_spec
p = words_spec(${JSON.stringify(tmp)})
raw = json.load(open(p)); d = os.path.dirname(p)
open(os.path.join(d, 'proof.webm'), 'wb').write(b'\\x1a\\x45\\xdf\\xa3' + b'\\x00' * 40)
json.dump({'title': 'older', 'key': 'older', 'out': 'older.html', 'steps': []}, open(os.path.join(d, 'older.json'), 'w'))
T = [{'round': 'Round 3', 'asked': 'there is no notes button', 'built': 'A Notes button.', 'said': 'i wanted a box at the foot'}, {'round': 'Round 4', 'built': 'A box at the foot of every page.'}]
def lst(i, h, calls, **kw): return {'id': i, 'words': True, 'surface': 'Decks', 'path': 'Rows', 'headline': h, 'calls': calls, **kw}
raw['related'] = [{'title': 'Round 6 deck', 'path': 'older.json', 'how': 'Where you chose the trail.'}]
raw['steps'] = [{'id': 'P-1', 'page': 'One', 'intro': 'Judge the rows.'},
  lst('L-1', 'What you asked for', [
    {'id': 'old', 'call': 'Settled thing.', 'why': 'Done.', 'state': 'settled', 'trail': T},
    {'id': 'chg', 'call': 'Changed thing.', 'why': 'Follows you.', 'state': 'changed', 'trail': T, 'reuse': {'from': ['The pencil button'], 'new': ['The star'], 'note': 'Only the star is new.'}},
    {'id': 'new', 'call': 'New thing.', 'why': 'Fresh.', 'state': 'new', 'picture': 'proof.webm'}], fold_settled=True),
  {'id': 'P-2', 'page': 'Two', 'intro': 'Checks.'},
  lst('L-2', 'Checks', [{'id': 'c', 'call': 'Phone width.', 'why': 'Narrow page.', 'result': 'skip', 'more': {'does': 'Opens it narrow.', 'returns': 'A picture.', 'why': 'Not suggested: desktop only.'}}])]
json.dump(raw, open(p, 'w'))
print(p)`;
  const fx = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
  const spec = fx.stdout.trim(); assert.ok(spec.endsWith('questions.json'), fx.stderr);
  { const r = spawnSync('python3', [RC, 'build', spec], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); }
  const port = await freePort();
  const srv = spawn('python3', [RC, 'serve', spec, '--no-build', '--port', String(port), '--timeout', '2'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const ready = async c => { for (let i = 0; i < 40 && !(await c.evaluate("!!window.__deckReady").catch(() => false)); i++) await sleep(250); await sleep(300); };
  try {
    await sleep(800);
    const c = await cdp(await freePort(), 1200, 1000);
    try {
      await c.send('Page.navigate', { url: `http://127.0.0.1:${port}/questions.html` }); await ready(c);
      const q = e => c.evaluate(e);
      // the one line at the top of the first page, and the related deck with its own line
      assert.equal(await q("document.querySelector('.since').textContent.replace(/\\s+/g, ' ')"), 'Since last round: 1 new · 1 changed from your comments · 1 settled');
      assert.match(await q("document.querySelector('.reltop li').textContent"), /Round 6 deck.*Where you chose the trail\./);
      // new and changed rows come first; the settled one is folded into one line at the foot
      assert.deepEqual(JSON.parse(await q("JSON.stringify([...document.querySelectorAll('.card.calls > ul > li.call')].map(l => l.dataset.call))")), ['chg', 'new']);
      assert.match(await q("document.querySelector('.settledhead').textContent"), /^Settled\s*1$/);
      assert.equal(await q("document.querySelector('.settledbody').hidden"), true);
      // the pills say what happened to each row
      assert.deepEqual(JSON.parse(await q("JSON.stringify([...document.querySelectorAll('li.call .stpill')].map(p => p.textContent))")), ['Changed from your comment', 'New this round', 'Settled in Round 4']);
      // the trail is closed until asked for, then walks round by round and ends in Now
      assert.equal(await q("document.querySelector('li[data-call=chg] .metapanel.trail').hidden"), true);
      await q("document.querySelector('li[data-call=chg] .trailtog').click()");
      assert.equal(await q("document.querySelector('li[data-call=chg] .metapanel.trail').hidden"), false);
      assert.deepEqual(JSON.parse(await q("JSON.stringify([...document.querySelectorAll('li[data-call=chg] .tround')].map(p => p.textContent))")), ['Round 3', 'Round 4', 'Now']);
      assert.equal(await q("document.querySelector('li[data-call=chg] .tline dd.decided').textContent"), '“there is no notes button”', 'his words are quoted');
      assert.equal(await q("getComputedStyle(document.querySelector('li[data-call=chg] .tnow')).fontSize"), '12px');
      // "Built from": the (i) lists what is reused and what is new
      await q("document.querySelector('li[data-call=chg] .how.lbl').scrollIntoView({block:'center'})"); await sleep(200);
      const pt = JSON.parse(await q("(()=>{const r=document.querySelector('li[data-call=chg] .how.lbl').getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2})})()"));
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y }); await sleep(200);
      assert.equal(await q("getComputedStyle(document.querySelector('li[data-call=chg] .how.lbl .tip')).display"), 'block');
      assert.match(await q("document.querySelector('li[data-call=chg] .how.lbl .tip').textContent"), /Reused from the app.*The pencil button.*New in this design.*The star/);
      // a video is in the Attachments card with controls, not playing by itself, and cannot be dragged on
      await q("document.querySelector('li[data-call=new] .atthead').click()");
      assert.equal(await q("(()=>{const v=document.querySelector('li[data-call=new] video.attvid');return v && v.controls && !v.autoplay && v.paused;})()"), true);
      assert.equal(await q("document.querySelectorAll('li[data-call=new] .attmarks, li[data-call=new] a.attimg').length"), 0);
      // jumping from the summary opens the fold and shows the settled row
      await q("document.querySelector('.sincepart.settled').click()"); await sleep(400);
      assert.equal(await q("document.querySelector('.settledbody').hidden"), false);
      // the second page: a run/skip row's More
      await q("document.querySelector('#save').click()"); await sleep(400);
      assert.equal(await q("document.querySelector('.topnotes') === null"), true, 'the summary is only on the first page');
      assert.equal(await q("document.querySelector('.metapanel.more').hidden"), true);
      await q("document.querySelector('.moretog').click()");
      assert.deepEqual(JSON.parse(await q("JSON.stringify([...document.querySelectorAll('.metapanel.more dt')].map(d => d.textContent))")), ['What it does', 'What comes back', 'Why, for this build']);
      assert.deepEqual(c.errors, []);
    } finally { await c.close(); }
  } finally { srv.kill(); }
});
