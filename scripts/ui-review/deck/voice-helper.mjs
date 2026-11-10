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
const PARTIAL_EVERY_MS = 1200;      // how often the words-so-far are refreshed while speaking
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

let rec = null;        // the running recorder process, or null
let chunks = [];       // raw little-endian float32 bytes heard so far
let bytes = 0;
let decoding = false;
let decodedBytes = 0;  // how much had been heard at the last refresh
let timer = null;
let lastLevel = 0;

async function hear() {
  // Every pass re-hears the whole recording from the start (the app does the same): the model
  // has no "continue from here", and re-hearing lets later words correct earlier ones.
  const buf = Buffer.concat(chunks, bytes - (bytes % 4));
  const samples = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  const stream = recognizer.createStream();
  stream.acceptWaveform({ samples: Float32Array.from(samples), sampleRate: RATE });
  await recognizer.decodeAsync(stream);
  return recognizer.getResult(stream).text.trim();
}

function stopRecorder() {
  clearInterval(timer); timer = null;
  if (rec) { const r = rec; rec = null; r.kill('SIGTERM'); }
}

function start() {
  if (rec) return;
  chunks = []; bytes = 0; decodedBytes = 0;
  // parec speaks to PipeWire and PulseAudio alike and writes bare samples to stdout.
  const r = spawn('parec', ['--format=float32le', `--rate=${RATE}`, '--channels=1', '--raw', '--latency-msec=100'],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  rec = r;
  let stderr = '';
  r.stderr.on('data', d => { stderr += d; });
  r.stdout.on('data', d => {
    if (rec !== r) return;
    chunks.push(d); bytes += d.length;
    // WHY: the page draws a ring that grows with the sound, like the app's own microphone, so
    // he can see it is hearing him before the first words appear. Loudness of this slice only.
    const n = Math.floor(d.length / 4); let sum = 0;
    for (let i = 0; i < n; i++) { const v = d.readFloatLE(i * 4); sum += v * v; }
    if (n && Date.now() - lastLevel > 90) { lastLevel = Date.now(); out({ type: 'level', v: Math.min(1, Math.sqrt(sum / n) * 6) }); }
    if (bytes / 4 / RATE > MAX_SECONDS) stop();
  });
  r.on('error', err => { if (rec === r) { stopRecorder(); out({ type: 'error', message: `The microphone could not be opened: ${err.message}` }); } });
  r.on('exit', code => {
    // Only an exit nobody asked for is a failure; stop() clears `rec` before it kills.
    if (rec === r) { stopRecorder(); out({ type: 'error', message: `The microphone stopped by itself (parec exit ${code}): ${stderr.trim().slice(0, 300)}` }); }
  });
  timer = setInterval(async () => {
    if (decoding || !rec || bytes - decodedBytes < RATE) return;   // under a quarter second of new sound
    decoding = true; decodedBytes = bytes;
    try { const text = await hear(); if (rec) out({ type: 'partial', text }); }
    catch (err) { out({ type: 'error', message: `Could not turn the recording into words: ${err.message}` }); }
    finally { decoding = false; }
  }, PARTIAL_EVERY_MS);
}

async function stop() {
  if (!rec) return;
  stopRecorder();
  while (decoding) await new Promise(r => setTimeout(r, 30));
  decoding = true;
  try { out({ type: 'final', text: bytes >= 4 * RATE / 5 ? await hear() : '' }); }
  catch (err) { out({ type: 'error', message: `Could not turn the recording into words: ${err.message}` }); }
  finally { decoding = false; }
}

createInterface({ input: process.stdin }).on('line', line => {
  const cmd = line.trim();
  if (cmd === 'start') start();
  else if (cmd === 'stop') stop();
  else if (cmd === 'cancel') { stopRecorder(); out({ type: 'final', text: '', cancelled: true }); }
}).on('close', () => { stopRecorder(); process.exit(0); });
