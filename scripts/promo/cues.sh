#!/bin/bash
# Prints every speech bubble in the film — absolute frame, beat, local frame, length, the backdrop
# theme and the host's costume under it, where the host stands, the text — or the first
# `present()` error (a line that cannot be read in its slot). WHY: the fourth draft had "Golden
# hour" on the wrong theme and three lines that never showed, and nobody could see it without
# rendering. This runs in ~2 s with no browser: esbuild bundles the beats for node, stubbing the
# Google-fonts loaders and webpack's require.context (marks.ts) — that is what the banner does.
# Usage: bash cues.sh [out.json]
set -euo pipefail
cd "$(dirname "$0")"
OUT="${1:-/tmp/promo-cues.json}"
TMP="$(mktemp -d)"
echo "export const loadFont = () => ({ fontFamily: 'stub' });" > "$TMP/fonts-stub.ts"
cat > ./.cues.tmp.ts <<'TS'
import { assemble } from './src/Promo';
import { BEATS, startFrames } from './src/timeline';
import { barFrame } from './src/grid';
import { evaluate, REST } from './src/host/engine';
const a = assemble(BEATS.map((b) => b.id));
const starts = startFrames(barFrame);
const themeAt = (f: number) => [...a.themes].filter((t) => t.at <= f).sort((x, y) => x.at - y.at).at(-1)?.slug;
const out: any[] = [];
for (const c of [...a.bubbles].sort((x, y) => x.at - y.at)) {
  const s = evaluate(a.host, { ...REST, hidden: true, costume: 'midnight' }, c.at + 6);
  const bi = BEATS.findIndex((_b, i) => c.at >= starts[i] && (i === BEATS.length - 1 || c.at < starts[i + 1]));
  out.push({ beat: BEATS[bi].id, local: c.at - starts[bi], at: c.at, until: c.until, sec: +(c.at / 30).toFixed(1), len: +(((c.until ?? 0) - c.at) / 30).toFixed(1), backdrop: themeAt(c.at), costume: s.costume, x: Math.round(s.x), y: Math.round(s.y), size: Math.round(s.size), hidden: s.hidden, alpha: +s.alpha.toFixed(2), peek: +s.peek.toFixed(2), side: c.side, text: c.text });
}
for (const o of out) console.log(JSON.stringify(o));
require('fs').writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
TS
# the entry must live beside src/ for the relative imports (esbuild resolves symlinks): written here, gitignored, removed
FOOTAGE="$(pwd)/public/footage"
npx --no-install esbuild ./.cues.tmp.ts --bundle --platform=node --format=cjs --outfile="$TMP/cues.cjs" --loader:.json=json \
  --alias:@remotion/google-fonts/Inter="$TMP/fonts-stub.ts" --alias:@remotion/google-fonts/Comfortaa="$TMP/fonts-stub.ts" \
  --alias:@remotion/google-fonts/Nunito="$TMP/fonts-stub.ts" --alias:@remotion/google-fonts/SpaceGrotesk="$TMP/fonts-stub.ts" \
  --banner:js="const __fs=require('fs'),__path=require('path');require.context=(dir,deep,re)=>{const base='$FOOTAGE';const keys=__fs.readdirSync(base).filter(k=>re.test(k)).map(k=>'./'+k);const fn=(k)=>JSON.parse(__fs.readFileSync(__path.join(base,k),'utf8'));fn.keys=()=>keys;return fn;};" \
  --log-level=error
rm -f ./.cues.tmp.ts
node "$TMP/cues.cjs" "$OUT" 2>&1 | rg -v '^\s+at ' || true
rm -rf "$TMP"
