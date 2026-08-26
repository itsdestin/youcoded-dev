// scripts/perf-lab/fixture.mjs — builds the frozen fake HOME the perf lab runs against.
//
// WHY this file exists: every measurement run launches the packaged app with
// HOME=<fixture>, so everything the app touches under `~` (.claude, .youcoded,
// .config/youcoded) lands inside a throwaway directory. A perf run can then
// NEVER read or write Destin's real data — the workspace live-app-safety rule.
//
// Node built-ins only (the workspace root has no package.json and must not gain one).
import {
  chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)));
const WORKSPACE = resolve(HERE, '..', '..');
// scratch/ is gitignored, so the ~40 MB of downloaded engine + model assets
// never enter git history. They are cached here and reused across runs.
export const ASSETS_DIR = join(WORKSPACE, 'scratch', 'perf-lab', 'assets');
const ENGINE_PIN_TS = join(WORKSPACE, 'youcoded', 'desktop', 'src', 'main', 'engine', 'engine-pin.ts');

// The smallest model that can actually hold a native conversation in THIS app.
//
// WHY not the 1.1 MB stories260K toy the plan specified: measured, its GGUF
// metadata says llama.context_length = 2048, and llama.cpp clamps -c down to a
// model's trained context. The app's agent system prompt is larger than that, so
// every native send came back "context size (2048 tokens), try increasing it
// (provider error 400)" — the model could never answer, no matter how the engine
// was configured. stories260K is also a story-completion toy with no chat
// template, so it was the wrong shape twice over.
//
// Qwen2.5-0.5B-Instruct is ~470 MB with a 32,768-token context and a real chat
// template: still small enough to load fast and cost nothing, big enough that
// nativeFirstTokenMs measures the app's path rather than a 400.
const GGUF_URL = 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf';
const GGUF_NAME = 'qwen2.5-0.5b-instruct-q4_k_m.gguf';

// ---------------------------------------------------------------------------
// Slug + transcript shapes — mirrors of app code, verified against it
// ---------------------------------------------------------------------------

/**
 * Faithful copy of ccProjectSlug (youcoded/desktop/src/main/slug-encoding.ts:44-48):
 * every non-alphanumeric becomes '-'. The real one also (a) upper-cases a leading
 * Windows drive letter and (b) appends `-<base36 hash>` past CC_SLUG_MAX (200 chars).
 * Neither applies here: fixture paths are POSIX and ~60 chars, well under the cap.
 * This is a COPY on purpose — the workspace has no build step and cannot import TS.
 */
