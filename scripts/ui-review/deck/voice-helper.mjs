// Voice typing for review decks: listens on this computer's microphone and turns speech into
// text with the SAME Parakeet model the YouCoded app uses for its message box.
//
// WHY a helper of the deck's own (Destin, 2026-11-09: "I want to be able to respond to these
// decks with my voice"): the running app must never be sent messages by a dev tool
// (.claude/rules/live-app-safety.md), so the deck cannot borrow the app's voice service. What it
// CAN do is read the speech engine and model the app already downloaded to
// ~/.config/youcoded/voice/ — plain files, safe to read — and run its own copy of the engine.
//
// WHY the microphone is opened HERE and not by the page: a deck shown inside the YouCoded app
// is refused the microphone by the app's own security policy (permission-policy.ts: only the
// app's own page may listen). Recording on this side works wherever the page is shown, with no
// browser permission prompt. `serve.py` only ever listens on 127.0.0.1, so "this computer's
// microphone" is always the microphone of the person looking at the deck.
//
// Protocol (serve.py owns the process): one word per line on stdin — `start`, `stop`, `cancel`
// — and one JSON object per line on stdout: {type: ready | partial | final | error, …}.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const RATE = 16000;                 // what the model hears; matches the app's VOICE_SAMPLE_RATE
const MAX_SECONDS = 300;            // a recording left running stops itself after five minutes

const out = o => process.stdout.write(JSON.stringify(o) + '\n');
const root = process.env.YOUCODED_VOICE_DIR || path.join(homedir(), '.config', 'youcoded', 'voice');
const pkg = path.join(root, 'runtime', 'package');
const models = path.join(root, 'model', 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8');

let recognizer = null;
try {
  // Never invent a cause (docs/error-message-standards.md): say exactly what is missing.
  for (const f of [path.join(pkg, 'sherpa-onnx.node'), path.join(models, 'encoder.int8.onnx')]) {
    if (!existsSync(f)) throw new Error(`The speech engine is not on this computer yet (${f} is missing). Tap the microphone in YouCoded's message box once to download it.`);
  }
  const req = createRequire(path.join(pkg, 'sherpa-onnx.node'));
  req(path.join(pkg, 'sherpa-onnx.node'));          // load the native half first, as the app does
  const sherpa = req(path.join(pkg, 'sherpa-onnx.js'));
  // The same settings as the app's createRecognizer (voice-worker.ts), minus custom vocabulary.
  recognizer = await sherpa.OfflineRecognizer.createAsync({
    featConfig: { sampleRate: RATE, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: path.join(models, 'encoder.int8.onnx'),
        decoder: path.join(models, 'decoder.int8.onnx'),
        joiner: path.join(models, 'joiner.int8.onnx'),
      },
      tokens: path.join(models, 'tokens.txt'),
      numThreads: 4, modelType: 'nemo_transducer', debug: 0,
    },
  });
  out({ type: 'ready' });
} catch (err) {
  out({ type: 'error', message: err instanceof Error ? err.message : String(err), fatal: true });
  process.exit(1);
}

// ── Listening, the way the app's own voice box does it ─────────────────────────────────
// WHY this was rewritten (Destin, 2026-11-10, round 3: "make this work much more like how it
// actually works in youcoded, including showing my words as i speak"): the first version
// re-heard the WHOLE recording on a 1.2-second clock, so words arrived in slow lumps and got
// slower the longer he spoke. The app (youcoded desktop/src/main/voice/voice-worker.ts and
// voice-service.ts) does three things this now copies, with the same numbers:
//   1. a finished sentence is closed off at a pause and never heard again, so each pass only
//      hears the open stretch and stays quick however long he talks;
//   2. the next pass starts a fifth of a second after the last one FINISHES (a chain, not a
//      clock), so words follow the voice as fast as this computer can manage;
//   3. two seconds of quiet after he has said something stops the microphone by itself.
const FRAME = RATE / 10;            // a tenth of a second of sound
const SPEECH_FLOOR = 0.01;          // below this loudness a frame is silence (app: SPEECH_RMS_FLOOR)
const COMMIT_MIN_S = 5;             // a stretch is never closed before this long…
const COMMIT_PAUSE_S = 0.8;         // …and then this much quiet closes it
const HARD_CUT_S = 15;              // nobody pausing: break at the quietest recent moment
const PASS_GAP_MS = 200;            // rest between one pass finishing and the next starting
const SILENCE_STOP_MS = 2000;       // quiet after speech that ends the recording

let rec = null;        // the running recorder process, or null
let open = [];         // raw float32 bytes of the stretch still being heard
let openBytes = 0;
let segments = [];     // the words of every stretch already closed off
let unheard = false;   // sound has arrived since the last pass began
let passing = false;
let gap = null;
let totalBytes = 0;
let speechHeard = false, lastLoudAt = 0, lastLevel = 0;

