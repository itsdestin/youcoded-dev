// Save a chat reading to disk, then (after an engine restart) restore it and check it is REALLY reused:
// a restore can answer 200 and still re-read everything (Qwen3.8-27B, 2026-11-13) — read prompt_n, not the status.
// Usage (via run.sh): node slot-save.mjs <port> save|restore <words> <slot-dir>
import { call, words, waitUp } from './lib.mjs';
import fs from 'node:fs';
const [port, phase, nWords, dir] = process.argv.slice(2);
const prompt = 'Long fixed: ' + words('qfix', +nWords);
const chat = (extra) => call(port, 'POST', '/v1/chat/completions', { messages: [{ role: 'user', content: prompt + extra }], max_tokens: 1, cache_prompt: true, id_slot: 0 });
await waitUp(port);
if (phase === 'save') {
  const j = (await chat('')).json;
  console.log('cold read', j.timings.prompt_n, 'tokens', (j.timings.prompt_ms / 1000).toFixed(1), 's');
  const s = (await call(port, 'POST', '/slots/0?action=save', { filename: 'chat.bin' })).json;
  console.log('save', JSON.stringify(s), 'file MB', (fs.statSync(dir + '/chat.bin').size / 1048576).toFixed(0));
} else {
  const t0 = Date.now();
  const r = (await call(port, 'POST', '/slots/0?action=restore', { filename: 'chat.bin' })).json;
  console.log('restore', JSON.stringify(r), 'wall ms', Date.now() - t0);
  const j = (await chat('')).json;
  console.log('re-send after restore: read', j.timings.prompt_n, 'tokens', (j.timings.prompt_ms / 1000).toFixed(2), 's, cached', j.timings.cache_n ?? j.usage?.prompt_tokens_details?.cached_tokens);
}
