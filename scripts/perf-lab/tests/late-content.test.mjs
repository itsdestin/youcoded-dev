import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, listTargets } from '../cdp.mjs';
import {
  formatLateContentLine,
  scrollAndCount,
  summariseLateContent,
  worstLateVerdict,
} from '../late-content.mjs';

// ── The verdict ─────────────────────────────────────────────────────────────

const raw = (o) => ({ ok: true, frames: 240, framesWithLate: 0, maxLate: 0, maxSpacersAnywhere: 300, totalEntriesSeen: 1200, lateAfterStop: false, firstLate: null, settledAtRest: true, settleTookMs: 40, lateAtRest: 0, jumpedFrames: 0, lastJumpTo: null, scrollHeight: 40000, clientHeight: 800, scrollablePx: 39200, travelledPx: 12000, pxPerSecond: 1500, elapsedMs: 8000, ...o });

test('one blank entry in view is the defect — the passing value is zero', () => {
  const m = summariseLateContent(raw({ maxLate: 1, framesWithLate: 3, firstLate: { key: 'e-42', heightPx: 96, atScrollTop: 12000 } }));
  assert.equal(m.verdict, 'late-content');
  assert.match(formatLateContentLine(m), /1 BLANK ENTRIES IN VIEW/);
  assert.match(formatLateContentLine(m), /key e-42/);
});

test('spacers off-screen are fine — that is folding working', () => {
  const m = summariseLateContent(raw({ maxLate: 0, spacersSeenAnywhere: 300 }));
  assert.equal(m.verdict, 'clean');
  assert.equal(m.maxLateInViewport, 0);
});

test('a scroll where nothing was ever a spacer is NOT a pass', () => {
  // The failure this instrument exists to prevent: a clean number from a window
  // where the mechanism under test never engaged.
  const m = summariseLateContent(raw({ maxLate: 0, maxSpacersAnywhere: 0 }));
  assert.equal(m.verdict, 'no-folding');
  assert.match(m.reason, /not a pass/);
  assert.match(formatLateContentLine(m), /NOTHING LAZY RAN/);
});

test('a pane that does not scroll is unmeasured, not clean', () => {
  const m = summariseLateContent(raw({ scrollHeight: 800, clientHeight: 800, scrollablePx: 0, travelledPx: 0 }));
  assert.equal(m.verdict, 'unmeasured');
  assert.match(m.reason, /does not scroll/);
});

test('a pass that moved zero pixels is unmeasured, not clean', () => {
  const m = summariseLateContent(raw({ travelledPx: 0 }));
  assert.equal(m.verdict, 'unmeasured');
  assert.match(m.reason, /zero pixels/);
});

test('the reading carries the scroll RATE, because without it the number means nothing', () => {
  // The bug this pins: the first version crossed the whole document in a fixed time,
  // which on the huge fixture was 745,000 px/s — 500x a human scroll — and reported
  // late content on every frame. A reading with no rate beside it cannot be judged.
  const m = summariseLateContent(raw({ maxLate: 3, framesWithLate: 40 }));
  assert.equal(m.pxPerSecond, 1500);
  assert.equal(m.scrolledPx, 12000);
  assert.equal(m.scrollablePx, 39200);
  assert.match(formatLateContentLine(m), /1500 px\/s over 12000 of 39200 px/);
});

test('a missing pane is unmeasured and says why', () => {
  const m = summariseLateContent({ ok: false, reason: 'no visible .chat-scroll' });
  assert.equal(m.verdict, 'unmeasured');
  assert.equal(m.reason, 'no visible .chat-scroll');
  assert.match(formatLateContentLine(m), /UNMEASURED/);
});

test('zero sampled frames is unmeasured', () => {
  assert.equal(summariseLateContent(raw({ frames: 0 })).verdict, 'unmeasured');
});

