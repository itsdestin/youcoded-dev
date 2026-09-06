#!/usr/bin/env python3
"""Voice bench — speak once, hear back what every candidate speech engine thinks you said.

  <venv>/bin/python server.py --models <dir> [--port 5240] [--no-open]

A page on loopback with a mic button. Two modes:
  Batch — tap, talk, tap: the recording goes through every ticked engine; a table shows each
          engine's text, how long it took, and (if you read the sample paragraph) its word error rate.
  Live  — words appear while you talk, two ways side by side: a TRUE streaming engine (hears
          audio as it arrives) and a CHUNKED one (re-hears the last stretch every second — the
          technique whisper-style engines need). This is the Q-2 "live words" experience.

WHY this exists: Destin answered the voice questions deck (2026-09-05) with "how good are these
local speech models actually tho? i kinda want to test before we commit". So: the real engines,
his own voice, his own machine, and a thread limiter to imitate a weaker laptop. Nothing here
ships; it decides what does.

Models are loaded lazily and cached per (engine, threads). Audio is 16 kHz mono float32
everywhere; the browser sends webm/opus for batch (ffmpeg converts) and raw int16 PCM for live.
"""
import argparse, glob, io, json, os, re, subprocess, sys, threading, time, uuid, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 16000

# ---- the candidates ---------------------------------------------------------------------
# `dir`/`file` are matched inside --models. `punct`: engine emits no punctuation, so the
# bench runs the small punctuation model over its output (what we would ship alongside it).
ENGINES = {
    'whisper-base': dict(kind='whisper', file='ggml-base.bin',
        label='Whisper base', runtime='whisper.cpp', size='141 MB', langs='99', note='the "about 150 MB" option from the deck'),
    'whisper-small': dict(kind='whisper', file='ggml-small.bin',
        label='Whisper small', runtime='whisper.cpp', size='465 MB', langs='99', note=''),
    'whisper-turbo': dict(kind='whisper', file='ggml-large-v3-turbo-q5_0.bin',
        label='Whisper large-v3-turbo (q5)', runtime='whisper.cpp', size='547 MB', langs='99', note='the accurate one; heavy on CPU'),
    'parakeet-v3': dict(kind='sherpa-transducer', dir='sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8',
        label='Parakeet TDT 0.6B v3', runtime='sherpa-onnx', size='464 MB', langs='25 European', note='NVIDIA; punctuates and capitalises itself'),
    'moonshine-base': dict(kind='sherpa-moonshine', dir='sherpa-onnx-moonshine-base-en-int8',
        label='Moonshine base (v1)', runtime='sherpa-onnx', size='239 MB', langs='English', note='built for on-device'),
    'moonshine-v2': dict(kind='sherpa-moonshine-v2', dir='sherpa-onnx-moonshine-base-en-quantized-2026-02-27',
        label='Moonshine base v2', runtime='sherpa-onnx', size='106 MB', langs='English (other languages as separate downloads)',
        note='2026 release; hears at most ~8 s per pass, so the bench cuts the recording at pauses first', max_seconds=8),
    'qwen3-asr': dict(kind='sherpa-qwen3', dir='sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25',
        label='Qwen3-ASR 0.6B', runtime='sherpa-onnx', size='837 MB', langs='52', note='2026 release; a small language model that listens'),
    # true streaming engines (live mode only)
    'stream-conformer': dict(kind='sherpa-online-transducer', dir='sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-480ms-int8',
        label='NVIDIA streaming FastConformer (480 ms)', runtime='sherpa-onnx', size='101 MB', langs='English', note='true streaming; no punctuation of its own', punct=True, stream=True),
    'stream-zipformer': dict(kind='sherpa-online-transducer', dir='sherpa-onnx-streaming-zipformer-en-kroko-2025-08-06',
        label='Zipformer streaming (kroko 2025)', runtime='sherpa-onnx', size='54 MB', langs='English', note='true streaming; tiny', punct=True, stream=True),
}
PUNCT_DIR = 'sherpa-onnx-online-punct-en-2024-08-06'


def pick(d, *patterns):
    """First file in d matching any pattern; int8 files preferred when both exist."""
    for p in patterns:
        hits = sorted(glob.glob(os.path.join(d, p)))
        if hits:
            hits.sort(key=lambda h: (0 if 'int8' in h else 1, h))
            return hits[0]
    raise FileNotFoundError(f'{patterns} in {d}')


