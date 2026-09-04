// In-page autopilot for the Flappy beat of the promo (scripts/ui-review/scenes/promo-flappy.json
// injects this with an `eval` action, then `hold`s while it flies).
//
// Why in-page: polling from the recorder over CDP reacts 30–60 ms late and the
// game punishes that — three afternoons of tuning never got past one pipe. A
// requestAnimationFrame loop inside the page sees the bird every frame and
// flaps by dispatching the same Space keydown the player would, so the game
// code path is exactly the real one.
//
// The rule comes from the engine's numbers (flappy-engine.ts): a flap always
// rises 18.8 units (flapVelocity² / 2·gravity) inside a 38-unit gap with a
// 4.6-unit hit radius, so the bird's centre must stay within ±14.4 of the gap
// centre. Flapping at +8 below centre tops out at −10.8: both inside the band,
// with room for one frame of detection lag at terminal velocity (≈5 units).
(() => {
  const f = document.querySelector("[data-game-keys='space']");
  if (!f) return 'pilot: no field';
  const WORLD_H = 125;                       // engine units, y down from the ceiling
  const MARGIN = 8;                          // flap when this far below the gap centre
  const COOLDOWN = 120;                      // ms between flaps (a flap takes 270 ms to top out)
  const px = f.getBoundingClientRect().height / WORLD_H;
  const bird = () => [...f.querySelectorAll('div')].find((d) => d.style.willChange === 'transform' && d.querySelector('svg'));
  const flap = () => f.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
  const st = (window.__pilot = { on: true, frames: 0, flaps: 0, log: [] });
  let prevY = null, prevT = null, lastFlap = -1e9;
  function tick(t) {
    if (!st.on) return;
    st.frames++;
    const b = bird();
    if (b) {
      const fr = f.getBoundingClientRect(), br = b.getBoundingClientRect();
      const y = (br.top + br.height / 2 - fr.top) / px;
      const v = prevY == null ? 0 : (y - prevY) / ((t - prevT) / 1000);
      prevY = y; prevT = t;
      // The next gap: the nearest visible pipe pair whose right edge is still ahead of the bird.
      let target = null, left = Infinity;
      for (const s of f.children) {
        if (s.children.length !== 2 || s.style.visibility !== 'visible') continue;
        const a = s.children[0].getBoundingClientRect(), c = s.children[1].getBoundingClientRect();
        if (a.width === 0 || a.right < br.left) continue;
        if (a.left < left) { left = a.left; target = ((Math.min(a.bottom, c.bottom) + Math.max(a.top, c.top)) / 2 - fr.top) / px; }
      }
      const want = st.flaps === 0                                   // the first flap starts the run
        || (target != null && v >= 0 && y > target + MARGIN)
        || (target == null && v >= 0 && y > WORLD_H * 0.45);
      if (want && t - lastFlap > COOLDOWN) { flap(); lastFlap = t; st.flaps++; }
      if (st.log.length < 2000) st.log.push([Math.round(t), +y.toFixed(1), target == null ? null : +target.toFixed(1), want ? 1 : 0]);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return 'pilot: on';
})();
