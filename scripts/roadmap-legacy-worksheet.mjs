#!/usr/bin/env node
// roadmap-legacy-worksheet.mjs — THROWAWAY. Parses the single-file ROADMAP.md format
// (pre-2026-09 migration) into the migration worksheet the area agents work from
// (spec §6.1.3). Deleted when the migration ships; git history keeps it.
//
// Usage: node scripts/roadmap-legacy-worksheet.mjs <ROADMAP.md> [--root <workspace>] > worksheet.json
//   Run it against the migration branch's BASE copy: git show <base>:ROADMAP.md > /tmp/x/ROADMAP.md
//
// Reads git history (last commit per cited file) — fine here, this never runs in CI.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { REPOS, listTrackedFiles } from './audit-anchors.mjs';

// Spec §6.4 — tag → default area. Flags / seen-on / surface tags map to the metadata instead.
const TAG_AREA = {
  'native-runtime': 'native-harness', harness: 'native-harness', permissions: 'native-harness', specialists: 'native-harness',
  pricing: 'native-harness', cost: 'native-harness', skills: 'native-harness', mcp: 'native-harness', sessions: 'native-harness',
  context: 'native-harness', memory: 'native-harness', slugs: 'native-harness', leases: 'native-harness',
  tooling: 'dev-workspace', tests: 'dev-workspace', ci: 'dev-workspace', build: 'dev-workspace', release: 'dev-workspace',
  workbench: 'dev-workspace', 'harness-eval': 'dev-workspace', docs: 'dev-workspace', infra: 'dev-workspace',
  'tech-debt': 'dev-workspace', 'landing-page': 'dev-workspace',
  'android-runtime': 'android-only',
  marketplace: 'marketplace', 'marketplace-ui': 'marketplace', worker: 'marketplace', catalog: 'marketplace',
  wecoded: 'marketplace', plugins: 'marketplace', install: 'marketplace',
  ui: 'user-interface', ux: 'user-interface', 'ui-consistency': 'user-interface', a11y: 'user-interface',
  animation: 'user-interface', copy: 'user-interface', markdown: 'user-interface',
  artifacts: 'files', 'project-view': 'files', git: 'files',
  sync: 'sync',
  conversations: 'chat-data', chatsearch: 'chat-data', 'conversation-store': 'chat-data', chat: 'chat-data',
  'chat-ui': 'chat-data', 'chat-reducer': 'chat-data',
  themes: 'themes',
  remote: 'remote-access', 'remote-access': 'remote-access',
  'local-models': 'local-models', engine: 'local-models',
  hooks: 'claude-code-integration', 'pty-io': 'claude-code-integration', 'pty-writes': 'claude-code-integration',
  terminal: 'claude-code-integration', 'terminal-parser': 'claude-code-integration', 'transcript-watcher': 'claude-code-integration',
  games: 'games',
  social: 'other-features', accounts: 'other-features', announcements: 'other-features', buddy: 'other-features', onboarding: 'other-features',
};
// Weak defaults: only used when nothing stronger matched.
const WEAK_AREA = { renderer: 'user-interface', android: 'android-only' };
const TAG_FLAG = { performance: 'performance', perf: 'performance', security: 'security', safety: 'security' };
const TAG_SEEN = { desktop: 'desktop', linux: 'desktop', android: 'android' };

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
if (!file) { console.error('usage: roadmap-legacy-worksheet.mjs <ROADMAP.md> [--root <workspace>]'); process.exit(1); }
const rootIdx = args.indexOf('--root');
const root = rootIdx !== -1 ? path.resolve(args[rootIdx + 1]) : path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const tracked = new Set(listTrackedFiles(root));
const lines = fs.readFileSync(file, 'utf8').split('\n');

// Old entry: `- [ ] \`type\` \`#tag\` … **headline** … (added YYYY-MM-DD…)`, continuation lines indented.
const items = [];
let section = null;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (/^## /.test(l)) { section = l.slice(3).trim(); continue; }
  const m = l.match(/^- \[ \] (.*)$/);
  if (!m) continue;
  const block = [m[1]];
  let j = i + 1;
  while (j < lines.length && /^\s+\S/.test(lines[j]) && !/^\s*- \[/.test(lines[j])) { block.push(lines[j].trim()); j++; }
  const text = block.join('\n');
  const tags = [...text.matchAll(/`#([a-z0-9-]+)`/g)].map(x => x[1]);
  const type = (block[0].match(/`(bug|feature|idea|chore|task|docs)`/) || [])[1] ?? null;
  const added = (text.match(/\(added (\d{4}-\d{2}-\d{2})/) || [])[1] ?? null;
  const headline = (block[0].match(/\*\*(.+?)\*\*/) || [])[1]
    ?? block[0].replace(/`[^`]*`/g, '').replace(/\(added.*$/, '').trim();
  const cited = [...new Set([...text.matchAll(/`([\w@./-]+\.(?:tsx?|kt|kts|mjs|cjs|js|md|json|sh|py|toml|ya?ml|html|css))(?::\d+(?:-\d+)?)?`/g)].map(x => x[1]))];
  const citedFiles = cited.map(p => {
    const hit = [...tracked].find(t => t === p || t.endsWith('/' + p)) ?? null;
    let lastCommit = null;
    if (hit) {
      const repo = REPOS.find(r => hit.startsWith(r + '/'));
      const dir = repo ? path.join(root, repo) : root;
      const rel = repo ? hit.slice(repo.length + 1) : hit;
      try { lastCommit = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%cs', '--', rel], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null; } catch { /* leave null */ }
    }
    return { path: p, resolved: hit, exists: hit !== null, lastCommit };
  });
  const strong = tags.map(t => TAG_AREA[t]).find(Boolean);
  const weak = tags.map(t => WEAK_AREA[t]).find(Boolean);
  items.push({
    line: i + 1, section, type, tags, added, headline,
    words: text.split(/\s+/).filter(Boolean).length,
    defaultArea: strong ?? weak ?? null,
    defaultFlags: [...new Set(tags.map(t => TAG_FLAG[t]).filter(Boolean))],
    defaultSeenOn: tags.map(t => TAG_SEEN[t]).find(Boolean) ?? null,
    defaultSurface: tags.includes('settings') ? 'settings' : null,
    citedFiles, sharesFilesWith: [], text,
  });
}
// Duplicate candidates: items citing the same resolved file.
const byFile = new Map();
for (const it of items) for (const c of it.citedFiles) if (c.resolved) { if (!byFile.has(c.resolved)) byFile.set(c.resolved, []); byFile.get(c.resolved).push(it.line); }
for (const it of items) {
  const s = new Set();
  for (const c of it.citedFiles) if (c.resolved) for (const l of byFile.get(c.resolved)) if (l !== it.line) s.add(l);
  it.sharesFilesWith = [...s].sort((a, b) => a - b);
}
process.stdout.write(JSON.stringify(items, null, 2) + '\n');
