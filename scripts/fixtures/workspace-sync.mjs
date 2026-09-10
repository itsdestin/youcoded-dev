import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function makeWorkspace(t) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-sync-'));
  const seed = path.join(fixtureRoot, 'seed');
  const remote = path.join(fixtureRoot, 'remote.git');
  const root = path.join(fixtureRoot, 'shared');
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Workspace Sync Fixture',
    GIT_AUTHOR_EMAIL: 'workspace-sync@example.invalid',
    GIT_COMMITTER_NAME: 'Workspace Sync Fixture',
    GIT_COMMITTER_EMAIL: 'workspace-sync@example.invalid',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_TERMINAL_PROMPT: '0',
  };

  function run(cwd, args, encoding = 'utf8') {
    return execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.filemode=true', '-C', cwd, ...args], {
      env,
      encoding,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: Number.MAX_SAFE_INTEGER,
    });
  }

  function git(cwd, ...args) {
    return run(cwd, args, 'utf8').trim();
  }

  fs.mkdirSync(seed);
  git(seed, 'init', '-b', 'master');
  fs.writeFileSync(path.join(seed, 'source.txt'), 'published\n');
  fs.writeFileSync(path.join(seed, 'CLAUDE.md'), 'initial guidance\n');
  git(seed, 'add', 'source.txt', 'CLAUDE.md');
  git(seed, 'commit', '-m', 'initial');
  git(fixtureRoot, 'clone', '--bare', seed, remote);
  git(fixtureRoot, 'clone', remote, root);
  git(seed, 'remote', 'add', 'origin', remote);

  function publish(relativePath, contents) {
    const target = path.join(seed, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (contents === null) fs.rmSync(target, { recursive: true, force: true });
    else fs.writeFileSync(target, contents);
    git(seed, 'add', '--', relativePath);
    git(seed, 'commit', '-m', `publish ${relativePath.replaceAll('\n', '\\n')}`);
    git(seed, 'push', 'origin', 'master');
    return git(seed, 'rev-parse', 'HEAD');
  }

  function capture(repository = root) {
    const indexPath = git(repository, 'rev-parse', '--git-path', 'index');
    const names = run(repository, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], null);
    const relativePaths = [];
    let start = 0;
    for (let i = 0; i < names.length; i++) if (names[i] === 0) {
      if (i > start) relativePaths.push(names.subarray(start, i));
      start = i + 1;
    }
    const rootBytes = Buffer.from(`${repository}${path.sep}`);
    return {
      head: git(repository, 'rev-parse', 'HEAD'),
      index: fs.readFileSync(path.resolve(repository, indexPath)),
      status: run(repository, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], null),
      staged: run(repository, ['diff', '--binary', '--cached', '--no-ext-diff', '--no-textconv'], null),
      unstaged: run(repository, ['diff', '--binary', '--no-ext-diff', '--no-textconv'], null),
      files: relativePaths.map(pathBytes => {
        const absolute = Buffer.concat([rootBytes, pathBytes]);
        const stat = fs.lstatSync(absolute);
        const type = stat.isSymbolicLink() ? 'symlink' : stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other';
        return {
          path: pathBytes.toString('utf8'),
          pathBytes,
          type,
          mode: stat.mode,
          bytes: type === 'symlink' ? fs.readlinkSync(absolute, { encoding: 'buffer' }) :
            type === 'file' ? fs.readFileSync(absolute) : Buffer.alloc(0),
        };
      }),
    };
  }

  // WHY: cleanup is scoped to the one mkdtemp root so a failed test cannot remove a caller-owned repository.
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  return { root, seed, remote, git, publish, capture };
}
