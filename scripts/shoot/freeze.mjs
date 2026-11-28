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
// WHY a scrub step (review 2026-11-10): "nothing in the file can run" was only true of <script>
// tags. `scrubFrozen` also takes out inline handlers (onclick=…), javascript: links, forms'
// targets, objects/embeds, meta refresh, remote pictures and remote @imports, so a screen saved
// from a page that carried any of them cannot run code or fetch from the network when the deck
// opens it (and the deck also frames it with no scripts allowed).
//
// It is a real function, exported so a test can run it; FREEZE below carries its source.
export function scrubFrozen(root) {
  const DANGER = /^(javascript|vbscript):|^data:text\/html/i;
  // WHY strip whitespace/control characters first: "java\tscript:" still runs in a browser.
  const clean = (v) => String(v || '').replace(/[\u0000-\u0020]+/g, '');
  // WHY read each url(...) as a whole quoted string (2026-11-23, Destin: a deck's pictures came out with square corners and
  // lost spacing): the old pattern stopped at the first ")" even inside quotes. The app's own grain texture is an SVG drawing
  // packed into the style text (`url("data:image/svg+xml,…filter='url(#n)'…")`), so the cleanup cut it in half, left a stray
  // quote, and the browser threw away every style rule after it: the theme's corner sizes, colours and spacing. A packed
  // picture (data:) or an in-page reference (#) stays whole; any other address still becomes url("").
  const URL_IN_CSS = /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)"'\s]*))\s*\)/gi;
  const cssClean = (t) => String(t || '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(URL_IN_CSS, (all, dq, sq, bare) => (/^(data:|#)/i.test((dq ?? sq ?? bare ?? '').trim()) ? all : 'url("")'));
  root.querySelectorAll('script, link, iframe, frame, noscript, base, object, embed, applet').forEach((n) => n.remove());
  root.querySelectorAll('meta[http-equiv]').forEach((n) => { if (/refresh/i.test(n.getAttribute('http-equiv'))) n.remove(); });
  root.querySelectorAll('style').forEach((n) => { n.textContent = cssClean(n.textContent); });
  root.querySelectorAll('*').forEach((n) => {
    for (const at of [...n.attributes]) {
      const name = at.name.toLowerCase();
      if (name.startsWith('on')) { n.removeAttribute(at.name); continue; }
      if (['href', 'src', 'action', 'formaction', 'xlink:href', 'data', 'poster'].includes(name) && DANGER.test(clean(at.value))) n.removeAttribute(at.name);
    }
    if (n.tagName.toLowerCase() === 'form') { n.removeAttribute('action'); n.removeAttribute('target'); }
    n.removeAttribute('formaction');
    // Pictures: only ones packed into the file stay. A fetch that failed left the remote address.
    if (['img', 'source', 'video', 'audio', 'image', 'input', 'track'].includes(n.tagName.toLowerCase())) {
      for (const k of ['src', 'poster']) { const v = n.getAttribute(k); if (v != null && !/^data:/i.test(v.trim())) n.removeAttribute(k); }
      n.removeAttribute('srcset');
    }
    if (n.tagName.toLowerCase() === 'use') {
      for (const k of ['href', 'xlink:href']) { const v = n.getAttribute(k); if (v != null && !v.trim().startsWith('#')) n.removeAttribute(k); }
    }
    const st = n.getAttribute('style');
    if (st && /url\(|@import/i.test(st)) n.setAttribute('style', cssClean(st));
  });
}

// FREEZE is evaluated inside the page (engine.mjs tab.evaluate) and returns the file's text.
export const FREEZE = `(async () => {
  const scrubFrozen = ${scrubFrozen.toString()};
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
    // A sheet that could not be read is left out (it used to be re-linked with @import, which made
    // the saved file load it from the network) — but its address is left as a marker comment, so
    // packRemoteSheets (outside the page) can fetch a theme's web font and pack it in.
    // WHY (Destin, 2026-11-28: "text editing slides are super broken"): the app's own security
    // rules forbid the page from downloading fonts.googleapis.com, so every frozen screen in a
    // Google-font theme (Meadow Mist: Nunito) fell back to the typewriter font.
    if (text === null) { if (s.href) css += '/*youcoded-sheet:' + encodeURI(s.href).replace(/\\*/g, '%2A') + '*/\\n'; continue; }
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
  // Internal ids the app hangs on elements (data-entry-key and the like) are dropped. WHY
  // (2026-11-10): the first two saved screens were committed beside a deck and the secrets
  // scanner stopped the push — an attribute named "…key" holding a random-looking id reads as
  // a password to it. Nothing in a still page uses them.
  root.querySelectorAll('*').forEach((n) => { for (const at of [...n.attributes]) if (/^data-.*(key|token|secret)/i.test(at.name)) n.removeAttribute(at.name); });
  await Promise.all([...root.querySelectorAll('img[src]')].map(async (img) => {
    img.removeAttribute('srcset'); img.removeAttribute('loading');
    try { img.setAttribute('src', await pack(new URL(img.getAttribute('src'), document.baseURI).href)); } catch {}
  }));
  await Promise.all([...root.querySelectorAll('[style*="url("]')].map(async (n) => n.setAttribute('style', await packUrls(n.getAttribute('style'), document.baseURI))));
  const style = document.createElement('style');
  // Entrance motion would replay every time the file opens; a still page shows the end state.
  style.textContent = imports + css + '\\n*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}';
  root.querySelector('head').appendChild(style);
  scrubFrozen(root);
  const meta = document.createElement('meta'); meta.setAttribute('charset', 'utf-8');
  root.querySelector('head').prepend(meta);
  root.setAttribute('data-frozen', innerWidth + 'x' + innerHeight);   // the size it was laid out at — the deck frames it at this size
  return '<!doctype html>\\n' + root.outerHTML;
})()`;

// packRemoteSheets — run OUTSIDE the page, on FREEZE's text: each sheet the page could not read
// (left as a /*youcoded-sheet:<address>*/ marker) is fetched here and its fonts packed in.
// WHY outside (Destin, 2026-11-28: "text editing slides are super broken"): the app's security
// rules stop the page itself from downloading fonts.googleapis.com, so a theme's Google font
// (Meadow Mist's Nunito) never reached the frozen copy and every screen fell back to the
// typewriter font. Only Google's two font addresses are fetched — the same ones the app's own
// theme check allows (theme-validator.ts) — and whatever cannot be fetched is simply left out,
// exactly as before. `get` is `fetch`; a test passes its own. Returns { html, missed: [address] }.
const FONT_HOST = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
export async function packRemoteSheets(html, get = fetch) {
  const missed = [];
  const asData = async (u) => {
    const r = await get(u); if (!r.ok) throw new Error(String(r.status));
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 4e6) throw new Error('too large');
    const type = (r.headers.get('content-type') || 'font/woff2').split(';')[0].trim();
    return `data:${type};base64,${buf.toString('base64')}`;
  };
  const sheet = async (href) => {
    if (!FONT_HOST.test(href)) { missed.push(href); return ''; }
    try {
      // WHY a browser's name: Google sends the small woff2 files only to a browser it recognises (plain ttf to anyone else, ~3x larger).
      const r = await get(href, { headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' } });
      if (!r.ok) throw new Error(String(r.status));
      // WHY only the Latin character sets: Google splits a font into Cyrillic, Vietnamese and Latin files, and packing all of
      // them made every saved screen ~750 KB heavier; the app's screens are in English. A block with no set label is kept.
      let text = (await r.text()).replace(/@import[^;]*;?/gi, '')
        .replace(/\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{[^}]*\}/gi, (block, set) => (/^latin(-ext)?$/i.test(set) ? block : ''));
      // WHY merge blocks that share one file: a variable font lists the SAME file once per weight, which packed it four times.
      // One block with the weights as a range ("400 800") draws the same.
      const seen = new Map();
      text = text.replace(/@font-face\s*\{[^}]*\}/gi, (block) => {
        const file = (block.match(/url\(\s*["']?([^"')\s]+)/) || [])[1], style = (block.match(/font-style:\s*([^;]+)/) || [])[1];
        const weight = (block.match(/font-weight:\s*([^;]+)/) || [])[1];
        if (!file || !weight || !/^\d+$/.test(weight.trim())) return block;
        const key = file + '|' + style, w = +weight.trim();
        if (!seen.has(key)) { seen.set(key, { lo: w, hi: w }); return `@@face:${key}@@` + block; }
        const s = seen.get(key); s.lo = Math.min(s.lo, w); s.hi = Math.max(s.hi, w); return '';
      });
      text = text.replace(/@@face:([^@]*)@@(@font-face\s*\{[^}]*\})/g, (all, key, block) => {
        const s = seen.get(key); return s.lo === s.hi ? block : block.replace(/font-weight:\s*[^;]+/, `font-weight: ${s.lo} ${s.hi}`);
      });
      const urls = [...new Set([...text.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)].map((m) => m[1]))];
      for (const u of urls) {
        let abs; try { abs = new URL(u, href).href; } catch { abs = ''; }
        // A font address not on Google's list, or one that fails, becomes url("") — never a live link in the saved file.
        const data = FONT_HOST.test(abs) ? await asData(abs).catch(() => '') : '';
        text = text.split(u).join(data);
      }
      // Nothing that could close the <style> it lands in.
      return text.replace(/<\//g, '<\\/');
    } catch { missed.push(href); return ''; }
  };
  const marks = [...new Set([...html.matchAll(/\/\*youcoded-sheet:([^*]*)\*\//g)].map((m) => m[1]))];
  for (const m of marks) {
    let href; try { href = decodeURI(m).replace(/%2A/g, '*'); } catch { href = ''; }
    html = html.split(`/*youcoded-sheet:${m}*/`).join(await sheet(href));
  }
  return { html, missed };
}
