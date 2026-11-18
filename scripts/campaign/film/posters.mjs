// Renders every poster still: node posters.mjs [filter] [scale] → <out>/<id>.png
// WHY one script: bundling once and rendering all sizes keeps the series consistent.
import { bundle } from '@remotion/bundler';
import { getCompositions, renderStill } from '@remotion/renderer';
import { mkdirSync } from 'node:fs';
const [filter = '', scale = '1', out = 'out/posters'] = process.argv.slice(2);
const serveUrl = await bundle({ entryPoint: new URL('./src/index.ts', import.meta.url).pathname });
const browserExecutable = '/usr/bin/google-chrome-stable';
const comps = (await getCompositions(serveUrl, { browserExecutable })).filter((c) => c.id.startsWith('poster-') && c.id.includes(filter));
mkdirSync(out, { recursive: true });
for (const composition of comps) {
  try {
    await renderStill({ serveUrl, composition, frame: 0, output: `${out}/${composition.id.replace('poster-', '')}.png`, scale: Number(scale), browserExecutable });
    console.log(composition.id);
  } catch (e) {
    // One missing picture should not stop the rest of the series.
    console.error(`FAILED ${composition.id}: ${String(e.message).split('\n')[0]}`);
  }
}
