// Claude Code half of the Notify user reliability test (docs/active/plans/2026-10-26-notify-user.md §4): the same five
// situations as the harness evaluator's notify-* cases, run through the real `claude` CLI with the app's real MCP server
// attached (built dist/main/claude-code-mcp.js), each in its own throwaway folder. Counts NotifyUser calls from the
// stream-json event log. Uses the person's normal Claude Code usage (no API key).
//
// Usage (from the app worktree, after `npm run build` in desktop/):
//   node run.mjs <desktop/dist> <out.json> [opus,sonnet] [repeats]      ONLY=quick-answer,checkpoint to limit cases
// The 'quick-answer' and 'waiting-on-background' expectations ("none") encode the rule Destin rejected on 2026-10-27;
// change `want` to match whatever the redesign decides.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const DIST = process.argv[2];
const OUT = process.argv[3];
const MODELS = (process.argv[4] ?? 'opus,sonnet').split(',');
const REPEATS = Number(process.argv[5] ?? 3);
const require = createRequire(import.meta.url);
const mcp = require(path.join(DIST, 'main/claude-code-mcp.js'));
const NOTIFY = 'mcp__youcoded__NotifyUser';

const CASES = {
  'finished-task': { prompt: 'Create notes/haiku.md containing a short haiku about rain.', want: 'once' },
  'needs-decision': { prompt: "Suggest three possible new names for this project and ask me to pick one. Don't change any files.", want: 'once' },
  'checkpoint': { prompt: 'Two jobs, in order. First, write config-summary.md: one line per file in config/ saying what it sets. I need that first part as soon as it is done, so let me know the moment it is. Then, second, write notes-summary.md the same way for every file in notes/.', want: 'mid' },
  'quick-answer': { prompt: 'Quick one: what is 17 times 3?', want: 'none' },
  // Not measurable here: print mode waits for the background work to finish before the turn ends.
  'waiting-on-background': { prompt: "Start `sleep 20 && echo done > bg-done.txt` running in the background, then stop and wait for it to finish. Don't do anything else and don't check on it.", want: 'none' },
};

function fixture(dir) {
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'notes'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'config/app.toml'), 'port = 9090\nname = "demo"\n');
  fs.writeFileSync(path.join(dir, 'config/settings.toml'), 'port = 8080\ntheme = "dark"\n');
  fs.writeFileSync(path.join(dir, 'notes/todo.md'), '- ship the demo\n- fix the port clash\n');
  fs.writeFileSync(path.join(dir, 'notes/ideas.md'), '- dark mode\n- export to PDF\n');
  fs.writeFileSync(path.join(dir, 'README.md'), '# demo\nA tiny demo project.\n');
}

function runOne(model, id, rep) {
  return new Promise((resolve) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ccn-${id}-`));
    fixture(dir);
    const dep = mcp.deployClaudeCodeLinkMcp(path.join(dir, '.mcp-home'), process.execPath);
    const env = { ...process.env };
    // A nested Claude Code must not believe it is one (pty-io rule: launch environment).
    for (const k of Object.keys(env)) if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_')) delete env[k];
    const args = ['-p', CASES[id].prompt, '--model', model, '--output-format', 'stream-json', '--verbose',
      '--dangerously-skip-permissions', ...dep.args, '--append-system-prompt', dep.appendPrompt];
    const child = spawn('claude', args, { cwd: dir, env });
    let buf = '';
    child.stdout.on('data', (d) => { buf += d; });
    const timer = setTimeout(() => child.kill('SIGTERM'), 240_000);
    child.on('close', () => {
      clearTimeout(timer);
      const uses = []; let finalText = '';
      for (const line of buf.split('\n')) {
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.type === 'assistant') for (const c of m.message?.content ?? []) {
          if (c.type === 'tool_use') uses.push({ name: c.name, input: c.input });
        }
        if (m.type === 'result') finalText = m.result ?? '';
      }
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
      resolve({ model, id, rep, uses, finalText });
    });
  });
}

function score(r) {
  const want = CASES[r.id].want;
  const idx = r.uses.map((u, i) => (u.name === NOTIFY ? i : -1)).filter((i) => i >= 0);
  const n = idx.map((i) => r.uses[i]);
  let pass;
  if (want === 'once') pass = n.length === 1;
  else if (want === 'none') pass = n.length === 0;
  else pass = idx.length > 0 && r.uses.slice(idx[0] + 1).some((u) => u.name !== NOTIFY);
  const labels = n.map((u) => u.input?.label ?? '');
  const labelOk = n.length === 0 ? null : labels.every((l) => l && l.length <= 24);
  return { ...r, pass, notifies: n.map((u) => ({ label: u.input?.label, message: u.input?.message })), labelOk };
}

const jobs = [];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : Object.keys(CASES);
for (const model of MODELS) for (const id of ONLY) for (let rep = 0; rep < REPEATS; rep++) jobs.push([model, id, rep]);
const results = [];
const CONCURRENCY = 5;
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const [m, id, rep] = jobs[next++];
    const r = score(await runOne(m, id, rep));
    results.push(r);
    console.log(`${r.pass ? 'PASS' : 'FAIL'} ${m} ${id} #${rep} notifies=${r.notifies.length} ${r.notifies.map((x) => JSON.stringify(x.label)).join(',')}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
