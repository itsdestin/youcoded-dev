#!/usr/bin/env node
// Offline preview only. Never imports runtime modules, credentials or execution adapters.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cases, exportSuite } from './suite.mjs';
import { efficiencyCases } from './efficiency-cases.mjs';
import { comprehensiveCases } from './comprehensive-cases.mjs';
import { planExperiment } from './experiment-plan.mjs';

const panel = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./model-panel.json', import.meta.url)), 'utf8'));
export const developmentTasks = [...cases, ...efficiencyCases, ...comprehensiveCases];
export const requiredLabInputs = ['runner','worker','observer','state','scenario','faults','clarifications','io'].map(name=>`test-engine/lab-${name}.mjs`);
const fields = ['baselineDesktopDir','candidateDesktopDir','model','pinnedProvider','tasks','profile','assumedInputTokens','assumedOutputTokens','budgetUsd'];
const sha = data => createHash('sha256').update(data).digest('hex');
const digest = value => sha(JSON.stringify(value));
const numeric = value => typeof value === 'number' && Number.isFinite(value);

export function validateInput(input) {
  if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(key=>!fields.includes(key))) throw new Error('Only documented input fields are allowed');
  for (const name of ['baselineDesktopDir','candidateDesktopDir']) if (typeof input[name] !== 'string' || !input[name].trim()) throw new Error(`${name} is required`);
  if (!panel.models.some(model=>model.id===input.model)) throw new Error('model must be an exact model-panel.json ID');
  if (typeof input.pinnedProvider !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,127}$/.test(input.pinnedProvider) || input.pinnedProvider !== input.pinnedProvider.trim()) throw new Error('pinnedProvider must be one explicit endpoint/provider label, not a wildcard');
  if (!['smoke','confirmation'].includes(input.profile)) throw new Error('profile must be smoke or confirmation');
  if (!Array.isArray(input.tasks) || input.tasks.length<1 || input.tasks.length>3 || new Set(input.tasks).size!==input.tasks.length || input.tasks.some(id=>!developmentTasks.some(task=>task.id===id))) throw new Error('Select 1–3 unique named development tasks; held-out, unknown and implicit full-suite selections are refused');
  for (const name of ['assumedInputTokens','assumedOutputTokens']) if (!Number.isSafeInteger(input[name]) || input[name]<0) throw new Error(`${name} must be an explicit nonnegative safe integer`);
  if (!numeric(input.budgetUsd) || input.budgetUsd<=0) throw new Error('budgetUsd must be finite and positive');
  return input.tasks.map(id=>developmentTasks.find(task=>task.id===id));
}

