---
date: 2026-11-26
status: draft
type: design
topic: iPhone app — a built-in command line and git for the assistant
card: 89
---

# iPhone: a built-in command line and git (design v3, 2026-11-26)

Not built. Awaiting Destin's go-ahead. A working throwaway prototype exists:
`docs/active/prototypes/2026-11-26-iphone-command-line-prototype.diff` (against `youcoded` at 5dcf668ca).

## Why
An iPhone app may not start any other program, so today the assistant's `Bash`, `BashOutput` and `KillShell`
tools are removed on iPhone (`deviceTools()`), and there is no git. Apple's rule does not forbid a command
interpreter that is part of the app (a-Shell is on the store). Values, in order: robust > simple > fewest original
lines > features. Desktop and Android must not change.

## How this design was reached
Three rounds of independent agents, each testing hands-on under Node 18.20.4 `--jitless` (the phone's engine,
minus "no ICU", which cannot be reproduced off a phone):
1. Four researchers: shell candidates, git candidates, Python/WebAssembly routes + App Store rules, the code seam.
2. Four critics of draft v1: simplicity, robustness/safety, git head-to-head, what the assistant experiences
   (171 everyday command lines).
3. A working prototype of v2 run through the real `Bash` tool and the built iPhone backend, plus a cold reviewer
   told to beat the design.

## Design

1. **Engine: open source, unforked.** `just-bash` 3.6.1 (Apache-2.0, Vercel Labs; a bash interpreter with ~80
   built-in commands, written for AI agents) and `just-git` 1.10.0 (MIT; plugs in as its `git` command). Exact
   pins. Why just-git over isomorphic-git: 3× faster clone, shorter stalls, atomic writes (isomorphic-git writes
   the index in place — an injected kill corrupted a repo), and it already has git's command line (isomorphic-git
   would need ~500 lines of ours and lacks stash/rebase/cherry-pick/diff). Its risk: a 9-month-old, one-author
   project. It sits behind one custom-command seam, so it is replaceable.

2. **iPhone-only packaging.** The adapter, worker and command table live in `ios/runtime/shell/`; the two
   packages are `devDependencies` of `ios/runtime/package.json` (installed `--omit=optional --ignore-scripts`:
   just-bash's optional native deps include an LGPL one and an install script). Desktop gains only a hook,
   `setInAppSpawner(fn)` in `harness/shell-registry.ts`; the iPhone bundle sets it. Desktop's compiler, knip, the
   desktop installer and the Android APK never see the packages. Build: alias `just-bash` to its CJS build, mark
   `guarded-fetch` external, stub `typescript`/`sql.js` if the bundler pulls them. New licences go in
   `AboutPopup.tsx` `IOS_LIBS` and the notice files.

3. **Seam: one branch.** `spawnDetached` (`shell-registry.ts:208`, the one function both the foreground and
   background paths use) returns the in-app spawner's result when `!canRunPrograms()`. The spawner returns a
   child-process-shaped object (`stdout`, `stderr`, `kill()`, `exitCode`, `signalCode`, `'exit'` then `'close'`,
   no pid) — the pattern `tools/in-process-search.ts` already uses. `killTree` calls `child.kill()` when there is no
   pid; `getShell()` answers `bash (built-in)`; `deviceTools()` stops removing the tools. Everything else in
   `bash.ts` is reused unchanged — the real working-directory probe text runs as-is inside just-bash — so
   truncation, spill files, timeouts, background hand-off, BashOutput, KillShell, the permission floors, approval
   cards and the chat UI need no iPhone version. `persistent_env: true` is refused with a sentence.

4. **A worker thread per command.** `worker.terminate()` is the only thing that stops a busy loop (an abort
   signal cannot reach it), and it keeps the app responsive. Measured: ~150 ms start, ~35 MB each, no leak, abort
   returned in 4 ms; 25 kills mid-commit left no damage. No pool, no state between commands.

5. **Files.** Only two folders are visible to a command: the app's Documents folder (= HOME, what the Files app
   shows) and its temp folder, each mounted at both its logical path and its real path (iOS reaches them through
   a `/var`→`/private/var` link, which just-bash would otherwise refuse). Paths are the same real paths Read/Write/
   Edit use. The app's key store (`userData`) is not mounted. Inside HOME, a thin deny layer built on the existing
   `credential-paths.ts` predicate hides credential files (`~/.claude.json`, `~/.git-credentials`). Links inside
   a folder work; links pointing outside are refused. Files over 64 MB cannot be read by a command; output is
   capped at 16 MB. A tracked working directory outside the mounts falls back to HOME. The shell's environment is
   built fresh; the backend's own never reaches a command.