class Engine:
    def __init__(self, key, threads, models_dir):
        import sherpa_onnx as so
        self.key, self.threads, self.spec = key, threads, ENGINES[key]
        k = self.spec['kind']
        d = os.path.join(models_dir, self.spec.get('dir', ''))
        t0 = time.time()
        if k == 'whisper':
            from pywhispercpp.model import Model
            self.m = Model(os.path.join(models_dir, self.spec['file']), n_threads=threads,
                           print_progress=False, print_realtime=False, redirect_whispercpp_logs_to=None)  # None = swallow whisper.cpp stderr chatter
        elif k == 'sherpa-transducer':
            self.m = so.OfflineRecognizer.from_transducer(
                encoder=pick(d, 'encoder*.onnx'), decoder=pick(d, 'decoder*.onnx'), joiner=pick(d, 'joiner*.onnx'),
                tokens=os.path.join(d, 'tokens.txt'), num_threads=threads, model_type='nemo_transducer')
        elif k == 'sherpa-moonshine':
            self.m = so.OfflineRecognizer.from_moonshine(
                preprocessor=pick(d, 'preprocess*.onnx'), encoder=pick(d, 'encode*.onnx'),
                uncached_decoder=pick(d, 'uncached_decode*.onnx'), cached_decoder=pick(d, 'cached_decode*.onnx'),
                tokens=os.path.join(d, 'tokens.txt'), num_threads=threads)
        elif k == 'sherpa-moonshine-v2':
            # The 2026 Moonshine v2 packs ship as .ort (ONNX Runtime's pre-optimised format), not .onnx.
            self.m = so.OfflineRecognizer.from_moonshine_v2(
                encoder=pick(d, 'encoder*.ort', 'encoder*.onnx'), decoder=pick(d, 'decoder*.ort', 'decoder*.onnx'),
                tokens=os.path.join(d, 'tokens.txt'), num_threads=threads)
        elif k == 'sherpa-qwen3':
            self.m = so.OfflineRecognizer.from_qwen3_asr(
                conv_frontend=pick(d, 'conv*.onnx'), encoder=pick(d, 'encoder*.onnx'), decoder=pick(d, 'decoder*.onnx'),
                tokenizer=pick(d, 'tokenizer*', 'vocab*', 'tokens*'), num_threads=threads)
        elif k == 'sherpa-online-transducer':
            self.m = so.OnlineRecognizer.from_transducer(
                tokens=os.path.join(d, 'tokens.txt'), encoder=pick(d, 'encoder*.onnx'),
                decoder=pick(d, 'decoder*.onnx'), joiner=pick(d, 'joiner*.onnx'), num_threads=threads,
                model_type='nemo_transducer' if 'nemo' in d else '')
        else:
            raise ValueError(k)
        self.load_seconds = time.time() - t0
        self.lock = threading.Lock()

    def transcribe(self, samples):
        """Whole-utterance path. Returns (text, seconds)."""
        with self.lock:
            t0 = time.time()
            limit = self.spec.get('max_seconds')
            if limit and len(samples) > limit * SR:
                # Measured 2026-09-05: Moonshine v2 returns nothing past ~8-10 s in one pass, so
                # cut at the quietest moment inside each window and hear the pieces in turn.
                parts = [self._one(p) for p in split_at_pauses(samples, limit)]
                return ' '.join(t for t in parts if t).strip(), time.time() - t0
            return self._one(samples), time.time() - t0

    def _one(self, samples):
            if self.spec['kind'] == 'whisper':
                segs = self.m.transcribe(samples, n_threads=self.threads, language='en')
                text = ' '.join(s.text.strip() for s in segs).strip()
            else:
                st = self.m.create_stream()
                st.accept_waveform(SR, samples)
                self.m.decode_stream(st)
                text = st.result.text.strip()
            return text


