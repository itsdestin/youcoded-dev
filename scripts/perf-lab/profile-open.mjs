// scripts/perf-lab/profile-open.mjs — "WHICH FUNCTIONS made this step slow?"
//
// WHY this exists. `explain.mjs` answers which STEP produced a number; it cannot
// say what ran inside it. On 2026-09-09 that gap sent a plan at the wrong target:
// opening a small Markdown file measured 570 ms against 117 ms for a code file
// twenty times its size, and three fixes were filed against the Markdown
// renderer — which, timed on its own, turns that same file into a page in ~30 ms.
// Roughly half a second was being attributed to code that was not running.
//
// This takes a real V8 CPU profile across one artifact open in the real app and
// ranks functions by self time, so the next such number is read rather than
// guessed. Filed as a rig gap in docs/roadmap/dev-workspace.md; this closes it.
//
// The app runs on Xvfb, exactly as the rig does — nothing appears on the desktop.
//
// Usage (from the workspace root):
//   node scripts/perf-lab/profile-open.mjs                    # md small + md large + code small
//   node scripts/perf-lab/profile-open.mjs --file mdSmall     # just one
//   node scripts/perf-lab/profile-open.mjs --top 30
//   node scripts/perf-lab/profile-open.mjs --checkout <path>  # which tree to build
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { buildApp } from './build.mjs';
import { buildFixture } from './fixture.mjs';
import { launchApp, resolveXvfbBin, startXvfb } from './launch.mjs';
import { waitFor } from './cdp.mjs';
import {
  installArtifactHelpers, registerArtifacts,
  buildCodeArtifact, buildMarkdownArtifact,
} from './scenario-artifacts.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRATCH = join(ROOT, 'scratch', 'perf-lab');
const CDP_PORT = 9557;   // not the rig's 9555 — so a profile and a run cannot collide

const arg = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : dflt;
};

/**
 * Fold a V8 .cpuprofile into self-time per function.
 *
 * V8 reports samples as node ids plus deltas; a node's self time is the sum of
 * the deltas for samples that landed ON it. Children are NOT included, which is
 * what makes this a ranking of work actually done rather than of call depth.
 */
