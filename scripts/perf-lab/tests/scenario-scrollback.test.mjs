// scripts/perf-lab/tests/scenario-scrollback.test.mjs — the scroll-back ceiling phase.
//
// THE POINT OF THIS FILE: this phase exists to size perf cycle 3, and the mistake it
// was built to prevent is a number that outlives the configuration it was measured in
// (the cycle-3 handoff of 2026-08-28 records exactly that happening once already).
// So the things pinned here are the ways this phase could produce a number that LOOKS
// like a ceiling and is not one:
//   * a conversation that never reached its beginning, averaged in as if it had
//   * an unmeasured JS heap reported as "0 MB of the rise is heap", which would point
//     cycle 3 at parking when eviction is the answer
//   * a page cap too small for the fixture, so the biggest conversation silently stops
//     part-way and the ceiling is a floor
//
// Node built-ins only. Run: node --test scripts/perf-lab/tests/*.test.mjs
//   (NOT `node --test <dir>/` — on Node 26 that tries to require() the directory.)

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MEASURES, NUMERIC_KEYS, SCROLL_SIZES, MAX_PAGES, medianRun, riseSplit } from '../scenario-scrollback.mjs';
import { PAGE_TURNS } from '../scenario-workload.mjs';
import { SIZES } from '../fixture.mjs';
import { PRIMARY } from '../compare.mjs';

const leg = (over = {}) => ({
  pages: 40, entriesBefore: 60, entriesAfter: 2460, reachedTop: true,
  pageMedianMs: 90, pageP95Ms: 210, pssAfterMb: 2100, jsHeapAfterMb: 700, domNodesAfter: 90000,
  ...over,
});
const run = (over = {}) => ({
  perSize: Object.fromEntries(SCROLL_SIZES.map((s) => [s, leg()])),
  floorPssMb: 1720, ceilingPssMb: 6800, deltaPssMb: 5080,
  floorJsHeapMb: 300, ceilingJsHeapMb: 2100, deltaJsHeapMb: 1800, deltaNonJsMb: 3280,
  floorDomNodes: 12000, ceilingDomNodes: 210000, deltaDomNodes: 198000,
  releasedMb: 0.4, totalPagesLoaded: 120, totalEntriesLoaded: 7200,
  ...over,
});

describe('riseSplit — the phase\'s whole conclusion', () => {
  it('splits the PSS rise into the heap share and the DOM share', () => {
    const s = riseSplit({ pssMb: 1720, jsHeapMb: 300, domNodes: 12000 },
                        { pssMb: 6800, jsHeapMb: 2100, domNodes: 210000 });
    assert.equal(s.deltaPssMb, 5080);
    assert.equal(s.deltaJsHeapMb, 1800);
    assert.equal(s.deltaNonJsMb, 3280);
    assert.equal(s.deltaDomNodes, 198000);
  });

  it('reports null — never 0 — when the heap was never measured', () => {
    // The failure this pins: with a `?? 0` the whole 5,080 MB rise would be credited
    // to the DOM, and "park hidden views" would look like the complete fix for a cost
    // that is mostly reducer state. A null makes validateReport fail the report.
    const s = riseSplit({ pssMb: 1720, jsHeapMb: null, domNodes: null },
                        { pssMb: 6800, jsHeapMb: null, domNodes: null });
    assert.equal(s.deltaPssMb, 5080);
    assert.equal(s.deltaJsHeapMb, null);
    assert.equal(s.deltaNonJsMb, null, 'an unmeasured heap must not attribute the rise to the DOM');
    assert.equal(s.deltaDomNodes, null);
  });

  it('a missing PSS reading does not become a 0 MB ceiling', () => {
    const s = riseSplit({ pssMb: 1720 }, {});
    assert.equal(s.ceilingPssMb, null);
    assert.equal(s.deltaPssMb, null);
  });
});