def split_at_pauses(x, limit, search=3.0, frame=0.1):
    """Cut x into pieces of at most `limit` seconds, each cut at the quietest 100 ms frame in the
    last `search` seconds of the window, so words are not sliced in half."""
    out, start, n = [], 0, len(x)
    lim, srch, fr = int(limit * SR), int(search * SR), int(frame * SR)
    while n - start > lim:
        lo, hi = start + lim - srch, start + lim
        frames = [(float(np.mean(x[i:i + fr] ** 2)), i) for i in range(lo, hi - fr, fr)]
        cut = min(frames)[1] + fr // 2 if frames else hi
        out.append(x[start:cut]); start = cut
    out.append(x[start:])
    return [p for p in out if len(p) > SR // 10]


class Punct:
    def __init__(self, models_dir, threads=2):
        import sherpa_onnx as so
        d = os.path.join(models_dir, PUNCT_DIR)
        cfg = so.OnlinePunctuationConfig(model_config=so.OnlinePunctuationModelConfig(
            cnn_bilstm=pick(d, 'model*.onnx'), bpe_vocab=pick(d, 'bpe*.vocab'), num_threads=threads))
        self.m = so.OnlinePunctuation(cfg)

    def __call__(self, text):
        return self.m.add_punctuation_with_case(text) if text else text


class Bench:
    def __init__(self, models_dir):
        self.models_dir = models_dir
        self.cache, self.cache_lock = {}, threading.Lock()
        self.punct = None
        self.live = {}  # session id -> state

    def available(self):
        out = {}
        for k, s in ENGINES.items():
            p = os.path.join(self.models_dir, s.get('dir') or s.get('file'))
            out[k] = {**s, 'present': os.path.exists(p)}
        return out

    def engine(self, key, threads):
        with self.cache_lock:
            e = self.cache.get((key, threads))
            if e is None:
                e = self.cache[(key, threads)] = Engine(key, threads, self.models_dir)
            return e

    def punctuate(self, text):
        if self.punct is None:
            self.punct = Punct(self.models_dir)
        return self.punct(text)

    # ---- batch ---------------------------------------------------------------------
    def run_batch(self, samples, keys, threads):
        rows = []
        for k in keys:
            if ENGINES[k].get('stream'):
                continue
            try:
                e = self.engine(k, threads)
                text, secs = e.transcribe(samples)
                if ENGINES[k].get('punct'):
                    text = self.punctuate(text)
                rows.append(dict(key=k, text=text, seconds=round(secs, 2), load=round(e.load_seconds, 1)))
            except Exception as ex:  # a broken model must not hide the others
                rows.append(dict(key=k, error=f'{type(ex).__name__}: {ex}'))
        return rows

    # ---- live ----------------------------------------------------------------------
    def live_start(self, stream_key, chunk_key, threads):
        sid = uuid.uuid4().hex[:8]
        st = dict(stream=None, stream_key=stream_key, chunk_key=chunk_key, threads=threads,
                  buf=np.zeros(0, np.float32), committed='', seg_start=0, chunk_text='',
                  busy=False, last_chunk_run=0.0, lock=threading.Lock(), chunk_ms=0)
        if stream_key:
            e = self.engine(stream_key, threads)
            st['stream'] = (e, e.m.create_stream())
        if chunk_key:
            self.engine(chunk_key, threads)  # warm the cache before the first chunk arrives
        self.live[sid] = st
        return sid

    def live_feed(self, sid, pcm):
        st = self.live[sid]
        with st['lock']:
            st['buf'] = np.concatenate([st['buf'], pcm])
            out = {}
            if st['stream']:
                e, s = st['stream']
                s.accept_waveform(SR, pcm)
                while e.m.is_ready(s):
                    e.m.decode_stream(s)
                raw = e.m.get_result(s).strip()
                out['stream'] = self.punctuate(raw) if raw else ''
            out['chunk'] = st['committed'] + (' ' if st['committed'] and st['chunk_text'] else '') + st['chunk_text']
            out['chunk_ms'] = st['chunk_ms']
        # The chunked re-hear runs outside the lock so audio keeps flowing while it thinks.
        if st['chunk_key'] and not st['busy'] and time.time() - st['last_chunk_run'] > 0.8:
            threading.Thread(target=self._chunk_run, args=(st,), daemon=True).start()
        return out

    def _chunk_run(self, st):
        st['busy'] = True
        try:
            with st['lock']:
                seg = st['buf'][st['seg_start']:].copy()
            if len(seg) < SR // 2:
                return
            e = self.engine(st['chunk_key'], st['threads'])
            t0 = time.time()
            text, _ = e.transcribe(seg)
            if ENGINES[st['chunk_key']].get('punct'):
                text = self.punctuate(text)
            with st['lock']:
                st['chunk_text'] = text
                st['chunk_ms'] = int((time.time() - t0) * 1000)
                st['last_chunk_run'] = time.time()
                # Commit: once a segment passes 12 s and its last 0.8 s is quiet, freeze the
                # text and start a fresh segment, so the window never grows without bound.
                tail = st['buf'][-int(0.8 * SR):]
                if len(seg) > 12 * SR and len(tail) and float(np.sqrt(np.mean(tail ** 2))) < 0.01:
                    st['committed'] = (st['committed'] + ' ' + text).strip()
                    st['chunk_text'] = ''
                    st['seg_start'] = len(st['buf'])
        finally:
            st['busy'] = False

    def live_stop(self, sid):
        st = self.live.pop(sid, None)
        if not st:
            return {}
        out = {}
        if st['stream']:
            e, s = st['stream']
            # Streaming models look ahead a little; without this padding the last word is lost.
            s.accept_waveform(SR, np.zeros(int(2.0 * SR), np.float32))  # measured 2026-09-05: 1 s recovers the last word, 2 s also the final full stop
            s.input_finished()
            while e.m.is_ready(s):
                e.m.decode_stream(s)
            out['stream'] = self.punctuate(e.m.get_result(s).strip())
        if st['chunk_key']:
            seg = st['buf'][st['seg_start']:]
            text = ''
            if len(seg) > SR // 4:
                text, _ = self.engine(st['chunk_key'], st['threads']).transcribe(seg)
                if ENGINES[st['chunk_key']].get('punct'):
                    text = self.punctuate(text)
            out['chunk'] = (st['committed'] + ' ' + text).strip()
        out['audio_seconds'] = round(len(st['buf']) / SR, 1)
        return out


# ---- audio + scoring helpers ----------------------------------------------------------------
def decode_webm(blob):
    """Browser recording (webm/opus or ogg) -> float32 16 kHz mono via ffmpeg."""
    p = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', 'pipe:0', '-f', 'f32le', '-ac', '1', '-ar', str(SR), 'pipe:1'],
                       input=blob, capture_output=True)
    if p.returncode:
        raise RuntimeError(p.stderr.decode(errors='replace')[-400:])
    return np.frombuffer(p.stdout, np.float32)