export function selfTimes(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const { samples = [], timeDeltas = [] } = profile;
  for (let i = 0; i < samples.length; i++) {
    const n = byId.get(samples[i]);
    if (!n) continue;
    const cf = n.callFrame;
    // Group by function + script, not by node: the same function appears under
    // every distinct call path, and summing those is the whole point.
    const url = (cf.url || '').replace(/^.*\/(dist|src|node_modules)\//, '$1/');
    const key = `${cf.functionName || '(anonymous)'}  ${url}${cf.lineNumber >= 0 ? `:${cf.lineNumber + 1}` : ''}`;
    self.set(key, (self.get(key) ?? 0) + Math.max(0, timeDeltas[i] ?? 0));
  }
  return [...self.entries()]
    .map(([name, us]) => ({ name, ms: us / 1000 }))
    .sort((a, b) => b.ms - a.ms);
}

/** A one-line bucket per subsystem, so the answer survives minified frames. */
export function buckets(rows) {
  const rules = [
    ['syntax highlighting (lowlight/highlight.js)', /highlight|lowlight|hljs/i],
    ['markdown parse (remark/micromark/mdast)', /remark|micromark|mdast|unified/i],
    ['hast / react-markdown', /hast|react-markdown|rehype/i],
    ['React render + reconcile', /react-dom|scheduler|beginWork|commitRoot|performWork|reconcile/i],
    ['CodeMirror', /codemirror|@?cm-|\bcm6\b/i],
    ['our app code', /dist\/renderer|src\/renderer/i],
    ['V8 / GC / runtime', /\(program\)|\(garbage collector\)|\(idle\)|\(root\)/i],
  ];
  const out = new Map();
  for (const r of rows) {
    const hit = rules.find(([, re]) => re.test(r.name));
    const k = hit ? hit[0] : 'other';
    out.set(k, (out.get(k) ?? 0) + r.ms);
  }
  return [...out.entries()].map(([name, ms]) => ({ name, ms })).sort((a, b) => b.ms - a.ms);
}

async function profileOpen(cdp, file, { top }) {
  await cdp.evaluate(`window.__perfArt.clickTitle('Show list')`);
  await cdp.send('Profiler.enable');
  // 100µs: fine enough to separate a 30 ms function from a 300 ms one without
  // the sampling itself distorting the very step being measured.
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  const click = await cdp.evaluate(`window.__perfArt.clickListRow(${JSON.stringify(file.name)})`);
  if (!click.ok) throw new Error(`could not open ${file.name} — ${click.reason}`);
  // Poll WITHOUT touching innerText: reading the pane's text forces layout, and
  // a probe that reflows the very document it is timing inflates its own answer.
  await waitFor(cdp, `(() => {
    const v = document.querySelector('[data-artifact-viewer]');
    return !!v && v.getAttribute('data-doc-path') === ${JSON.stringify(file.rel)};
  })()`, { timeoutMs: 60000, everyMs: 25 });
  const wallMs = Date.now() - t0;
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.send('Profiler.disable');

  const rows = selfTimes(profile);
  const total = rows.reduce((s, r) => s + r.ms, 0);
  return { wallMs, total, rows: rows.slice(0, top), all: rows, profile };
}

async function main() {
  const top = Number(arg('--top', 20));
  const only = arg('--file', null);
  // Default to THIS worktree's app, not the rig's shared perf-lab checkout —
  // profiling exists to explain the tree you are working in.
  const checkout = resolve(arg('--checkout', join(ROOT, 'youcoded')));

  console.log(`building ${checkout} …`);
  const build = await buildApp(checkout, { skipIfFresh: true });
  const fixture = buildFixture(SCRATCH, { log: () => {} });

  resolveXvfbBin();
  const x = await startXvfb();
  let app = null;
  try {
    app = await launchApp({ binary: build.binary, appDir: build.appDir, fixture, cdpPort: CDP_PORT, display: x.display });
    const cdp = app.cdp;
    await waitFor(cdp, `performance.getEntriesByType('mark').some(m => m.name === 'yc:sessions-listed')`, { timeoutMs: 90_000 });
    await installArtifactHelpers(cdp);

    // Same seeds and sizes the artifacts scenario uses, so a number here is
    // comparable with open.mdSmall/open.mdLarge in a rig report.
    const dirName = 'perf-artifacts';
    const dir = join(fixture.projects.alpha, dirName);
    mkdirSync(dir, { recursive: true });
    const files = {};
    const put = (key, base, text) => {
      const abs = join(dir, base);
      writeFileSync(abs, text);
      files[key] = { key, name: base, rel: `${dirName}/${base}`, abs, bytes: statSync(abs).size };
    };
    put('codeSmall', 'perf-small.ts', buildCodeArtifact({ approxBytes: 3000, seed: 11 }));
    put('mdSmall', 'perf-small.md', buildMarkdownArtifact({ approxBytes: 3000, seed: 21 }).text);
    put('mdLarge', 'perf-large.md', buildMarkdownArtifact({ approxBytes: 400000, seed: 22 }).text);

    // A session first: the drawer's file list is session-scoped, so registering
    // artifacts against a null session would leave nothing to click.
    const t = fixture.transcripts?.small ?? Object.values(fixture.transcripts ?? {})[0] ?? null;
    const made = await cdp.evaluate(`(async () => {
      try {
        const s = await window.claude.session.create({
          name: 'perf-profile', cwd: ${JSON.stringify(fixture.projects.alpha)}, skipPermissions: true,
          ${t ? `resumeSessionId: ${JSON.stringify(t.sessionId)},` : ''}
        });
        return { id: s && s.id };
      } catch (e) { return { error: (e && e.message) ? e.message : String(e) }; }
    })()`);
    if (!made?.id) throw new Error(`session.create failed in the app: ${made?.error ?? JSON.stringify(made)}`);
    await waitFor(cdp, `!document.body.innerText.includes('Initializing session')`, { timeoutMs: 60000, everyMs: 100 });

    await registerArtifacts(cdp, fixture.projects.alpha, made.id, files);

    await cdp.evaluate(`window.__perfArt.clickTitle('Session Files')`);
    await waitFor(cdp, `window.__perfArt.drawerOpen()`, { timeoutMs: 15000, everyMs: 25 });
    await waitFor(cdp, `(() => { const n = window.__perfArt.rowNames(); return !!(n && n.indexOf('perf-small.md') >= 0); })()`,
      { timeoutMs: 20000, everyMs: 50 });

    const outDir = join(SCRATCH, 'profiles');
    mkdirSync(outDir, { recursive: true });
    for (const key of Object.keys(files)) {
      if (only && key !== only) continue;
      const r = await profileOpen(cdp, files[key], { top });
      const path = join(outDir, `open-${key}.cpuprofile`);
      writeFileSync(path, JSON.stringify(r.profile));
      console.log(`\n================ open ${key} — ${r.wallMs} ms wall, ${r.total.toFixed(0)} ms sampled ================`);
      console.log('  by subsystem:');
      for (const b of buckets(r.all)) {
        if (b.ms < 1) continue;
        console.log(`    ${b.name.padEnd(44)} ${b.ms.toFixed(0).padStart(7)} ms  ${((b.ms / r.total) * 100).toFixed(0).padStart(3)}%`);
      }
      console.log(`  top ${top} functions by self time:`);
      for (const row of r.rows) {
        if (row.ms < 0.5) continue;
        console.log(`    ${row.ms.toFixed(1).padStart(8)} ms  ${row.name}`);
      }
      console.log(`  profile written: ${path}`);
    }
  } finally {
    // app.kill() is the rig's own teardown (run.mjs teardown()); it sweeps the
    // process family, so nothing is left holding the CDP port or the profile.
    try { if (app) await app.kill(); } catch (e) { console.error(`teardown failed: ${e.message}`); }
    // Only stop the display if WE started it — a reused one belongs to someone else.
    try { if (!x.reused && x.proc) x.proc.kill('SIGTERM'); } catch { /* already gone */ }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e?.stack || String(e)); process.exit(1); });
}
