// Deterministic, runtime-only inputs for the stall lab. No app launch, model,
// download or user-state access belongs in fixture generation.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
// WHY: pngjs/jpeg-js were resolved from an app checkout's node_modules relative to the working directory, so the image fixtures (and
// their unit test) failed from any other directory and could never run where nothing is installed. The lab now writes both formats itself.
import { IMAGE_ENCODER_REVISION, encodeJpeg, encodePng } from './image-encode.mjs';

export const IMAGE_LIMITS=Object.freeze({maxPixels:24000000,maxSide:8192,maxFileBytes:16*1024*1024,maxAggregateBytes:48*1024*1024,maxFiles:4});
export const IMAGE_PLAN=Object.freeze([{id:'image-png-1024x768',format:'png',width:1024,height:768,seed:23063},{id:'image-png-4096x3072',format:'png',width:4096,height:3072,seed:23063},{id:'image-jpeg-4096x3072',format:'jpeg',width:4096,height:3072,seed:23063}].map(Object.freeze));
export function validateImagePlan(plan){
 if(!Array.isArray(plan)||!plan.length||plan.length>4)throw Error('Image fixture count cap');const ids=new Set();
 for(const f of plan){if(!f||!/^[-\w]+$/.test(f.id)||ids.has(f.id)||!['png','jpeg'].includes(f.format)||![f.width,f.height].every(n=>Number.isInteger(n)&&n>0&&n<=8192)||f.width*f.height>24000000||(f.seed!==undefined&&(!Number.isInteger(f.seed)||f.seed<0||f.seed>0xffffffff)))throw Error('Invalid image dimensions/format/seed budget');ids.add(f.id);}
 return plan;
}
export function encodeImageFixture(spec,{allocate=n=>Buffer.alloc(n)}={}){
 validateImagePlan([spec]);
 // WHY: validate BOTH dimensions and expanded pixel budget before allocation.
 // Repeated color quadrants/checker make visual review recognizable
 // without incompressible noise exceeding compressed-file caps at large sizes.
 const rgba=allocate(spec.width*spec.height*4);let seed=spec.seed??23063;
 for(let y=0;y<spec.height;y++)for(let x=0;x<spec.width;x++){
  const i=(y*spec.width+x)*4,quadrant=(x>=spec.width/2?1:0)+(y>=spec.height/2?2:0),checker=((x>>4)^(y>>4))&1;
  rgba[i]=[220,40,40,220][quadrant]^(checker?16:0);rgba[i+1]=[40,210,40,210][quadrant]^(seed&7);rgba[i+2]=[40,40,220,40][quadrant]^(checker?16:0);rgba[i+3]=255;
 }
 const image={width:spec.width,height:spec.height,data:rgba};
 const data=spec.format==='png'?encodePng(image):encodeJpeg(image,85);
 if(data.length>IMAGE_LIMITS.maxFileBytes)throw Error('Encoded image exceeds file byte cap');
 return {data,shape:{width:spec.width,height:spec.height,pixels:spec.width*spec.height,rgbaBytes:rgba.length,seed,pattern:'four-color-quadrants-16px-checker-v1',encoder:{module:'perf-lab/image-encode',version:'r'+IMAGE_ENCODER_REVISION,settings:spec.format==='png'?'rgb/filter0/deflate6':'baseline444/quality85'},generatorSha256:sha256(readFileSync(fileURLToPath(import.meta.url)))}};
}
// Opt-in separate manifest: default document smoke is deliberately untouched.
// Large encodes must run sequentially under caller-owned external time/RSS guard.
export async function buildImageFixtures(root,{checkout,plan=IMAGE_PLAN,guard}={}){
 validateImagePlan(plan);if(plan.some(f=>f.width*f.height>1024*768)&&typeof guard!=='function')throw Error('Large image generation requires external generation guard');
 root=resolve(root);let s;try{s=await lstat(root);}catch(e){if(e.code!=='ENOENT')throw e;}if(s&&(s.isSymbolicLink()||!s.isDirectory()||(await readdir(root)).length))throw Error('Image fixture root must be empty and not symlink');if(!s)await mkdir(root,{recursive:true});
 const cases=[];let aggregate=0;
 for(const f of plan){const encoded=guard?await guard(()=>encodeImageFixture(f),f):encodeImageFixture(f);if(!Buffer.isBuffer(encoded?.data)||encoded.data.length>IMAGE_LIMITS.maxFileBytes||aggregate+encoded.data.length>IMAGE_LIMITS.maxAggregateBytes)throw Error('Image aggregate/file byte cap');aggregate+=encoded.data.length;
  const file=join(root,f.id+(f.format==='jpeg'?'.jpg':'.png'));await writeFile(file,encoded.data,{flag:'wx'});cases.push({id:f.id,kind:'image-'+f.format,marker:'stall-lab-'+f.id,file,bytes:encoded.data.length,sha256:sha256(encoded.data),shape:encoded.shape});
 }
 return {schema:2,imagesRevision:1,profile:'images-opt-in',root,aggregateBytes:aggregate,cases,limits:IMAGE_LIMITS,generationPolicy:'Sequential; larger than1024x768 requires caller-owned external generation guard, not an in-thread timeout'};
}