def norm_words(t):
    return re.sub(r"[^a-z0-9' ]+", ' ', t.lower()).split()


def wer(ref, hyp):
    r, h = norm_words(ref), norm_words(hyp)
    if not r:
        return None
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return round(100 * d[len(h)] / len(r), 1)


# ---- http ------------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    bench: Bench = None

    def log_message(self, fmt, *a):
        sys.stderr.write('%s %s\n' % (time.strftime('%H:%M:%S'), fmt % a)); sys.stderr.flush()

    def _json(self, obj, code=200):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)

    def _body(self):
        return self.rfile.read(int(self.headers.get('Content-Length') or 0))

    def do_GET(self):
        if self.path in ('/', '/index.html'):
            with open(os.path.join(HERE, 'index.html'), 'rb') as f:
                b = f.read()
            self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
        elif self.path == '/engines':
            self._json(dict(engines=self.bench.available(), cpu=os.cpu_count()))
        else:
            self.send_error(404)

    def do_POST(self):
        if self.headers.get('Host', '').split(':')[0] not in ('127.0.0.1', 'localhost'):
            return self.send_error(403)
        try:
            if self.path == '/batch':
                q = json.loads(self.headers.get('X-Bench') or '{}')
                samples = decode_webm(self._body())
                rows = self.bench.run_batch(samples, q.get('engines', []), int(q.get('threads', 4)))
                ref = q.get('reference') or ''
                for r in rows:
                    if 'text' in r:
                        r['wer'] = wer(ref, r['text']) if ref else None
                        r['rtf'] = round(r['seconds'] / max(len(samples) / SR, 0.01), 2)
                self._json(dict(audio_seconds=round(len(samples) / SR, 1), rows=rows))
            elif self.path == '/live/start':
                q = json.loads(self._body())
                sid = self.bench.live_start(q.get('stream') or None, q.get('chunk') or None, int(q.get('threads', 4)))
                self._json(dict(sid=sid))
            elif self.path.startswith('/live/feed/'):
                pcm = np.frombuffer(self._body(), np.int16).astype(np.float32) / 32768.0
                self._json(self.bench.live_feed(self.path.rsplit('/', 1)[1], pcm))
            elif self.path.startswith('/live/stop/'):
                self._json(self.bench.live_stop(self.path.rsplit('/', 1)[1]))
            else:
                self.send_error(404)
        except Exception as ex:
            self._json(dict(error=f'{type(ex).__name__}: {ex}'), 500)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', required=True)
    ap.add_argument('--port', type=int, default=5240)
    ap.add_argument('--no-open', action='store_true')
    a = ap.parse_args()
    Handler.bench = Bench(a.models)
    srv = ThreadingHTTPServer(('127.0.0.1', a.port), Handler)
    url = f'http://127.0.0.1:{a.port}/'
    print('voice bench:', url, flush=True)
    if not a.no_open:
        webbrowser.open(url)
    srv.serve_forever()


if __name__ == '__main__':
    main()
