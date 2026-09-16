// Scrolls youcoded.ai from wherever it is to the bottom the way a reader does:
// about half a window, a short pause, again. Every scene in this folder films
// its ?motion= version with this same file, so the four clips move at exactly
// the same pace and only the page's motion differs between them.
// Run by record.mjs as an evalFile; it resolves once the page is at the bottom.
(function () {
  // The page sets scroll-behavior:smooth, which would turn each scrollTo below
  // into its own slow glide and fight the easing here.
  document.documentElement.style.scrollBehavior = 'auto';
  var STRETCH = 460, MOVE_MS = 950, PAUSE_MS = 380;
  function ease(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  function glide(to) {
    return new Promise(function (done) {
      var from = scrollY, t0 = performance.now();
      function step(now) {
        var k = Math.min(1, (now - t0) / MOVE_MS);
        scrollTo(0, from + (to - from) * ease(k));
        if (k < 1) requestAnimationFrame(step); else done();
      }
      requestAnimationFrame(step);
    });
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  return (async function () {
    var end = document.documentElement.scrollHeight - innerHeight;
    while (scrollY < end - 2) {
      await glide(Math.min(end, scrollY + STRETCH));
      await wait(PAUSE_MS);
      end = document.documentElement.scrollHeight - innerHeight;   // lazy pictures grow the page
    }
    return scrollY;
  })();
})()
