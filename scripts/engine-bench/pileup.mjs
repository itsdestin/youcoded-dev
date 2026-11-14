// Long read on a FRESH engine, three short requests that stay in other slots, then the long read again.
// This is the shape that shows ROCm fading request by request (docs/engine-dependencies.md, "ROCm vs Vulkan, measured").
// Usage (via run.sh): node pileup.mjs <port> <label> <model-name>
import { call, words, waitUp } from './lib.mjs';
const [port, tag, M] = process.argv.slice(2);
await waitUp(port);
const post = async (body) => (await call(port, 'POST', '/v1/chat/completions', body)).json;
const long = async (label) => { const j = await post({ model: M, messages: [{ role: 'user', content: `Long ${Date.now()}: ` + words(label === 'FRESH' ? 'qa' : 'qb', 4000) }], max_tokens: 1, cache_prompt: false });
  if (!j.timings) { console.log(tag, M, label, 'FAILED', JSON.stringify(j).slice(0, 300)); return; }
  console.log(tag, M, label, 'long read', j.timings.prompt_n, 'tok', (j.timings.prompt_ms / 1000).toFixed(1), 's =', j.timings.prompt_per_second.toFixed(1), 't/s'); };
await long('FRESH');
for (let r = 0; r < 3; r++) { const j = await post({ model: M, messages: [{ role: 'user', content: `Run ${Date.now()}: ` + words('w' + r, 1200) }], max_tokens: 20, cache_prompt: false });
  console.log(tag, M, 'short', r, 'read t/s', j.timings?.prompt_per_second?.toFixed(1), 'write t/s', j.timings?.predicted_per_second?.toFixed(1)); }
await long('AFTER-PILEUP');
