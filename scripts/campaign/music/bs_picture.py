#!/usr/bin/env python3
"""Reads the "Make it mine" picture's own timeline (film/src/round2/take2.tsx + footage.json) so the score is
fitted to the edit as it IS, never to a hand-copied list of seconds.
WHY (round four review): the score's drop sat 500 ms before the look change and its typing was placed for an
older cut, because the times were typed in by hand. Now the film is the single source: this compiles take2.tsx
with the film's own esbuild (nothing in the film is edited; the module is loaded with a few extra exports and
with its React/Remotion imports stubbed out), calls its shot-list builders, and maps every footage mark into
film time through the shots that actually play it:
  - typing: a shot playing a footage `type*` stretch at true speed (rate 1) -> a typing pocket in film time;
  - sends:  a `send*` mark that is on screen -> the moment a message is sent;
  - looks:  every exported T_* constant (T_LOOK1, T_LOOK2, T_EMAIL, T_BEFORE, T_AFTER ...).
Usage: python bs_picture.py   (prints what it found; bs_mine.py imports timeline())"""
import json, os, re, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
FILM = os.path.normpath(os.path.join(HERE, '..', 'film'))
SRC = os.path.join(FILM, 'src', 'round2', 'take2.tsx')

# WHY a JS program kept inside this Python file: the score folder stays one language for the owner to follow, and
# nothing is added to the film project. It runs from the film folder so it uses the film's own esbuild.
_JS = r"""
const path = require('path'), fs = require('fs');
const esbuild = require(path.join(process.cwd(), 'node_modules', 'esbuild'));
const src = process.argv[1];
let code = fs.readFileSync(src, 'utf8');
const consts = [...code.matchAll(/(?:^|[\s,])(T_[A-Z0-9_]+)\s*=\s*[-\d.]/gm)].map(m => m[1]);
const segFns = [...code.matchAll(/^const (\w+Segs)\s*=/gm)].map(m => m[1]);
code += `\nexport const __consts = { ${[...new Set(consts)].join(', ')} };\nexport const __segs = { ${segFns.join(', ')} };\n`;
const stub = `
  const manifest = require(${JSON.stringify(path.join(process.cwd(), 'src', 'footage.json'))});
  export const mark = (clip, label, edge = 'start') => { const c = manifest[clip]; if (!c) return 0;
    const m = c.marks[label]; if (!m) throw new Error('no mark ' + clip + ' ' + label); return edge === 'start' ? m[0] : m[1]; };
  const Any = new Proxy(function () { return null; }, { get: () => Any, apply: () => null });
  export default Any;
  export const Day = Any, EndCard = Any, Line = Any, HomeUI = Any, KawaiiEmail = Any, MoneyUI = Any, AbsoluteFill = Any,
    Audio = Any, Freeze = Any, OffthreadVideo = Any, Sequence = Any, interpolate = () => 0, spring = () => 0,
    staticFile = (s) => s, useCurrentFrame = () => 0, EASE_IN = (x) => x, EASE_IN_OUT = (x) => x, EASE_OUT = (x) => x, FPS = 30;
`;
esbuild.build({
  stdin: { contents: code, resolveDir: path.dirname(src), sourcefile: 'take2.tsx', loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent',
  plugins: [{ name: 'stub', setup(b) {
    b.onResolve({ filter: /^(react|remotion|\.\.\/kit|\.\.\/brand|\.\/take2-ui)$/ }, a => ({ path: a.path, namespace: 'stub' }));
    b.onResolve({ filter: /footage\.json$/ }, a => ({ path: path.join(process.cwd(), 'src', 'footage.json') }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: stub, loader: 'js', resolveDir: process.cwd() }));
  } }],
}).then(r => {
  const mod = {}; const fn = new Function('module', 'exports', 'require', r.outputFiles[0].text);
  fn(mod, mod.exports = {}, require);
  const E = mod.exports;
  const segs = []; for (const [k, f] of Object.entries(E.__segs)) for (const s of f()) segs.push({ ...s, group: k });
  const manifest = require(path.join(process.cwd(), 'src', 'footage.json'));
  const marks = {}; for (const s of segs) marks[s.clip] = manifest[s.clip] ? manifest[s.clip].marks : {};
  console.log(JSON.stringify({ consts: E.__consts, segs, marks }));
}).catch(e => { console.error(String(e)); process.exit(1); });
"""


