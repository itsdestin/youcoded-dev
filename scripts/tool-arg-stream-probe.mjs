// Probe: does OpenRouter's deepseek/deepseek-v4-flash-0731 STREAM tool-call
// argument deltas, or buffer them server-side and deliver one blob at the end?
//
// Distinguishes the two explanations for the 2026-08-12 75s watchdog kill:
//   streaming args  -> that turn was a one-off provider stall
//   buffered blob   -> systematic: our watchdog kills every large tool call
//
// Raw fetch + SSE parse on purpose — no AI SDK layers, so what we log is what
// the wire carried. Key: OPENROUTER_API_KEY env var, or a path in KEY_FILE.
// Cost: one ~700-output-token completion (cents).
import { readFileSync } from 'fs';

const key = process.env.OPENROUTER_API_KEY
  ?? (process.env.KEY_FILE ? readFileSync(process.env.KEY_FILE, 'utf8').trim() : null);
if (!key) { console.error('Set OPENROUTER_API_KEY or KEY_FILE.'); process.exit(1); }

const MODEL = process.env.PROBE_MODEL ?? 'deepseek/deepseek-v4-flash-0731';
const t0 = Date.now();
const ts = () => String(Date.now() - t0).padStart(6) + 'ms';

const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: MODEL,
    stream: true,
    max_tokens: 900,
    // Force a tool call with a body big enough that buffering is unmistakable:
    // several seconds of generation, hundreds of arg tokens.
    tool_choice: { type: 'function', function: { name: 'write_file' } },
    tools: [{
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Write a file to disk',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string', description: 'full file content' },
          },
          required: ['path', 'content'],
        },
      },
    }],
    messages: [{
      role: 'user',
      content: 'Write a ~500 word plain-text essay about rivers into essay.txt using the write_file tool.',
    }],
  }),
});

console.log(ts(), 'HTTP', res.status);
if (!res.ok) { console.error(await res.text()); process.exit(1); }

// Minimal SSE parse: count every chunk, log the interesting ones + gaps.
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '', chunks = 0, argChars = 0, lastAt = Date.now(), maxGapMs = 0, firstArgAt = null;
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  const now = Date.now();
  const gap = now - lastAt;
  if (gap > maxGapMs) maxGapMs = gap;
  if (gap > 2000) console.log(ts(), `--- ${gap}ms silent gap ---`);
  lastAt = now;
  buf += dec.decode(value, { stream: true });
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6);
    if (data === '[DONE]') { console.log(ts(), 'DONE'); continue; }
    let j; try { j = JSON.parse(data); } catch { continue; }
    chunks++;
    const d = j.choices?.[0]?.delta;
    const tc = d?.tool_calls?.[0];
    if (tc?.function?.arguments) {
      argChars += tc.function.arguments.length;
      if (firstArgAt == null) { firstArgAt = Date.now() - t0; console.log(ts(), 'FIRST arg delta'); }
    }
    if (d?.reasoning || d?.reasoning_content) process.stdout.write('r');
    if (j.choices?.[0]?.finish_reason) console.log('\n' + ts(), 'finish:', j.choices[0].finish_reason);
  }
}
console.log('\n--- summary ---');
console.log('model:', MODEL);
console.log('SSE chunks:', chunks);
console.log('arg chars total:', argChars);
console.log('first arg delta at:', firstArgAt, 'ms');
console.log('max inter-chunk gap:', maxGapMs, 'ms');
console.log(maxGapMs > 60_000
  ? 'VERDICT: silent-buffering shape — our 75s watchdog WILL kill big tool calls on this route'
  : (argChars > 0 && maxGapMs < 10_000)
    ? 'VERDICT: args stream normally — the 2026-08-12 kill was a genuine provider stall'
    : 'VERDICT: inconclusive — read the log above');
