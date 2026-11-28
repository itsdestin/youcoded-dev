// Pins scrubFrozen (scripts/shoot/freeze.mjs): a saved screen must carry nothing that runs or loads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scrubFrozen, FREEZE, packRemoteSheets } from '../freeze.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const jsdomPath = join(here, '..', '..', '..', 'youcoded', 'desktop', 'node_modules', 'jsdom');
const have = existsSync(jsdomPath);

test('scrubFrozen takes out everything that can run or fetch', { skip: !have && 'jsdom is not installed in this checkout' }, () => {
  const { JSDOM } = createRequire(import.meta.url)(jsdomPath);
  const dom = new JSDOM(`<html><head><meta http-equiv="refresh" content="0;url=http://x"><style>@import url("http://x/a.css"); .a{background:url(http://x/i.png)} .b{background:url(data:image/png;base64,AAAA)}</style></head><body>
    <button onclick="evil()" onmouseover="x()">ok</button><a href="javascript:evil()">j</a><a href=" Java\tScript:evil()">j2</a><a href="https://fine.example/">fine</a>
    <form action="http://evil/"><input name=a></form><object data="x"></object><embed src="x"><img src="https://x/y.png"><img src="data:image/png;base64,AAAA">
    <div style="background:url(http://x/z.png)">t</div><svg><use href="http://x/s.svg#a"></use><use href="#local"></use></svg></body></html>`);
  const root = dom.window.document.documentElement;
  scrubFrozen(root);
  const html = root.outerHTML;
  for (const bad of ['onclick', 'onmouseover', 'javascript:', 'http-equiv', '@import', 'http://x', 'http://evil', '<object', '<embed', 'https://x/y.png'])
    assert.ok(!html.toLowerCase().includes(bad.toLowerCase()), 'still there: ' + bad + '\n' + html);
  assert.ok(html.includes('data:image/png;base64,AAAA'), 'a picture packed into the file must stay');
  // WHY an exact href match: the code scanner reads a bare substring check of a URL as a weak URL filter (PR 391).
  assert.ok(/href="https:\/\/fine\.example\/"/.test(html), 'an ordinary link stays');
  assert.ok(html.includes('href="#local"'), 'an in-page reference stays');
  assert.ok(!/java\s*script/i.test(html.replace(/\s+/g, '')), 'the whitespace-split javascript: address is gone too');
});

// WHY (2026-11-23): a packed SVG with its own url(#…) and quotes inside cut the style text in half, so every rule after it was
// dropped and frozen screens lost their rounded corners. The picture must survive whole and the rules after it must still be there.
test('a packed SVG drawing with quotes and url(#…) inside survives the scrub whole', { skip: !have && 'jsdom is not installed in this checkout' }, () => {
  const { JSDOM } = createRequire(import.meta.url)(jsdomPath);
  const svg = `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence/></filter><rect filter='url(#n)' opacity='0.5'/></svg>")`;
  const css = `.grain::before{background-image:${svg};background-size:120px} .after{border-radius:30px} .remote{background:url( "http://x/a.png" )}`;
  const dom = new JSDOM(`<html><head><style>${css}</style></head><body><div class="after">t</div></body></html>`);
  const root = dom.window.document.documentElement;
  scrubFrozen(root);
  const text = root.querySelector('style').textContent;
  assert.ok(text.includes(svg), 'the packed drawing stays whole\n' + text);
  assert.ok(text.includes('.after{border-radius:30px}'), 'the rule after it is still there');
  assert.ok(!text.includes('http://x/a.png') && text.includes('.remote{background:url("")}'), 'a remote address is still emptied');
  assert.equal(dom.window.document.styleSheets[0].cssRules.length, 3, 'the browser reads all three rules');
});

test('FREEZE carries the scrub and is still one expression', () => {
  assert.ok(FREEZE.includes('scrubFrozen(root)') && FREEZE.includes('const scrubFrozen'));
  assert.doesNotThrow(() => new Function('return ' + FREEZE));
});

// WHY (Destin, 2026-11-28: "text editing slides are super broken"): the page may not download a theme's Google font,
// so every frozen screen showed the typewriter fallback. packRemoteSheets fetches it outside the page; pinned with a fake download.
test('packRemoteSheets packs a theme font, one file per set, and fetches nothing else', async () => {
  const css = `/* cyrillic */ @font-face { font-family: 'Nunito'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/c.woff2) format('woff2'); }
/* latin */ @font-face { font-family: 'Nunito'; font-style: normal; font-weight: 400; src: url(https://fonts.gstatic.com/l.woff2) format('woff2'); }
/* latin */ @font-face { font-family: 'Nunito'; font-style: normal; font-weight: 800; src: url(https://fonts.gstatic.com/l.woff2) format('woff2'); }`;
  const asked = [];
  const get = async (u) => { asked.push(u); return u.endsWith('.woff2')
    ? { ok: true, headers: new Map([['content-type', 'font/woff2']]), arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
    : { ok: true, text: async () => css }; };
  const font = 'https://fonts.googleapis.com/css2?family=Nunito';
  const html = `<style>a{}/*youcoded-sheet:${encodeURI(font)}*/b{}/*youcoded-sheet:${encodeURI('https://evil.example/x.css')}*/</style>`;
  const { html: out, missed } = await packRemoteSheets(html, get);
  assert.deepEqual(missed, ['https://evil.example/x.css'], 'an address that is not Google Fonts is left out, never fetched');
  assert.ok(!asked.some((u) => u.includes('evil')) && !asked.includes('https://fonts.gstatic.com/c.woff2'), 'only the Latin file is downloaded: ' + asked);
  assert.equal((out.match(/@font-face/g) || []).length, 1, 'the two weights of one file become one block\n' + out);
  assert.ok(out.includes('font-weight: 400 800') && out.includes('url(data:font/woff2;base64,AQID)'), out);
  assert.ok(!out.includes('youcoded-sheet') && !out.includes('https://'), 'no marker and no live address is left');
});
