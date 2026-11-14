// Bench harness: starts `wrangler dev --local` (no login, 127.0.0.1, random port) and
// speaks the prototype's binary protocol. Throwaway.
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const WRANGLER = path.resolve(here, "../../../../../wecoded-marketplace/worker/node_modules/.bin/wrangler");
const enc = new TextEncoder(), dec = new TextDecoder();

export function pack(h, payload) {
  const hb = enc.encode(JSON.stringify(h));
  const out = new Uint8Array(4 + hb.length + (payload ? payload.byteLength : 0));
  new DataView(out.buffer).setUint32(0, hb.length);
  out.set(hb, 4);
  if (payload) out.set(payload, 4 + hb.length);
  return out;
}
export function unpack(buf) {
  const n = new DataView(buf).getUint32(0);
  return [JSON.parse(dec.decode(new Uint8Array(buf, 4, n))), new Uint8Array(buf, 4 + n)];
}
async function freePort() {
  return new Promise(r => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
}

export async function startServer({ capBytes = 1073741824, persist }) {
  const port = await freePort();
  persist ||= fs.mkdtempSync("/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/t7-state-");
  const child = spawn(WRANGLER, ["dev", "--local", "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", "0",
    "--persist-to", persist, "--var", `CAP_BYTES:${capBytes}`, "--show-interactive-dev-session=false"], {
    cwd: here, env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1", NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", d => log += d); child.stderr.on("data", d => log += d);
  await new Promise((res, rej) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (/Ready on/.test(log)) { clearInterval(iv); res(); }
      else if (Date.now() - t0 > 60000) { clearInterval(iv); rej(new Error("wrangler did not start:\n" + log)); }
    }, 200);
  });
  return { port, pid: child.pid, persist, child, stop: () => { if (process.env.T7_LOG) fs.writeFileSync(process.env.T7_LOG, log); try { process.kill(child.pid); } catch {} } };
}

let nextId = 1;
export class Dev {
  constructor(port, key, device) { this.port = port; this.key = key; this.device = device; this.pending = new Map(); this.events = []; this.onEvent = null; }
  async connect() {
    this.ws = new WebSocket(`ws://127.0.0.1:${this.port}/?key=${this.key}`);
    this.ws.binaryType = "arraybuffer";
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = e => rej(new Error("ws error")); });
    this.ws.onmessage = ev => {
      const [h, p] = unpack(ev.data);
      if (h.id && this.pending.has(h.id)) {
        const slot = this.pending.get(h.id);
        if (h.op === "frame") { slot.frames.push([h, p]); return; }
        this.pending.delete(h.id); slot.res({ h, p, frames: slot.frames });
      } else { this.events.push(h); if (this.onEvent) this.onEvent(h, p); }
    };
    const r = await this.rpc({ op: "auth", device: this.device, sig: "ok:" + this.device });
    if (r.h.r !== "ok") throw new Error("auth failed");
    return this;
  }
  rpc(h, payload) {
    const id = nextId++;
    return new Promise(res => { this.pending.set(id, { res, frames: [] }); this.ws.send(pack({ ...h, id }, payload)); });
  }
  send(h, payload) { this.ws.send(pack(h, payload)); }
  close() { this.ws.close(); }
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export function fmt(n) { return Number(n).toLocaleString("en-US"); }
