import { test as nodeTest, before as nodeBefore, after as nodeAfter } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, symlink, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { buildStallFixtures } from '../stall-fixtures.mjs';
import { missingAppDeps } from './app-deps.mjs';

const checkout = resolve(fileURLToPath(new URL('../../../youcoded', import.meta.url)));
const require = createRequire(join(checkout, 'desktop/package.json'));
// Skipped, with the reason, where the app's dependencies are not installed (tests/app-deps.mjs).
const skip = missingAppDeps(['jszip', 'pngjs', 'exceljs', 'mammoth', 'fast-csv']);
const test = (name, fn) => nodeTest(name, { skip }, fn);
const before = (fn) => { if (!skip) nodeBefore(fn); };
const after = (fn) => { if (!skip) nodeAfter(fn); };
const appDep = (name) => (skip ? {} : require(name));
const JSZip = appDep('jszip');
const { PNG } = appDep('pngjs');
const ExcelJS = appDep('exceljs');
const mammoth = appDep('mammoth');
const { parseFile } = appDep('fast-csv');
const hash = (b) => createHash('sha256').update(b).digest('hex');
let temp, smoke, repeat, stress, stressRepeat;
before(async () => {
  temp = await mkdtemp(join(tmpdir(), 'stall-fixtures-'));
  smoke = await buildStallFixtures(join(temp, 'smoke'), { checkout });
  repeat = await buildStallFixtures(join(temp, 'repeat'), { checkout });
  stress = await buildStallFixtures(join(temp, 'stress'), { checkout, profile: 'stress' });
  stressRepeat = await buildStallFixtures(join(temp, 'stress-repeat'), { checkout, profile: 'stress' });
});
after(async () => { if (temp) await rm(temp, { recursive: true, force: true, maxRetries: 5 }); });

function contained(root, file) {
  const rel = relative(root, file);
  assert.ok(isAbsolute(file) && rel && !rel.startsWith('..') && !isAbsolute(rel), file);
}
// WHY: a strict state machine independently validates quoted newlines/escaped quotes;
// no copied app parser or source transpilation is needed to establish CSV validity.
function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === ',' || c === '\n') {
      row.push(field); field = ''; closed = false;
      if (c === '\n') { rows.push(row); row = []; }
    } else if (c === '"') {
      assert.equal(field, ''); assert.equal(closed, false); quoted = true;
    } else { assert.equal(closed, false); field += c; }
  }
  assert.equal(quoted, false); assert.equal(field, ''); assert.deepEqual(row, []);
  return rows;
}

test('fresh roots produce identical case identities, bytes, shapes and asset hashes', () => {
  assert.equal(smoke.schema, 1); assert.equal(smoke.profile, 'smoke');
  assert.equal(smoke.root, join(temp, 'smoke'));
  const identity = (m) => m.cases.map(({ file, assets, ...c }) => ({ ...c,
    file: relative(m.root, file), assets: assets?.map((a) => ({ ...a, file: relative(m.root, a.file) })) }));
  assert.deepEqual(identity(smoke), identity(repeat));
  assert.deepEqual(identity(stress), identity(stressRepeat));
  assert.equal(new Set(smoke.cases.map((c) => c.id)).size, smoke.cases.length);
  assert.deepEqual(new Set(smoke.cases.map((c) => c.kind)), new Set([
    'xlsx-merge', 'xlsx-sheets', 'csv-rows', 'csv-wide', 'csv-quoted',
    'docx-paragraphs', 'docx-table', 'html-assets', 'html-script', 'path-list',
  ]));
});

test('every recorded file is contained and its actual size and hash agree', async () => {
  for (const m of [smoke, repeat, stress, stressRepeat]) {
    for (const c of m.cases) {
      for (const f of [c, ...(c.assets ?? [])]) {
        contained(m.root, f.file);
        const bytes = await readFile(f.file);
        assert.equal(bytes.length, f.bytes); assert.equal(hash(bytes), f.sha256);
      }
      assert.ok(c.bytes < 16 * 1024 * 1024);
      if (c.shape.expandedXmlBytes !== undefined) assert.ok(c.shape.expandedXmlBytes <= 16 * 1024 * 1024);
    }
  }
});

