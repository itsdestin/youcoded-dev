#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// These small, public tasks validate plumbing and regressions, not competitive superiority.
// Oracle files are used only by offline tests; never copy them into an agent environment.
export const cases = [
  { id: 'finish-the-file', category: 'follow-through',
    instruction: 'Read request.json and write result.json with the same ticket and status "ready". Do the work now; do not merely explain a plan. Leave request.json unchanged. Reply in at most two sentences.',
    files: { 'request.json': '{"ticket":"LAB-148","owner":"Mira"}\n' },
    oracle: { 'result.json': '{"ticket":"LAB-148","status":"ready"}\n' },
    check: `assert json.loads((root/'request.json').read_text()) == {'ticket':'LAB-148','owner':'Mira'}\nassert json.loads((root/'result.json').read_text()) == {'ticket':'LAB-148','status':'ready'}` },
  { id: 'repair-average', category: 'coding',
    instruction: 'Fix average.py: average(values) must return the arithmetic mean for nonempty numeric lists and raise ValueError for an empty list. Preserve the function name. Verify your change, then briefly explain it.',
    files: { 'average.py': 'def average(values):\n    return sum(values)\n' },
    oracle: { 'average.py': 'def average(values):\n    if not values:\n        raise ValueError("empty")\n    return sum(values) / len(values)\n' },
    check: `import importlib.util\nspec = importlib.util.spec_from_file_location('solution', root/'average.py')\nmodule = importlib.util.module_from_spec(spec)\nspec.loader.exec_module(module)\nassert module.average([2,4,6]) == 4\nassert module.average([-2,2]) == 0\nassert module.average([3]) == 3\ntry:\n    module.average([])\nexcept ValueError:\n    pass\nelse:\n    raise AssertionError('empty list must raise ValueError')` },
  { id: 'reconcile-sources', category: 'research-document',
    instruction: 'Using only the provided source files, determine the approved launch date and budget. Write decision.json with keys launchDate, budgetUsd, source. Also write brief.md explaining the conflict and why you chose that source, citing its filename. Do not alter the source files. Be concise.',
    files: { 'draft.md': '# Draft — 2026-01-02\nProposed launch: 2026-03-01. Budget: $900. Not approved.\n',
      'approved.md': '# Signed decision — 2026-01-09\nApproved launch: 2026-03-15. Budget: $750. Supersedes draft.md.\n' },
    oracle: { 'decision.json': '{"launchDate":"2026-03-15","budgetUsd":750,"source":"approved.md"}\n',
      'brief.md': 'The signed approved.md supersedes draft.md: launch March 15, 2026 with a $750 budget.\n' },
    check: `assert json.loads((root/'decision.json').read_text()) == {'launchDate':'2026-03-15','budgetUsd':750,'source':'approved.md'}\nbrief = (root/'brief.md').read_text()\nassert 'approved.md' in brief and 'draft.md' in brief\nassert (root/'draft.md').read_text() == '# Draft — 2026-01-02\\nProposed launch: 2026-03-01. Budget: $900. Not approved.\\n'\nassert (root/'approved.md').read_text() == '# Signed decision — 2026-01-09\\nApproved launch: 2026-03-15. Budget: $750. Supersedes draft.md.\\n'` },
];