// WHY: realpath alone hides symlinks. Inspect every ancestor before resolving or reading.
function noLinks(target) {
  const absolute = path.resolve(target), parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current,part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Symlink refused: ${current}`);
  }
  return fs.realpathSync(absolute);
}

function hashFiles(root, initial) {
  const hashes = {};
  let entries=0, bytes=0;
  const visit = relative => {
    if (++entries>20000) throw new Error('Snapshot exceeds 20000 entries');
    const file=path.join(root,relative), stat=fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`Symlink refused: ${file}`);
    if (stat.isDirectory()) for (const name of fs.readdirSync(file).sort()) visit(relative ? `${relative}/${name}` : name);
    else if (stat.isFile()) {
      bytes+=stat.size;
      if (stat.size>128*1024*1024 || bytes>1024*1024*1024) throw new Error('Snapshot exceeds 128 MiB/file or 1 GiB total');
      hashes[relative]=sha(fs.readFileSync(file));
    } else throw new Error(`Only ordinary files/directories allowed: ${file}`);
  };
  for (const relative of initial) visit(relative);
  return Object.fromEntries(Object.entries(hashes).sort(([a],[b])=>a<b?-1:a>b?1:0));
}

export function snapshotDesktop(directory) {
  const desktopDir=noLinks(directory);
  if (!fs.statSync(desktopDir).isDirectory()) throw new Error('Desktop input must be a directory');
  // WHY: enumerate all lab inputs, but require the transport's complete known runtime set.
  for (const relative of ['dist/main/create-runtime.js','package.json','package-lock.json',...requiredLabInputs]) {
    const file=noLinks(path.join(desktopDir,relative));
    if (!fs.statSync(file).isFile()) throw new Error(`Missing ordinary runtime input: ${relative}`);
  }
  const labs=fs.readdirSync(path.join(desktopDir,'test-engine')).filter(name=>/^lab-.*\.mjs$/.test(name)).sort().map(name=>`test-engine/${name}`);
  const files=hashFiles(desktopDir,['dist','package.json','package-lock.json',...labs]);
  return {desktopDir,sha256:digest(files),files,scope:'dist/**, package.json, package-lock.json, test-engine/lab-*.mjs; dependencies are not snapshotted'};
}

// Pure matrix construction: filesystem snapshots are supplied, never executed or copied.
export function planTargeted(input, builds) {
  const selected=validateInput(input), model=panel.models.find(row=>row.id===input.model);
  for (const arm of ['baseline','candidate']) if (!builds?.[arm]?.desktopDir || !builds[arm].sha256 || !builds[arm].files) throw new Error(`Missing ${arm} snapshot`);
  const repetitions=input.profile==='smoke'?1:3;
  const adapters=['baseline','candidate'].map(id=>({id,client:'youcoded',label:`YouCoded ${id}`,models:[model.id],capabilities:['single-turn','filesystem'],transportReady:false}));
  const plan=planExperiment({models:[model],tasks:selected.map(task=>({...task,split:'development'})),adapters,repetitions,assumedInputTokens:input.assumedInputTokens,assumedOutputTokens:input.assumedOutputTokens});
  const sameBuild=builds.baseline.sha256===builds.candidate.sha256;
  const overBudget=plan.estimatedTotalUsd!==null && plan.estimatedTotalUsd>input.budgetUsd;
  if (!numeric(plan.estimatedTotalUsd)) throw new Error('Illustrative estimate must be finite');
  return {...plan,mode:'targeted-offline-planning',executionAuthorized:false,profile:input.profile,
    builds,arms:adapters,model:model.id,pinnedProvider:input.pinnedProvider,
    taskIds:input.tasks,taskDefinitionHashes:Object.fromEntries(selected.map(task=>[task.id,digest(task)])),
    sameBuild,budgetUsd:input.budgetUsd,overBudget,priceCatalog:{source:panel.source,checkedDate:panel.checkedDate,model},
    cells:plan.cells.map(cell=>({...cell,client:'youcoded',pinnedProvider:input.pinnedProvider,buildSha256:builds[cell.agent].sha256,pairKey:JSON.stringify([cell.taskId,cell.model,cell.repetition])})),
    matchingConditions:['Same model, pinned provider, task fixtures and token assumptions in each pair.', 'Future execution must match reasoning, tools, permissions, cache policy, dependencies and gateway accounting; these are not configured or validated by this preview.'],
    limitations:['Builds are fingerprinted in place, NOT copied or frozen. Recheck all paths/file hashes during future runtime preparation.', 'No dependency installation, credential loading, subprocess, gateway or provider request occurs.', 'Exported verifier files are for the verifier only; never mount tests in the agent environment.', 'Selected public development tasks cannot establish broad benchmark superiority.'],
    warnings:[...plan.warnings,...(sameBuild?['A/A calibration: identical build-input hashes, not a demonstrated candidate change.']:[]),...(input.profile==='smoke'?['One smoke repetition is a plumbing/regression check, not proof of improvement.']:[]),...(overBudget?['Illustrative estimate exceeds budget; all cells retained. Budget is not spending approval.']:[])]};
}

export function writeTargetedPlan(input, outputDirectory) {
  const selected=validateInput(input), output=path.resolve(outputDirectory);
  // WHY: reserve a fresh root exclusively only after validating every requested input.
  noLinks(path.dirname(output));
  try { fs.lstatSync(output); throw new Error('Output already exists; choose a fresh directory'); }
  catch (error) { if (error.code!=='ENOENT') throw error; }
  const builds={baseline:snapshotDesktop(input.baselineDesktopDir),candidate:snapshotDesktop(input.candidateDesktopDir)};
  for (const build of Object.values(builds)) if (output===build.desktopDir || output.startsWith(build.desktopDir+path.sep)) throw new Error('Output must be outside build inputs');
  const plan=planTargeted(input,builds);
  fs.mkdirSync(output,{mode:0o700});
  try {
    exportSuite(path.join(output,'tasks'),selected,{split:'development'});
    plan.exportedFileHashes=hashFiles(output,['tasks']);
    fs.writeFileSync(path.join(output,'plan.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
  } catch (error) {
    fs.rmSync(output,{recursive:true,force:true,maxRetries:5});
    throw error;
  }
  return plan;
}

const help = `Usage: node scripts/harness-lab/targeted-plan.mjs INPUT.json NEW_OUTPUT_DIR
Offline only; writes plan.json and selected tasks/. No authorization or execution option.
Required JSON fields (no others):
  baselineDesktopDir, candidateDesktopDir: explicit desktop build paths (relative to cwd)
  model: exact model-panel.json ID
  pinnedProvider: single explicit endpoint/provider label (not validated online)
  tasks: array of 1–3 unique named development task IDs
  profile: "smoke" (1 repeat) or "confirmation" (3 repeats)
  assumedInputTokens, assumedOutputTokens: nonnegative integer assumptions
  budgetUsd: finite positive illustrative ceiling, NOT approval
Development task IDs: ${developmentTasks.map(task=>task.id).join(', ')}
Build symlinks/missing runtime inputs and existing output directories are refused.
Output parent must already exist; input build files are hashed, not copied/frozen.`;
if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2);
    if (args.length===1 && args[0]==='--help') console.log(help);
    else {
      if (args.length!==2 || args.some(arg=>arg.startsWith('--'))) throw new Error(help);
      const input=JSON.parse(fs.readFileSync(noLinks(args[0]),'utf8'));
      console.log(JSON.stringify(writeTargetedPlan(input,args[1]),null,2));
    }
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