test('content still blank after the scroll stops is carried through', () => {
  const m = summariseLateContent(raw({ maxLate: 2, framesWithLate: 5, lateAfterStop: true }));
  assert.equal(m.lateAfterStop, true);
  assert.match(formatLateContentLine(m), /still blank after scrolling stopped/);
});

test('frames where the APP scrolled are excluded, not counted as late content', () => {
  // Measured against the real app: one frame in 337 reported blanks at scrollTop
  // 4,504,200 (the very bottom) while this pass had travelled 12,003 px from the top.
  // The chat pane had pinned itself to the end. That is an auto-scroll, not late
  // content, and the probe now skips those frames — so a reading like this one has
  // maxLate 0 with the jump reported beside it.
  const m = summariseLateContent(raw({ maxLate: 0, framesWithLate: 0, frames: 336, jumpedFrames: 1, lastJumpTo: 4504200 }));
  assert.equal(m.verdict, 'clean');
  assert.equal(m.jumpedFrames, 1);
  assert.match(formatLateContentLine(m), /1 frame\(s\) skipped where the app scrolled itself/);
});

test('a pass the app hijacked almost entirely is not a pass', () => {
  const m = summariseLateContent(raw({ frames: 5, jumpedFrames: 300 }));
  assert.equal(m.verdict, 'unmeasured');
  assert.match(m.reason, /the app moving the viewport/);
});

test('blank while STANDING STILL is its own verdict, worse than the scrolling one', () => {
  // The instrument seeks to the start before it scrolls, and that seek is a teleport
  // no user performs. The first version sampled one frame later and counted the
  // entries that had not yet unfolded at the new position — 4 blanks on 8 frames,
  // every one at scrollTop 0. Settling first makes any blank DURING the scroll
  // attributable to the scroll; a failure to settle is a separate, worse finding.
  const m = summariseLateContent(raw({ settledAtRest: false, settleTookMs: 3000, lateAtRest: 3, maxLate: 3 }));
  assert.equal(m.verdict, 'blank-at-rest');
  assert.match(m.reason, /standing still/);
  assert.match(formatLateContentLine(m), /STANDING STILL/);
});

test('blank-at-rest outranks late-content in the rollup', () => {
  assert.equal(worstLateVerdict(['clean', 'late-content', 'blank-at-rest']), 'blank-at-rest');
});

test('worstLateVerdict never lets a clean repeat bury a defective one', () => {
  assert.equal(worstLateVerdict(['clean', 'late-content', 'clean']), 'late-content');
  assert.equal(worstLateVerdict(['clean', 'no-folding']), 'no-folding');
  assert.equal(worstLateVerdict(['clean', 'clean']), 'clean');
  assert.equal(worstLateVerdict([]), 'unmeasured');
});

// ── The live proof ──────────────────────────────────────────────────────────
// Two panes built the same way, differing only in WHEN the lazy body comes back:
// one restores content on scroll (correct), one waits for an idle callback after
// scrolling stops (the cycle-3 pop-in). The instrument must separate them.
const CHROME = process.env.CHROME_BIN || 'google-chrome-stable';
const haveChrome = spawnSync('sh', ['-c', `command -v ${CHROME}`], { encoding: 'utf8' }).status === 0;