export function exportSuite(destination, selectedCases = cases, {split='development'}={}) {
  if(!['development','evaluation-only','behavior','retention'].includes(split))throw new Error('Invalid suite split');
  if (fs.existsSync(destination)) throw new Error('Destination already exists; choose a fresh suite folder');
  const ids=new Set();
  // WHY: validate the whole export before creating files; fixture names must never escape its directory.
  for(const c of selectedCases){
    if(typeof c.id!=='string'||!/^[a-z0-9][a-z0-9-]*$/.test(c.id)||ids.has(c.id))throw new Error('Invalid or duplicate case path');
    ids.add(c.id);
    for(const [name,text] of Object.entries(c.files??{}))if(!name||path.isAbsolute(name)||path.win32.isAbsolute(name)||name.includes('\\')||name.includes('\0')||name.split('/').some(p=>!p||p==='.'||p==='..')||typeof text!=='string')throw new Error('Unsafe fixture path or content');
  }
  for (const c of selectedCases) {
    const dir = path.join(destination, c.id);
    fs.mkdirSync(path.join(dir, 'environment', 'fixtures'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'tests'));
    fs.writeFileSync(path.join(dir, 'instruction.md'), `Work in /app.\n\n${c.instruction}\n`);
    if(c.steps)fs.writeFileSync(path.join(dir,'scenario.json'),JSON.stringify({steps:c.steps},null,2)+'\n');
    const coverageMetadata = c.domain ? `domain = "${c.domain}"\nrequiredCapabilities = [${c.requiredCapabilities.map(value => `"${value}"`).join(', ')}]\n` : '';
    fs.writeFileSync(path.join(dir, 'task.toml'), `version = "1.0"\n\n[metadata]\nauthor_name = "YouCoded"\ndifficulty = "easy"\ncategory = "${c.category}"\ntags = ["harness-lab", "${split}"]\nsplit = "${split}"\n${coverageMetadata}\n[agent]\ntimeout_sec = 300\n\n[verifier]\ntimeout_sec = 30\n\n[environment]\ncpus = 2\nmemory_mb = 2048\nstorage_mb = 4096\n`);
    fs.writeFileSync(path.join(dir, 'environment', 'Dockerfile'), 'FROM node:22-bookworm-slim\nRUN apt-get update && apt-get install -y --no-install-recommends python3 git ripgrep ca-certificates && rm -rf /var/lib/apt/lists/*\nWORKDIR /app\nCOPY fixtures/ /app/\n');
    for (const [name, contents] of Object.entries(c.files)) {
      const fixturePath = path.join(dir, 'environment', 'fixtures', name);
      fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
      fs.writeFileSync(fixturePath, contents);
    }
    fs.writeFileSync(path.join(dir, 'tests', 'verify.py'), `import json, sys\nfrom pathlib import Path\nroot = Path(sys.argv[1] if len(sys.argv) > 1 else '/app')\n${c.check}\n`);
    // Verifier owns the reward. A claimed success in the agent's final text never counts.
    fs.writeFileSync(path.join(dir, 'tests', 'test.sh'), '#!/bin/bash\nmkdir -p /logs/verifier\nif python3 /tests/verify.py /app; then\n  echo 1 > /logs/verifier/reward.txt\nelse\n  echo 0 > /logs/verifier/reward.txt\nfi\n', { mode: 0o755 });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (!process.argv[2] || process.argv.includes('--help')) console.log('Usage: node scripts/harness-lab/suite.mjs NEW_DIRECTORY [--efficiency|--comprehensive|--heldout|--behavior|--retention]\nExports separate development, evaluation-only, or scenario fixtures; no model calls.');
    else {
      let selected = cases;
      if(['--efficiency','--comprehensive','--heldout','--behavior','--retention'].filter(flag=>process.argv.includes(flag)).length>1)throw new Error('Choose one suite split');
      if(process.argv.includes('--heldout'))selected=(await import('./heldout-cases.mjs')).heldoutCases;
      else if(process.argv.includes('--behavior'))selected=(await import('./behavior-cases.mjs')).behaviorCases;
      else if(process.argv.includes('--retention'))selected=[(await import('./retention-probes.mjs')).buildRetentionProbe()];
      else if (process.argv.includes('--comprehensive')) {
        selected = [
          ...cases,
          ...(await import('./efficiency-cases.mjs')).efficiencyCases,
          ...(await import('./comprehensive-cases.mjs')).comprehensiveCases,
        ];
      } else if (process.argv.includes('--efficiency')) {
        selected = (await import('./efficiency-cases.mjs')).efficiencyCases;
      }
      const split=process.argv.includes('--heldout')?'evaluation-only':process.argv.includes('--behavior')?'behavior':process.argv.includes('--retention')?'retention':'development';
      exportSuite(path.resolve(process.argv[2]), selected,{split});
      console.log(`Exported ${selected.length} tasks.`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