6. **Network.** `curl` and git share one `safeFetch` over the app's existing `iosFetch`, checking every hop with
   the existing `assertPublicHttpUrl`: public internet yes; the phone itself and private networks no (the backend
   listens on the phone's loopback). `git push` credentials come through just-git's credentials callback from a
   `{host: token}` map handed to the worker — never in the environment or the URL. First version: none supplied
   automatically (see Decisions).

7. **git guard.** The `git` command (including `git -C dir`) refuses, in a plain sentence, a repository whose
   index is not version 2 or is a split index; just-git mis-reads those and a silent bad commit was reproduced.

8. **Honest gaps.** A small table of stub commands (`python python3 pip node npm npx sudo brew apt make ffmpeg gh
   open …`) exits with one line saying what is missing and what to use instead; a real `which`; `command -v`/`type`
   must not report stubs as present. The Bash description on iPhone gets a tested ~115-word paragraph (built-in
   shell, ~80 commands plus git, no python/node/installs, GNU-style flags, output arrives at the end, search big
   folders with the Grep tool); the environment line is rewritten; "linux (x64)" is corrected. just-bash's own
   bugs (`du -h` units, `stat -c %a`, `xargs -I`, relative `date -d`, `grep 'a\+b'`) are reported upstream, not
   patched here. just-bash's 100,000-step limit is raised to 1,000,000 and its silent truncation at the limit is
   turned into a visible note.

9. **Kept.** `tools/in-process-search.ts` (just-bash's `rg` measured ~100× slower) and `main/git-snapshot.ts`
   (just-git cannot fetch one commit by id, which plugin installs need).

10. **Proof.** A ~40-line conformance list with expected output runs (a) in the desktop suite against the built
    iPhone bundle under Node 18 `--jitless`, and (b) inside the real app in CI's iPhone simulator, from a separate
    test-only entry bundled into the simulator build, writing PASS/FAIL to `backend.log` — the first run on the
    real engine without ICU. Unit tests pin: the three optional runtimes are never registered, the fake child's
    contract, the deny layer, the git guard.

## Not in this version
Python (the credible route is embedding real CPython — a separate project), `node` (a `vm` one is not a safety
boundary and slips past the command checks), zip/unzip (cheap later with the `jszip` already in the app),
sqlite3, output that streams while running, plugins that need to start a program, the git panel, sync.

## Size
Prototype: 153 lines in two new files + 16 changed lines in three existing ones + 7 in the build script. With the
round-3 changes and tests: roughly 450 lines, about half of them tests.

## Proven by the prototype (Node 18 --jitless, iPhone mode, Linux)
Working directory carried between commands; timeout → background → read output → stop; abort of an endless loop;
200,000-line output truncated with a spill file; a symlinked home; curl with headers, POST, a 4 MB download
(checksum matched); loopback refused; git init → commit → diff → log; shallow clone from GitHub; fetch, pull;
push with a token to a local server; both bad-index refusals; stubs; an end-to-end chat turn through the built
iPhone backend with the approval step; 650 existing tests in 14 files and both type checks pass.

## Not proven
Anything on a physical iPhone or the real no-ICU engine (item 10 covers the simulator); suspend/resume
mid-command; the Stop button through the UI (proven through the tool's abort signal only); memory on older iPhones
(a mid-size clone peaked at 325–517 MB on Linux); App Store review.

## Decisions for Destin
1. Go ahead and build on `session/89-iphone-app`?
2. Private-network access from commands: blocked (recommended) or allow home-network/Tailscale addresses.
3. `git push`: person pastes a token when needed (first version) or the app's saved GitHub sign-in is used
   automatically (later, small).