test('Office ZIP CRCs, XML sizes and declared shapes agree without expanding large merges', async () => {
  for (const c of stress.cases.filter((c) => /^(xlsx|docx)/.test(c.kind))) {
    const zip = await JSZip.loadAsync(await readFile(c.file), { checkCRC32: true });
    let expanded = 0;
    for (const [name, entry] of Object.entries(zip.files)) {
      assert.equal(entry.dir, false);
      assert.equal(entry.date.getUTCFullYear(), 2000);
      if (name.endsWith('.xml') || name.endsWith('.rels')) expanded += (await entry.async('nodebuffer')).length;
    }
    assert.equal(expanded, c.shape.expandedXmlBytes);
    if (c.kind.startsWith('xlsx')) {
      const workbook = await zip.file('xl/workbook.xml').async('string');
      assert.equal((workbook.match(/<sheet /g) ?? []).length, c.shape.sheets);
      assert.equal((workbook.match(/state="hidden"/g) ?? []).length, c.shape.hiddenSheets);
      let storedCells = 0;
      for (let s = 1; s <= c.shape.sheets; s++) {
        const sheet = await zip.file(`xl/worksheets/sheet${s}.xml`).async('string');
        storedCells += (sheet.match(/<c /g) ?? []).length;
        assert.ok(sheet.includes(c.marker));
      }
      assert.equal(storedCells, c.shape.storedCells);
      const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
      assert.ok(xml.includes(c.marker));
      if (c.kind === 'xlsx-merge') {
        const range = /<mergeCell ref="A1:([A-Z]+)(\d+)"/.exec(xml);
        assert.ok(range);
        const cols = [...range[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
        assert.equal(cols, c.shape.columns); assert.equal(Number(range[2]), c.shape.rows);
        assert.equal(c.shape.mergeCells, c.shape.rows * cols);
        assert.ok(c.shape.mergeCells <= 200000);
        assert.equal((xml.match(/<c /g) ?? []).length, 1, 'generation must not materialize merged cells');
      }
    } else {
      const xml = await zip.file('word/document.xml').async('string');
      assert.ok(xml.includes(c.marker));
      assert.equal((xml.match(/<w:p>/g) ?? []).length, c.shape.paragraphs);
      assert.equal((xml.match(/<w:tr>/g) ?? []).length, c.shape.rows ?? 0);
      assert.equal((xml.match(/<w:tc>/g) ?? []).length, c.shape.cells ?? 0);
    }
  }
});

test('small XLSX and DOCX open in the existing real readers with sentinel intact', async () => {
  for (const kind of ['xlsx-merge', 'xlsx-sheets']) {
    const c = smoke.cases.find((c) => c.kind === kind);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(c.file);
    assert.equal(wb.worksheets.length, c.shape.sheets);
    assert.equal(wb.worksheets[0].getCell('A1').value, c.marker);
  }
  for (const kind of ['docx-paragraphs', 'docx-table']) {
    const c = smoke.cases.find((c) => c.kind === kind);
    const out = await mammoth.convertToHtml({ path: c.file });
    assert.ok(out.value.includes(c.marker));
    assert.equal(out.messages.filter((m) => m.type === 'error').length, 0);
  }
});

test('CSV workloads are valid rectangular CSV at bounded byte targets', async () => {
  for (const c of stress.cases.filter((c) => c.kind.startsWith('csv-'))) {
    const rows = parseCsv(await readFile(c.file, 'utf8'));
    assert.equal(rows.length, c.shape.rows);
    assert.ok(rows.every((r) => r.length === c.shape.columns));
    assert.equal(rows[0][0], c.marker);
    assert.ok(c.bytes >= c.shape.targetBytes && c.bytes < c.shape.targetBytes + 10000);
    if (c.kind === 'csv-quoted') {
      assert.ok(rows[1][0].includes('\n')); assert.ok(rows[1][0].includes('"'));
    }
  }
});

test('small CSV shapes also parse with the existing ExcelJS CSV dependency', async () => {
  for (const kind of ['csv-rows', 'csv-wide', 'csv-quoted']) {
    const c = smoke.cases.find((c) => c.kind === kind);
    const rows = await new Promise((resolveRows, reject) => {
      const parsed = [];
      parseFile(c.file).on('error', reject).on('data', (row) => parsed.push(row))
        .on('end', () => resolveRows(parsed));
    });
    assert.deepEqual(rows, parseCsv(await readFile(c.file, 'utf8')));
    assert.equal(rows[0][0], c.marker);
  }
});

test('local PNG assets have valid CRCs, distinct noise and exact aggregate sizes', async () => {
  for (const c of stress.cases.filter((c) => c.kind === 'html-assets')) {
    const html = await readFile(c.file, 'utf8');
    const refs = [...html.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(refs.length, c.shape.images); assert.equal(c.assets.length, refs.length);
    assert.equal(new Set(c.assets.map((a) => a.sha256)).size, refs.length);
    assert.equal(c.assets.reduce((n, a) => n + a.bytes, 0), c.shape.aggregateAssetBytes);
    for (let i = 0; i < refs.length; i++) {
      assert.ok(!isAbsolute(refs[i]) && !refs[i].includes('..') && !refs[i].includes(':'));
      assert.equal(resolve(c.file, '..', refs[i]), c.assets[i].file);
      const png = PNG.sync.read(await readFile(c.assets[i].file), { checkCRC: true });
      assert.equal(png.width, c.shape.width); assert.equal(png.height, c.shape.height);
      assert.ok(new Set(png.data).size > 200);
    }
  }
});

test('bounded HTML script posts deterministic before/after phases using a fake clock', async () => {
  const c = smoke.cases.find((c) => c.kind === 'html-script');
  const html = await readFile(c.file, 'utf8'); const messages = []; let clock = 0;
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  assert.equal(c.shape.scriptMs, 250);
  runInNewContext(script, { performance: { now: () => clock++ }, parent: {
    postMessage: (message, origin) => messages.push({ message, origin }),
  } }, { timeout: 1000 });
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), ['start', 'done'].map((phase) => ({
    message: { type: 'perf-lab-stall', marker: c.marker, phase }, origin: '*',
  })));
});

test('smoke and stress retain the complete bounded ladders and bare path counts', async () => {
  const shapes = (m, kind, key) => m.cases.filter((c) => c.kind === kind).map((c) => c.shape[key]);
  assert.deepEqual(shapes(smoke, 'xlsx-merge', 'mergeCells'), [1024, 16384, 90000]);
  assert.deepEqual(shapes(stress, 'xlsx-merge', 'mergeCells'), [1024, 16384, 90000, 200000]);
  assert.deepEqual(shapes(stress, 'xlsx-sheets', 'sheets'), [1, 8, 32]);
  assert.deepEqual(shapes(stress, 'docx-paragraphs', 'paragraphs'), [100, 1000, 5000]);
  assert.deepEqual(shapes(stress, 'docx-table', 'rows'), [25, 250, 1000]);
  assert.deepEqual(shapes(stress, 'html-assets', 'images'), [1, 4, 8]);
  for (const kind of ['csv-rows', 'csv-wide', 'csv-quoted']) {
    assert.deepEqual(shapes(stress, kind, 'targetBytes'), [65536, 262144, 1048576, 3145728]);
  }
  assert.deepEqual(shapes(stress, 'path-list', 'paths'), [1000, 10000, 20000]);
  for (const c of stress.cases.filter((c) => c.kind === 'path-list')) {
    const paths = (await readFile(c.file, 'utf8')).trimEnd().split('\n');
    assert.equal(paths.length, c.shape.paths); assert.equal(new Set(paths).size, paths.length);
    assert.ok(paths.every((p) => /^\/stall-lab\/[\w/-]+\.txt$/.test(p)));
    assert.ok(paths.some((p) => p.includes(c.marker)));
  }
});

test('refuses nonempty roots, root symlinks and invalid options without harming unrelated files', async () => {
  const root = join(temp, 'protected'); await mkdir(root);
  const file = join(root, 'unrelated'); await writeFile(file, 'keep');
  await assert.rejects(buildStallFixtures(root, { checkout }), /nonempty|not empty/i);
  assert.equal(await readFile(file, 'utf8'), 'keep'); assert.deepEqual(await readdir(root), ['unrelated']);
  const empty = join(temp, 'empty'); await mkdir(empty);
  const link = join(temp, 'link'); await symlink(empty, link, 'junction');
  await assert.rejects(buildStallFixtures(link, { checkout }), /symlink/i);
  assert.deepEqual(await readdir(empty), []);
  await assert.rejects(buildStallFixtures(join(temp, 'missing-checkout')), /checkout/i);
  await assert.rejects(buildStallFixtures(join(temp, 'bad-profile'), { checkout, profile: 'unbounded' }), /profile/i);
});