describe('medianRun', () => {
  it('takes a median of each numeric key across repeats', () => {
    const m = medianRun([run({ ceilingPssMb: 6000 }), run({ ceilingPssMb: 6800 }), run({ ceilingPssMb: 7000 })]);
    assert.equal(m.ceilingPssMb, 6800);
  });

  it('reachedTopEveryRun is false if ANY repeat fell short — a short leg is not averaged away', () => {
    // A ceiling measured on a conversation that stopped part-way is a FLOOR, and a
    // median cannot express that. It has to survive as a flag or the report reads as
    // clean while under-stating the very number cycle 3 is sized against.
    const short = run();
    short.perSize.huge = leg({ reachedTop: false, pages: 12 });
    const m = medianRun([run(), short, run()]);
    assert.equal(m.perSize.huge.reachedTopEveryRun, false);
    assert.equal(m.perSize.small.reachedTopEveryRun, true);
  });

  it('a metric that was null in every repeat stays null rather than becoming 0', () => {
    const m = medianRun([run({ deltaNonJsMb: null }), run({ deltaNonJsMb: null })]);
    assert.equal(m.deltaNonJsMb, null);
  });
});

describe('the phase cannot silently under-measure', () => {
  it('MAX_PAGES clears the fixture\'s biggest transcript at the app\'s page size', () => {
    // If fixture SIZES.huge grows (or the app's PAGE_TURNS shrinks) past this cap, the
    // huge conversation stops before its beginning and the ceiling quietly becomes a
    // floor. This fails at that moment instead.
    const pagesNeeded = Math.ceil(SIZES.huge / PAGE_TURNS);
    assert.ok(MAX_PAGES > pagesNeeded,
      `MAX_PAGES (${MAX_PAGES}) must exceed the ${pagesNeeded} pages the huge fixture needs at PAGE_TURNS=${PAGE_TURNS}`);
  });

  it('scrolls only conversations that HAVE older history', () => {
    // The empty control and the two native sessions never render a sentinel, so
    // "scrolling" them would measure nothing and report it as a completed leg.
    assert.deepEqual([...SCROLL_SIZES], ['huge', 'medium', 'small']);
    for (const s of SCROLL_SIZES) assert.ok(SIZES[s] > 0, `${s} must be a real fixture transcript`);
  });

  it('every scrollback PRIMARY path is answerable from what a run records', () => {
    // The drift this catches: compare.mjs gains a scrollback path, the scenario never
    // produces the field, and the gate goes blind on it while still printing KEEP.
    const m = medianRun([run(), run()]);
    for (const path of PRIMARY.filter((p) => p.startsWith('scrollback.'))) {
      const rest = path.replace(/^scrollback\.median\./, '');
      const v = rest.split('.').reduce((a, k) => (a == null ? undefined : a[k]), m);
      assert.equal(typeof v, 'number', `${path} did not resolve to a number in a median this scenario produces`);
    }
  });

  it('NUMERIC_KEYS names every top-level number a run reports', () => {
    const numeric = Object.entries(run())
      .filter(([, v]) => typeof v === 'number')
      .map(([k]) => k);
    for (const k of numeric) {
      assert.ok(NUMERIC_KEYS.includes(k), `run() reports ${k} but NUMERIC_KEYS omits it, so no median is taken of it`);
    }
  });
});

describe('MEASURES', () => {
  it('names the question, the configuration and the blind spots', () => {
    assert.equal(MEASURES.scenario, 'scrollback');
    assert.ok(MEASURES.question.length > 20);
    assert.ok(MEASURES.configuration.length >= 3);
    assert.ok(MEASURES.blindTo.length >= 3);
  });

  it('states that this is a WORST CASE, not a typical session', () => {
    // The single most likely misreading of this phase's headline number.
    assert.ok(MEASURES.blindTo.some((b) => /ceiling|worst case/i.test(b)),
      'blindTo must say the ceiling is deliberately the worst case');
  });

  it('states that the six sessions match the workload phase, or the floor is not comparable', () => {
    assert.ok(MEASURES.configuration.some((c) => /same six sessions|openJourneySessions/i.test(c)));
  });
});
