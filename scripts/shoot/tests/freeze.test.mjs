// Pins scrubFrozen (scripts/shoot/freeze.mjs): a saved screen must carry nothing that runs or loads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scrubFrozen, FREEZE } from '../freeze.mjs';

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
  assert.ok(html.includes('https://fine.example/'), 'an ordinary link stays');
  assert.ok(html.includes('href="#local"'), 'an in-page reference stays');
  assert.ok(!/java\s*script/i.test(html.replace(/\s+/g, '')), 'the whitespace-split javascript: address is gone too');
});

test('FREEZE carries the scrub and is still one expression', () => {
  assert.ok(FREEZE.includes('scrubFrozen(root)') && FREEZE.includes('const scrubFrozen'));
  assert.doesNotThrow(() => new Function('return ' + FREEZE));
});
