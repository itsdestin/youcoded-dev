---
status: active
---
# Office — build plan to the demo point (design §8 tasks 1–6)

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans. Steps use checkboxes (`- [ ]`).

**Goal:** Destin opens, edits and saves real Word/Excel/PowerPoint files on the Office page of a
YouCoded **dev** window. The page shows his theme, autosaves, and keeps versions (contract
R29, R30).

**Architecture:** the editors are a separate AGPL program, built in `itsdestin/youcoded-office`
and downloaded at a pinned version into the installer. Main serves each open document from its
own `office://<token>/` origin and answers the editor's requests; each request is relayed
editor → renderer → main. It translates files with the bundled native `x2t`. The renderer's
Office screens (already built on the workbench) switch from the fake bridge to the real one.

**Tech stack:** Electron 41, TypeScript, React, vitest; the add-on is bash + Node 22 + GitHub
Actions.

**Sources:**
- Design (authority for every "why"): `docs/active/specs/2026-09-28-office-build-design.md`.
- Contract: `docs/active/design/2026-09-27-office/office.contract.json`.
- Spike code (a working reference for tasks 1–6): `docs/active/prototypes/2026-09-28-office-spike/`.
- Theme bridge: `docs/active/prototypes/2026-09-27-office-trial/yc-bridge.js`.

## Global constraints

- App paths below are relative to `youcoded/desktop/` in the session worktree
  (`/home/destin/youcoded-dev/worktrees/sessions/office-suite-investigation/youcoded/desktop`).
  Add-on paths are relative to a clone of `itsdestin/youcoded-office`, at
  `/home/destin/youcoded-dev/worktrees/sessions/office-suite-investigation/scratch/youcoded-office`.
- **Coding rules:**
  - A WHY comment at every non-trivial edit.
  - No `*Sync` fs or child_process calls in `src/main/**` (`tests/main-blocking-calls.test.ts`).
  - No single-quoted strings in comments of files the IPC parity tests scan.
- **Never touch Destin's running YouCoded app.** Runtime checks use
  `bash scripts/run-dev.sh --label "Office" --offset 7 --profile office` from the workspace root.
- **Git:**
  - Stage explicit paths only.
  - Push after every commit, on branch `session/office-suite-investigation` for both the app and
    the workspace repos. The add-on repo commits to `main`; it has no users yet.
  - No merge, no PR.
- `bash scripts/verify.sh <app worktree>` passes before a task is called done. A failing or
  flaky test is fixed then and there.
- **Scope of this plan:**
  - Desktop only (R28), and **Linux only for bundles**; Windows and macOS bundles come in
    design task 9.
  - Office opens `.docx/.xlsx/.pptx` only. Old formats, ODF and CSV are design task 8. File
    viewer editing is design task 7.
- **Limits and copy:**
  - Files over `OFFICE_MAX_BYTES = 200 * 1024 * 1024` are refused with a specific message.
  - Error copy follows `docs/error-message-standards.md`: specific and accurate, never an
    invented cause.
- **Deviation from design §3a, recorded:** the editor's own `bridge.js` passes file bytes as
  base64 text.
  - The spike measured this within budget: +110 ms for the 9.5 MB workbook, +210–230 ms for
    the 21 MB one, and 191 ms to save the 9.5 MB one.
  - So strings cross unchanged, and `bridge.js` stays unmodified apart from `ASC_PROTO_BASE`.
    Review 2's R2-8 ("hand it bytes instead") is not needed.
  - Task 3 records this in the design.

---

### Task 1: The add-on bundle (repo `itsdestin/youcoded-office`)

Builds `youcoded-office-<version>-linux-x64.tar.gz` from euro-office-lite **v0.17.21-alpha**
(AGPL):
- the editor UI, built from source;
- `x2t` and its libraries, plus the blank templates, taken from the same release's `.deb`;
- YouCoded's two scripts, baked into `index.html`.

Why gzip: every platform's `tar` reads it; zstd is not on stock Windows.

**Files (add-on repo):**
- Create: `PIN.json`, `build/build-linux.sh`, `build/patch.mjs`, `bridge/tauri-relay.js`,
  `bridge/yc-bridge.js`, `test/bundle.test.mjs`, `test/fixtures/memo.docx`,
  `.github/workflows/bundle.yml`, `NOTICE`, `README.md`, `.gitignore`

**Interfaces:**
- Produces:
  - Bundle layout (the app relies on it):
    - `manifest.json` = `{ "version": "0.1.0", "euroOfficeLite": "v0.17.21-alpha", "platform": "linux-x64" }`
    - `editors/` (index.html, bridge.js, web-apps/, sdkjs/, fonts/, dictionaries/, tauri-relay.js, yc-bridge.js)
    - `converter/` (x2t, *.so, AllFonts.js, fonts/, …)
    - `templates/blank.{docx,xlsx,pptx}`
    - `LICENSE`, `NOTICE`
  - Messages from `tauri-relay.js` to the parent:
    - `{yc:'ready'}`: once, when `bridge.js` first listens for `open-file`.
    - `{yc:'rpc',id,cmd,args}`.
  - Accepted from the parent: `{yc:'rpc-result',id,result|error}` and `{yc:'event',name,payload}`.
  - `yc-bridge.js` additionally accepts `{type:'yc:office-save'}`, which runs the editor's own
    save (`AscDesktopEditor.LocalFileSave`).

- [ ] **Step 1: Clone the empty repo and add the pin.**

```bash
cd /home/destin/youcoded-dev/worktrees/sessions/office-suite-investigation/scratch
gh repo clone itsdestin/youcoded-office && cd youcoded-office
cat > PIN.json <<'EOF'
{
  "version": "0.1.0",
  "euroOfficeLite": { "repo": "delmarguillen/euro-office-lite", "tag": "v0.17.21-alpha" }
}
EOF
printf 'dist/\nwork/\nnode_modules/\n' > .gitignore
```

- [ ] **Step 2: Add the relay, with the ready signal.** Copy
  `docs/active/prototypes/2026-09-28-office-spike/tauri-relay.js` to `bridge/tauri-relay.js`.
  Then replace its `event.listen` line with:

```js
    // WHY a ready signal: the host must not send "open-file" before bridge.js listens for it.
    // The spike guessed with a 1.5 s timer; the first listen() for it is the exact moment.
    event: { listen: function (name, cb) {
      (listeners[name] = listeners[name] || []).push(cb);
      if (name === 'open-file' && !announced) { announced = true; window.parent.postMessage({ yc: 'ready' }, '*'); }
      return Promise.resolve(function () {});
    } },
```

  Add `announced = false` to the `var seq = 0, …` line.

- [ ] **Step 3: Add the theme bridge, with the save message.** Copy
  `docs/active/prototypes/2026-09-27-office-trial/yc-bridge.js` to `bridge/yc-bridge.js`. In its
  `message` listener, after the `yc:office-cmd` line, add:

```js
    // WHY: autosave is the host's decision (3 s after the last change); the editor's own save
    // path (LocalFileSave, the spike's --save) sends the bytes and calls save_file itself.
    if (d.type === 'yc:office-save' && window.AscDesktopEditor) window.AscDesktopEditor.LocalFileSave('', '', null, 0, null);
```

- [ ] **Step 4: Write the patcher.** `build/patch.mjs` edits the built `editors/` folder in
  place, and fails loudly if a pattern is missing, so a new euro-office-lite version cannot
  silently skip a patch.

