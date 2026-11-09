// WHY: replay only synthetic CLI transcripts through the unchanged app parser.
// This checks compatibility separately from whether a mod control itself succeeds.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const requireApp = createRequire(path.join(root, 'youcoded/desktop/package.json'));
const ts = requireApp('typescript');
// WHY: esbuild is absent in this checkout. The existing TypeScript compiler can
// transpile the unchanged source in memory; no dependency installation is needed.
const previousLoader = Module._extensions['.ts'];
Module._extensions['.ts'] = (module, filename) => {
  if (!filename.startsWith(path.join(root, 'youcoded/desktop/src/'))) throw new Error('Unexpected TypeScript import');
  const {outputText} = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true},
    fileName: filename,
  });
  module._compile(outputText, filename);
};
const evidence = new URL('../evidence/controls-summary.json', import.meta.url);
const summary = JSON.parse(fs.readFileSync(evidence, 'utf8'));
try {
  const {parseTranscriptLine, emptyTurnUsageTally} = requireApp(path.join(root,'youcoded/desktop/src/main/transcript-watcher.ts'));
  const reports = [];
  for (const transcript of summary.transcripts) {
    // Only evidence-owned temporary fixture paths are accepted, never personal history.
    if (!transcript.path.startsWith('/tmp/cc-mods-controls-')) throw new Error('Non-fixture transcript refused');
    const tally = emptyTurnUsageTally();
    const rows = [];
    for (const line of fs.readFileSync(transcript.path,'utf8').split('\n').filter(Boolean)) {
      const input = JSON.parse(line);
      const events = parseTranscriptLine(line, 'isolated-replay', tally);
      if (input.type === 'user' || events.some(e=>e.type==='compact-summary')) {
        rows.push({uuid:input.uuid,origin:input.origin,promptId:input.promptId,
          content:input.message?.content,
          events:events.map(e=>({type:e.type,uuid:e.uuid,data:e.data}))});
      }
    }
    reports.push({file:path.basename(transcript.path),rows});
  }
  const all = reports.flatMap(r=>r.rows);
  const emitted = all.flatMap(r=>r.events);
  assert.equal(emitted.filter(e=>e.type==='user-message' && e.data.text==='repeat exact').length,2);
  assert(emitted.some(e=>e.type==='user-message' && e.data.text==='line one\n第二行 café 🧪'));
  const model = all.find(r=>typeof r.content==='string' && r.content.includes('<command-name>/model</command-name>'));
  assert(model && model.events.length===0, 'Observed mod /model record is not parsed into a command event');
  const compact = emitted.find(e=>e.type==='user-message' && e.data.text==='/compact Keep the probe markers.');
  assert(compact && compact.data.slashCommand!==true, 'Observed mod /compact is parsed as ordinary user text');
  assert(emitted.some(e=>e.type==='compact-summary'));
  fs.writeFileSync(new URL('./results.json',import.meta.url), JSON.stringify({scope:'pure unchanged parser replay; no live app',assertions:'duplicate text preserved; Unicode preserved; model command omitted; compact command ordinary text; compact summary present',reports},null,2)+'\n');
  for (const r of reports) {
    console.log('FILE',r.file);
    for (const row of r.rows) {
      if (row.origin?.kind === 'plugin' || row.events.some(e=>e.type==='compact-summary')) {
        console.log(JSON.stringify({text:typeof row.content==='string'?row.content.slice(0,100):'[blocks]',
          origin:row.origin,events:row.events.map(e=>({type:e.type,text:e.data?.text,slashCommand:e.data?.slashCommand}))}));
      }
    }
  }
} finally {
  if (previousLoader) Module._extensions['.ts'] = previousLoader;
  else delete Module._extensions['.ts'];
}
