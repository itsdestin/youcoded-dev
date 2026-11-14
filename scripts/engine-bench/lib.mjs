// Tiny HTTP helper without Node fetch's 300 s header timeout (a 27B long read takes longer).
import http from 'node:http';
export const call = (port, method, path, body) => new Promise((res, rej) => {
  const data = body ? JSON.stringify(body) : undefined;
  const r = http.request({ host: '127.0.0.1', port, method, path, agent: false, headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} }, (m) => {
    let s = ''; m.on('data', (c) => s += c); m.on('end', () => { try { res({ status: m.statusCode, json: JSON.parse(s) }); } catch { res({ status: m.statusCode, json: s }); } });
  });
  r.setTimeout(0); r.on('error', rej); if (data) r.write(data); r.end();
});
export const words = (t, n) => Array.from({ length: n }, (_, i) => `${t}${i * 7919 % 100003}`).join(' ');
export const waitUp = async (port) => { for (let i = 0; i < 600; i++) { try { const r = await call(port, 'GET', '/health'); if (r.status === 200) return; } catch {} await new Promise((r) => setTimeout(r, 1000)); } throw new Error('server never came up'); };