```js
// Applies YouCoded's two changes to euro-office-lite's built editor folder.
// WHY at bundle time: the app then serves plain files; nothing is rewritten per request.
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('usage: patch.mjs <editors dir>'); process.exit(2); }

async function replaceOnce(file, from, to) {
  const p = path.join(dir, file);
  const text = await readFile(p, 'utf8');
  if (!text.includes(from)) { console.error(`patch: pattern not found in ${file}: ${from}`); process.exit(1); }
  await writeFile(p, text.replace(from, to));
}

// 1. Relay first (bridge.js calls __TAURI__ at load), then the theme bridge.
await replaceOnce('index.html', '<head>', '<head><script src="tauri-relay.js"></script><script src="yc-bridge.js"></script>');
// 2. Media and dictionaries under the document's own origin (design §3a), never a shared scheme.
await replaceOnce('bridge.js',
  "var ASC_PROTO_BASE = _isWindows ? 'http://ascdesktop.localhost/' : 'ascdesktop://';",
  "var ASC_PROTO_BASE = location.origin + '/asc/';");
const here = path.dirname(new URL(import.meta.url).pathname);
await copyFile(path.join(here, '..', 'bridge', 'tauri-relay.js'), path.join(dir, 'tauri-relay.js'));
await copyFile(path.join(here, '..', 'bridge', 'yc-bridge.js'), path.join(dir, 'yc-bridge.js'));
console.log('patch: ok');
```

- [ ] **Step 5: Write the Linux build script.** `build/build-linux.sh`:

```bash
#!/usr/bin/env bash
# Builds dist/youcoded-office-<version>-linux-x64.tar.gz. Needs: node 22 on PATH, git, gh or curl, ar, tar.
# WHY Node 22: euro-office-lite's grunt chain calls util.isRegExp, removed in Node 23+.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION=$(node -p "require('$ROOT/PIN.json').version")
TAG=$(node -p "require('$ROOT/PIN.json').euroOfficeLite.tag")
REPO=$(node -p "require('$ROOT/PIN.json').euroOfficeLite.repo")
WORK="$ROOT/work"; OUT="$WORK/bundle"; mkdir -p "$WORK" "$ROOT/dist"; rm -rf "$OUT"; mkdir -p "$OUT"

# 1. Editor UI from source, at the pinned tag.
[ -d "$WORK/eol" ] || git clone --depth 1 --branch "$TAG" --recurse-submodules --shallow-submodules "https://github.com/$REPO.git" "$WORK/eol"
cd "$WORK/eol"
# WHY --ignore-scripts then rebuild: npm 11+ blocks install scripts by default, and imagemin's
# binaries only arrive through them.
npm ci --ignore-scripts
npm rebuild gifsicle mozjpeg optipng-bin pngquant-bin || true
node scripts/build-frontend-prod.mjs
cp -r src-dist "$OUT/editors"

# 2. Translator + templates from the same release's .deb.
DEB="$WORK/eol.deb"
V="${TAG#v}"
[ -f "$DEB" ] || curl -fL -o "$DEB" "https://github.com/$REPO/releases/download/$TAG/Euro-Office-Lite_${V}_amd64.deb"
mkdir -p "$WORK/deb" && cd "$WORK/deb" && ar x "$DEB" && tar xf data.tar.* 
cp -r "$WORK/deb/usr/lib/Euro-Office-Lite/binaries" "$OUT/converter"
cp -r "$WORK/deb/usr/lib/Euro-Office-Lite/templates" "$OUT/templates"

# 3. YouCoded's patches, licence, notices, manifest.
node "$ROOT/build/patch.mjs" "$OUT/editors"
cp "$ROOT/LICENSE" "$ROOT/NOTICE" "$OUT/"
printf '{ "version": "%s", "euroOfficeLite": "%s", "platform": "linux-x64" }\n' "$VERSION" "$TAG" > "$OUT/manifest.json"
tar -C "$OUT" -czf "$ROOT/dist/youcoded-office-$VERSION-linux-x64.tar.gz" .
cd "$ROOT/dist" && sha256sum youcoded-office-*.tar.gz > SHA256SUMS
echo "built dist/youcoded-office-$VERSION-linux-x64.tar.gz"
```

  If `build-frontend-prod.mjs` stops on a missing grunt dependency, compare with the manual
  steps that built `scratch/spike/eol/src-dist` (Node 22 at `scratch/spike/node22`). Fix it in
  this script, never by hand.

- [ ] **Step 6: Write the bundle test (it fails first).** `test/bundle.test.mjs` uses `node:test`
  and runs against `work/bundle`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';

const B = path.resolve(import.meta.dirname, '..', 'work', 'bundle');
const run = promisify(execFile);

test('index.html loads the relay before bridge.js and the theme bridge', async () => {
  const html = await readFile(path.join(B, 'editors', 'index.html'), 'utf8');
  const relay = html.indexOf('tauri-relay.js'), yc = html.indexOf('yc-bridge.js'), bridge = html.indexOf('bridge.js"');
  assert.ok(relay > 0 && yc > relay, 'relay then yc-bridge');
  assert.ok(bridge === -1 || bridge > relay, 'bridge.js after the relay');
});

test('bridge.js serves media from the document origin', async () => {
  const js = await readFile(path.join(B, 'editors', 'bridge.js'), 'utf8');
  assert.match(js, /var ASC_PROTO_BASE = location\.origin \+ '\/asc\/';/);
});

test('bundle carries licence, notice, manifest and templates', async () => {
  for (const f of ['LICENSE', 'NOTICE', 'manifest.json', 'templates/blank.docx', 'templates/blank.xlsx', 'templates/blank.pptx', 'converter/x2t', 'converter/AllFonts.js'])
    await stat(path.join(B, f));
});

test('x2t round-trips a docx through Editor.bin', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'yco-'));
  const conv = path.join(B, 'converter');
  const job = async (from, to, fmt) => {
    const jt = await mkdtemp(path.join(tmp, 'job-'));
    const xml = `<?xml version="1.0" encoding="utf-8"?><TaskQueueDataConvert><m_sFileFrom>${from}</m_sFileFrom><m_sFileTo>${to}</m_sFileTo><m_nFormatTo>${fmt}</m_nFormatTo><m_sTempDir>${jt}</m_sTempDir><m_sFontDir>${conv}/fonts</m_sFontDir><m_sAllFontsPath>${conv}/AllFonts.js</m_sAllFontsPath></TaskQueueDataConvert>`;
    const p = path.join(tmp, `p-${fmt}.xml`); await writeFile(p, xml);
    await run(path.join(conv, 'x2t'), [p], { cwd: conv, env: { ...process.env, LD_LIBRARY_PATH: conv }, timeout: 60000 });
  };
  const bin = path.join(tmp, 'Editor.bin'), back = path.join(tmp, 'back.docx');
  await job(path.join(import.meta.dirname, 'fixtures', 'memo.docx'), bin, 8192);
  await job(bin, back, 65);
  assert.ok((await stat(back)).size > 1000);
  await rm(tmp, { recursive: true, force: true });
});
```

  Fixture: GENERATE a neutral memo; never copy anything from `scratch/spike/samples/`,
  which holds Destin's own files. Nothing of his goes into any repo without his say.
  `scratch/office-editor/venv/bin/python -c "import docx; d=docx.Document(); d.add_heading('Test memo', 1); p=d.add_paragraph('Plain text, then '); p.add_run('bold').bold=True; d.add_table(rows=2, cols=2); d.save('test/fixtures/memo.docx')"`

- [ ] **Step 7: Run the test.** `node --test test/` should FAIL (no `work/bundle`).
- [ ] **Step 8: Build.** Run `bash build/build-linux.sh` with Node 22 first on PATH
  (`PATH=/home/destin/youcoded-dev/worktrees/sessions/office-suite-investigation/scratch/spike/node22/bin:$PATH`).
  Then run `node --test test/`; all 4 pass.
- [ ] **Step 9: Add NOTICE and README.**
  - `NOTICE` names:
    - Euro-Office (web-apps, sdkjs; AGPL-3.0, <https://github.com/Euro-Office>);
    - OnlyOffice (Ascensio System SIA, AGPL-3.0; the origin of the editors and x2t);
    - euro-office-lite (AGPL-3.0, <https://github.com/delmarguillen/euro-office-lite>, pinned tag);
    - the fonts' licences (`editors/fonts` — list the families and licences found there).
  - `README.md` says what this is (YouCoded's Office add-on, a separate AGPL program), how to
    build, and where the corresponding source is (this repo + the pinned tag).
- [ ] **Step 10: Add the CI release workflow.** `.github/workflows/bundle.yml`:

```yaml
name: bundle
on:
  push: { tags: ['v*'] }
  workflow_dispatch:
