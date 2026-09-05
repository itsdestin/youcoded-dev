// Autopilot for record.mjs: poll a JS predicate inside the page and press a key
// when it says so. Exists for the Flappy beat of the promo — the game exposes no
// autopilot and a fixed flap rhythm dies on the first low gap, but the DOM knows
// where the bird and the next gap are, so the recorder can "play" by reading it.
// Pure (clock, evaluate and press are injected) so node --test can drive it.
export async function runAutopilot({ evaluate, press, sleep, now, ms, every = 25, when, key = 'Space', minGap = 120 }) {
  const end = now() + ms;
  let lastPress = -Infinity, presses = 0, polls = 0;
  while (now() < end) {
    polls++;
    let want = false;
    try { want = Boolean(await evaluate(when)); } catch { want = false; }   // the page may not be ready yet
    if (want && now() - lastPress >= minGap) { await press(key); lastPress = now(); presses++; }
    await sleep(every);
  }
  return { presses, polls };
}

// The marks file: where every scene action sits in the finished clip, in video
// seconds. The Remotion timeline trims footage by these labels instead of by a
// hand-measured frame, so a re-film never breaks the edit. `firstFrameAt` is
// the wall-clock ms at which the first screencast frame arrived — the clip's
// time zero — and each stamp's start/end are wall-clock ms too.
// `captureLagMs`: the screencast delivers a frame this long AFTER the moment
// it shows. The clip's time zero is the wall-clock at which the FIRST frame
// arrived, so without this every action lands ~2 frames before its visible
// effect. Measured 2026-09-03 on the theme scene: the paint that a DOM
// observer stamped at t showed up at t + 77 ms (2.3 frames at 30 fps), the
// observer's own two rAFs being ~20 ms of that. With 60 ms the paint still
// showed 1.4 frames after its mark; 100 ms put it within half a frame.
export function marksFile({ fps, width, height, duration, firstFrameAt, stamps, captureLagMs = 0 }) {
  const sec = (ms) => Math.round(ms - (firstFrameAt - captureLagMs)) / 1000;
  return { fps, width, height, duration,
    actions: stamps.map((s) => ({ i: s.i, kind: s.kind, mark: s.mark ?? null, start: sec(s.start), end: sec(s.end) })) };
}