export function ccProjectSlug(cwd) {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

const WORDS = 'the quick brown fox jumps over the lazy dog while the perf lab measures every millisecond of the boot path and the history reload'.split(' ');
/** Deterministic filler text — same seed always yields the same words, so two
 *  runs produce byte-identical transcript bodies (only the uuids differ). */
function prose(seed, words) {
  let s = seed + 1;
  const out = [];
  for (let i = 0; i < words; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    // Take the HIGH bits: an LCG's low bits cycle with a short period, which
    // produced visibly repetitive filler ("dog of of dog").
    out.push(WORDS[(s >>> 13) % WORDS.length]);
  }
  return out.join(' ');
}

/**
 * One JSONL line per message, in the exact shape session-browser.ts keeps.
 *
 * Verified against loadHistory (session-browser.ts:660-721) — it keeps a line
 * ONLY if it has `uuid` and `type` of 'user'/'assistant', plus:
 *   user      → `message` present, NOT `isMeta`, HAS `promptId`, non-empty text
 *   assistant → `message.stop_reason === 'end_turn'` and non-empty text blocks
 * Anything else is silently dropped, which would make a history measurement read
 * zero messages. The same gate re-appears in readSessionTranscriptMeta
 * (session-browser.ts:322-347) for the session-list title, which additionally
 * skips a first prompt whose text starts with '<' — hence the "Turn N:" prefix.
 * `message.model` on the assistant line is what that scan reports as lastUsedModel.
 */
export function transcriptLines({ sessionId, cwd, turns, startedAt }) {
  const lines = [];
  let parent = null;
  for (let i = 0; i < turns; i++) {
    const ts = new Date(startedAt + i * 60000);
    const u = randomUUID();
    lines.push(JSON.stringify({
      type: 'user', uuid: u, parentUuid: parent, promptId: randomUUID(), isMeta: false,
      sessionId, cwd, version: '2.1.229', gitBranch: '', userType: 'external',
      timestamp: ts.toISOString(),
      message: { role: 'user', content: `Turn ${i + 1}: ${prose(i, 24)}` },
    }));
    const a = randomUUID();
    lines.push(JSON.stringify({
      type: 'assistant', uuid: a, parentUuid: u,
      sessionId, cwd, version: '2.1.229', gitBranch: '', userType: 'external',
      timestamp: new Date(ts.getTime() + 5000).toISOString(),
      message: {
        role: 'assistant', model: 'claude-sonnet-4-5', stop_reason: 'end_turn',
        content: [{ type: 'text', text: prose(i + 7, 80) }],
      },
    }));
    parent = a;
  }
  return lines;
}

// small ≈ 60 KB, medium ≈ 3 MB, huge ≈ 30 MB — the three points the
// history-reload scenario measures. Lines written = 2 x turns.
const SIZES = { small: 50, medium: 2500, huge: 25000 };

// ---------------------------------------------------------------------------
// Asset provisioning
// ---------------------------------------------------------------------------

/**
 * Reads the pinned llama.cpp engine build straight out of the app's own
 * engine-pin.ts, which its header calls "the ONE place the engine version is
 * pinned". Parsed as TEXT rather than imported: engine-pin.ts is TypeScript in a
 * CommonJS package, so `import()` of it fails ("Unexpected token 'export'").
 * Parsing keeps the version/sha/layout in ONE place — bump the pin and the perf
 * lab downloads the new engine with no edit here.
 */
export function readEnginePin({ platform = 'linux', arch = 'x64', backend = 'cpu' } = {}) {
  const src = readFileSync(ENGINE_PIN_TS, 'utf8');
  const version = /ENGINE_VERSION\s*=\s*'([^']+)'/.exec(src)?.[1];
  if (!version) throw new Error(`Could not read ENGINE_VERSION from ${ENGINE_PIN_TS}`);
  // Each asset is one object literal on one line in ENGINE_ASSETS.
  const row = src.split('\n').find((l) =>
    l.includes(`platform: '${platform}'`) && l.includes(`arch: '${arch}'`) && l.includes(`backend: '${backend}'`));
  if (!row) throw new Error(`No ${platform}/${arch}/${backend} asset in ${ENGINE_PIN_TS}`);
  const field = (name) => {
    const m = new RegExp(`${name}:\\s*'([^']+)'`).exec(row);
    if (!m) throw new Error(`Asset row for ${platform}/${arch}/${backend} has no ${name}`);
    return m[1];
  };
  return {
    version, backend,
    assetName: field('assetName'),
    sha256: field('sha256'),
    binaryRelPath: field('binaryRelPath'),
    // Mirrors assetUrl() in engine-pin.ts.
    url: `https://github.com/ggml-org/llama.cpp/releases/download/${version}/${field('assetName')}`,
  };
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed (${res.status} ${res.statusText}): ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(resolve(dest, '..'), { recursive: true });
  writeFileSync(dest, buf);
  return buf.length;
}