permissions: { contents: write }
jobs:
  linux:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: bash build/build-linux.sh
      - run: node --test test/
      - if: startsWith(github.ref, 'refs/tags/')
        run: gh release create "$GITHUB_REF_NAME" dist/*.tar.gz dist/SHA256SUMS --title "$GITHUB_REF_NAME" --notes "Built from euro-office-lite $(node -p "require('./PIN.json').euroOfficeLite.tag")"
        env: { GH_TOKEN: '${{ github.token }}' }
```

- [ ] **Step 11: Commit and push.** Stage explicit paths, run a secrets scan, then commit.
  Push `main`, tag `v0.1.0`, push the tag, and watch CI with
  `gh run watch -R itsdestin/youcoded-office`. It must finish green with a release carrying the
  tarball and `SHA256SUMS`.

```bash
git add PIN.json build/ bridge/ test/ .github/ NOTICE README.md .gitignore
git diff --cached | rg -n -i 'api[_-]?key|secret|token=|password|BEGIN .*PRIVATE' || echo clean
git commit -m "feat: linux bundle of euro-office-lite v0.17.21-alpha with YouCoded's relay and theme bridge"
git push origin main && git tag v0.1.0 && git push origin v0.1.0
```

---

### Task 2: The app fetches and ships the add-on

**Files (app):**
- Create:
  - `office-pin.json`
  - `scripts/fetch-office.mjs`
  - `src/main/office/office-root.ts`
  - `tests/office/office-root.test.ts`
  - `tests/office/fetch-office.test.ts`
- Modify:
  - `package.json`: scripts `dev:main` and `build`
  - `electron-builder.yml`: add `extraResources`
  - `.gitignore` (the app repo's, in `youcoded/`): add `desktop/office-addon/`

**Interfaces:**
- Produces:
  - `officeRoot(): string` — the bundle folder. Packaged: `process.resourcesPath/office`.
    Dev: `<app path>/office-addon`.
  - `officeAvailable(): Promise<boolean>` — true when `manifest.json` exists and its version
    equals `office-pin.json`'s.

- [ ] **Step 1: Pin.** `office-pin.json`:

```json
{
  "version": "0.1.0",
  "platforms": {
    "linux-x64": {
      "url": "https://github.com/itsdestin/youcoded-office/releases/download/v0.1.0/youcoded-office-0.1.0-linux-x64.tar.gz",
      "sha256": "<from the release's SHA256SUMS>"
    }
  }
}
```

- [ ] **Step 2: Failing test for fetch.** `tests/office/fetch-office.test.ts` imports
  `planFetch` from `scripts/fetch-office.mjs`:
  - With a present manifest of the same version → `{ action: 'skip' }`.
  - With a missing manifest → `{ action: 'download', url, sha256 }`.
  - With an unsupported platform key → `{ action: 'unsupported' }`.
- [ ] **Step 3: Write `scripts/fetch-office.mjs`.**

```js
// Downloads the pinned Office add-on (itsdestin/youcoded-office, AGPL) into office-addon/.
// WHY at build and dev time, not first use: contract R2 — Office ships INSIDE the installer.
// WHY a separate program in a separate folder: the MIT app and the AGPL editors stay apart (R2).
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(here, '..');
const DEST = path.join(DESKTOP, 'office-addon');

export function platformKey(platform = process.platform, arch = process.arch) {
  const p = { linux: 'linux', darwin: 'mac', win32: 'win' }[platform];
  return p ? `${p}-${arch}` : null;
}

export function planFetch(pin, manifest, key) {
  const entry = key && pin.platforms[key];
  if (!entry) return { action: 'unsupported' };
  if (manifest && manifest.version === pin.version) return { action: 'skip' };
  return { action: 'download', url: entry.url, sha256: entry.sha256 };
}

async function main() {
  const pin = JSON.parse(await readFile(path.join(DESKTOP, 'office-pin.json'), 'utf8'));
  const manifest = await readFile(path.join(DEST, 'manifest.json'), 'utf8').then(JSON.parse, () => null);
  const plan = planFetch(pin, manifest, platformKey());
  if (plan.action === 'skip') return console.log(`office add-on ${pin.version} present`);
  if (plan.action === 'unsupported') return console.log(`office add-on: no bundle for ${platformKey()} yet — Office will say it is not available`);
  const res = await fetch(plan.url);
  if (!res.ok) throw new Error(`office add-on download failed: HTTP ${res.status} ${plan.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== plan.sha256) throw new Error(`office add-on checksum mismatch: expected ${plan.sha256}, got ${got}`);
  const tgz = path.join(os.tmpdir(), `youcoded-office-${pin.version}.tar.gz`);
  await writeFile(tgz, buf);
  await rm(DEST, { recursive: true, force: true });
  await mkdir(DEST, { recursive: true });
  await promisify(execFile)('tar', ['-xzf', tgz, '-C', DEST]);
  await rm(tgz, { force: true });
  console.log(`office add-on ${pin.version} installed in office-addon/`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 4: Run the tests; they pass.**
  `npx vitest run tests/office/fetch-office.test.ts`
- [ ] **Step 5: Wire it into dev and build.** In `package.json`, prefix `dev:main` and `build`
  with `node scripts/fetch-office.mjs && `. WHY: no network means no add-on, and Office then
  says it is unavailable; the build fails loudly on a checksum mismatch. In
  `electron-builder.yml` add:

```yaml
# WHY a resource, not inside app.asar: x2t is a native program that must run from a real
# folder, and the AGPL add-on stays a separate program beside the MIT app (contract R2).
extraResources:
  - from: office-addon
    to: office
    filter: ["**/*"]
```

- [ ] **Step 6: Failing test for the root.** `tests/office/office-root.test.ts`:
  - With `app.isPackaged=false`, `officeRoot()` ends with `office-addon`.
  - `officeAvailable()` is false for a temp root without a manifest, and true with a manifest
    whose version matches `office-pin.json`.
  - Make `officeRoot` take an optional override for tests: `officeRoot({ packaged, resourcesPath, appPath })`.
- [ ] **Step 7: Write `src/main/office/office-root.ts`.**

```ts
import { app } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pin from '../../../office-pin.json';

// WHY two places: packaged builds carry the add-on as an extraResource ("office"); dev runs
// use the folder scripts/fetch-office.mjs fills.
export function officeRoot(o: { packaged?: boolean; resourcesPath?: string; appPath?: string } = {}): string {
  const packaged = o.packaged ?? app.isPackaged;
  return packaged ? path.join(o.resourcesPath ?? process.resourcesPath, 'office') : path.join(o.appPath ?? app.getAppPath(), 'office-addon');
}

