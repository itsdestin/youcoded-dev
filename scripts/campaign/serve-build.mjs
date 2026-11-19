// Builds the practice app for this worktree and keeps serving it (so takes can run in parallel
// with BASE_URL=http://127.0.0.1:<port>). Also starts the Office editor for the Office takes.
// Prints "SERVING <port> OFFICE <port>" when ready.
import { resolveCheckout, ensureBuild, serve } from '../shoot/engine.mjs';
import { ensureOfficeEditor } from '../shoot/office-editor.mjs';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
const WORKSPACE = join(import.meta.dirname, '..', '..');
const local = join(WORKSPACE, 'youcoded');
const checkout = existsSync(join(local, 'desktop')) ? local : resolveCheckout('');
const log = (m) => console.error(`[serve] ${m}`);
const dist = await ensureBuild(checkout, log);
const s = await serve(dist);
let office = { port: 0 };
try { office = await ensureOfficeEditor(checkout, log); } catch (e) { log('office editor failed: ' + e.message); }
console.log(`SERVING ${s.port} OFFICE ${office.port}`);
setInterval(() => {}, 1 << 30);
