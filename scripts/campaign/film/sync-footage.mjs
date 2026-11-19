#!/usr/bin/env node
// Copies the filmed takes (../footage) to where the films read them (public/footage, public/stills,
// public/audio) and writes src/footage.json: each clip's length and the film-second of every
// labelled action. WHY: the films cut to labels ("the moment the lamp switches off"), never to
// hand-measured times, so a re-filmed take drops in without retiming anything.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'footage'), PUB = join(HERE, 'public');
const fresh = (a, b) => !existsSync(b) || statSync(a).mtimeMs > statSync(b).mtimeMs;
mkdirSync(join(PUB, 'footage'), { recursive: true }); mkdirSync(join(PUB, 'stills'), { recursive: true }); mkdirSync(join(PUB, 'audio'), { recursive: true });
const out = {};
for (const f of readdirSync(SRC).filter((n) => n.endsWith('.mp4')).sort()) {
  const name = f.slice(0, -4), marksPath = join(SRC, `${name}.marks.json`);
  if (!existsSync(marksPath)) continue;
  const m = JSON.parse(readFileSync(marksPath, 'utf8'));
  const marks = {};
  for (const a of m.actions) if (a.mark) marks[a.mark] = [a.start, a.end];
  if (fresh(join(SRC, f), join(PUB, 'footage', f))) copyFileSync(join(SRC, f), join(PUB, 'footage', f));
  out[name] = { file: `footage/${f}`, duration: m.duration, marks };
}
writeFileSync(join(HERE, 'src', 'footage.json'), JSON.stringify(out, null, 1) + '\n');
const stills = existsSync(join(SRC, 'stills')) ? readdirSync(join(SRC, 'stills')).filter((n) => /\.(png|jpg|webp)$/.test(n)).sort() : [];
for (const s of stills) if (fresh(join(SRC, 'stills', s), join(PUB, 'stills', s))) copyFileSync(join(SRC, 'stills', s), join(PUB, 'stills', s));
writeFileSync(join(HERE, 'src', 'stills.json'), JSON.stringify(stills.map((s) => `stills/${s}`), null, 1) + '\n');
const MUSIC = join(HERE, '..', 'music', 'out');
const wavs = existsSync(MUSIC) ? readdirSync(MUSIC).filter((n) => n.endsWith('.wav')) : [];
for (const w of wavs) if (fresh(join(MUSIC, w), join(PUB, 'audio', w))) copyFileSync(join(MUSIC, w), join(PUB, 'audio', w));
console.log(`${Object.keys(out).length} clips, ${stills.length} stills, ${wavs.length} audio files`);