function sha256File(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

/**
 * Sync check for "are both assets already provisioned?" — returns their paths,
 * or null if anything is missing. "Provisioned" for the engine means exactly what
 * EngineAcquisition.installed() means (engine-acquisition.ts:52-64): a readable
 * `.complete` marker for the pinned version whose binaryRelPath actually exists.
 */
export function assetsReady() {
  let pin;
  try { pin = readEnginePin(); } catch { return null; }
  const ggufSrc = join(ASSETS_DIR, GGUF_NAME);
  const engineSrc = join(ASSETS_DIR, `engine-${pin.version}-${pin.backend}`);
  try { if (statSync(ggufSrc).size === 0) return null; } catch { return null; }
  try {
    const m = JSON.parse(readFileSync(join(engineSrc, '.complete'), 'utf8'));
    if (m.version !== pin.version || !existsSync(join(engineSrc, m.binaryRelPath))) return null;
  } catch { return null; }
  return { ggufSrc, engineSrc, pin };
}

/**
 * Downloads whatever assetsReady() says is missing into scratch/perf-lab/assets/:
 *   - the toy GGUF model, and
 *   - an unpacked llama.cpp engine install complete with its `.complete` marker,
 *     so the app finds an engine already installed and never downloads one
 *     mid-measurement (which would make every number meaningless).
 * Async because it uses fetch. Fast no-op when both are already there.
 */
export async function ensureAssets({ log = () => {} } = {}) {
  const ready = assetsReady();
  if (ready) return ready;

  mkdirSync(ASSETS_DIR, { recursive: true });
  const pin = readEnginePin();
  const ggufSrc = join(ASSETS_DIR, GGUF_NAME);
  const engineSrc = join(ASSETS_DIR, `engine-${pin.version}-${pin.backend}`);

  if (!existsSync(ggufSrc) || statSync(ggufSrc).size === 0) {
    log(`[fixture] downloading ${GGUF_NAME}\u2026`);
    await download(GGUF_URL, ggufSrc);
  }

  const marker = join(engineSrc, '.complete');
  let usable = false;
  try {
    const m = JSON.parse(readFileSync(marker, 'utf8'));
    usable = m.version === pin.version && existsSync(join(engineSrc, m.binaryRelPath));
  } catch { usable = false; }

  if (!usable) {
    const tarball = join(ASSETS_DIR, pin.assetName);
    if (!existsSync(tarball)) {
      log(`[fixture] downloading ${pin.assetName}\u2026`);
      await download(pin.url, tarball);
    }
    // Verify against the SAME sha256 the app verifies against. A corrupt or
    // substituted engine must fail loudly here, not halfway through a run.
    const got = sha256File(tarball);
    if (got !== pin.sha256) {
      throw new Error(`sha256 mismatch for ${pin.assetName}\n  expected ${pin.sha256}\n  got      ${got}`);
    }
    rmSync(engineSrc, { recursive: true, force: true });
    mkdirSync(engineSrc, { recursive: true });
    execFileSync('tar', ['-xzf', tarball, '-C', engineSrc]);
    if (!existsSync(join(engineSrc, pin.binaryRelPath))) {
      throw new Error(`Unpacked engine has no ${pin.binaryRelPath} \u2014 archive layout changed; re-check engine-pin.ts`);
    }
    // Shape pinned by the CompleteMarker interface (engine-acquisition.ts:35)
    // and written exactly as engine-acquisition.ts:120-121 writes it.
    writeFileSync(marker, JSON.stringify({
      version: pin.version, backend: pin.backend, binaryRelPath: pin.binaryRelPath,
    }));
    log(`[fixture] engine ${pin.version}-${pin.backend} unpacked`);
  }
  const ok = assetsReady();
  if (!ok) throw new Error('ensureAssets ran but the assets still look incomplete');
  return ok;
}

// ---------------------------------------------------------------------------
// Fixture build
// ---------------------------------------------------------------------------

/**
 * Wipes and rebuilds <root>/home. Idempotent by construction — call it once per
 * cold-start run. The huge transcript is ~30 MB, so a rebuild is ~1s of I/O.
 */
export function buildFixture(root, { engineSrc, ggufSrc, log = () => {} } = {}) {
  // Synchronous on purpose (the plan's interface) — but provisioning needs
  // `await fetch`. So: fast sync check first, and only when an asset is genuinely
  // missing do we shell out to ourselves to run the async download once. On a
  // provisioned machine this never spawns anything.
  let assets = assetsReady();
  if (!assets) {
    log('[fixture] assets missing \u2014 provisioning (one-time download)\u2026');
    execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--ensure-assets'], { stdio: 'inherit' });
    assets = assetsReady();
    if (!assets) throw new Error('Asset provisioning failed \u2014 see the output above');
  }
  const engine = engineSrc ?? assets.engineSrc;
  const gguf = ggufSrc ?? assets.ggufSrc;
  const pin = assets.pin;

  const home = join(root, 'home');
  rmSync(home, { recursive: true, force: true });
  const mk = (...p) => { const d = join(home, ...p); mkdirSync(d, { recursive: true }); return d; };
  const w = (p, s) => writeFileSync(join(home, p), s);

  // First-run wizard: FirstRunManager.isFirstRun (first-run.ts:48-60) reads
  // ~/.claude/toolkit-state/config.json and returns false once setup_completed
  // is exactly true. Without this the app boots into the setup wizard and
  // measures nothing.
  mk('.claude', 'toolkit-state');
  w('.claude/toolkit-state/config.json', JSON.stringify({ setup_completed: true }));
  w('.claude/settings.json', '{}');
  // Remote access defaults to OFF (remote-config.ts:51), which would zero the
  // remote-server startup chore. Turning it on here makes that chore measurable.
  // Filename note: remote-config.ts:21-24 switches to youcoded-remote.<profile>.json
  // when YOUCODED_PROFILE is set — the rig must launch with NO profile.
  w('.claude/youcoded-remote.json', JSON.stringify({
    enabled: true, port: 10000, passwordHash: null,
    trustTailscale: false, keepAwakeHours: 0, everPaired: false,
  }));

  const projects = { alpha: mk('projects', 'alpha'), beta: mk('projects', 'beta') };
  w('projects/alpha/README.md', '# alpha\n');
  w('projects/beta/README.md', '# beta\n');

  const slug = ccProjectSlug(projects.alpha);
  mk('.claude', 'projects', slug);
  const transcripts = {};
  const now = Date.now();
  for (const [name, turns] of Object.entries(SIZES)) {
    const sessionId = randomUUID();
    const path = join(home, '.claude', 'projects', slug, `${sessionId}.jsonl`);
    // Timestamps are relative to generation time, so the "N days ago" labels in
    // the session list read identically run-to-run (no pixel churn in screenshots).
    writeFileSync(path, transcriptLines({
      sessionId, cwd: projects.alpha, turns, startedAt: now - 3 * 86400000,
    }).join('\n') + '\n');
    transcripts[name] = { sessionId, slug, path, turns };
  }

  mk('.youcoded');
  const models = mk('models');
  // engine-config.ts:34-43 reads cfg.engine.{cacheDir,backend,contextSize}. cacheDir
  // points at the fixture's model dir so the app never sees the real ~/.cache/llama.cpp.
  w('.youcoded/config.json', JSON.stringify({
    // contextSize 16384, not the plan's 4096: llama.cpp clamps -c to the model's
    // trained context, and the app's agent system prompt is bigger than 4096
    // tokens — measured, a 4096 fixture answered every native send with
    // "context size (4096 tokens), try increasing it (provider error 400)".
    // Qwen2.5-0.5B trains to 32768, so 16384 leaves real headroom while keeping
    // the KV cache small enough to load fast.
    v: 1, engine: { backend: pin.backend, contextSize: 16384, cacheDir: models },
  }));
  // Exactly ProvidersFile (provider-registry.ts:34) seeded with BUILT_INS
  // (provider-registry.ts:21-26). No secretRef — the fixture holds no API keys,
  // so a run cannot spend money even if something tries.
  w('.youcoded/providers.json', JSON.stringify({
    v: 1,
    providers: [
      { id: 'local', type: 'local-engine', label: 'Local models (llama.cpp)', enabled: true },
      { id: 'openrouter', type: 'openrouter', label: 'OpenRouter', enabled: true },
    ],
  }));
  copyFileSync(gguf, join(models, GGUF_NAME));

  // Electron's userData for app name "youcoded" (desktop/package.json:2) is
  // appData/<name>, and on Linux appData = $XDG_CONFIG_HOME || $HOME/.config —
  // hence <fixture>/.config/youcoded, provided the rig launches with NO
  // YOUCODED_PROFILE (main.ts:250-253 would redirect it to youcoded-<profile>).
  const userData = mk('.config', 'youcoded');
  const engineRoot = join(userData, 'engine');   // EngineManager: <userData>/engine (engine-manager.ts:111)
  mkdirSync(engineRoot, { recursive: true });
  const engineDir = join(engineRoot, `${pin.version}-${pin.backend}`); // installDir() naming, engine-acquisition.ts:41
  // Hardlink copy: 39 MB of engine in milliseconds, near-zero disk. Safe here
  // because the app only ever READS an installed engine dir (a version bump
  // unpacks into a fresh `.unpacking` sibling), so it can't write through the
  // links into the cached asset. cpSync fallback for a filesystem without `cp -al`.
  try {
    execFileSync('cp', ['-al', engine, engineDir]);
  } catch {
    cpSync(engine, engineDir, { recursive: true });
  }

  // Pre-create the XDG dirs the env below points at, so nothing the app (or a
  // library it loads) writes there can fall back to the REAL ~/.local/share
  // or ~/.cache when a mkdir is missing.
  mk('.local', 'share');
  mk('.cache');

  const bin = mk('bin');
  const fakeClaude = join(bin, 'claude');
  copyFileSync(join(HERE, 'fake-claude.cjs'), fakeClaude);
  chmodSync(fakeClaude, 0o755);

  const perfLog = join(home, 'perf-marks.jsonl');
  writeFileSync(perfLog, '');

  return {
    home, bin, projects, transcripts, perfLog, userData,
    modelId: GGUF_NAME.replace(/\.gguf$/i, ''),   // ggufIdFromFileName (cache-scan.ts:22)
    engine: { dir: engineDir, version: pin.version, backend: pin.backend, binaryRelPath: pin.binaryRelPath },
    // The env a launcher MUST use. XDG_CONFIG_HOME is pinned explicitly rather
    // than left to default: if the launching shell ever exports it, Electron's
    // userData would escape the fixture and land in the REAL ~/.config/youcoded.
    env: {
      HOME: home,
      XDG_CONFIG_HOME: join(home, '.config'),
      XDG_DATA_HOME: join(home, '.local', 'share'),
      XDG_CACHE_HOME: join(home, '.cache'),
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      YOUCODED_PERF_LOG: perfLog,
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const log = (m) => console.error(m);
  if (process.argv.includes('--ensure-assets')) {
    // The one-time provisioning path buildFixture re-enters this file for.
    await ensureAssets({ log });
  } else {
    const root = resolve(process.argv[2] || join(WORKSPACE, 'scratch', 'perf-lab'));
    console.log(JSON.stringify(buildFixture(root, { log }), null, 2));
  }
}
