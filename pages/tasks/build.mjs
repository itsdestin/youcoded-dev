#!/usr/bin/env node
// Builds page.html from src/. WHY a build at all: a YouCoded page must be ONE document with no
// outside files, but one 2,500-line file is hard to change safely and impossible to test. The
// rules live in src/core.js (tested in Node), the screens in src/ui-*.js, the look in
// src/styles.css; this pastes them into src/shell.html. `--check` fails if page.html is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, 'src', f), 'utf8');
// A function, not a string, as the replacement: `$&` and `$'` inside the code must stay as they are.
const put = (doc, mark, text) => doc.replace(mark, () => text.trimEnd());
let out = read('shell.html');
out = put(out, '/*__CSS__*/', read('styles.css'));
out = put(out, '/*__CORE__*/', read('core.js').replace(/\nif \(typeof module[^\n]*\n?$/, '\n'));
out = put(out, '/*__UI__*/', ['ui-a.js', 'ui-b.js', 'ui-c.js'].map(read).join('\n'));
if (/<\/script>/i.test(out.slice(out.indexOf('<script>') + 8, out.lastIndexOf('</script>')))) throw new Error('src contains </script>, which would end the page script early');
const target = join(here, 'page.html');
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== out) { console.error('page.html is stale: run node pages/tasks/build.mjs'); process.exit(1); }
  console.log('page.html is up to date');
} else {
  writeFileSync(target, out);
  console.log(`page.html written (${(out.length / 1024).toFixed(0)} KB)`);
}
