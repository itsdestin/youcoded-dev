import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const FETCH_TIMEOUT_MS = 15_000;
const BRIEF_PATH_LIMIT = 12;
const BRIEF_BYTE_LIMIT = 4096;

function runGit(root, args, { buffer = false, timeout } = {}) {
  return execFileSync('git', ['-c', 'core.quotepath=false', '-C', root, ...args], {
    encoding: buffer ? null : 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout,
    // WHY: observational inventories must not inherit Node's 1 MiB collection ceiling.
    maxBuffer: Number.MAX_SAFE_INTEGER,
  });
}

function git(root, ...args) {
  return runGit(root, args).trim();
}

function decodePath(bytes) {
  const value = bytes.toString('utf8');
  const supported = Buffer.from(value).equals(bytes);
  return { value, supported, ...(supported ? {} : { bytesBase64: bytes.toString('base64') }) };
}

function pathFields(decoded, prefix = 'path') {
  return {
    [prefix]: decoded.value,
    ...(decoded.supported ? {} : { [`${prefix}BytesBase64`]: decoded.bytesBase64 }),
  };
}

function splitNul(buffer) {
  const result = [];
  let start = 0;
  for (let i = 0; i < buffer.length; i++) if (buffer[i] === 0) {
    result.push(buffer.subarray(start, i));
    start = i + 1;
  }
  if (start < buffer.length) result.push(buffer.subarray(start));
  return result;
}

export function parseStatusInventory(buffer) {
  const fields = splitNul(buffer);
  const changes = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!field.length) continue;
    const indexStatus = String.fromCharCode(field[0]);
    const worktreeStatus = String.fromCharCode(field[1]);
    const decoded = decodePath(field.subarray(3));
    const change = {
      ...pathFields(decoded),
      indexStatus,
      worktreeStatus,
      category: indexStatus === '?' && worktreeStatus === '?' ? 'untracked' :
        indexStatus !== ' ' ? (worktreeStatus !== ' ' ? 'staged-and-unstaged' : 'staged') : 'unstaged',
      pathnameEncoding: decoded.supported ? 'utf8' : 'unsupported',
    };
    if (indexStatus === 'R' || indexStatus === 'C' || worktreeStatus === 'R' || worktreeStatus === 'C') {
      const original = decodePath(fields[++i] ?? Buffer.alloc(0));
      Object.assign(change, pathFields(original, 'originalPath'));
      if (!original.supported) change.pathnameEncoding = 'unsupported';
    }
    changes.push(change);
  }
  return changes;
}

function statusInventory(root) {
  return parseStatusInventory(runGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { buffer: true }));
}

function commitList(root, range) {
  const data = runGit(root, ['log', '--format=%H%x00%P%x00%s', '-z', range], { buffer: true });
  const fields = splitNul(data);
  while (fields.length && fields.at(-1).length === 0) fields.pop();
  const commits = [];
  for (let i = 0; i + 2 < fields.length; i += 3) {
    commits.push({
      oid: fields[i].toString('ascii').trim(),
      parents: fields[i + 1].toString('ascii').trim().split(' ').filter(Boolean),
      subject: fields[i + 2].toString('utf8').replace(/\n$/, ''),
    });
  }
  return commits;
}

function patchEquivalence(root, remoteOid, headOid, local) {
  try {
    const byOid = new Map(local.map(commit => [commit.oid, commit]));
    for (const line of git(root, 'cherry', remoteOid, headOid).split('\n').filter(Boolean)) {
      const commit = byOid.get(line.slice(2));
      if (commit) commit.patchEquivalence = line[0] === '-' ? 'equivalent' : 'unique';
    }
  } catch {
    for (const commit of local) commit.patchEquivalence = 'unknown';
  }
  for (const commit of local) commit.patchEquivalence ??= 'unknown';
}

function history(root, headOid, remoteOid) {
  try {
    const base = git(root, 'merge-base', headOid, remoteOid);
    const incoming = commitList(root, `${base}..${remoteOid}`);
    const local = commitList(root, `${base}..${headOid}`);
    patchEquivalence(root, remoteOid, headOid, local);
    return { relation: 'related', mergeBase: base, incoming, local };
  } catch {
    return {
      relation: 'unrelated',
      mergeBase: null,
      incoming: commitList(root, remoteOid),
      local: commitList(root, headOid).map(commit => ({ ...commit, patchEquivalence: 'unknown' })),
    };
  }
}

function metadata(root, change) {
  if (change.category !== 'untracked') return undefined;
  const relative = change.pathBytesBase64 ? Buffer.from(change.pathBytesBase64, 'base64') : Buffer.from(change.path);
  const absolute = Buffer.concat([Buffer.from(`${root}${path.sep}`), relative]);
  try {
    const stat = fs.lstatSync(absolute);
    const type = stat.isSymbolicLink() ? 'symlink' : stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other';
    return {
      type,
      size: stat.size,
      mode: stat.mode & 0o7777,
      // WHY: reporting the link itself avoids reading arbitrary targets outside the workspace.
      ...(type === 'symlink' ? (() => {
        const target = fs.readlinkSync(absolute, { encoding: 'buffer' });
        const decoded = decodePath(target);
        return { linkTarget: decoded.value, ...(decoded.supported ? {} : { linkTargetBytesBase64: decoded.bytesBase64 }) };
      })() : {}),
    };
  } catch (error) {
    return { type: 'unavailable', error: error.code ?? String(error) };
  }
}

function gitCommonDirectory(root) {
  return path.resolve(root, git(root, 'rev-parse', '--git-common-dir'));
}

function runId() {
  return `${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}`;
}

function privateDirectory(root, id = runId()) {
  const directory = path.join(gitCommonDirectory(root), 'youcoded-sync', id);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  return directory;
}

function persistDiff(root, directory, name, args) {
  const target = path.join(directory, name);
  const descriptor = fs.openSync(target, 'wx', 0o600);
  const result = spawnSync('git', ['-c', 'core.quotepath=false', '-C', root, 'diff', '--no-ext-diff', '--no-textconv', '--binary', ...args], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
    stdio: ['ignore', descriptor, 'pipe'],
  });
  fs.closeSync(descriptor);
  if (result.error || result.status !== 0) throw result.error ?? new Error(String(result.stderr).trim());
  fs.chmodSync(target, 0o600);
  return { path: target, bytes: fs.statSync(target).size };
}

function inspectRepository(root, remoteOid, directory, prefix) {
  const head = git(root, 'rev-parse', 'HEAD');
  const histories = history(root, head, remoteOid);
  const changes = statusInventory(root).map(change => ({ ...change, metadata: metadata(root, change) }));
  return {
    root,
    authority: prefix === 'shared' ? 'shared workspace state; committed guidance is authoritative only at the fetched commit' : 'preserved session work; inspect but do not silently integrate',
    scope: 'tracked commits plus all nonignored staged, unstaged, and untracked paths',
    head,
    ...histories,
    changes,
    recoveryLocation: null,
    candidateLocation: null,
    diffs: {
      committed: persistDiff(root, directory, `${prefix}-committed.patch`, [head, remoteOid]),
      staged: persistDiff(root, directory, `${prefix}-staged.patch`, ['--cached']),
      unstaged: persistDiff(root, directory, `${prefix}-unstaged.patch`, []),
    },
  };
}

function pathPriority(value) {
  return /(^|\/)(CLAUDE|AGENTS)\.md$/i.test(value) ? 0 : value.startsWith('.claude/') ? 1 :
    value.startsWith('scripts/') ? 2 : value.startsWith('docs/') ? 3 : 4;
}

function prioritized(changes) {
  const score = item => Math.min(pathPriority(item.path), item.originalPath ? pathPriority(item.originalPath) : 4);
  return [...changes].sort((a, b) => score(a) - score(b) || a.path.localeCompare(b.path));
}