const XML_CAP = 16 * 1024 * 1024;
const DATE = new Date('2000-01-01T00:00:00.000Z');
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const PKG = 'http://schemas.openxmlformats.org/package/2006';
const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const SHEET = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const markerFor = (id) => `stall-lab-${id}`;
const relationships = (entries) => XML + `<Relationships xmlns="${PKG}/relationships">${entries.map(
  ([id, type, target]) => `<Relationship Id="${id}" Type="${OFFICE}/${type}" Target="${target}"/>`,
).join('')}</Relationships>`;
const contentTypes = (overrides) => XML + `<Types xmlns="${PKG}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides.map(
  ([name, type]) => `<Override PartName="/${name}" ContentType="application/vnd.openxmlformats-officedocument.${type}+xml"/>`,
).join('')}</Types>`;

function columnName(n) {
  let result = '';
  while (n) { n--; result = String.fromCharCode(65 + n % 26) + result; n = Math.floor(n / 26); }
  return result;
}

async function officeZip(JSZip, parts) {
  const expandedXmlBytes = Object.values(parts).reduce((n, text) => n + Buffer.byteLength(text), 0);
  if (expandedXmlBytes > XML_CAP) throw new Error('Expanded XML exceeds 16 MiB cap');
  const zip = new JSZip();
  // WHY: automatic directory entries and current timestamps change hashes even
  // when the workload is identical. Keep every ZIP member explicitly fixed.
  for (const [name, text] of Object.entries(parts)) {
    zip.file(name, text, { date: DATE, createFolders: false });
  }
  return { data: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE',
    compressionOptions: { level: 6 }, platform: 'DOS' }), expandedXmlBytes };
}

function xlsxParts(marker, { rows, columns, sheets, mergeCells }) {
  const parts = {
    '[Content_Types].xml': contentTypes([
      ['xl/workbook.xml', 'spreadsheetml.sheet.main'],
      ...Array.from({ length: sheets }, (_, i) => [`xl/worksheets/sheet${i + 1}.xml`, 'spreadsheetml.worksheet']),
    ]),
    '_rels/.rels': relationships([['rId1', 'officeDocument', 'xl/workbook.xml']]),
    'xl/workbook.xml': XML + `<workbook xmlns="${SHEET}" xmlns:r="${OFFICE}"><sheets>${Array.from({ length: sheets }, (_, i) =>
      `<sheet name="Sheet${i + 1}" sheetId="${i + 1}" state="${i ? 'hidden' : 'visible'}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': relationships(Array.from({ length: sheets }, (_, i) =>
      [`rId${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`])),
  };
  for (let s = 1; s <= sheets; s++) {
    // WHY: merged ranges are metadata only; using ExcelJS.mergeCells here would
    // expand the very allocation cliff the lab needs to measure in isolation.
    const dataRows = mergeCells ? 1 : rows;
    const dataColumns = mergeCells ? 1 : columns;
    const data = Array.from({ length: dataRows }, (_, r) => `<row r="${r + 1}">${Array.from({ length: dataColumns }, (_, c) =>
      `<c r="${columnName(c + 1)}${r + 1}" t="inlineStr"><is><t>${r === 0 && c === 0 ? marker : `s${s}-r${r + 1}-c${c + 1}`}</t></is></c>`).join('')}</row>`).join('');
    parts[`xl/worksheets/sheet${s}.xml`] = XML + `<worksheet xmlns="${SHEET}"><dimension ref="A1:${columnName(columns)}${rows}"/><sheetData>${data}</sheetData>${mergeCells ? `<mergeCells count="1"><mergeCell ref="A1:${columnName(columns)}${rows}"/></mergeCells>` : ''}</worksheet>`;
  }
  return parts;
}