export async function officeAvailable(root = officeRoot()): Promise<boolean> {
  try { return JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')).version === pin.version; }
  catch { return false; }
}
```

  If `tsconfig.json` lacks `resolveJsonModule`, read the pin with `readFile` instead of
  importing it. Check `rg -n resolveJsonModule tsconfig.json` first.
- [ ] **Step 8: Run the tests** and `node scripts/fetch-office.mjs`. Confirm `office-addon/manifest.json` exists.
- [ ] **Step 9: Commit and push.** Stage `office-pin.json scripts/fetch-office.mjs src/main/office/office-root.ts tests/office/ package.json electron-builder.yml ../.gitignore`.

---

### Task 3: One sealed origin per document (`office://<token>/`)

**Files:**
- Create:
  - `src/main/office/office-sessions.ts`
  - `src/main/office/office-protocol.ts`
  - `tests/office/office-sessions.test.ts`
  - `tests/office/office-protocol.test.ts`
- Modify:
  - `src/main/main.ts:434-439` (scheme list)
  - `src/main/main.ts` near line 1920 (register the handler after `registerThemeProtocol()`)
  - `docs/active/specs/2026-09-28-office-build-design.md` §3a (the base64 deviation note from Global constraints)

**Interfaces:**
- Produces:

```ts
// office-sessions.ts
export interface OfficeSession { token: string; path: string; temp: string; senderId: number; modified: boolean; lastSnapshotAt: number }
export function createSessions(tempBase: string): {
  open(filePath: string, senderId: number): Promise<OfficeSession>;   // 128-bit hex token, fresh temp dir
  get(token: string): OfficeSession | undefined;
  close(token: string): Promise<void>;                               // removes the temp dir
  closeAllFor(senderId: number): Promise<void>;
  byPath(filePath: string): OfficeSession | undefined;
};
// office-protocol.ts
export const OFFICE_SCHEME = 'office';
export const OFFICE_CSP: string;
export function officeRequestHandler(deps: { root: string; sessions: ReturnType<typeof createSessions> }): (req: Request) => Promise<Response>;
export function registerOfficeProtocol(deps: …): void;  // protocol.handle(OFFICE_SCHEME, officeRequestHandler(deps))
```

- [ ] **Step 1: Failing session tests.**
  - `open` returns a 32-hex token and an existing temp dir.
  - Two opens give different tokens and dirs.
  - `close` removes the dir and `get` returns undefined.
  - `closeAllFor(7)` closes only sender 7's sessions.
- [ ] **Step 2: Implement `office-sessions.ts`.** Use `crypto.randomBytes(16).toString('hex')`
  and `fs.promises.mkdtemp(path.join(tempBase, 'doc-'))`. Close with `rm({recursive, force})`.
  WHY comment: one origin per document keeps each document's storage and media apart
  (design §3a, R2-1/R2-2).
- [ ] **Step 3: Failing protocol tests.** Call the handler with `new Request(...)` against a
  temp root holding `editors/index.html`, `editors/sdkjs/x.js`, and a session temp with
  `media/a.png`:
  1. `office://<token>/index.html` returns 200 with the CSP header equal to `OFFICE_CSP`.
  2. `office://<token>/asc/docmedia/media/a.png` returns 200, from that session's temp.
  3. `office://<other-token>/asc/docmedia/media/a.png` (another open session without the
     file) returns 404, and an unknown token returns 404.
  4. `office://<token>/../../etc/passwd`, `…/%2e%2e/…` and a symlink in `editors/` pointing
     outside all return 404.
  5. `.js` is served as `text/javascript`, `.wasm` as `application/wasm`, `.html` as `text/html`.
  6. `office://<token>/asc/dictionaries/en_US/en_US.dic` is served from
     `editors/dictionaries/…`.
- [ ] **Step 4: Implement `office-protocol.ts`.**

```ts
import { protocol } from 'electron';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { createSessions } from './office-sessions';

export const OFFICE_SCHEME = 'office';
// WHY no network at all: a compromised or confused editor must not be able to send a document
// anywhere (design §3, R2-6). Everything the editor needs is served from its own origin.
export const OFFICE_CSP = "default-src office: data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src office: data: blob:; img-src office: data: blob:; font-src office: data:";

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.emf': 'image/emf', '.wmf': 'image/wmf', '.dic': 'text/plain', '.aff': 'text/plain' };

async function serveConfined(base: string, rel: string): Promise<Response> {
  // WHY realpath on both sides: a symlink inside the add-on must not lead outside it.
  const root = await realpath(base).catch(() => null);
  if (!root) return notFound();
  const full = await realpath(path.resolve(root, '.' + path.sep + rel)).catch(() => null);
  if (!full || (full !== root && !full.startsWith(root + path.sep))) return notFound();
  const data = await readFile(full).catch(() => null);
  if (!data) return notFound();
  return new Response(data, { headers: { 'content-type': MIME[path.extname(full).toLowerCase()] ?? 'application/octet-stream' } });
}
const notFound = () => new Response('not found', { status: 404 });

export function officeRequestHandler(deps: { root: string; sessions: ReturnType<typeof createSessions> }) {
  return async (req: Request): Promise<Response> => {
    const u = new URL(req.url);
    const s = deps.sessions.get(u.hostname);
    let res: Response;
    if (!s) res = notFound();
    else {
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
      if (rel.startsWith('asc/docmedia/')) res = await serveConfined(s.temp, rel.slice('asc/docmedia/'.length));
      else if (rel.startsWith('asc/dictionaries/')) res = await serveConfined(path.join(deps.root, 'editors', 'dictionaries'), rel.slice('asc/dictionaries/'.length));
      else res = await serveConfined(path.join(deps.root, 'editors'), rel);
    }
    const h = new Headers(res.headers);
    h.set('Content-Security-Policy', OFFICE_CSP);
    return new Response(res.body, { status: res.status, headers: h });
  };
}

export function registerOfficeProtocol(deps: { root: string; sessions: ReturnType<typeof createSessions> }): void {
  protocol.handle(OFFICE_SCHEME, officeRequestHandler(deps));
}
```

- [ ] **Step 5: Register the scheme.** Add it to the `registerSchemesAsPrivileged` array in
  `main.ts:434-439`:

```ts
  // Office editors (design §3): a standard secure origin per document so workers, fetch and
  // storage work; no bypassCSP, no service workers. corsEnabled + stream were in the spike's
  // set; drop each and keep it only if the editor then fails to load (record which in the test).
  { scheme: 'office', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
```

  Add a test in `office-protocol.test.ts` that reads `main.ts` and pins this exact privilege
  set. In Task 6's dev-window check, try removing `corsEnabled` and then `stream`, one at a
  time. Keep whichever the editor needs, and update the pin and the WHY comment.
- [ ] **Step 6: Run the tests; they pass.** Then commit and push.

---

### Task 4: The translator and the editor's commands (open, save)

**Files:**
- Create:
  - `src/main/office/x2t.ts`
  - `src/main/office/office-commands.ts`
  - `tests/office/x2t.test.ts`
  - `tests/office/office-commands.test.ts`
  - `tests/office/fixtures/memo.docx` (the generated neutral memo from the add-on repo's `test/fixtures/`, never a file from `scratch/spike/samples/`)

**Interfaces:**
- Consumes: `officeRoot()` (Task 2); `createSessions`/`OfficeSession` (Task 3).
- Consumes from existing code:
  - `authorizeArtifactWrite` (`src/main/artifacts/write-authorization.ts`)
  - `noteOwnWrite` (`src/main/artifacts/project-watcher.ts`)
  - `renameReplacing`, `sweepStaleTmp` (`src/main/artifacts/cas-write.ts`)
  - `OFFICE_MAX_BYTES` (Task 5 adds it to `src/shared/office-types.ts`; define it there now)
- Produces:

```ts
// x2t.ts
export const FORMAT = { bin: 8192, docx: 65, xlsx: 257, pptx: 129 } as const;
export function formatFor(filePath: string): number | null;     // docx/xlsx/pptx only in this plan
export async function convert(root: string, from: string, to: string, formatTo: number, tempBase: string): Promise<void>; // throws X2tError
export class X2tError extends Error { code: string | number; stderr: string }
// office-commands.ts
export const OFFICE_COMMANDS: ReadonlySet<string>;               // the allow-list
export function createOfficeCommands(deps: {
  root: string; sessions: ReturnType<typeof createSessions>;
  onSaved?(s: OfficeSession, beforeBytes: Buffer | null): Promise<void>;  // Task 7 hooks versions here
  onOpened?(s: OfficeSession): Promise<void>;
}): (token: string, cmd: string, args: Record<string, unknown>) => Promise<unknown>;
```

- [ ] **Step 1: Failing x2t tests.** Skip them when `office-addon/manifest.json` is missing, with
  `describe.skipIf(!fs.existsSync(...))` and a printed reason.
  - docx → bin → docx gives a file over 1 KB.
  - The temp base holds no leftover `job-*` dirs afterwards.
  - A missing input rejects with `X2tError`.
  - `formatFor('a.DOCX') === 65`, and `formatFor('a.odt') === null`.
- [ ] **Step 2: Implement `x2t.ts`.** Port `x2t()` from the spike `main.cjs`, async:
  - `mkdtemp` a job dir, write the params XML, and run `execFile` with a 60 s timeout.
    `LD_LIBRARY_PATH` is the converter dir on Linux; on macOS add `DYLD_LIBRARY_PATH` too
    (unverified; noted for design task 9).
  - `rm` the job dir in `finally`.
  - Escape `&<>"` in the paths placed in the XML. WHY: a folder name with `&` must not break
    the task file.
  - Carry the spike's WHY comment about fresh temp dirs per job.
- [ ] **Step 3: Failing command tests.** Use a real x2t, with the same skip rule. Run the sender
  check in Task 5; here call the function directly.
  1. `open_file` on a session for `memo.docx` returns a base64 string. The session temp then
     holds `Editor.bin`, and the result ignores any `path` argument: pass `{path:'/etc/passwd'}`
     and it still opens the session's file.
  2. `write_editor_bin({data})` then `save_file({})` rewrites the file.
     - Its modification time changes and it opens again with `open_file`.
     - `noteOwnWrite` was called with its path (mock the module).
     - No `.tmp` is left beside it.
  3. `open_file` on a file larger than `OFFICE_MAX_BYTES` rejects with the message
     `This file is larger than 200 MB, which Office can't open.`. Test it with a sparse file
     (`fh.truncate`).
  4. A session whose path has a `.git` segment rejects with `Office can't open files in this protected folder.`.
  5. An unknown command rejects with `refused`.
  6. `get_system_fonts` returns `''`. `recent_files_state` returns `{enabled:false, files:[]}`.
  7. Race (real x2t, no mocks of the queue): start `write_editor_bin(A)`, `save_file`,
     `write_editor_bin(B)` and `save_file` without awaiting between them.
     - The file afterwards opens as B's content.
     - No `.tmp` is left.
     - x2t ran at most twice.
     Make A and B differ: A is the memo's own Editor.bin; B is the Editor.bin of a second
     fixture docx.
  8. `write_editor_bin` with a string whose `length * 3 / 4` exceeds `EDITOR_BIN_MAX_BYTES`
     rejects with the too-large message, without allocating the buffer. Test with a small
     override of the limit via deps.
- [ ] **Step 4: Implement `office-commands.ts`.** Port the per-document `commands(s)` factory
  from the spike's `main2.cjs:49` (review P1-1). Not `main.cjs`: that one is single-document,
  with global state. Changes from the spike:
  - The session comes from the token, never from `args.path`.
  - `s.path` is already canonical: `office:open` (Task 5) stores `authorizeArtifactWrite`'s
    `realPath`, never the spelling it was given (review P1-6). Versions and "one editor per
    file" key on it.
  - **One command at a time per document** (review P1-2; design §3 "one save in flight per
    document"):
    - Every command for a session runs through a per-session promise chain
      (`s.queue = s.queue.then(run, run)`). WHY: without it, `write_editor_bin` from a second
      save could replace `Editor.bin` while x2t is still reading it.
    - Consecutive `save_file` calls queued behind a running one collapse into one, so only the
      newest bytes are translated.
  - `write_editor_bin` refuses more than `EDITOR_BIN_MAX_BYTES = 1024 * 1024 * 1024` decoded,
    checked as `data.length * 3 / 4` before decoding. The message is
    `This document has grown too large for Office to save.` (review P1-3). WHY 1 GB and not
    200 MB: the translated form runs about 5× the file (the 21 MB workbook's Editor.bin was
    104 MB). Add it to `office-types.ts` beside `OFFICE_MAX_BYTES`.
  - Authorization: `authorizeArtifactWrite({ projectRoot: path.dirname(s.path), fullPath: s.path, mustStayInRoot: false })`.
    - `protected-path` → the protected-folder message.
    - `needs-confirm` → `Office can't open settings files like this one yet.`
      (a confirm step is design task 8's).
  - Size check before translating: `stat.size > OFFICE_MAX_BYTES` → the 200 MB message.
  - `open_file`:
    1. Translate into a fresh `Editor.bin` in the session temp, with media landing in `temp/media`.
       x2t writes media beside its output; the spike's protocol served `asc/docmedia/` from the
       session temp.
    2. Return base64.
    3. Then call `onOpened`.
  - `write_editor_bin` stores `Buffer.from(data, 'base64')` as `temp/Editor.bin`.
  - `save_file` and `save_changes`:
    1. `sweepStaleTmp`.
    2. Read the current file (`before`, null if missing).
    3. Translate to `<file>.<pid>.<Date.now()>.tmp` beside it.
    4. `noteOwnWrite`, then `renameReplacing(tmp, file)`; on failure, unlink the tmp.
    5. `modified=false`, then `onSaved(s, before)`. Return `'ok'`.
    WHY tmp+rename: a crash mid-save never leaves half a file (same as `artifacts:save`).
  - `set_document_modified` sets `s.modified`. `force_close` is a no-op (the host owns closing).
    `set_window_title` is a no-op.
  - `recovery_*` are no-ops returning the spike's values. Crash recovery is design §4's
    follow-up, outside this plan; list it under "Not in this plan" below.
  - `OFFICE_COMMANDS` is exactly the spike's key set.
- [ ] **Step 5: Run the tests; they pass.** Run `npx vitest run tests/main-blocking-calls.test.ts`
  (no new sync calls). Commit and push.

---

### Task 5: The bridge to the renderer (IPC, preload, types, parity)

**Files:**
- Modify:
  - `src/shared/office-types.ts` (v2 shapes below)
  - `src/main/preload.ts` (an `office` namespace)
  - `src/renderer/hooks/useIpc.ts` (`Window.claude.office?: OfficeBridge`)
  - `src/main/main.ts` (call `registerOfficeIpc` inside `whenReady`, after the protocol)
  - `src/renderer/remote-shim.ts` / `src/renderer/remote-unsupported.ts` (desktop-only refusal)
  - `../app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` (explicit stubs)
  - `src/renderer/dev/workbench/mock-only.ts` (remove the office rows)
  - `src/renderer/dev/workbench/mock-shim.ts` (fake v2, Task 6 finishes it)
- Create:
  - `src/main/office/office-ipc.ts`
  - `tests/office/office-ipc.test.ts`
- Modify (test): `tests/ipc-channels.test.ts` (a new `describe('office:* channel parity')`)

**Interfaces:**
- Produces (`src/shared/office-types.ts`):

```ts
export const OFFICE_MAX_BYTES = 200 * 1024 * 1024;
export type OfficeOpen = { ok: true; token: string; origin: string } | { ok: false; message: string };
export interface OfficeStatus {
  /** False when this build carries no Office add-on (e.g. a platform without a bundle yet). */
  available: boolean;
  recent: OfficeFile[];
  project: { name: string; files: OfficeFile[] } | null;
}
export interface OfficeBridge {
  status(projectRoot: string | null): Promise<OfficeStatus>;
  create(kind: OfficeKind, projectRoot: string | null): Promise<{ ok: true; file: OfficeFile } | { ok: false; message: string }>;
  pick(): Promise<OfficeFile | null>;
  open(path: string): Promise<OfficeOpen>;
  invoke(token: string, cmd: string, args: unknown): Promise<unknown>;
  close(token: string): Promise<void>;
  versions(path: string): Promise<OfficeVersion[]>;
  restore(path: string, versionId: string): Promise<{ ok: true } | { ok: false; message: string }>;
}
```

  Channels: `office:status`, `office:create`, `office:pick`, `office:open`, `office:invoke`,
  `office:close`, `office:versions`, `office:restore`.

- [ ] **Step 1: Failing IPC tests.** Call `registerOfficeIpc(ipcMain, deps)` with a fake
  `ipcMain` that records its handlers.
  1. `office:open` for a missing file → `{ok:false, message:'This file no longer exists.'}`.
  2. For a `.odt` → `{ok:false, message:"Office can't open this kind of file yet."}`.
  3. For a valid docx → `{ok:true, token, origin:'office://'+token}`.
  4. `office:invoke` from sender 2 on sender 1's token rejects with `refused`.
  5. A command not in `OFFICE_COMMANDS` rejects with `refused`.
  6. `office:close` removes the session.
  7. A sender's `destroyed` event closes all its sessions.
  8. Opening the same path twice from the same sender returns the SAME token (one editor per
     file, design §5). Opening it through a symlink to it also returns the same token, and
     `session.path` is the realpath (review P1-6).
  9. With the add-on unavailable, `office:open` → `{ok:false, message:"Office isn't included in this build."}`.
- [ ] **Step 2: Implement `office-ipc.ts`**, following `src/main/voice/voice-handlers.ts`:
  - Keep a `CHANNELS` list, and call `ipcMain.removeHandler` on each before handling.
    WHY: hot-reload re-registration.
  - `event.sender.id` is the sender identity. Attach `sender.once('destroyed', …)` on its first
    open.
  - Main re-checks everything (design §3a, R2-7).
  - For now `status/create/pick/versions/restore` return the Task 7/8 stand-ins:
    - `status` → `{available, recent:[], project:null}`
    - `create`/`restore` → `{ok:false, message:'Not available yet.'}`
    - `pick` → `null`, `versions` → `[]`
  - Tasks 7 and 8 replace each stand-in; keep them in one small `pending` block so it's obvious.
- [ ] **Step 3: Add the preload namespace** (inline strings, like `git`):

```ts
    // Office (design §3a): the editor frame's requests reach main only through invoke, and
    // main re-checks the command and that this window opened the document.
    office: {
      status: (projectRoot: string | null) => ipcRenderer.invoke('office:status', projectRoot),
      create: (kind: string, projectRoot: string | null) => ipcRenderer.invoke('office:create', kind, projectRoot),
      pick: () => ipcRenderer.invoke('office:pick'),
      open: (p: string) => ipcRenderer.invoke('office:open', p),
      invoke: (token: string, cmd: string, args: unknown) => ipcRenderer.invoke('office:invoke', token, cmd, args),
      close: (token: string) => ipcRenderer.invoke('office:close', token),
      versions: (p: string) => ipcRenderer.invoke('office:versions', p),
      restore: (p: string, id: string) => ipcRenderer.invoke('office:restore', p, id),
    },
```

- [ ] **Step 4: Refuse on remote and Android.**
  - `remote-shim.ts`: an `office` namespace where every method calls `invoke('office:<x>', …)`,
    so the host refuses it (follow `dev.setupWorkspace`, around remote-shim.ts:2712). Add
    `['office:', 'Office']` to `FEATURE_NAMES` in `remote-unsupported.ts`.
  - `SessionService.kt`: one explicit stub arm listing all eight channels, returning
    `ok=false, unsupported=true, error="not-implemented-on-mobile"`, like the `tags:create`
    arm (around line 1695).
  - WHY: R28, desktop first. Phones keep preview-only.
  - The renderer already hides Office when `window.claude.office` is absent. On remote it is
    present, so status must be refused. Check that the remote Office page then shows the
    existing unsupported toast, not a crash.
- [ ] **Step 5: Parity test.** In `tests/ipc-channels.test.ts`, add
  `describe('office:* channel parity')`. For each of the eight channels, assert:
  - `'ch'` appears in preload;
  - `'ch'` appears in remote-shim;
  - `'ch'` appears in `src/main/office/office-ipc.ts`;
  - `"ch"` appears in SessionService.kt;
  - `remote-unsupported.ts` contains `'office:'`.

  Copy the git block (around line 1442) as the model.
- [ ] **Step 6: Update the mock and remove the rows.**
  - Delete the six `office.*` rows in `mock-only.ts`, adding a header note: "office rows came
    off 2026-09-2x when the real channels landed".
  - Update the hand-written list in `mock-shim.ts` (lines 219-220) to the eight v2 names.
  - Reshape `createOfficeMock` to v2. Task 6 fills `open`/`invoke`; until then return
    `{ok:false, message}` so it compiles.
  - Run `npx vitest run tests/mock-shim-window.test.ts tests/ipc-channels.test.ts`.
- [ ] **Step 7: Run all office tests plus `npx tsgo --noEmit -p tsconfig.json`.** Commit and push.

---

### Task 6: The renderer talks to the real editor

**Files:**
- Modify:
  - `src/renderer/components/office/EditorFrame.tsx` (relay, open, autosave trigger, status)
  - `src/renderer/components/office/office-store.ts` (per-tab save state)
  - `src/renderer/components/office/OfficeView.tsx` (Saved label from the store; `status(projectRoot)`; unavailable state)
  - `src/renderer/components/office/OfficeInlineEditor.tsx` (v2 open; slim flows unchanged)
  - `src/renderer/components/pages/PageHost.tsx` (pass the active session's cwd)
  - `src/renderer/dev/workbench/mock-shim.ts` + `fixtures/office.ts` (fake host)
- Create:
  - `scripts/office-workbench-server.mjs` (workbench only)
  - `tests/office/editor-frame-relay.test.tsx` (jsdom)
  - `tests/office/office-autosave.test.ts`

**Interfaces:**
- Consumes: the `OfficeBridge` v2 from Task 5; the relay messages from Task 1.
- Produces, in `office-store.ts`:
  - `saveStateFor(path): { phase: 'saved' | 'unsaved' | 'saving' | 'failed'; savedAt?: string; message?: string }`
  - `markChanged(path)`, `markSaving(path)`, `markSaved(path)`, `markFailed(path, message)`

- [ ] **Step 1: Failing relay tests** (jsdom). Render `EditorFrame` with a fake bridge whose
  `open` returns `{ok:true, token:'t1', origin:'office://t1'}`. Dispatch `MessageEvent`s with
  `origin:'office://t1'` and `source` = the iframe's contentWindow.
  1. The iframe `src` is `office://t1/index.html`.
  2. `{yc:'ready'}` makes the host post the theme, the mode, and then
     `{yc:'event', name:'open-file', payload: file.path}`.
  3. `{yc:'rpc', id:5, cmd:'open_file', args:{}}` calls `bridge.invoke('t1','open_file',{})` and
     posts `{yc:'rpc-result', id:5, result}` back.
  4. A bridge rejection posts `{yc:'rpc-result', id:5, error:'<message>'}`.
  5. A message from another origin, or another source, is ignored: invoke is not called.
  6. Unmount calls `bridge.close('t1')`.
  7. `rpc set_document_modified {modified:true}` marks the path `unsaved`, and after 3 s (fake
     timers) the host posts `{type:'yc:office-save'}`.
  8. `rpc save_file` marks `saving`; its result marks `saved`, and its error marks `failed`
     with that message.
  9. A change during a save marks `unsaved` again and triggers exactly ONE follow-up save
     after the first result (coalescing, design §3).
- [ ] **Step 2: Implement it in `EditorFrame.tsx`.** Replace the `document:ready` /
  `source()` / `document:open-url` flow:
  - On mount (and on `file.path` change), call `bridge.open(file.path)`.
    - Failure → the existing failed phase with `message`.
    - Success → store `{token, origin}` and render the iframe at `${origin}/index.html`. Keep
      the same `sandbox` attribute; the ast-grep exception covers this file.
  - Message checks stay: `e.origin === origin && e.source === frame` (design §5, R3-1).
  - Autosave, per file:
    - A 3 s debounce from the last `set_document_modified(true)`.
    - Save on tab close as well: `close` posts `yc:office-save`, then waits for the save
      result or 5 s before `bridge.close`.
    - WHY 3 s and on close: design §4.
  - Keep `yc:office-loaded`, `yc:office-state`, `yc:office-esc` and the theme watcher unchanged.
  - The theme's `fontLinks` are rewritten in Task 9. For now pass `[]`; Google links are
    blocked by the CSP anyway.
- [ ] **Step 3: Store and view.**
  - `office-store` gains the save-state map, from the Produces block above.
  - `OfficeView`'s Saved label reads it:
    - `saved` → "Saved";
    - `saving`/`unsaved` → "Saving…";
    - `failed` → the message plus a Retry button that posts `yc:office-save`. EditorFrame's
      handle gains `save()`.
    Follow `<ErrorState>` / `docs/error-message-standards.md` for the failed copy: the
    message comes from main and is specific.
  - `status(projectRoot)`: PageHost passes the active session's cwd. Find how PageHost reads
    the active session (`rg -n "activeSession|sessionId" src/renderer/components/pages/PageHost.tsx`);
    if it has none, read it the way `ChatView.tsx:164` gets `cwd`.
  - `status.available === false` shows an empty state on the Office page: "Office isn't
    included in this build." It is specific and accurate, with no Retry, since retrying cannot
    change it.
- [ ] **Step 4: Workbench fake host** (the shoot screens need it).
  - `scripts/office-workbench-server.mjs` serves `office-addon/editors` on 127.0.0.1:4717 with
    `OFFICE_CSP`. `GET /fixtures/<name>` runs x2t via Task 4's real `convert()` (import the
    compiled `dist/main/office/x2t.js` after `npx tsc -p tsconfig.json`; never a second copy
    of the task XML, review P1-7) on
    `src/renderer/dev/workbench/fixtures/office/<name>` and returns base64 Editor.bin. It
    caches the result in memory.
  - The mock's `open(path)` returns `{ok:true, token:'wb', origin:'http://127.0.0.1:4717'}`.
    `invoke('wb','open_file')` fetches `/fixtures/<basename>`. `write_editor_bin`/`save_file`
    return `'ok'`, and other commands return the Task 4 defaults.
  - Put the three workbench documents in `fixtures/office/`: Garden plan.docx,
    Volunteer rota.xlsx, Grant report.docx, and a pptx. Make them neutral with python-docx,
    openpyxl and python-pptx (the venv at `scratch/office-editor/venv`).
  - Replace the prototype's `serve-euro.py` step in
    `docs/active/prototypes/2026-09-27-office-trial/README.md` with this server, in one sentence.
  - WHY a fake host that still runs x2t: the screens then show the real editor with real
    content, as Destin reviewed them.
- [ ] **Step 5: Reshoot the office screens.** Start the server in the background, then run
  `node scripts/shoot/shoot.mjs 'office/*' 'chat/files/*/a-sent-plan'`. Read every picture:
  - A failed screen is unreviewed, not fine.
  - Differences from the approved review-3 pictures that aren't from Euro-Office's editor
    itself are bugs.
- [ ] **Step 6: Dev-window check (first real run).**
  1. Run `bash scripts/run-dev.sh --label "Office" --offset 7 --profile office` from the
     workspace root.
  2. With `explore.mjs` against the dev window, open the Office page, pick a copy of
     `scratch/spike/samples/budget-memo.docx` (a copy made in `scratch/spike/work/`), type a
     word, wait 5 s, and close the tab.
  3. `compare.py` then shows the paragraph count +0 and the chars grown by the typed word.
  4. Try dropping `corsEnabled`, then `stream`, from the scheme privileges (Task 3 Step 5).
     Rerun steps 2–3 each time. Ship the smallest set that passes: edit `main.ts`, the Task 3
     pin test and its WHY comment to match, and name in the comment what broke without each
     kept privilege (review P1-5).
- [ ] **Step 7: `bash scripts/verify.sh <app worktree>`.** It must be green; fix anything it
  finds. Then commit and push.

---

### Task 7: Versions (autosave safety net) on real data

**Files:**
- Create:
  - `src/main/office/versions.ts`
  - `tests/office/versions.test.ts`
- Modify:
  - `src/main/office/office-ipc.ts` (versions/restore replace their stand-ins; `onOpened`/`onSaved` hooks)

**Interfaces:**
- Produces:

```ts
export function versionsDir(userData: string, filePath: string): string;   // userData/office-versions/<sha1(canonical path)>
export async function snapshot(userData: string, filePath: string, reason: OfficeVersion['reason'], bytes: Buffer): Promise<OfficeVersion | null>; // null when identical to the newest
export async function list(userData: string, filePath: string): Promise<OfficeVersion[]>;   // newest first
export async function restore(userData: string, filePath: string, id: string): Promise<{ ok: true } | { ok: false; message: string }>;
export function pruneKeep(versions: { id: string; at: string; bytes: number }[], now: Date): Set<string>;  // pure
export async function pruneAll(userData: string, now?: Date): Promise<void>;  // per-file rules + 1 GB global cap
```

- [ ] **Step 1: Failing pure-pruning tests** (`pruneKeep`, R11 "tiered-30"):
  1. Everything from the last 24 h is kept.
  2. Days 1–30: only the newest per calendar day is kept.
  3. Older than 30 days: dropped.
  4. More than 50 versions: the oldest go first.
  5. Empty in → empty out.
- [ ] **Step 2: Implement `pruneKeep`.** Run the tests.
- [ ] **Step 3: Failing store tests** (temp userData):
  - A `snapshot` writes `index.json` plus a copy; an identical second snapshot returns null.
  - `list` is newest first.
  - `restore` snapshots the current file as `before-restore`, then replaces the file with the
    chosen copy (tmp + `renameReplacing`, `noteOwnWrite`).
  - An unknown id → `{ok:false, message:'That version is no longer kept.'}`.
  - `pruneAll` enforces 1 GB across files: set a tiny cap through an optional parameter, and
    the oldest go globally.
- [ ] **Step 4: Implement the store**, async only.
  - `index.json` is written by `casWrite` with `updatedAt`: two windows saving at once must
    not lose an entry.
  - Copies are named `<id>.<ext>`, where `id` = the ISO time with the colons removed plus 4
    random hex characters.
- [ ] **Step 5: Hook it up.**
  - `onOpened`: snapshot `opened`, from the file's bytes.
  - `onSaved`: if `before` is not null and `Date.now() - s.lastSnapshotAt > 10 min`, snapshot
    `autosave` from `before`, then set `lastSnapshotAt`. WHY: design §3, at most every 10 min
    while changing.
  - `office:versions`/`office:restore` call the store.
  - After a restore, main tells the open editor to reload by pushing `office:changed` to that
    sender with `{path}`. EditorFrame remounts on it: close, open, and the new token. Add the
    channel to preload (`onChanged`), remote-shim, Kotlin and the parity block.
  - Run `pruneAll` once at startup, off the hot path: `setTimeout(…, 30_000)` after
    `whenReady`, with a WHY comment.
- [ ] **Step 6: Versions dialog on real data.** In the dev window, open a copy, type, and wait
  more than 3 s; the Versions dialog lists "Opened". Restore it and the document reloads
  showing the old text. Run verify.sh, then commit and push.

---

### Task 8: Start screen on real data — recent, create, pick, project files

**Files:**
- Create:
  - `src/main/office/recent.ts`
  - `src/main/office/office-home.ts` (create, pick, project listing)
  - `tests/office/recent.test.ts`
  - `tests/office/office-home.test.ts`
- Modify: `src/main/office/office-ipc.ts` (replace the remaining stand-ins)

**Interfaces:**
- Produces:
  - `recent.ts`:
    - `add(userData, file: OfficeFile): Promise<void>` — dedupes by path, newest first, 12 max
    - `list(userData): Promise<OfficeFile[]>` — drops entries whose file no longer exists
  - `office-home.ts`:
    - `projectFiles(root): Promise<OfficeFile[]>`
    - `createBlank(root: string, kind, dir): Promise<OfficeFile>`
    - `pickFile(win): Promise<OfficeFile | null>`

- [ ] **Step 1: Failing tests.**
  - recent: dedupes, caps at 12, drops a deleted file, and the file is written through
    `casWrite`.
  - `projectFiles`:
    - Finds docx/xlsx/pptx up to 3 folders deep.
    - Skips `node_modules`, `.git` and dot-folders.
    - Returns at most 50, newest changed first, with `at` = mtime.
  - `createBlank('document', dir)` copies `templates/blank.docx` to `Untitled document.docx`;
    a second call gives `Untitled document 2.docx`. The same holds for spreadsheet and
    presentation.
- [ ] **Step 2: Implement.**
  - `office:status(projectRoot)` returns:
    - `available` from `officeAvailable()`;
    - `recent` from `list`;
    - `project`, from `projectFiles(projectRoot)` named after the folder's basename, or null.
  - `office:create(kind, projectRoot)` goes to `projectRoot ?? app.getPath('documents')`.
    Contract/design: the focused project or Documents.
  - `office:pick` uses `dialog.showOpenDialog`:
    - The sender's BrowserWindow is the parent.
    - Filter `Office files: docx, xlsx, pptx` in this plan.
  - `office:open` success calls `recent.add`. WHY: Recent means opened in Office (R5).
- [ ] **Step 3: Check it in the dev window.**
  - New document creates and opens.
  - Recent shows it after reopening the page, and a project file opens.
  - Run verify.sh, then commit and push.

---

### Task 9: Theme against Euro-Office (fonts, tips, the external-links warning)

**Files:**
- Modify:
  - `bridge/yc-bridge.js` (add-on)
  - `src/main/office/office-protocol.ts` (fonts route)
  - `src/renderer/components/office/EditorFrame.tsx` (rewrite fontLinks)
- Create:
  - `src/main/office/theme-fonts.ts`
  - `tests/office/theme-fonts.test.ts`

**Interfaces:**
- Produces:
  - `office://<token>/yc-fonts/css?u=<encoded https://fonts.googleapis.com/css2?...>`: CSS
    whose `url(...)`s point at `office://<token>/yc-fonts/file?u=<encoded https://fonts.gstatic.com/...>`.
  - `theme-fonts.ts`:
    - `fetchFontCss(u)` / `fetchFontFile(u)` (cached under `userData/office-font-cache/`)
    - `isAllowedFontUrl(u)` accepts only https `fonts.googleapis.com/css2` and
      `fonts.gstatic.com/`

- [ ] **Step 1: Failing tests.**
  - `isAllowedFontUrl` accepts the two hosts and refuses: http, other hosts, `fonts.googleapis.com.evil.com`, and a userinfo trick `https://fonts.googleapis.com@evil.com/`.
  - The CSS rewrite maps every `url(https://fonts.gstatic.com/…)` to the office route.
  - A cached file is served without a network call (inject `fetch`).
- [ ] **Step 2: Implement.**
  - Main fetches (main has network); the editor never does. WHY: the CSP keeps the editor
    offline (design §3). Theme fonts still load, via main, from Google's two font hosts only.
  - EditorFrame maps `readOfficeTheme().fontLinks` to
    `${origin}/yc-fonts/css?u=${encodeURIComponent(link)}` before posting.
- [ ] **Step 3: Dismiss Euro-Office's "New feature" tips and the external-links warning.**
  1. Find their code: in `scratch/spike/eol/src/web-apps`, run
     `rg -n "New\b.*tip|newFeature|asc_onNeedUpdateExternalReference|Turn off AutoUpdate" apps/ -g '*.js'`.
  2. Tips: set whatever localStorage key or `customization` flag marks them seen, from
     yc-bridge, before the editor starts. The origin is per document and fresh, so this has
     to run every time.
  3. External links: choose the option that neither contacts the outside nor changes the file.
     Verify by opening `scratch/spike/work/two-edmodel.xlsx` in the dev window: no dialog, and
     after a save `compare.py` shows no change beyond the known false alarms.
  4. Record which calls you used in a WHY comment. Rebuild the bundle as add-on `v0.1.1`,
     update `office-pin.json` (version, URL, sha256), and run `node scripts/fetch-office.mjs`.
- [ ] **Step 4: Screenshots in the four themes.** In the dev window, open the memo and the
  workbook in Midnight, Meadow Mist, Halftone Dimension and one more light theme. Read each
  picture:
  - the title row is hidden;
  - the panels use the theme;
  - the theme font shows in menus;
  - no tip or warning is visible.

  Save the pictures under
  `docs/active/design/2026-09-27-office/images/demo/`. Run verify.sh, then commit and push
  both repos.

---

### Task 10: The demo point (contract R29, R30)

- [ ] **Step 1:** Run the UX tester's second pass? **No.** That belongs to design task 10,
  after tasks 7–9 of the design. Here, only confirm:
  - `bash scripts/verify.sh <app worktree>` is green;
  - `node --test test/` in the add-on is green;
  - both repos are pushed.
- [ ] **Step 2: Try-it deck.** Copy `scripts/ui-review/templates/try-it.json` (read
  `.claude/rules/review-deck.md` first). Make one Try-it slide: "Office opens, edits and saves
  your files". Its steps, in Destin's words:
  1. Open Office from the rail.
  2. Open one of your own files, or make a new one.
  3. Type something.
  4. Close the tab.
  5. Open the file in Word or LibreOffice, and check the change is there.
  6. Open Versions.

  Add one Approve slide per theme picture from Task 9. `preview` it, read the contact sheet,
  start the dev window, and `serve` it in the background. The `[deck]` link is the last line of
  the turn.

## Not in this plan (design tasks 7–10; each gets its own plan)

- File-viewer editing on the real backend (R14–R20).
- Formats: old types, ODF save-as-Word copy, CSV (R21–R24).
- Sleep, the user-fonts overlay, and Windows + macOS bundles.
- Crash recovery (`recovery_*`) and the on-disk-change conflict (design §4a).
- Reviews → grader → acceptance.