const joined = extra => segments.concat(extra ? [extra] : []).map(t => t.trim()).filter(Boolean).join(' ');
function openSamples() {
  const buf = Buffer.concat(open, openBytes - (openBytes % 4));
  // A copy, so sound still arriving cannot change what the engine is hearing mid-pass.
  return Float32Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4));
}
function frameLoudness(samples) {
  const frames = [];
  for (let i = 0; i + FRAME <= samples.length; i += FRAME) {
    let sum = 0; for (let j = i; j < i + FRAME; j++) sum += samples[j] * samples[j];
    frames.push(Math.sqrt(sum / FRAME));
  }
  return frames;
}
// How much of the open stretch this pass hears, and whether it closes the stretch.
function plan(samples) {
  const frames = frameLoudness(samples), seconds = samples.length / RATE;
  let quiet = 0; for (let i = frames.length - 1; i >= 0 && frames[i] < SPEECH_FLOOR; i--) quiet++;
  if (seconds >= COMMIT_MIN_S && quiet / 10 >= COMMIT_PAUSE_S) return { n: samples.length, closes: true };
  if (seconds >= HARD_CUT_S) {
    // Break at the END of the quietest tenth of the last second — a gap between words, so no
    // word is cut in half and heard as two wrong ones.
    const first = Math.max(0, frames.length - 10); let q = first;
    for (let i = first; i < frames.length; i++) if (frames[i] < frames[q]) q = i;
    return { n: Math.min(samples.length, (q + 1) * FRAME), closes: true };
  }
  return { n: samples.length, closes: false };
}
async function decode(samples) {
  const stream = recognizer.createStream();
  stream.acceptWaveform({ samples, sampleRate: RATE });
  await recognizer.decodeAsync(stream);
  return recognizer.getResult(stream).text.trim();
}
function dropOpen(nSamples) {
  const buf = Buffer.concat(open, openBytes).subarray(nSamples * 4);
  open = buf.length ? [Buffer.from(buf)] : []; openBytes = buf.length;
  unheard = openBytes > 0;
}
async function pass() {
  if (passing || !rec || !unheard || openBytes < 4 * RATE / 4) return;   // under a quarter second
  passing = true; unheard = false;
  try {
    const samples = openSamples(), p = plan(samples);
    const text = await decode(p.n === samples.length ? samples : samples.subarray(0, p.n));
    if (!rec) return;                       // stopped or cancelled meanwhile: stop() speaks last
    if (p.closes) { segments.push(text); dropOpen(p.n); out({ type: 'partial', text: joined('') }); }
    else out({ type: 'partial', text: joined(text) });
  } catch (err) {
    out({ type: 'error', message: `Could not turn the recording into words: ${err.message}` });
  } finally {
    passing = false;
    if (rec) gap = setTimeout(() => { gap = null; pass(); }, PASS_GAP_MS);
  }
}

function stopRecorder() {
  clearTimeout(gap); gap = null;
  if (rec) { const r = rec; rec = null; r.kill('SIGTERM'); }
}

function start() {
  if (rec) return;
  open = []; openBytes = 0; segments = []; unheard = false; totalBytes = 0; speechHeard = false; lastLoudAt = Date.now();
  // parec speaks to PipeWire and PulseAudio alike and writes bare samples to stdout.
  const r = spawn('parec', ['--format=float32le', `--rate=${RATE}`, '--channels=1', '--raw', '--latency-msec=100'],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  rec = r;
  let stderr = '';
  r.stderr.on('data', d => { stderr += d; });
  r.stdout.on('data', d => {
    if (rec !== r) return;
    open.push(d); openBytes += d.length; totalBytes += d.length; unheard = true;
    // Loudness of this slice: it draws the meter beside the microphone and arms the quiet stop.
    const n = Math.floor(d.length / 4); let sum = 0;
    for (let i = 0; i < n; i++) { const v = d.readFloatLE(i * 4); sum += v * v; }
    const rms = n ? Math.sqrt(sum / n) : 0, now = Date.now();
    if (n && now - lastLevel > 90) { lastLevel = now; out({ type: 'level', v: Math.min(1, rms * 6) }); }
    if (rms >= SPEECH_FLOOR) { speechHeard = true; lastLoudAt = now; }
    // Only AFTER he has said something, so a microphone opened in a quiet room does not close
    // itself at once (the app's rule, voice-service.ts).
    else if (speechHeard && now - lastLoudAt >= SILENCE_STOP_MS) { stop(); return; }
    if (totalBytes / 4 / RATE > MAX_SECONDS) { stop(); return; }
    if (!passing && !gap) pass();
  });
  r.on('error', err => { if (rec === r) { stopRecorder(); out({ type: 'error', message: `The microphone could not be opened: ${err.message}` }); } });
  r.on('exit', code => {
    // Only an exit nobody asked for is a failure; stop() clears `rec` before it kills.
    if (rec === r) { stopRecorder(); out({ type: 'error', message: `The microphone stopped by itself (parec exit ${code}): ${stderr.trim().slice(0, 300)}` }); }
  });
}

async function stop() {
  if (!rec) return;
  stopRecorder();
  while (passing) await new Promise(r => setTimeout(r, 30));
  passing = true;
  try {
    // One last pass over whatever is still open; the closed stretches keep the words they have.
    const last = openBytes >= 4 * RATE / 5 ? await decode(openSamples()) : '';
    out({ type: 'final', text: joined(last) });
  }
  catch (err) { out({ type: 'error', message: `Could not turn the recording into words: ${err.message}` }); }
  finally { passing = false; open = []; openBytes = 0; }
}

createInterface({ input: process.stdin }).on('line', line => {
  const cmd = line.trim();
  if (cmd === 'start') start();
  else if (cmd === 'stop') stop();
  else if (cmd === 'cancel') { stopRecorder(); out({ type: 'final', text: '', cancelled: true }); }
}).on('close', () => { stopRecorder(); process.exit(0); });