function docxParts(marker, paragraphs, rows = 0, columns = 0) {
  const p = (text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
  const body = rows ? `<w:tbl><w:tblPr/><w:tblGrid>${'<w:gridCol w="900"/>'.repeat(columns)}</w:tblGrid>${Array.from({ length: rows }, (_, r) =>
    `<w:tr>${Array.from({ length: columns }, (_, c) => `<w:tc><w:tcPr/>${p(r === 0 && c === 0 ? marker : `row-${r + 1}-column-${c + 1}`)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`
    : Array.from({ length: paragraphs }, (_, i) => p(i === 0 ? marker : `Paragraph ${i + 1}: bounded stall lab document text.`)).join('');
  return {
    '[Content_Types].xml': contentTypes([['word/document.xml', 'wordprocessingml.document.main']]),
    '_rels/.rels': relationships([['rId1', 'officeDocument', 'word/document.xml']]),
    'word/document.xml': XML + `<w:document xmlns:w="${WORD}"><w:body>${body}<w:sectPr/></w:body></w:document>`,
  };
}

function csvData(marker, kind, targetBytes) {
  const columns = kind === 'csv-wide' ? 256 : kind === 'csv-quoted' || kind === 'csv-fullread' ? 4 : 2;
  const quote = (text) => /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  const first = Array.from({ length: columns }, (_, i) => i ? `column-${i + 1}` : marker).map(quote).join(',') + '\n';
  // WHY csv-fullread rows are ~1.8 KB: the viewer shows at most 2000 rows. The partial first 3 MiB then holds ~1750 rows (no
  // "rows truncated" note) and the whole 5 MiB file holds ~2900, so the note APPEARING after "Load the whole file" is objective
  // proof that more of the file was actually read and parsed (not just that a banner disappeared).
  const row = Array.from({ length: columns }, (_, i) => kind === 'csv-quoted'
    ? `quoted "value", column ${i + 1}\ncontinued` : kind === 'csv-fullread' ? `v${i + 1}-${'x'.repeat(440)}` : `v${i + 1}`).map(quote).join(',') + '\n';
  const count = Math.ceil((targetBytes - Buffer.byteLength(first)) / Buffer.byteLength(row));
  return { data: first + row.repeat(count), rows: count + 1, columns };
}

function noisePng(side, seed) {
  const data = Buffer.alloc(side * side * 4); let state = seed;
  for (let i = 0; i < data.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      data[i + channel] = state & 255;
    }
    data[i + 3] = 255;
  }
  return encodePng({ width: side, height: side, data });
}

/**
 * Every case a profile builds, WITHOUT generating anything: { id, kind, ext, params }. The lane plans rungs, thresholds and
 * per-rung generation children from this list, so the plan and the generator cannot drift apart.
 * 'ladder' = stress + the explicit CSV full-read file (5 MiB, over the app's 3 MiB partial-view cap, under its 12 MiB full-read cap).
 */
export const CSV_FULLREAD_BYTES = 5 * 1024 * 1024;
export function stallCasePlan(profile = 'smoke') {
  if (!['smoke', 'stress', 'ladder'].includes(profile)) throw new Error('Unknown fixture profile');
  const stress = profile !== 'smoke', plan = [];
  const add = (id, kind, ext, params) => plan.push({ id, kind, ext, params });
  for (const [rows, columns] of [[32, 32], [128, 128], [300, 300], ...(stress ? [[400, 500]] : [])]) add(`xlsx-merge-${rows}x${columns}`, 'xlsx-merge', 'xlsx', { rows, columns });
  for (const sheets of [1, 8, ...(stress ? [32] : [])]) add(`xlsx-sheets-${sheets}`, 'xlsx-sheets', 'xlsx', { sheets });
  for (const kind of ['csv-rows', 'csv-wide', 'csv-quoted']) for (const kib of [64, 256, ...(stress ? [1024, 3072] : [])]) add(`${kind}-${kib}kib`, kind, 'csv', { kib });
  if (profile === 'ladder') add(`csv-fullread-${CSV_FULLREAD_BYTES / 1024}kib`, 'csv-fullread', 'csv', { kib: CSV_FULLREAD_BYTES / 1024 });
  for (const paragraphs of [100, 1000, ...(stress ? [5000] : [])]) add(`docx-paragraphs-${paragraphs}`, 'docx-paragraphs', 'docx', { paragraphs });
  for (const rows of [25, 250, ...(stress ? [1000] : [])]) add(`docx-table-${rows}x10`, 'docx-table', 'docx', { rows, columns: 10 });
  for (const [images, side] of [[1, 256], [4, 256], ...(stress ? [[8, 512]] : [])]) add(`html-assets-${images}x${side}`, 'html-assets', 'html', { images, side });
  add('html-script-250ms', 'html-script', 'html', { scriptMs: 250 });
  for (const paths of [1000, 10000, ...(stress ? [20000] : [])]) add(`path-list-${paths}`, 'path-list', 'txt', { paths });
  return plan;
}

/**
 * Build bounded fixtures into a new or empty directory; never clear an old one.
 * checkout is the explicit app repo root, containing desktop/package.json and
 * its existing dependencies (only jszip is read from it now). stress includes the smoke ladder, not a replacement.
 * `only` (ids) builds just those cases; `reuseRoot` lets several per-rung children share one root (files are still created
 * exclusively, so a collision is refused rather than overwritten). WHY both: each rung is generated in its own memory-bounded
 * child process (bounded-exec.mjs), so a rung killed for memory is one recorded failed row, not a lost ladder.
 */
export async function buildStallFixtures(root, { checkout, profile = 'smoke', only = null, reuseRoot = false } = {}) {
  if (typeof checkout !== 'string' || !checkout) throw new Error('checkout is required');
  const plan = stallCasePlan(profile);
  if (typeof root !== 'string' || !root) throw new Error('Fixture root is required');
  const wanted = only ? new Set(only) : null;
  if (wanted) for (const id of wanted) if (!plan.some((c) => c.id === id)) throw new Error(`Unknown fixture case ${id} for profile ${profile}`);
  root = resolve(root);
  let stat;
  try { stat = await lstat(root); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (stat?.isSymbolicLink()) throw new Error('Fixture root must not be a symlink');
  if (stat && (!stat.isDirectory() || (!reuseRoot && (await readdir(root)).length))) throw new Error('Fixture root must be an empty directory, not nonempty');
  if (!stat) await mkdir(root, { recursive: true });
  let JSZipModule;
  const jszip = () => (JSZipModule ??= createRequire(join(resolve(checkout), 'desktop/package.json'))('jszip'));
  const cases = [];
  const write = async (name, data) => {
    const file = join(root, name); const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
    // WHY: exclusive creation refuses a collision instead of overwriting files
    // if another caller mistakenly shares this supposedly disposable root.
    await writeFile(file, bytes, { flag: 'wx' });
    return { file, bytes: bytes.length, sha256: sha256(bytes) };
  };
  const add = async (id, kind, extension, data, shape, assets) => {
    cases.push({ id, kind, marker: markerFor(id), shape, ...await write(`${id}.${extension}`, data),
      ...(assets ? { assets } : {}) });
  };
  const addOffice = async (id, kind, extension, parts, shape) => {
    const { data, expandedXmlBytes } = await officeZip(jszip(), parts);
    await add(id, kind, extension, data, { ...shape, expandedXmlBytes });
  };
  for (const c of plan) {
    if (wanted && !wanted.has(c.id)) continue;
    const { id, kind, params: p } = c, marker = markerFor(id);
    if (kind === 'xlsx-merge') {
      const shape = { rows: p.rows, columns: p.columns, sheets: 1, hiddenSheets: 0, mergeRanges: 1, mergeCells: p.rows * p.columns, storedCells: 1 };
      await addOffice(id, kind, 'xlsx', xlsxParts(marker, shape), shape);
    } else if (kind === 'xlsx-sheets') {
      const shape = { rows: 8, columns: 8, sheets: p.sheets, hiddenSheets: p.sheets - 1, mergeRanges: 0, mergeCells: 0, storedCells: p.sheets * 64 };
      await addOffice(id, kind, 'xlsx', xlsxParts(marker, shape), shape);
    } else if (kind.startsWith('csv-')) {
      const targetBytes = p.kib * 1024;
      const { data, rows, columns } = csvData(marker, kind, targetBytes);
      await add(id, kind, 'csv', data, { rows, columns, cells: rows * columns, targetBytes });
    } else if (kind === 'docx-paragraphs') {
      await addOffice(id, kind, 'docx', docxParts(marker, p.paragraphs), { paragraphs: p.paragraphs });
    } else if (kind === 'docx-table') {
      const shape = { rows: p.rows, columns: p.columns, cells: p.rows * p.columns, paragraphs: p.rows * p.columns, tables: 1 };
      await addOffice(id, kind, 'docx', docxParts(marker, shape.paragraphs, p.rows, p.columns), shape);
    } else if (kind === 'html-assets') {
      const assets = [], refs = [];
      for (let i = 0; i < p.images; i++) {
        const name = `${id}-image-${i + 1}.png`;
        assets.push(await write(name, noisePng(p.side, 0x5a17 + i)));
        refs.push(`<img src="${name}" width="${p.side}" height="${p.side}" alt="Noise ${i + 1}">`);
      }
      await add(id, kind, 'html', `<!doctype html><html><head><meta charset="utf-8"><title>${id}</title></head><body><h1>${marker}</h1>${refs.join('')}</body></html>`,
        { images: p.images, width: p.side, height: p.side, aggregateAssetBytes: assets.reduce((n, a) => n + a.bytes, 0) }, assets);
    } else if (kind === 'html-script') {
      // WHY: origin sandboxing is not CPU isolation. This finite workload measures
      // the parent response; phase messages prove whether the script actually ran.
      // Both elapsed time and a finite iteration ceiling bound the busy loop.
      const scriptMs = p.scriptMs;
      const script = `parent.postMessage({type:'perf-lab-stall',marker:'${marker}',phase:'start'},'*');\nconst start=performance.now();\nfor(let i=0;i<100000000 && performance.now()-start<${scriptMs};i++){}\nparent.postMessage({type:'perf-lab-stall',marker:'${marker}',phase:'done'},'*');`;
      await add(id, kind, 'html', `<!doctype html><html><head><meta charset="utf-8"><title>${id}</title></head><body><h1>${marker}</h1><script>${script}</script></body></html>`,
        { scriptMs, maxIterations: 100000000 });
    } else if (kind === 'path-list') {
      const data = Array.from({ length: p.paths }, (_, i) => `/stall-lab/${marker}/group-${Math.floor(i / 100)}/file-${String(i).padStart(5, '0')}.txt\n`).join('');
      await add(id, kind, 'txt', data, { paths: p.paths });
    }
  }
  return { schema: 1, root, profile, cases };
}
