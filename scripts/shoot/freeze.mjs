// freeze — a screen saved as ONE still web page, for editing its words in place on a review deck.
//
// WHY (Destin, 2026-11-10): wording was first reviewed as a list of text boxes beside a small
// picture — "this system is terrible… directly edit text on the real ui surface so i can see it
// in context". A picture cannot be typed into, and the running app needs a server and reacts to
// clicks. So `shoot --page` saves what the screen IS at the moment of the picture: the same
// elements and the same styling, with the app's code removed. The deck shows that file in a
// frame and makes its text editable (deck/page.js `screenCard`); retyped words re-wrap exactly
// as they would in the app, because the styling is the app's own.
//
// What is kept: every element, every style rule (as one <style>), pictures and fonts (packed
// into the file, so it needs no server). What is dropped: all scripts — nothing in the file
// can run, click through or load anything.
//
// FREEZE is evaluated inside the page (engine.mjs tab.evaluate) and returns the file's text.
export const FREEZE = `(async () => {
  const MAX = 4e6;                                   // a single picture or font above this stays a link
  const cache = new Map();
  const pack = (u) => {
    if (!u || u.startsWith('data:') || u.startsWith('#')) return Promise.resolve(u);
    if (!cache.has(u)) cache.set(u, (async () => {
      try {
        const b = await (await fetch(u)).blob();
        if (b.size > MAX) return u;
        return await new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = () => res(u); f.readAsDataURL(b); });
      } catch { return u; }
    })());
    return cache.get(u);
  };
  // url(...) inside style text, resolved against the sheet it came from and packed in.
  const packUrls = async (text, base) => {
    const found = [...text.matchAll(/url\\((["']?)([^"')]+)\\1\\)/g)];
    const map = new Map();
    await Promise.all(found.map(async (m) => {
      if (m[2].startsWith('data:') || m[2].startsWith('#')) return;
      let abs; try { abs = new URL(m[2], base).href; } catch { return; }
      map.set(m[0], 'url("' + await pack(abs) + '")');
    }));
    return text.replace(/url\\((["']?)([^"')]+)\\1\\)/g, (all) => map.get(all) || all);
  };
  // Every style rule the page is using. A sheet from another site (a theme's web font) refuses
  // to be read, so its text is fetched instead; failing that it stays an @import at the top.
  let imports = '', css = '';
  for (const s of [...document.styleSheets, ...(document.adoptedStyleSheets || [])]) {
    let text = null;
    try { text = [...s.cssRules].map((r) => r.cssText).join('\\n'); } catch {}
    if (text === null && s.href) { try { text = await (await fetch(s.href)).text(); } catch {} }
    if (text === null) { if (s.href) imports += '@import url("' + s.href + '");\\n'; continue; }
    css += await packUrls(text, s.href || document.baseURI) + '\\n';
  }
  const root = document.documentElement.cloneNode(true);
  // What a person typed or ticked lives outside the markup — copy it in, or boxes come back empty.
  const live = document.querySelectorAll('input, textarea, select, canvas');
  const copy = root.querySelectorAll('input, textarea, select, canvas');
  live.forEach((el, i) => {
    const c = copy[i]; if (!c) return;
    if (el.tagName === 'CANVAS') {
      try { const img = document.createElement('img'); img.src = el.toDataURL(); img.className = el.className; img.setAttribute('style', (el.getAttribute('style') || '') + ';width:' + el.clientWidth + 'px;height:' + el.clientHeight + 'px'); c.replaceWith(img); } catch {}
    } else if (el.tagName === 'TEXTAREA') c.textContent = el.value;
    else if (el.tagName === 'SELECT') [...c.options].forEach((o, n) => { if (n === el.selectedIndex) o.setAttribute('selected', ''); else o.removeAttribute('selected'); });
    else if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked) c.setAttribute('checked', ''); else c.removeAttribute('checked'); }
    else c.setAttribute('value', el.value);
  });
  // How far each scrolled part was scrolled. A still page has no code to scroll itself, so the
  // offsets ride as attributes and the deck puts them back when it opens the file — without
  // this a chat photographed at its newest message reopened at its oldest.
  { const all = document.querySelectorAll('*'); const mine = root.querySelectorAll('*');
    all.forEach((el, i) => { if ((el.scrollTop || el.scrollLeft) && mine[i]) mine[i].setAttribute('data-frozen-scroll', el.scrollLeft + ',' + el.scrollTop); }); }
  root.querySelectorAll('script, style, link, iframe, noscript, base').forEach((n) => n.remove());
  await Promise.all([...root.querySelectorAll('img[src]')].map(async (img) => {
    img.removeAttribute('srcset'); img.removeAttribute('loading');
    try { img.setAttribute('src', await pack(new URL(img.getAttribute('src'), document.baseURI).href)); } catch {}
  }));
  await Promise.all([...root.querySelectorAll('[style*="url("]')].map(async (n) => n.setAttribute('style', await packUrls(n.getAttribute('style'), document.baseURI))));
  const style = document.createElement('style');
  // Entrance motion would replay every time the file opens; a still page shows the end state.
  style.textContent = imports + css + '\\n*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}';
  root.querySelector('head').appendChild(style);
  const meta = document.createElement('meta'); meta.setAttribute('charset', 'utf-8');
  root.querySelector('head').prepend(meta);
  root.setAttribute('data-frozen', innerWidth + 'x' + innerHeight);   // the size it was laid out at — the deck frames it at this size
  return '<!doctype html>\\n' + root.outerHTML;
})()`;