function guidancePaths(repository, commits, includeWorkingChanges = false) {
  const paths = [];
  for (const commit of commits) for (const item of commit.paths ?? []) {
    for (const value of [item.originalPath, item.path]) if (value && pathPriority(value) < 4) paths.push(value);
  }
  if (includeWorkingChanges) for (const item of repository.changes ?? []) {
    for (const value of [item.originalPath, item.path]) if (value && pathPriority(value) < 4) paths.push(value);
  }
  return [...new Set(paths)];
}

function guidanceItem(scope, authority, item, commit = null) {
  if (![item.path, item.originalPath].some(value => value && pathPriority(value) < 4)) return null;
  return {
    scope,
    ...(['path', 'pathBytesBase64', 'originalPath', 'originalPathBytesBase64', 'pathnameEncoding', 'status', 'indexStatus', 'worktreeStatus', 'category']
      .reduce((fields, key) => item[key] === undefined ? fields : { ...fields, [key]: item[key] }, {})),
    authority,
    ...(commit ? { commit: commit.oid } : {}),
  };
}

function reportGuidance(report) {
  const result = [];
  const addCommits = (repository, scope, commits) => {
    for (const commit of commits ?? []) for (const item of commit.paths ?? []) {
      const guidance = guidanceItem(scope, 'committed', item, commit);
      if (guidance) result.push(guidance);
    }
  };
  const addWorking = (repository, scope) => {
    for (const item of repository?.changes ?? []) {
      const guidance = guidanceItem(scope, 'uncommitted-proposal', item);
      if (guidance) result.push(guidance);
    }
  };
  addCommits(report.shared, 'shared-incoming', report.shared.incoming);
  addCommits(report.shared, 'shared-local', report.shared.local);
  addWorking(report.shared, 'shared-working');
  if (report.session) {
    addCommits(report.session, 'session-incoming', report.session.incoming);
    addCommits(report.session, 'session-local', report.session.local);
    addWorking(report.session, 'session-working');
  }
  return result;
}

function terminalSafe(value) {
  // Escape C0/C1 controls and DEL so a factual filename cannot alter terminal layout or state.
  return String(value).replace(/[\x00-\x1f\x7f-\x9f]/g, character => {
    if (character === '\n') return '\\n';
    if (character === '\r') return '\\r';
    if (character === '\t') return '\\t';
    return `\\x${character.codePointAt(0).toString(16).padStart(2, '0')}`;
  });
}

function boundedLine(label, values) {
  if (!values.length) return `${label} none.`;
  const visible = values.slice(0, BRIEF_PATH_LIMIT).map(terminalSafe);
  return `${label} ${visible.join(', ')}${values.length > visible.length ? `; ${values.length - visible.length} more in report` : ''}.`;
}

function fitBriefing(lines, reportPath) {
  const nextSteps = 'Inspect relevant diffs, explain major changes, and reread authoritative guidance from the returned workspace.';
  const required = `\nComplete private report: ${terminalSafe(String(reportPath))}\n${nextSteps}`;
  let text = lines.join('\n');
  if (Buffer.byteLength(text) <= BRIEF_BYTE_LIMIT) return `${text}${required}`;
  const marker = '\n… more in report';
  const budget = BRIEF_BYTE_LIMIT - Buffer.byteLength(marker);
  const bytes = Buffer.from(text);
  // WHY: cap only variable summaries; the complete report path and mandatory next steps are never expendable.
  text = bytes.subarray(0, Math.max(0, budget - 4)).toString('utf8').replace(/\uFFFD+$/, '');
  while (Buffer.byteLength(text) > budget) text = text.slice(0, -1);
  return `${text}${marker}${required}`;
}

export function formatBriefing(report) {
  const shared = report.shared;
  const counts = new Map();
  for (const item of shared.changes) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  const changedPaths = new Map();
  for (const commit of shared.incoming) for (const item of commit.paths ?? []) changedPaths.set(`${item.originalPath ?? ''}\0${item.path}`, item);
  for (const item of shared.changes) changedPaths.set(`${item.originalPath ?? ''}\0${item.path}`, item);
  const items = prioritized([...changedPaths.values()]);
  const shown = items.slice(0, BRIEF_PATH_LIMIT);
  const detail = report.freshness.detail ? String(report.freshness.detail).slice(0, 240) : '';
  const lines = [
    `Workspace freshness: ${report.freshness.status}${detail ? ` (${detail})` : ''}`,
    `Fetched authority: origin/master at ${report.freshness.fetchedOid ?? 'unknown'}; local proposals do not override committed guidance.`,
    ...(report.action ? [`Action: ${report.action.status} — ${terminalSafe(report.action.reason)} (${report.action.beforeHead} -> ${report.action.afterHead}).`] : []),
    `Shared commits: ${shared.incoming.length} incoming, ${shared.local.length} local-only; history ${shared.relation}.`,
    `Shared changes: ${[...counts].map(([name, count]) => `${count} ${name}`).join(', ') || 'none'}.`,
    ...shown.map(item => `- ${terminalSafe(item.path)}${item.originalPath ? ` (from ${terminalSafe(item.originalPath)})` : ''}`),
  ];
  if (items.length > shown.length) lines.push(`- … ${items.length - shown.length} more in report`);
  if (report.session) {
    lines.push(`Session scope: ${report.session.incoming.length} incoming commits newer/different than the preserved branch; inspect without silently integrating.`);
    lines.push(boundedLine('Session incoming guidance:', guidancePaths(report.session, report.session.incoming)));
    lines.push(boundedLine('Session-local guidance:', guidancePaths(report.session, report.session.local, true)));
  }
  return fitBriefing(lines, report.reportPath);
}