def _raw():
    r = subprocess.run(['node', '-e', _JS, SRC], cwd=FILM, capture_output=True, text=True, timeout=60)
    if r.returncode:
        raise RuntimeError('reading take2.tsx failed: ' + r.stderr.strip()[-600:])
    return json.loads(r.stdout)


def _to_film(seg, ft):
    """Footage time ft -> film time, if this shot plays it (else None)."""
    rate = seg.get('rate') or 1.0
    t = seg['at'] + (ft - seg['from']) / rate
    return t if seg['at'] - 1e-6 <= t <= seg['out'] + 1e-6 else None


# WHY (round five review): the 2026-11-20 re-cut stopped exporting T_AFTER, so `import bs_mine` died with a bare
# KeyError and no film could be rebuilt. The payoff's times are still written in take2.tsx, just inline. Each
# constant the score needs is now taken from an exported T_* if there is one, else read from the line of the
# picture's code that does that job; if neither exists the build stops with a sentence naming what is missing.
_FALLBACKS = {
    # name: (regex on take2.tsx, what it is, in words)
    'T_AFTER': (r'const r = t < ([\d.]+)\s*\?', 'when the "after" window rises in the payoff'),
    'T_MONEY': (r'const money = t >= ([\d.]+)', 'when the payoff window switches to the money page'),
    'T_LINE1': (r'<Line text="stop waiting[^>]*?at=\{([\d.]+)\}', 'when the first closing line appears'),
    'T_LINE2': (r'<Line text="make anything[^>]*?at=\{([\d.]+)\}', 'when the second closing line appears'),
    'T_END': (r'<EndCard at=\{([\d.]+)\}', 'when the end card lands'),
}
REQUIRED = ('T_LOOK1', 'T_LOOK2', 'T_EMAIL', 'T_BEFORE', 'T_AFTER', 'T_MONEY', 'T_LINE1', 'T_LINE2', 'T_END')


def _fill_consts(consts):
    code = open(SRC, encoding='utf8').read()
    c = dict(consts)
    for k, (pat, what) in _FALLBACKS.items():
        if k not in c:
            mm = re.search(pat, code)
            if mm:
                c[k] = float(mm.group(1))
    missing = [k for k in REQUIRED if k not in c]
    if missing:
        raise SystemExit('The Make it mine score cannot find these picture times in film/src/round2/take2.tsx: '
                         + '; '.join(f'{k} ({_FALLBACKS[k][1] if k in _FALLBACKS else "exported constant"})' for k in missing)
                         + '. Export them from take2.tsx (for example `export const T_AFTER = 46.5`) and run mix-r2.sh again.')
    return c


def timeline():
    """{'consts': {T_*: s}, 'typing': [(t0, t1)], 'sends': [t], 'cuts': [t]} in film seconds, sorted."""
    d = _raw()
    d['consts'] = _fill_consts(d['consts'])
    typing, sends, cuts = [], [], set()
    for s in d['segs']:
        cuts.add(round(s['at'], 3))
        mk = d['marks'].get(s['clip'], {})
        rate = s.get('rate') or 1.0
        for lab, (a, b) in mk.items():
            if lab.startswith('type') and abs(rate - 1.0) < 0.02:
                # the part of the typed stretch this shot shows, in film time
                fa, fb = max(a, s['from']), min(b, s['from'] + (s['out'] - s['at']) * rate)
                if fb - fa > 0.1:
                    typing.append((round(_to_film(s, fa), 3), round(_to_film(s, fb), 3)))
            if lab.startswith('send'):
                t = _to_film(s, a)
                if t is not None:
                    sends.append(round(t, 3))
    # where each part of the film starts (lookSegs -> 'look', homeSegs -> 'home', ...): the score's sections
    groups = {}
    for s in d['segs']:
        g = s['group'][:-4]
        groups[g] = min(groups.get(g, 1e9), s['at'])
    return dict(consts=d['consts'], typing=sorted(set(typing)), sends=sorted(set(sends)), cuts=sorted(cuts), groups=groups)


if __name__ == '__main__':
    tl = timeline()
    print('constants:', tl['consts'])
    print('typing (film s):', tl['typing'])
    print('sends:', tl['sends'])
    print('cuts:', tl['cuts'])
    print('parts:', tl['groups'])
