// scripts/perf-lab/fixture.mjs — builds the frozen fake HOME the perf lab runs against.
//
// WHY this file exists: every measurement run launches the packaged app with
// HOME=<fixture>, so everything the app touches under `~` (.claude, .youcoded,
// .config/youcoded) lands inside a throwaway directory. A perf run can then
// NEVER read or write Destin's real data — the workspace live-app-safety rule.
//
// Node built-ins only (the workspace root has no package.json and must not gain one).
import {
  appendFileSync, chmodSync, copyFileSync, cpSync, existsSync, mkdirSync,
  readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// The realistic-content generator. WHY it exists at all: `transcriptLines()`
// below writes plain prose, which is the CHEAPEST thing this app can render
// (one <p> per message). Real conversations are full of fenced code, diffs and
// tool cards, so a prose-only fixture measured a FLOOR rather than what the
// owner actually pays. content.mjs emits those shapes and is deterministic by
// construction (seeded PRNG, no clock, no entropy pool) — see its header.
import { realisticTranscriptLines, messagesPerTurn } from './content.mjs';

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

// ---------------------------------------------------------------------------
// Transcript sizes — the three points the history-reload scenario measures
// ---------------------------------------------------------------------------

/**
 * Fixed seed for the realistic generator. Same seed => byte-identical
 * transcript bodies on every rebuild, which is what makes two perf reports
 * comparable at all: if the content moved between runs, so would the numbers.
 */
export const CONTENT_SEED = 'perf-lab-v1';

/**
 * Turn counts per size. `small` and `medium` keep the turn counts they have
 * always had, so their numbers stay comparable and stay interpretable — 2,500
 * turns is 5,000 history messages, which is an ORDINARY conversation in this
 * app, not a stress case.
 *
 * WHY `huge` dropped from 25,000 turns to 3,500 — measured, not guessed:
 *
 *  Realistic content costs ~6.8x the bytes of the old prose filler (measured
 *  6.62-6.85x across seven turn counts) and writes 2.92 JSONL lines per turn
 *  instead of 2.00, i.e. 1.46x as many TIMELINE ENTRIES to render per turn.
 *  Only 2 of those lines per turn are history-visible (see the invariant note
 *  on transcriptBody below); the rest are tool round-trips, which the resume
 *  path still renders as cards.
 *
 *  The ceiling that decides this is NOT the 45-minute report budget, it is
 *  scenario-history.mjs's in-page WATCH_TIMEOUT_MS = 240s per resume sample. A
 *  resume that overruns it reports null, so history.<size>.median.resumeStableMs
 *  — a PRIMARY metric — goes blind while still burning 240s x 5 repeats.
 *
 *  Two cost models, both anchored on the two measurements taken with PLAIN
 *  content on this machine (medium 5,000 entries -> 3.5s; huge 50,000 entries
 *  -> 124s):
 *    (a) pessimistic — take huge's measured 2.48 ms/entry and scale it by the
 *        4.7x bytes-per-entry that realistic content adds => ~34 ms/turn.
 *        Deliberately harsh: it applies the per-entry cost measured at 50,000
 *        entries (where the superlinear term dominates) to a much shorter file.
 *    (b) two-term fit t = 0.502*n + 3.96e-5*n^2 through both plain points, with
 *        both terms scaled 4.7x and n = 2.92 * turns.
 *
 *  turns   file    gen+write   resume (a)   resume (b)
 *  25,000  224 MiB  2.33 s      850 s        1166 s   <- blows the 240s ceiling
 *  12,000  106 MiB  0.99 s      408 s         312 s   <- blows it
 *   8,000   70 MiB  0.64 s      272 s         157 s   <- (a) blows it
 *   6,000   54 MiB  0.47 s      204 s          98 s   <- only 15% margin
 *   5,000   44 MiB  0.45 s      170 s          74 s   <- 29% margin, 21 min phase
 *   3,500   31 MiB  0.32 s      119 s          43 s   <- CHOSEN
 *
 *  (The table's file sizes come from a bare generator run; inside a real
 *  fixture the longer cwd stamped on every line makes them 0.26 / 23.8 / 33.0
 *  MiB for small / medium / huge — 57 MiB of transcript per build.)
 *
 *  3,500 turns holds BOTH budgets at once: 33 MiB is the same file size the old
 *  prose `huge` had (~33 MiB), and ~119 s is the same wall clock the old `huge`
 *  resume took (~124 s) — so the history phase costs what it already cost
 *  (~17 min for 5 repeats across all three sizes, pessimistically) and keeps 2x
 *  headroom under the 240 s ceiling. It is still a hard stress: 10,258 timeline
 *  entries of real code/diff content, blocking the renderer for minutes.
 *
 *  THE TRADEOFF, stated plainly: the rig no longer probes the 50,000-message
 *  regime. `huge` is now 7,000 history messages (10,258 timeline entries), 1.4x
 *  medium's turn count rather than 10x. Reports from before this change are NOT
 *  comparable to reports after it — different content AND different sizes. If
 *  the 50k-message regime is wanted back, the lever is raising
 *  WATCH_TIMEOUT_MS in scenario-history.mjs, or building that one size with
 *  { content: 'plain' }; both are deliberate choices, not defaults.
 */
export const SIZES = Object.freeze({ small: 50, medium: 2500, huge: 3500 });

/**
 * How many TINY extra transcripts to scatter across how many project dirs.
 *
 * These restore the file-COUNT dimension the fixture was missing. Destin's real
 * machine: 804 .jsonl files across 10 project directories. The fixture had 3 in 1.
 * Costs in the app that scale with the number of files walked — the conversation
 * reconciler at startup and on a 30-minute timer, the Resume Browser's per-record
 * read — were therefore measured in the one configuration where they are free.
 *
 * 600 rather than 804: the reconciler's own source comment quotes its measured
 * cost "at 600 records", so this lands on a number the app's authors already
 * characterised, and it stays well clear of turning fixture setup into a
 * noticeable part of a run.
 */
export const DECOY_TRANSCRIPTS = 600;
export const DECOY_PROJECT_DIRS = 10;

/** Content modes buildFixture accepts. 'plain' is the pre-2026-08-27 prose
 *  filler, kept because it is the cheapest way to get back a 50,000-message
 *  file if someone wants to measure that regime again. */
const CONTENT_MODES = ['realistic', 'plain'];

/**
 * The JSONL body for one transcript, in whichever content mode was asked for.
 *
 * THE INVARIANT THIS MUST HOLD: scenario-history.mjs:184 aborts the whole run
 * unless `loadHistory(all).length === 2 * turns`. Both modes hold it — plain
 * writes exactly 2 history-visible lines per turn, and realistic writes 2
 * history-visible lines plus tool lines that loadHistory drops by construction
 * (its tool-call assistant line carries stop_reason 'tool_use', its tool_result
 * user line carries no promptId; loadHistory requires 'end_turn' and a
 * promptId respectively). `messagesPerTurn` is content.mjs's exported name for
 * that 2.
 */
export function transcriptBody({ content = 'realistic', sessionId, cwd, turns, startedAt, seed = CONTENT_SEED }) {
  // Throw rather than fall back: a typo'd mode must not silently produce the
  // cheap content and make a report look 7x faster than the app really is.
  if (!CONTENT_MODES.includes(content)) {
    throw new Error(`buildFixture: unknown content mode ${JSON.stringify(content)} (want one of ${CONTENT_MODES.join(', ')})`);
  }
  return content === 'plain'
    ? transcriptLines({ sessionId, cwd, turns, startedAt })
    : realisticTranscriptLines({ sessionId, cwd, turns, startedAt, seed });
}

/** History-visible messages per turn — 2 in both content modes. Re-exported so
 *  a caller checking the invariant above never has to hardcode the number. */
export { messagesPerTurn };

/**
 * A uuid-shaped id derived from a string, with no randomness in it.
 *
 * WHY: the transcripts embed their own sessionId on every line, so a
 * randomUUID() sessionId would make an otherwise deterministic file differ
 * byte-for-byte between rebuilds — the exact thing content.mjs went to the
 * trouble of eliminating. Hash-derived ids keep the whole fixture reproducible.
 * Shaped as a v4 uuid (version nibble 4, variant nibble 8) so it looks like
 * every other CC session id, and it passes session-browser.ts's SAFE_ID_RE.
 */
export function stableUuid(key) {
  const h = createHash('sha256').update(key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Write JSONL in chunks instead of one giant concatenated string. WHY: joining
 *  a whole transcript into a single string spikes this process's heap by the
 *  file size (measured 1.3 GB RSS while building the 224 MiB candidate), and
 *  buildFixture runs inside run.mjs right before it takes timings. */
function writeJsonl(path, lines, chunkLines = 2000) {
  writeFileSync(path, '');
  for (let i = 0; i < lines.length; i += chunkLines) {
    appendFileSync(path, lines.slice(i, i + chunkLines).join('\n') + '\n');
  }
}

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
 * cold-start run (a full report calls it six times). With the default realistic
 * content the three transcripts total ~57 MiB; a whole rebuild measured 545 ms,
 * which is mostly the 470 MB gguf copy, not the transcripts.
 *
 * "Idempotent" is now literal for the transcripts: same filenames, same bytes
 * on every rebuild EXCEPT the timestamps, which are deliberately anchored to
 * build time so the session list keeps saying "3 days ago" (see below).
 *
 * `content` picks the transcript filler: 'realistic' (default — fenced code,
 * diffs, tool cards, what the app actually renders) or 'plain' (the old prose
 * filler). Everything else about the fixture is identical between the two.
 */
export function buildFixture(root, { engineSrc, ggufSrc, content = 'realistic', log = () => {} } = {}) {
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
    // Derived, not random — see stableUuid. Two rebuilds of the same size now
    // produce the same filename AND the same bytes inside it.
    const sessionId = stableUuid(`${CONTENT_SEED}:${content}:${name}`);
    const path = join(home, '.claude', 'projects', slug, `${sessionId}.jsonl`);
    // Timestamps are relative to generation time, so the "N days ago" labels in
    // the session list read identically run-to-run (no pixel churn in screenshots).
    // This is the ONE thing about a transcript that still moves between builds.
    writeJsonl(path, transcriptBody({
      content, sessionId, cwd: projects.alpha, turns, startedAt: now - 3 * 86400000,
    }));
    transcripts[name] = { sessionId, slug, path, turns };
  }

  // ── Decoy transcripts: file COUNT, not file size ──────────────────────────
  //
  // WHY THESE EXIST. Measured on Destin's machine 2026-08-27:
  //   real:    804 .jsonl files across 10 project directories
  //   fixture: 3 files in 1 directory
  //
  // Several costs in the app are O(number of transcript files), not O(their
  // size). `conversations/reconciler.ts` readdirs every project slug dir and
  // opens every .jsonl in it — at startup AND on a 30-minute timer — and its own
  // source comment measures 2.8s at 600 records. At three files that cost is
  // effectively zero, so the rig's headline startup numbers have always been
  // taken in the one configuration where that whole class of defect cannot
  // appear. It is the same mistake as measuring idle with no sessions open and
  // switching between empty conversations, and it is the fourth instance found.
  //
  // Decoys are TINY (a header line and one turn) and spread across several slug
  // dirs, so they restore the file-count dimension for a few hundred KB and a
  // fraction of a second of setup. They are deliberately NOT big: this is about
  // how many files get walked, and making them large would confound that with
  // read cost, which the size-based transcripts above already cover.
  const decoys = [];
  if (DECOY_TRANSCRIPTS > 0) {
    for (let d = 0; d < DECOY_PROJECT_DIRS; d++) {
      const decoyCwd = mk('projects', `decoy-${d}`);
      const decoySlug = ccProjectSlug(decoyCwd);
      mk('.claude', 'projects', decoySlug);
      const perDir = Math.ceil(DECOY_TRANSCRIPTS / DECOY_PROJECT_DIRS);
      for (let i = 0; i < perDir && decoys.length < DECOY_TRANSCRIPTS; i++) {
        // stableUuid again: same fixture bytes on every rebuild, so a baseline
        // and a candidate walk an identical directory tree.
        const id = stableUuid(`${CONTENT_SEED}:decoy:${d}:${i}`);
        const dp = join(home, '.claude', 'projects', decoySlug, `${id}.jsonl`);
        writeJsonl(dp, transcriptBody({
          content, sessionId: id, cwd: decoyCwd, turns: 1,
          startedAt: now - (7 + (i % 90)) * 86400000,
        }));
        decoys.push(dp);
      }
    }
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
  // Hardlink the model, same reasoning as the engine below: the app only READS a
  // GGUF from cacheDir (a download writes a NEW file), so links can't write back
  // into the cached asset.
  //
  // WHY this is worth doing rather than a plain copy: the model is ~470 MB and the
  // fixture is rebuilt once per cold start, so `--runs 5` was copying ~2.3 GB per
  // report for no benefit — it was most of the measured 545 ms rebuild cost, and
  // that cost lands immediately before the rig starts timing a boot.
  try {
    execFileSync('cp', ['-al', gguf, join(models, GGUF_NAME)]);
  } catch {
    copyFileSync(gguf, join(models, GGUF_NAME));
  }

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
    // How many transcript files the app will actually find. Reported so a reader
    // can see the scale a number was taken at, instead of assuming a realistic
    // library: costs that scale with file COUNT were invisible while this was 3.
    transcriptFileCount: Object.keys(transcripts).length + decoys.length,
    decoyTranscripts: decoys.length,
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
    // `--plain` swaps in the old prose filler; the default is realistic content.
    const content = process.argv.includes('--plain') ? 'plain' : 'realistic';
    const root = resolve(process.argv.find((a) => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1])
      || join(WORKSPACE, 'scratch', 'perf-lab'));
    console.log(JSON.stringify(buildFixture(root, { content, log }), null, 2));
  }
}