test('LIVE: pop-in is caught, and an eager re-render is not', { skip: haveChrome ? false : `${CHROME} not on PATH` }, async () => {
  const port = 9784;
  const profile = mkdtempSync(join(tmpdir(), 'perf-lab-late-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=900,800', 'about:blank',
  ], { stdio: 'ignore' });
  let cdp = null;
  try {
    let targets = null;
    for (let i = 0; i < 60 && !targets; i++) {
      try { targets = await listTargets(port); } catch { await new Promise((r) => setTimeout(r, 200)); }
    }
    assert.ok(targets, 'Chrome never opened its debugging port');
    cdp = await connect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);

    // `lazy` reproduces the app's shape: entries far from the viewport lose their
    // body and keep their height. `eager` decides that on every scroll event;
    // `popIn` only re-fills after scrolling has been quiet — which is exactly the
    // defect, and exactly what a settled measurement cannot see.
    const build = (mode) => cdp.evaluate(`(() => {
      document.body.style.margin = '0';
      document.body.innerHTML = '<div class="chat-scroll" style="height:600px;overflow:auto"></div>';
      const pane = document.querySelector('.chat-scroll');
      const N = 400, H = 100;
      for (let i = 0; i < N; i++) {
        const d = document.createElement('div');
        d.className = 'timeline-entry';
        d.setAttribute('data-entry-key', 'e-' + i);
        d.style.height = H + 'px';
        d.appendChild(Object.assign(document.createElement('p'), { textContent: 'message ' + i }));
        pane.appendChild(d);
      }
      const MARGIN = 1200;
      const fold = () => {
        const view = pane.getBoundingClientRect();
        for (const el of pane.querySelectorAll('.timeline-entry')) {
          const r = el.getBoundingClientRect();
          const far = r.bottom < view.top - MARGIN || r.top > view.bottom + MARGIN;
          if (far && el.childElementCount) { el.innerHTML = ''; }
          else if (!far && !el.childElementCount) {
            el.appendChild(Object.assign(document.createElement('p'), { textContent: 'message ' + el.getAttribute('data-entry-key') }));
          }
        }
      };
      let idle = 0;
      pane.addEventListener('scroll', () => {
        if (${JSON.stringify(mode)} === 'eager') { fold(); return; }
        // popIn: only unfold once the user has STOPPED scrolling.
        clearTimeout(idle);
        idle = setTimeout(fold, 250);
      });
      fold();
      return true;
    })()`);

    await build('eager');
    const eager = summariseLateContent(await scrollAndCount(cdp, { durationMs: 2500, direction: 'down', pxPerSecond: 1500 }));

    await build('popIn');
    const popIn = summariseLateContent(await scrollAndCount(cdp, { durationMs: 2500, direction: 'down', pxPerSecond: 1500 }));

    // The pass must actually have moved at the rate it was asked for — a probe that
    // silently teleported through the document is the failure mode this guards.
    assert.equal(eager.settledAtRest, true, 'the eager pane must reach a clean viewport before the scroll starts');
    assert.equal(eager.pxPerSecond, 1500);
    assert.ok(eager.scrolledPx > 2000 && eager.scrolledPx <= 1500 * 3,
      `expected ~1500 px/s for 2.5s, got ${eager.scrolledPx} px`);

    assert.equal(eager.verdict, 'clean', `an eager re-render must be clean, got: ${formatLateContentLine(eager)}`);
    assert.ok(eager.spacersSeenAnywhere > 0, 'the eager pane must still fold off-screen, or the comparison proves nothing');
    assert.equal(popIn.verdict, 'late-content', `deferred unfolding must be caught, got: ${formatLateContentLine(popIn)}`);
    assert.ok(popIn.maxLateInViewport > 0);
    assert.ok(popIn.firstLate?.key, 'the report must name an entry a human can go look at');
  } finally {
    try { cdp?.close(); } catch { /* already closed */ }
    // WHY THE WAIT AND THE try/catch: `kill()` only SIGNALS. Chrome keeps writing its
    // profile for a moment after, so removing the directory immediately raced it and
    // threw `ENOTEMPTY: ... /Default` — which failed this test in CI on 2026-09-06
    // AFTER every assertion above had passed. A leftover directory in the OS temp dir
    // is not a test failure; reporting one as though the instrument were broken is.
    await new Promise((done) => {
      if (chrome.exitCode !== null || chrome.signalCode !== null) return done();
      const t = setTimeout(done, 5000);
      chrome.once('exit', () => { clearTimeout(t); done(); });
      chrome.kill();
    });
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* the OS will reap it */ }
  }
});
