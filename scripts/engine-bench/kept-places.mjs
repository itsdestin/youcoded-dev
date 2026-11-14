// Does each chat keep its place when several chats share one context pool?
// Usage: ENGINE_DIR=<dir> MODEL=<file.gguf> node kept-places.mjs <ctx> [port=9990]. Measured 2026-11-12: 32k keeps two chats, 64k three.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const [ctx, port] = [Number(process.argv[2]), Number(process.argv[3] || 9990)];
const BIN = process.env.ENGINE_DIR + '/llama-server';   // a SEPARATE engine copy, never the live app's
const MODEL = process.env.MODEL;                        // path to a .gguf
const log = fs.createWriteStream(new URL(`./slot-test-${ctx}.log`, import.meta.url));
const srv = spawn(BIN, ['-m', MODEL, '--port', String(port), '--host', '127.0.0.1', '-c', String(ctx), '--jinja',
  '--no-cache-idle-slots', '--spec-default', '--cache-type-k', 'q8_0'], { stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.pipe(log); srv.stderr.pipe(log);
const base = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 120; i++) { try { const r = await fetch(base + '/health'); if (r.ok) break; } catch {} await sleep(500); }
const tok = async (t) => (await (await fetch(base + '/tokenize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: t }) })).json()).tokens.length;
const lines = (tag, n) => Array.from({ length: n }, (_, i) => `${tag} note ${i}: item ${(i * 7919) % 1000} was checked against rule ${(i * 31) % 97} and kept.`).join('\n');
// One shared opening of ~14k tokens, like the app's instructions.
let n = 700; let opening = lines('Opening', n);
const per = (await tok(opening)) / n; opening = lines('Opening', Math.round(14000 / per));
const openTok = await tok(opening);
const props = await (await fetch(base + '/props')).json();
console.log(JSON.stringify({ ctx, slots: props.total_slots, n_ctx_per_slot: props.default_generation_settings?.n_ctx, openingTokens: openTok }));
const chats = { A: opening + '\n\nChat A begins.', B: opening + '\n\nChat B begins.', C: opening + '\n\nChat C begins.' };
const slotOf = { A: 0, B: 1, C: 2 };
let step = 0;
async function send(name, addTokens, label) {
  if (addTokens) chats[name] += '\n' + lines(`${name}-turn${step}`, Math.round(addTokens / per));
  const t0 = Date.now();
  const r = await fetch(base + '/completion', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: chats[name], n_predict: 1, cache_prompt: true, id_slot: slotOf[name] }) });
  const j = await r.json();
  console.log(JSON.stringify({ step: ++step, chat: name, label, status: r.status, promptTokens: (j.tokens_cached ?? 0), newlyRead: j.timings?.prompt_n, ms: Date.now() - t0, err: j.error?.message }));
}
await send('A', 0, 'open A');
await send('B', 0, 'open B');
await send('A', 300, 'A follow-up');
await send('B', 300, 'B follow-up');
await send('C', 0, 'open C (third chat)');
await send('A', 300, 'A follow-up after C opened');
await send('B', 300, 'B follow-up after C opened');
await send('C', 300, 'C follow-up');
await send('A', 8000, 'A grows by 8k');
await send('B', 300, 'B follow-up after A grew');
await send('C', 300, 'C follow-up after A grew');
await send('A', 300, 'A follow-up at the end');
srv.kill('SIGTERM'); await sleep(500);
const text = fs.readFileSync(new URL(`./slot-test-${ctx}.log`, import.meta.url), 'utf8');
console.log('purge lines:', (text.match(/.*purg.*/gi) || []).slice(0, 12).join('\n') || 'none');