function commitPaths(root, commits) {
  for (const commit of commits) {
    const fields = splitNul(runGit(root, ['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '-z', '-M', commit.oid], { buffer: true }));
    const paths = [];
    for (let i = 0; i < fields.length;) {
      const status = fields[i++].toString('ascii');
      if (!status) continue;
      const first = decodePath(fields[i++] ?? Buffer.alloc(0));
      if (status.startsWith('R') || status.startsWith('C')) {
        const second = decodePath(fields[i++] ?? Buffer.alloc(0));
        paths.push({ ...pathFields(second), ...pathFields(first, 'originalPath'), status: status[0], pathnameEncoding: first.supported && second.supported ? 'utf8' : 'unsupported' });
      } else paths.push({ ...pathFields(first), status: status[0], pathnameEncoding: first.supported ? 'utf8' : 'unsupported' });
    }
    commit.paths = paths;
  }
}

function writePrivate(target, contents) {
  fs.writeFileSync(target, contents, { mode: 0o600 });
  fs.chmodSync(target, 0o600);
}

function acquireLock(root, beforeOwnerWrite = null) {
  const lockPath = path.join(gitCommonDirectory(root), 'youcoded-sync.lock');
  try {
    fs.mkdirSync(lockPath, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let owner = null;
    try { owner = JSON.parse(fs.readFileSync(path.join(lockPath, 'owner.json'), 'utf8')); } catch {}
    return { acquired: false, path: lockPath, owner };
  }
  try {
    beforeOwnerWrite?.(lockPath);
    writePrivate(path.join(lockPath, 'owner.json'), `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }, null, 2)}\n`);
    return { acquired: true, path: lockPath };
  } catch (error) {
    // WHY: mkdir proves this invocation owns this new lock; remove it if owner metadata cannot make acquisition diagnosable.
    fs.rmSync(lockPath, { recursive: true, force: true });
    throw error;
  }
}

function operationState(root) {
  const gitPath = name => path.resolve(root, git(root, 'rev-parse', '--git-path', name));
  const checks = [
    ['merge', 'MERGE_HEAD'], ['rebase', 'rebase-merge'], ['rebase', 'rebase-apply'],
    ['cherry-pick', 'CHERRY_PICK_HEAD'], ['revert', 'REVERT_HEAD'], ['bisect', 'BISECT_LOG'],
  ];
  return Object.fromEntries(checks.map(([operation, name]) => [`${operation}:${name}`, pathState(gitPath(name))]));
}

function activeOperation(root) {
  const state = operationState(root);
  return Object.entries(state).find(([, value]) => value.type !== 'absent')?.[0].split(':')[0] ?? null;
}

function indexBytes(root) {
  return fs.readFileSync(path.resolve(root, git(root, 'rev-parse', '--git-path', 'index')));
}

function pathState(absolute) {
  try {
    const stat = fs.lstatSync(absolute);
    const type = stat.isSymbolicLink() ? 'symlink' : stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other';
    const bytes = type === 'file' ? fs.readFileSync(absolute) : type === 'symlink' ? fs.readlinkSync(absolute, { encoding: 'buffer' }) : Buffer.alloc(0);
    return { type, mode: stat.mode & 0o7777, size: stat.size, digest: createHash('sha256').update(bytes).digest('hex') };
  } catch (error) {
    if (error.code === 'ENOENT') return { type: 'absent' };
    return { type: 'unavailable', error: error.code ?? String(error) };
  }
}

function incomingChanges(root, head, remoteOid) {
  const fields = splitNul(runGit(root, ['diff', '--name-status', '-z', '-M', head, remoteOid], { buffer: true }));
  const result = [];
  for (let i = 0; i < fields.length;) {
    const status = fields[i++].toString('ascii');
    if (!status) continue;
    const first = decodePath(fields[i++] ?? Buffer.alloc(0));
    if (status.startsWith('R') || status.startsWith('C')) {
      const second = decodePath(fields[i++] ?? Buffer.alloc(0));
      result.push({ status: status[0], oldPath: first, path: second });
    } else result.push({ status: status[0], path: first });
  }
  return result;
}

function affectedPaths(changes) {
  const values = [];
  for (const change of changes) for (const item of [change.oldPath, change.path]) if (item) values.push(item);
  return values;
}

function ancestors(value) {
  const parts = value.split('/');
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'));
}

function indexEntries(root, revision, relativePath) {
  const output = runGit(root, revision ? ['ls-tree', '-z', revision, '--', relativePath] : ['ls-files', '-s', '-z', '--', relativePath], { buffer: true });
  return splitNul(output).filter(Boolean).map(field => field.toString('utf8'));
}

function treeEntry(root, revision, relativePath) {
  const entry = indexEntries(root, revision, relativePath).find(value => value.endsWith(`\t${relativePath}`));
  if (!entry) return null;
  const match = /^(\d+) (\w+) [0-9a-f]+\t/.exec(entry);
  return match ? { mode: match[1], type: match[2] } : null;
}

function componentRoots(root) {
  const marker = path.join(root, 'scripts', 'workspace-repos.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(marker, 'utf8'));
    return Object.keys(parsed).filter(name => name !== 'workspace');
  } catch {
    return [];
  }
}

export function trackedTypeBlockers(modes, changedNames) {
  const blockers = [];
  if (modes.includes('160000')) blockers.push(`Gitlink transition is unsupported: ${changedNames.join(' -> ')}`);
  if (modes.includes('120000')) blockers.push(`Tracked symlink transition is review-only: ${changedNames.join(' -> ')}`);
  if (modes.some(mode => !['000000', '100644', '100755', '120000', '160000'].includes(mode))) blockers.push(`Unsupported tracked type: ${changedNames.join(' -> ')}`);
  return blockers;
}

function preflight(root, head, remoteOid, changes, actualBranch) {
  const blockers = [];
  if (actualBranch !== 'master') blockers.push('Shared checkout is not on symbolic branch master.');
  if (spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', head, remoteOid]).status !== 0) blockers.push('Shared HEAD is not an ancestor of fetched origin/master.');
  if (runGit(root, ['ls-files', '-u'], { buffer: true }).length) blockers.push('The index has unmerged entries.');
  const operation = activeOperation(root);
  if (operation) blockers.push(`An active ${operation} operation prevents automatic application.`);
  let sparseCheckout = false;
  try { sparseCheckout = git(root, 'config', '--bool', 'core.sparseCheckout') === 'true'; } catch {}
  if (sparseCheckout) blockers.push('Sparse checkout is unsupported for automatic application.');
  const names = affectedPaths(changes);
  const dirty = statusInventory(root);
  const dirtyNames = dirty.flatMap(item => [item.path, item.originalPath].filter(Boolean));
  for (const name of names) {
    if (!name.supported) blockers.push('An incoming path has unsupported encoding.');
    if (dirtyNames.some(local => local === name.value || local.startsWith(`${name.value}/`) || name.value.startsWith(`${local}/`))) blockers.push(`Incoming path overlaps local work: ${name.value}`);
  }
  const roots = componentRoots(root);
  for (const name of names.map(item => item.value)) {
    if (roots.some(component => name === component || name.startsWith(`${component}/`) || component.startsWith(`${name}/`))) blockers.push(`Incoming path collides with component root: ${name}`);
    for (const candidate of [...ancestors(name), name]) {
      const state = pathState(path.join(root, candidate));
      const oldEntry = treeEntry(root, head, candidate);
      const newEntry = treeEntry(root, remoteOid, candidate);
      if (candidate !== name && state.type !== 'absent' && state.type !== 'directory') blockers.push(`Incoming path ancestor is not a directory: ${candidate}`);
      if (state.type === 'symlink') blockers.push(`Incoming path collides with a symlink: ${candidate}`);
      if (candidate !== name && oldEntry?.type === 'blob' && newEntry?.type === 'tree') blockers.push(`Incoming path changes a file into a directory: ${candidate}`);
      if (candidate === name && oldEntry?.type === 'tree' && newEntry?.type === 'blob') blockers.push(`Incoming path changes a directory into a file: ${candidate}`);
    }
    const ignored = spawnSync('git', ['-C', root, 'check-ignore', '-q', '--no-index', '--', name]).status === 0;
    const tracked = indexEntries(root, null, name).length > 0;
    if (ignored && !tracked && pathState(path.join(root, name)).type !== 'absent') blockers.push(`Incoming path would overwrite ignored content: ${name}`);
    const componentCollision = roots.some(component => name === component || name.startsWith(`${component}/`) || component.startsWith(`${name}/`));
    if (!componentCollision && treeEntry(root, head, name)?.type === 'tree' && treeEntry(root, remoteOid, name)?.type === 'blob') {
      // WHY: query Git's ignored index only for the replaced tree; never walk component directories or follow filesystem links.
      const hidden = splitNul(runGit(root, ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--', name], { buffer: true }));
      if (hidden.some(Boolean)) blockers.push(`Incoming directory replacement contains ignored descendants: ${name}`);
    }
  }
  const raw = splitNul(runGit(root, ['diff', '--raw', '-z', head, remoteOid], { buffer: true }));
  for (let index = 0; index < raw.length;) {
    const header = raw[index++].toString('ascii');
    if (!header) continue;
    const match = /^:(\d+) (\d+) /.exec(header);
    const status = header.trim().split(/\s+/).at(-1);
    const pathCount = status?.startsWith('R') || status?.startsWith('C') ? 2 : 1;
    const changedNames = raw.slice(index, index += pathCount).map(item => item.toString('utf8'));
    const modes = match ? match.slice(1) : [];
    blockers.push(...trackedTypeBlockers(modes, changedNames));
  }
  return { blockers: [...new Set(blockers)], dirty, names };
}

function fingerprint(root, names) {
  let branch = null;
  try { branch = git(root, 'symbolic-ref', '--short', 'HEAD'); } catch {}
  return {
    head: git(root, 'rev-parse', 'HEAD'),
    branch,
    operations: operationState(root),
    index: createHash('sha256').update(indexBytes(root)).digest('hex'),
    paths: Object.fromEntries([...new Set(names.flatMap(name => [name.value, ...ancestors(name.value)]))].map(name => [name, pathState(path.join(root, name))])),
  };
}

function dirtyFingerprint(root, dirty = statusInventory(root)) {
  const names = dirty.flatMap(item => [item.path, item.originalPath].filter(Boolean));
  return {
    status: runGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { buffer: true }).toString('base64'),
    staged: runGit(root, ['diff', '--binary', '--cached', '--no-ext-diff', '--no-textconv'], { buffer: true }).toString('base64'),
    unstaged: runGit(root, ['diff', '--binary', '--no-ext-diff', '--no-textconv'], { buffer: true }).toString('base64'),
    paths: Object.fromEntries(names.map(name => [name, pathState(path.join(root, name))])),
  };
}

function completeFingerprint(root, incomingNames) {
  // WHY: the last pre-apply gate must cover unrelated and newly-created work too,
  // not only paths known dirty during the earlier preflight.
  return { repository: fingerprint(root, incomingNames), dirty: dirtyFingerprint(root) };
}

function snapshotPathIdentity(item) {
  return item.pathBytesBase64 ?? item.bytesBase64 ?? `utf8:${item.path ?? item.value}`;
}

function collisionSnapshotNames(names, dirty) {
  const incoming = names.map(item => item.value);
  const result = [...names];
  const identities = new Set(names.map(snapshotPathIdentity));
  for (const change of dirty.filter(item => item.category === 'untracked')) {
    if (!incoming.some(name => change.path === name || change.path.startsWith(`${name}/`) || name.startsWith(`${change.path}/`))) continue;
    const decoded = change.pathBytesBase64 ? decodePath(Buffer.from(change.pathBytesBase64, 'base64')) : { value: change.path, supported: true };
    const identity = snapshotPathIdentity(decoded);
    if (!identities.has(identity)) {
      identities.add(identity);
      result.push(decoded);
    }
  }
  return result;
}

function captureSnapshotPath(absolute) {
  let stat;
  try { stat = fs.lstatSync(absolute); } catch (error) {
    if (error.code === 'ENOENT') return { state: { type: 'absent' }, bytes: null };
    return { state: { type: 'unavailable', error: error.code ?? String(error) }, bytes: null };
  }
  const mode = stat.mode & 0o7777;
  if (stat.isSymbolicLink()) {
    const bytes = fs.readlinkSync(absolute, { encoding: 'buffer' });
    return { state: { type: 'symlink', mode, size: stat.size, digest: createHash('sha256').update(bytes).digest('hex') }, bytes };
  }
  if (!stat.isFile()) {
    const type = stat.isDirectory() ? 'directory' : 'other';
    return { state: { type, mode, size: stat.size, digest: createHash('sha256').update(Buffer.alloc(0)).digest('hex') }, bytes: null };
  }
  let descriptor;
  try {
    descriptor = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino) throw new Error('path identity changed during snapshot capture');
    const bytes = fs.readFileSync(descriptor);
    return { state: { type: 'file', mode, size: opened.size, digest: createHash('sha256').update(bytes).digest('hex') }, bytes };
  } catch (error) {
    return { state: { type: 'unavailable', mode, size: stat.size, error: error.code ?? String(error.message || error) }, bytes: null };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function snapshot(root, directory, id, names, originalHead, hooksPath, onEvidence = () => {}, beforeVerify = null) {
  const snapshotPath = path.join(directory, 'snapshot');
  const recoveryRef = `refs/youcoded-sync/${id}`;
  onEvidence({ snapshot: snapshotPath, recoveryRef });
  fs.mkdirSync(snapshotPath, { mode: 0o700 });
  fs.chmodSync(snapshotPath, 0o700);
  const index = indexBytes(root);
  const indexPath = path.join(snapshotPath, 'index');
  writePrivate(indexPath, index);
  const staged = persistDiff(root, snapshotPath, 'staged.patch', ['--cached']);
  const unstaged = persistDiff(root, snapshotPath, 'unstaged.patch', []);
  const pathsDirectory = path.join(snapshotPath, 'paths');
  fs.mkdirSync(pathsDirectory, { mode: 0o700 });
  fs.chmodSync(pathsDirectory, 0o700);
  const manifest = [];
  const capturedBytes = new Map();
  for (const [position, decoded] of names.entries()) {
    const absolute = path.join(root, decoded.value);
    const { state, bytes } = captureSnapshotPath(absolute);
    const item = { position, ...pathFields(decoded), ...state };
    if (bytes) {
      capturedBytes.set(position, bytes);
      writePrivate(path.join(pathsDirectory, String(position)), bytes);
    }
    manifest.push(item);
  }
  const manifestPath = path.join(snapshotPath, 'paths.json');
  writePrivate(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  // WHY: recovery bookkeeping must not execute repository hooks such as reference-transaction.
  runGit(root, ['-c', `core.hooksPath=${hooksPath}`, 'update-ref', recoveryRef, originalHead, '']);
  const recoveryPath = path.join(snapshotPath, 'RECOVERY.txt');
  writePrivate(recoveryPath, `Original HEAD: ${originalHead}\nRecovery ref: ${recoveryRef}\nInspect the saved index, patches, and path manifest before any deliberate recovery. Do not restore automatically over concurrent edits.\n`);
  // WHY: verification compares with bytes captured during preparation, not a potentially changed workspace reread.
  const expectedStaged = fs.readFileSync(staged.path);
  const expectedUnstaged = fs.readFileSync(unstaged.path);
  beforeVerify?.({ snapshotPath, recoveryRef });
  const savedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const ownerOnly = target => (fs.statSync(target).mode & 0o777) === 0o600 && fs.statSync(target).nlink === 1;
  let verified = (fs.statSync(snapshotPath).mode & 0o777) === 0o700 && (fs.statSync(pathsDirectory).mode & 0o777) === 0o700 &&
    fs.readFileSync(indexPath).equals(index) && ownerOnly(indexPath) &&
    fs.readFileSync(staged.path).equals(expectedStaged) && ownerOnly(staged.path) &&
    fs.readFileSync(unstaged.path).equals(expectedUnstaged) && ownerOnly(unstaged.path) &&
    ownerOnly(manifestPath) && ownerOnly(recoveryPath) &&
    savedManifest.length === manifest.length && git(root, 'rev-parse', recoveryRef) === originalHead;
  for (let position = 0; verified && position < manifest.length; position++) {
    const expected = manifest[position];
    verified = JSON.stringify(savedManifest[position]) === JSON.stringify(expected);
    if (capturedBytes.has(position)) {
      const copy = path.join(pathsDirectory, String(position));
      verified &&= ownerOnly(copy) && fs.readFileSync(copy).equals(capturedBytes.get(position));
    }
  }
  if (!verified) throw new Error('snapshot verification failed');
  return { path: snapshotPath, recoveryRef, staged, unstaged };
}

const CANDIDATE_PATCH_LIMIT = 16 * 1024 * 1024;

function candidateEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === 'GIT_DIR' || key === 'GIT_WORK_TREE' || key === 'GIT_INDEX_FILE' || key === 'GIT_OBJECT_DIRECTORY' ||
        key === 'GIT_ALTERNATE_OBJECT_DIRECTORIES' || key === 'GIT_CONFIG_PARAMETERS' || key === 'GIT_CONFIG_COUNT' ||
        /^GIT_CONFIG_(KEY|VALUE)_/.test(key)) delete env[key];
  }
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
  };
}

function runCandidateGit(repository, hooksPath, args, options = {}) {
  const config = [
    '-c', 'core.autocrlf=false', '-c', 'core.quotepath=false', '-c', `core.hooksPath=${hooksPath}`,
    '-c', 'commit.gpgSign=false', '-c', 'tag.gpgSign=false', '-c', 'protocol.file.allow=always',
    '-c', 'diff.external=', '-c', 'diff.trustExitCode=false', '-c', 'remote.pushDefault=__youcoded_disabled__',
  ];
  return spawnSync('git', [...config, '-C', repository, ...args], {
    env: candidateEnvironment(), encoding: options.buffer ? null : 'utf8', input: options.input,
    stdio: options.input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
    maxBuffer: Number.MAX_SAFE_INTEGER,
  });
}

function candidatePatch(root, inputs, name, args) {
  const result = spawnSync('git', [
    '-c', 'core.quotepath=false', '-c', 'diff.external=', '-c', 'diff.trustExitCode=false',
    '-C', root, 'diff', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', ...args,
  ], { env: candidateEnvironment(), encoding: null, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: Number.MAX_SAFE_INTEGER });
  if (result.error || result.status !== 0) throw result.error ?? new Error(String(result.stderr).trim());
  const target = path.join(inputs, `${name}.patch`);
  writePrivate(target, result.stdout);
  return { name, path: target, bytes: result.stdout.length, status: 'pending' };
}

function captureCandidateInputs(candidatePath, snapshotPath, changes, incomingNames) {
  const inputs = path.join(candidatePath, 'inputs');
  fs.mkdirSync(inputs, { recursive: true, mode: 0o700 });
  fs.chmodSync(inputs, 0o700);
  const incoming = new Set(incomingNames.map(item => item.value));
  const snapshotManifest = JSON.parse(fs.readFileSync(path.join(snapshotPath, 'paths.json'), 'utf8'));
  const snapshotsByPath = new Map(snapshotManifest.map(item => [item.path, item]));
  const collisions = [];
  const bytesPath = path.join(inputs, 'untracked');
  for (const change of changes.filter(item => item.category === 'untracked')) {
    const collides = [...incoming].some(name => name === change.path || name.startsWith(`${change.path}/`) || change.path.startsWith(`${name}/`));
    if (!collides) continue;
    const captured = snapshotsByPath.get(change.path);
    const item = {
      path: change.path, pathnameEncoding: change.pathnameEncoding, metadata: change.metadata,
      capture: captured ?? { type: 'unavailable', blocker: 'No matching snapshot entry was available.' },
      bytes: null, evidenceOnly: true,
    };
    if (captured?.type === 'file' && captured.size <= CANDIDATE_PATCH_LIMIT) {
      fs.mkdirSync(bytesPath, { recursive: true, mode: 0o700 });
      const target = path.join(bytesPath, String(collisions.length));
      // WHY: copy only snapshot bytes; rereading a pathname could follow a file swapped to a symlink after capture.
      writePrivate(target, fs.readFileSync(path.join(snapshotPath, 'paths', String(captured.position))));
      item.bytes = target;
    } else if (captured?.type === 'file') {
      item.capture = { ...captured, blocker: `Captured file exceeds the ${CANDIDATE_PATCH_LIMIT}-byte private-copy limit.` };
    }
    collisions.push(item);
  }
  writePrivate(path.join(inputs, 'untracked-collisions.json'), `${JSON.stringify(collisions, null, 2)}\n`);
  return inputs;
}

function unsafeLocalTrackedTypes(root, baseOid, headOid) {
  const unsafe = [];
  const record = (scope, modes, names) => {
    if (names.some(name => !name.supported) || modes.some(mode => !['000000', '100644', '100755'].includes(mode))) {
      unsafe.push({ scope, modes, paths: names.map(name => ({ ...pathFields(name), pathnameEncoding: name.supported ? 'utf8' : 'unsupported' })) });
    }
  };
  for (const [scope, args] of [['local-committed', [baseOid, headOid]], ['staged', ['--cached']], ['unstaged', []]]) {
    const fields = splitNul(runGit(root, ['diff', '--raw', '-z', '--no-ext-diff', '--no-textconv', ...args], { buffer: true }));
    for (let index = 0; index < fields.length;) {
      const header = fields[index++].toString('ascii');
      if (!header) continue;
      const match = /^:(\d+) (\d+) /.exec(header);
      const status = header.trim().split(/\s+/).at(-1) ?? '';
      const pathCount = status.startsWith('R') || status.startsWith('C') ? 2 : 1;
      record(scope, match ? match.slice(1) : [], fields.slice(index, index += pathCount).map(item => decodePath(item)));
    }
  }
  // WHY: unchanged symlinks/gitlinks are still unsafe candidate material, so inspect the complete local index rather than only changed patches.
  for (const field of splitNul(runGit(root, ['ls-files', '-s', '-z'], { buffer: true })).filter(Boolean)) {
    const separator = field.indexOf(0x09);
    const header = field.subarray(0, separator).toString('ascii');
    const name = decodePath(field.subarray(separator + 1));
    const match = /^(\d+) [0-9a-f]+ (\d+)$/.exec(header);
    if (match && (match[2] !== '0' || !['100644', '100755'].includes(match[1]))) record('index', [match[1]], [name]);
  }
  return unsafe;
}

function writeCandidateSafety(candidatePath, repository, hooksPath) {
  const attributesPath = path.join(candidatePath, 'safe-attributes');
  writePrivate(attributesPath, '* -diff -merge\n');
  const config = [
    ['core.hooksPath', hooksPath], ['commit.gpgSign', 'false'], ['tag.gpgSign', 'false'],
    ['core.attributesFile', attributesPath], ['diff.external', ''], ['diff.trustExitCode', 'false'], ['merge.renormalize', 'false'],
  ];
  for (const [key, value] of config) {
    const result = runCandidateGit(repository, hooksPath, ['config', '--local', key, value]);
    if (result.error || result.status !== 0) throw result.error ?? new Error(String(result.stderr).trim());
  }
  const wrapper = path.join(candidatePath, 'git-safe.mjs');
  const gitLookup = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [process.platform === 'win32' ? 'git.exe' : 'git'], { encoding: 'utf8' });
  if (gitLookup.error || gitLookup.status !== 0 || !gitLookup.stdout.trim()) throw gitLookup.error ?? new Error('Could not resolve the Git executable for the candidate wrapper.');
  const gitExecutable = fs.realpathSync(gitLookup.stdout.trim().split(/\r?\n/, 1)[0]);
  const source = `#!/usr/bin/env node\nimport { spawnSync } from 'node:child_process';\nconst args = process.argv.slice(2);\n// WHY: the wrapper owns repository selection. Reject every Git-global option instead of trying to classify or skip retargeting spellings.\nif (!args.length || args[0].startsWith('-')) { console.error('Git global options that can override configuration or retarget the candidate are prohibited.'); process.exit(64); }\nconst command = args[0];\nconst commandArgs = args.slice(1);\nconst deny = detail => { console.error(\`Candidate command prohibited: \${detail}.\`); process.exit(64); };\nconst safePath = value => typeof value === 'string' && value.length > 0 && !value.includes('\\0') && !value.includes('\\\\') && !value.startsWith('/') && !/^[A-Za-z]:/.test(value) && !value.split('/').includes('..');\nconst validatePathspecs = values => { const marker = values.indexOf('--'); if (marker >= 0 && values.slice(marker + 1).some(value => !safePath(value))) deny('pathspec must stay repository-relative'); };\nconst requirePathspecs = (values, count = 1) => { const marker = values.indexOf('--'); const paths = marker < 0 ? [] : values.slice(marker + 1); if (paths.length < count || paths.some(value => !safePath(value))) deny('mutating pathspecs must follow -- and stay repository-relative'); return paths; };\nconst onlyOptions = (values, exact, equalsPrefixes = [], valued = new Set()) => { for (let index = 0; index < values.length; index++) { const value = values[index]; if (value === '--') break; if (valued.has(value) && values[++index] !== undefined) continue; if (!value.startsWith('-') || exact.has(value) || equalsPrefixes.some(prefix => value.startsWith(\`\${prefix}=\`)) || (command === 'log' && /^-n\\d+$/.test(value))) continue; deny(\`option \${value} is not allowed for \${command}\`); } validatePathspecs(values); };\nconst exact = (...values) => new Set(values);\nswitch (command) {\n  case 'status': onlyOptions(commandArgs, exact('--short', '-s', '--porcelain', '--branch', '-b', '--show-stash', '--ahead-behind', '--no-ahead-behind'), ['--porcelain=']); break;\n  case 'diff': onlyOptions(commandArgs, exact('--stat', '--cached', '--staged', '--check', '--name-only', '--name-status', '--no-renames', '--binary', '--full-index')); break;\n  case 'log': onlyOptions(commandArgs, exact('--oneline', '--stat', '--decorate', '--no-decorate', '--graph'), ['--max-count'], new Set(['-n'])); break;\n  case 'show': onlyOptions(commandArgs, exact('--stat', '--oneline', '--name-only', '--name-status', '--no-renames')); break;\n  case 'grep': onlyOptions(commandArgs, exact('-n', '--line-number', '-i', '--ignore-case', '-F', '--fixed-strings', '-E', '--extended-regexp', '-w', '--word-regexp', '-l', '--files-with-matches'), [], new Set(['-e'])); break;\n  case 'ls-files': onlyOptions(commandArgs, exact('--cached', '-c', '--modified', '-m', '--deleted', '-d', '--others', '-o', '--stage', '-s', '--unmerged', '-u', '--error-unmatch')); break;\n  case 'rev-parse': onlyOptions(commandArgs, exact('--verify', '--short')); break;\n  case 'checkout': onlyOptions(commandArgs, exact('--detach', '--ours', '--theirs', '--conflict=merge')); break;\n  case 'restore': onlyOptions(commandArgs, exact('--staged', '--worktree', '--ours', '--theirs'), ['--source']); requirePathspecs(commandArgs); break;\n  case 'add': onlyOptions(commandArgs, exact('-N', '--intent-to-add')); requirePathspecs(commandArgs); break;\n  case 'rm': onlyOptions(commandArgs, exact('-f', '--force', '-r', '--cached', '--ignore-unmatch')); requirePathspecs(commandArgs); break;\n  case 'mv': onlyOptions(commandArgs, exact('-f', '--force', '-k')); requirePathspecs(commandArgs, 2); break;\n  case 'apply': { onlyOptions(commandArgs, exact('--check', '--3way', '--index', '--cached', '--reverse', '-R', '--reject', '--binary'), ['--whitespace']); const patches = commandArgs.filter(value => !value.startsWith('-')); if (patches.length !== 1 || !safePath(patches[0])) deny('apply accepts one repository-relative patch path'); break; }\n  case 'config': { const readOnly = (commandArgs.length === 2 && ['--get', '--get-all', '--get-regexp', '--bool', '--path'].includes(commandArgs[0])) || (commandArgs.length === 1 && !commandArgs[0].startsWith('-')); if (!readOnly) deny('only read-only config queries are allowed'); break; }\n  default: deny(\`command \${command} is not review-safe\`);\n}\nconst env = { ...process.env };\n// WHY: Git environment variables can retarget repositories, worktrees, namespaces, indexes, object stores, execution helpers, or configuration despite fixed command arguments.\nfor (const key of Object.keys(env)) if (/^GIT_/.test(key) || ['PAGER', 'EDITOR', 'VISUAL', 'SSH_ASKPASS'].includes(key)) delete env[key];\n// WHY: allowed commands must stay non-interactive on a TTY; inherited pager, editor, askpass, SSH, diff, and helper programs cannot execute.\nObject.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: ${JSON.stringify(process.platform === 'win32' ? 'NUL' : '/dev/null')}, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat', PAGER: 'cat', GIT_EDITOR: 'false', GIT_SEQUENCE_EDITOR: 'false', EDITOR: 'false', VISUAL: 'false', GIT_ASKPASS: 'false', SSH_ASKPASS: 'false' });\nconst result = spawnSync(${JSON.stringify(gitExecutable)}, ['--no-pager', '-C', ${JSON.stringify(repository)}, ...args], { env, stdio: 'inherit' });\nif (result.error) { console.error(result.error.message); process.exit(1); }\nprocess.exit(result.status ?? 1);\n`;
  fs.writeFileSync(wrapper, source, { mode: 0o700 });
  fs.chmodSync(wrapper, 0o700);
  writePrivate(path.join(candidatePath, 'SAFETY.md'), `# Candidate safety\n\nUse only \`${wrapper}\` for checklist-directed inspection and conflict-resolution work. It pins both the Git executable and candidate repository and applies a strict per-command option allowlist to status/diff/log/show/grep/ls-files/rev-parse and checkout/restore/add/rm/mv/apply. Pathspecs after \`--\` and patch inputs must be repository-relative with no traversal; \`apply --unsafe-paths\`, pager/editor/helper execution, external diff/textconv, recursive/submodule and exclude-from file reads, Git-global options, publication/remote commands, and persistent config mutation are prohibited. It clears inherited Git/helper and pager/editor/askpass environment, forces \`--no-pager\`, and supplies non-interactive fallback values; this prevents inherited helper execution for the allowlisted operations, rather than claiming to sandbox direct Git use. Read-only config queries such as \`config --get\` remain available. The repository-local config disables hooks, commit/tag signing and external diff commands; imported attributes cannot obtain an external merge driver from disabled global/system config. There is no configured remote. Do not invoke Git directly.\n`);
  return wrapper;
}

function applyCandidateLayer(repository, hooksPath, layer) {
  if (layer.bytes === 0) return { ...layer, status: 'no-changes' };
  const reverse = runCandidateGit(repository, hooksPath, ['apply', '--reverse', '--check', '--binary', layer.path]);
  if (reverse.status === 0) return { ...layer, status: 'already-present' };
  const result = runCandidateGit(repository, hooksPath, ['apply', '--3way', '--index', '--binary', layer.path]);
  if (result.status === 0) return { ...layer, status: 'applied' };
  return {
    ...layer,
    status: 'conflict',
    detail: String(result.stderr || result.error?.message || 'Git patch apply failed').trim(),
  };
}

function prepareCandidate({ root, directory, report, fetchedOid, originalHead, incomingNames, beforeCandidate }) {
  const candidatePath = path.join(directory, 'candidate');
  fs.mkdirSync(candidatePath, { mode: 0o700 });
  fs.chmodSync(candidatePath, 0o700);
  report.evidence.candidate = candidatePath;
  report.candidateLocation = candidatePath;
  report.shared.candidateLocation = candidatePath;
  const checklist = [
    'Inspect the full report and each original committed, staged, and unstaged layer.',
    'Review the isolated candidate; resolve technical conflicts only inside its standalone repository.',
    'Ask Destin only when intent remains ambiguous after reviewing the evidence.',
    'Do not transplant whole candidate files over live changes.',
    'Recheck current shared and session state before any later deliberate application.',
    'There is no automatic candidate-apply command in this build.',
  ];
  report.recoveryChecklist = checklist;
  const manifest = {
    version: 1,
    status: 'preparing',
    complete: false,
    notice: 'requires semantic review; not applied',
    baseOid: report.shared.mergeBase,
    localHead: originalHead,
    fetchedOid,
    standalone: true,
    originalLayerBoundariesPreservedInInputs: true,
    candidateIndexReproducesOriginalStaging: false,
    layers: [],
    blockers: [],
    recoveryChecklist: checklist,
  };
  const writeManifest = () => writePrivate(path.join(candidatePath, 'candidate.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeManifest();
  let inputs;
  try {
    inputs = captureCandidateInputs(candidatePath, report.evidence.snapshot, report.shared.changes, incomingNames);
    beforeCandidate?.({ candidatePath, inputs });
    if (!report.shared.mergeBase || report.shared.relation !== 'related') {
      manifest.status = 'evidence-only';
      manifest.complete = true;
      manifest.blockers.push('No common ancestor exists; no candidate merge was invented.');
      writeManifest();
      return candidatePath;
    }
    const unsafeTypes = unsafeLocalTrackedTypes(root, report.shared.mergeBase, originalHead);
    const layers = [
      candidatePatch(root, inputs, 'local-committed', [report.shared.mergeBase, originalHead]),
      candidatePatch(root, inputs, 'staged', ['--cached']),
      candidatePatch(root, inputs, 'unstaged', []),
    ];
    manifest.layers = layers;
    if (unsafeTypes.length || layers.some(layer => layer.bytes > CANDIDATE_PATCH_LIMIT)) {
      manifest.status = 'evidence-only';
      manifest.complete = true;
      manifest.unsafeTrackedTypes = unsafeTypes;
      manifest.blockers.push(unsafeTypes.length ? 'Unsafe local tracked or index type is retained as evidence only.' : `A layer exceeds the ${CANDIDATE_PATCH_LIMIT}-byte candidate limit.`);
      writeManifest();
      return candidatePath;
    }
    const repository = path.join(candidatePath, 'repo');
    const hooksPath = path.join(candidatePath, 'disabled-hooks');
    fs.mkdirSync(repository, { mode: 0o700 });
    fs.mkdirSync(hooksPath, { mode: 0o700 });
    let result = spawnSync('git', ['init', '--quiet', repository], { env: candidateEnvironment(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.error || result.status !== 0) throw result.error ?? new Error(String(result.stderr).trim());
    // WHY: fetching by local path imports objects without recording the real publication remote as candidate origin.
    for (const oid of [...new Set([report.shared.mergeBase, originalHead, fetchedOid])]) {
      result = runCandidateGit(repository, hooksPath, ['fetch', '--quiet', '--no-tags', root, oid]);
      if (result.error || result.status !== 0) throw result.error ?? new Error(String(result.stderr).trim());
    }
    result = runCandidateGit(repository, hooksPath, ['checkout', '--quiet', '--detach', fetchedOid]);
    if (result.error || result.status !== 0) throw result.error ?? new Error(String(result.stderr).trim());
    let stopped = false;
    manifest.layers = layers.map(layer => {
      if (stopped) return { ...layer, status: 'not-attempted', detail: 'A prior layer conflicted; later application stopped.' };
      const applied = applyCandidateLayer(repository, hooksPath, layer);
      if (applied.status === 'conflict') stopped = true;
      return applied;
    });
    manifest.status = stopped ? 'partial' : 'clean';
    manifest.complete = true;
    if (stopped) manifest.blockers.push('At least one layer conflicted; later layers were retained but not attempted.');
    // Persist restrictive attributes only after applying captured layers so they cannot alter candidate construction semantics.
    writeCandidateSafety(candidatePath, repository, hooksPath);
    writeManifest();
    writePrivate(path.join(candidatePath, 'RECOVERY.txt'), `${checklist.map((item, index) => `${index + 1}. ${item}`).join('\n')}\n`);
    return candidatePath;
  } catch (error) {
    manifest.status = 'failed';
    manifest.complete = false;
    manifest.blockers.push(String(error.message || error));
    writeManifest();
    writePrivate(path.join(candidatePath, 'RECOVERY.txt'), `${checklist.map((item, index) => `${index + 1}. ${item}`).join('\n')}\nCandidate preparation failed: ${String(error.message || error)}\n`);
    throw error;
  }
}

function persistReport(report, directory) {
  // WHY: guidance is a public, directly-consumable contract rather than an
  // inference callers must rebuild from commit and status inventories.
  report.guidance = reportGuidance(report);
  const reportPath = path.join(directory, 'report.json');
  const markdownPath = path.join(directory, 'report.md');
  report.reportPath = reportPath;
  report.evidence.directory = directory;
  writePrivate(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  writePrivate(markdownPath, `${formatBriefing(report)}\n`);
  return reportPath;
}

function busyResult(root, lock) {
  const directory = privateDirectory(root);
  const head = git(root, 'rev-parse', 'HEAD');
  const report = {
    version: 1, createdAt: new Date().toISOString(), root, branch: 'master',
    action: { status: 'busy', reason: 'Workspace synchronization lock is held by another invocation.', beforeHead: head, afterHead: head },
    evidence: { directory, diffs: [], snapshot: null, recoveryRef: null, candidate: null }, recoveryLocation: null, candidateLocation: null,
    blockers: ['Workspace synchronization is busy; shared state was not fetched or mutated.'],
    freshness: { status: 'unknown', remoteOid: null, fetchedOid: null, cachedOid: null, staleEvidence: false, detail: 'lock contention' },
    lock: { path: lock.path, owner: lock.owner },
    shared: { root, authority: 'shared workspace state; freshness unknown because lock is busy', scope: 'not inspected while another sync owns the lock', head, relation: 'unknown', mergeBase: null, incoming: [], local: [], changes: [], recoveryLocation: null, candidateLocation: null, diffs: {} },
    guidance: [],
  };
  const reportPath = persistReport(report, directory);
  return { report, reportPath, briefing: formatBriefing(report) };
}

export function syncWorkspace(options) {
  const root = path.resolve(options.root);
  if (options.branch !== undefined && options.branch !== 'master') throw new Error(`Unsupported workspace branch: ${options.branch}; only master is supported.`);
  const lock = acquireLock(root, options.beforeLockOwnerWrite);
  if (!lock.acquired) return busyResult(root, lock);
  try {
    const id = runId();
    const directory = privateDirectory(root, id);
    const hooks = path.join(directory, 'disabled-hooks');
    fs.mkdirSync(hooks, { mode: 0o700 });
    fs.chmodSync(hooks, 0o700);
    const originalHead = git(root, 'rev-parse', 'HEAD');
    let actualBranch = null;
    try { actualBranch = git(root, 'symbolic-ref', '--short', 'HEAD'); } catch {}
    let fetchedOid = null;
    let fetchError = null;
    try {
      // WHY: fetch updates refs and can invoke reference-transaction; isolate hooks
      // before the first repository mutation without changing user configuration.
      runGit(root, ['-c', `core.hooksPath=${hooks}`, 'fetch', '--no-tags', 'origin', '+refs/heads/master:refs/remotes/origin/master'], { timeout: options.fetchTimeoutMs ?? FETCH_TIMEOUT_MS });
      fetchedOid = git(root, 'rev-parse', 'refs/remotes/origin/master');
    } catch (error) {
      const configuredTimeout = options.fetchTimeoutMs ?? FETCH_TIMEOUT_MS;
      fetchError = error.code === 'ETIMEDOUT' ? `fetch timed out after ${configuredTimeout} ms` : `${String(error.stderr || error.message).trim()} (fetch timeout configured as ${configuredTimeout} ms)`;
    }
    let cachedOid = null;
    try { cachedOid = git(root, 'rev-parse', 'refs/remotes/origin/master'); } catch {}
    // WHY: a cached ref is evidence, but never proof of freshness after a failed fetch.
    const evidenceOid = fetchedOid ?? cachedOid ?? originalHead;
    const report = {
      version: 1,
      createdAt: new Date().toISOString(),
      root,
      branch: actualBranch,
      action: { status: fetchError ? 'offline' : 'unchanged', reason: fetchError ? 'Remote freshness could not be established; no update was attempted.' : 'Shared HEAD already matches fetched origin/master.', beforeHead: originalHead, afterHead: originalHead },
      evidence: { directory, diffs: [], snapshot: null, recoveryRef: null, candidate: null },
      recoveryLocation: null,
      candidateLocation: null,
      blockers: fetchError ? ['Remote freshness could not be established; no action was taken.'] : [],
      freshness: fetchedOid ? { status: 'fetched', remoteOid: fetchedOid, fetchedOid } : { status: 'unknown', remoteOid: null, fetchedOid: null, cachedOid, staleEvidence: cachedOid !== null, detail: fetchError },
      shared: inspectRepository(root, evidenceOid, directory, 'shared'),
    };
    commitPaths(root, report.shared.incoming);
    commitPaths(root, report.shared.local);
    report.evidence.diffs = Object.values(report.shared.diffs);
    if (options.sessionPath ?? options.sessionRoot) {
      const sessionRoot = path.resolve(options.sessionPath ?? options.sessionRoot);
      report.session = inspectRepository(sessionRoot, evidenceOid, directory, 'session');
      commitPaths(sessionRoot, report.session.incoming);
      commitPaths(sessionRoot, report.session.local);
    }
    if (fetchedOid) {
      const incoming = incomingChanges(root, originalHead, fetchedOid);
      const check = preflight(root, originalHead, fetchedOid, incoming, actualBranch);
      report.blockers.push(...check.blockers);
      if (check.blockers.length) {
        report.action = { status: 'review-required', reason: check.blockers.join(' '), beforeHead: originalHead, afterHead: originalHead };
        try {
          options.beforeSnapshot?.(directory);
          // WHY: use Git's known nonignored untracked inventory to add exact colliding descendants; never recurse into ignored/component trees.
          const snapshotNames = collisionSnapshotNames(check.names, check.dirty);
          const saved = snapshot(root, directory, id, snapshotNames, originalHead, hooks, partial => {
            report.evidence.snapshot = partial.snapshot;
            report.evidence.recoveryRef = partial.recoveryRef;
            report.recoveryLocation = partial.snapshot;
            report.shared.recoveryLocation = partial.snapshot;
          }, options.beforeSnapshotVerify);
          report.evidence.snapshot = saved.path;
          report.evidence.recoveryRef = saved.recoveryRef;
          // WHY: ambiguous layers are materialized only after recoverable evidence exists, and only in a private standalone repository.
          prepareCandidate({ root, directory, report, fetchedOid, originalHead, incomingNames: check.names, beforeCandidate: options.beforeCandidate });
        } catch (error) {
          const reason = `${report.evidence.snapshot ? 'Candidate preparation' : 'Snapshot preparation'} failed: ${error.message}`;
          report.blockers.push(reason);
          report.action.reason = `${report.action.reason} ${reason}`;
        }
      } else if (originalHead !== fetchedOid) {
        const before = completeFingerprint(root, check.names);
        const dirtyBefore = before.dirty;
        let prepared = false;
        try {
          options.beforeSnapshot?.(directory);
          const saved = snapshot(root, directory, id, check.names, originalHead, hooks, partial => {
            report.evidence.snapshot = partial.snapshot;
            report.evidence.recoveryRef = partial.recoveryRef;
            report.recoveryLocation = partial.snapshot;
            report.shared.recoveryLocation = partial.snapshot;
          }, options.beforeSnapshotVerify);
          report.evidence.snapshot = saved.path;
          report.evidence.recoveryRef = saved.recoveryRef;
          prepared = true;
        } catch (error) {
          report.blockers.push(`Snapshot preparation failed: ${error.message}`);
          report.action = { status: 'review-required', reason: report.blockers.at(-1), beforeHead: originalHead, afterHead: git(root, 'rev-parse', 'HEAD') };
        }
        if (prepared) {
          options.beforeApply?.();
          if (JSON.stringify(completeFingerprint(root, check.names)) !== JSON.stringify(before)) {
            report.blockers.push('Workspace state changed during preparation; automatic application was refused.');
            report.action = { status: 'review-required', reason: report.blockers.at(-1), beforeHead: originalHead, afterHead: git(root, 'rev-parse', 'HEAD') };
          } else {
            // WHY: once merge begins, every exception is a failed apply with refreshed evidence; it is never safe to describe it as a snapshot refusal.
            try {
              const mergeArgs = ['-c', `core.hooksPath=${hooks}`, '-c', 'core.quotepath=false', '-C', root, 'merge', '--ff-only', '--no-overwrite-ignore', fetchedOid];
              const result = options.runMerge ? options.runMerge({ root, remoteOid: fetchedOid, hooksPath: hooks, args: mergeArgs }) : spawnSync('git', mergeArgs, {
                env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: Number.MAX_SAFE_INTEGER,
              });
              if (result?.error || result?.status !== 0) throw result?.error ?? new Error(String(result?.stderr || 'Git fast-forward failed').trim());
              const afterHead = git(root, 'rev-parse', 'HEAD');
              const afterDirty = dirtyFingerprint(root, check.dirty);
              const afterStatus = statusInventory(root);
              const unrelatedPreserved = afterDirty.staged === dirtyBefore.staged && afterDirty.unstaged === dirtyBefore.unstaged &&
                JSON.stringify(afterDirty.paths) === JSON.stringify(dirtyBefore.paths) &&
                check.dirty.every(item => afterStatus.some(after => after.path === item.path && after.originalPath === item.originalPath && after.indexStatus === item.indexStatus && after.worktreeStatus === item.worktreeStatus));
              if (afterHead !== fetchedOid || !unrelatedPreserved) throw new Error('Fast-forward postconditions could not prove preservation; recovery evidence was retained and no rollback was attempted.');
              report.action = { status: 'fast-forwarded', reason: 'Fetched commit applied with preservation checks.', beforeHead: originalHead, afterHead };
            } catch (error) {
              const reason = String(error.message || error);
              report.blockers.push(reason);
              const afterHead = git(root, 'rev-parse', 'HEAD');
              report.action = { status: 'failed', reason, beforeHead: originalHead, afterHead };
              // WHY: a partially mutating Git failure makes the original inspection stale; preserve it on disk but make the report's shared view describe current reality.
              const refreshed = inspectRepository(root, fetchedOid, directory, 'shared-after-failure');
              commitPaths(root, refreshed.incoming);
              commitPaths(root, refreshed.local);
              refreshed.recoveryLocation = report.recoveryLocation;
              report.shared = refreshed;
              report.evidence.diffs.push(...Object.values(refreshed.diffs));
            }
          }
        }
      }
    }
    const reportPath = persistReport(report, directory);
    return { report, reportPath, briefing: formatBriefing(report) };
  } finally {
    // WHY: only this invocation's successful mkdir grants authority to remove the cooperative lock.
    fs.rmSync(lock.path, { recursive: true, force: true });
  }
}

export function verifyWorkspaceIdentity(input, branch = 'master', { requirePrimary = true } = {}) {
  if (branch !== 'master') throw new Error(`Unsupported workspace branch: ${branch}; only master is supported.`);
  const root = path.resolve(input);
  const marker = path.join(root, 'scripts', 'workspace-repos.json');
  let stat;
  try { stat = fs.lstatSync(marker); } catch { throw new Error(`Workspace inventory marker is missing: ${marker}`); }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Workspace inventory marker must be a tracked regular file: ${marker}`);
  let inventory;
  try { inventory = JSON.parse(fs.readFileSync(marker, 'utf8')); } catch (error) { throw new Error(`Invalid workspace inventory marker: ${error.message}`); }
  if (inventory.workspace?.branch !== 'master') throw new Error('Workspace inventory must define workspace with branch master.');
  const tracked = spawnSync('git', ['-C', root, 'ls-files', '--error-unmatch', '--', 'scripts/workspace-repos.json'], {
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, stdio: ['ignore', 'ignore', 'ignore'],
  }).status === 0;
  if (!tracked) throw new Error('Workspace inventory marker must be tracked.');
  const primary = git(root, 'worktree', 'list', '--porcelain').split('\n')[0].replace(/^worktree /, '');
  if (requirePrimary && fs.realpathSync(primary) !== fs.realpathSync(root)) throw new Error(`Workspace sync requires the primary worktree root: ${primary}`);
  return { root, primary: fs.realpathSync(primary), inventory };
}

function main(args) {
  if (args.length < 1 || args.length > 2) throw new Error('usage: workspace-sync.mjs <repo-dir> [branch]');
  const { root } = verifyWorkspaceIdentity(args[0], args[1] ?? 'master');
  const out = syncWorkspace({ root, branch: args[1] ?? 'master', identityVerified: true });
  console.log(formatBriefing(out.report));
  console.log(`Report: ${out.reportPath}`);
  if (!['unchanged', 'fast-forwarded'].includes(out.report.action.status)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (error) {
    console.error(`workspace-sync: ${error.message}`);
    process.exitCode = 1;
  }
}
