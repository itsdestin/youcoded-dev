// Bounded private protocol, checked BEFORE handing objects to process.send.
import { types } from 'node:util';
export const PROTOCOL_CAPS = Object.freeze({ bytes: 65536, records: 512, depth: 12, array: 128, sends: 16, requests: 8 });
export function assertProtocolEnvelope(value) {
  let bytes = 0, records = 0;
  const active = new Set();
  const add = n => { bytes += n; if (bytes > PROTOCOL_CAPS.bytes) throw Error('IPC byte cap exceeded'); };
  const string = text => {
    if (text.length > PROTOCOL_CAPS.bytes - bytes) throw Error('IPC byte cap exceeded');
    add(2);
    for (let i=0;i<text.length;i++) {
      const c = text.charCodeAt(i);
      if (c < 32) add(6);
      else if (c === 34 || c === 92) add(2);
      else if (c >= 0xd800 && c <= 0xdbff && i+1<text.length && text.charCodeAt(i+1)>=0xdc00 && text.charCodeAt(i+1)<=0xdfff) { add(4); i++; }
      else if (c>=0xd800 && c<=0xdfff) add(6);
      else add(c<128 ? 1 : c<2048 ? 2 : 3);
    }
  };
  const visit = (item,depth) => {
    if (++records > PROTOCOL_CAPS.records || depth > PROTOCOL_CAPS.depth) throw Error('IPC record/depth cap exceeded');
    if (item === null || item === undefined) { add(4); return; }
    if (typeof item === 'string') { string(item); return; }
    if (typeof item === 'number') { if (!Number.isFinite(item)) throw Error('IPC nonfinite number'); add(32); return; }
    if (typeof item === 'boolean') { add(5); return; }
    if (typeof item !== 'object' || types.isProxy(item) || active.has(item)) throw Error('IPC unsafe/cyclic value');
    const array = Array.isArray(item), prototype=Object.getPrototypeOf(item);
    if (array ? prototype!==Array.prototype : prototype!==Object.prototype && prototype!==null) throw Error('IPC nonplain object');
    // JSON IPC invokes toJSON even when non-enumerable; never allow an unscanned
    // hook/accessor to allocate or substitute a larger envelope after preflight.
    if (Object.getOwnPropertyDescriptor(item,'toJSON') || (prototype && Object.getOwnPropertyDescriptor(prototype,'toJSON'))) throw Error('IPC serialization hook rejected');
    active.add(item); add(2);
    if (array) {
      if (item.length>PROTOCOL_CAPS.array) throw Error('IPC array/member cap exceeded');
      for(let i=0;i<item.length;i++) { const d=Object.getOwnPropertyDescriptor(item,String(i)); if(d && !('value' in d)) throw Error('IPC accessor'); add(1); visit(d?.value,depth+1); }
    } else for(const key in item) {
      const d=Object.getOwnPropertyDescriptor(item,key); if(!d?.enumerable) continue;
      if(!('value' in d)) throw Error('IPC accessor');
      if(++records>PROTOCOL_CAPS.records) throw Error('IPC record cap exceeded');
      string(key); add(2); visit(d.value,depth+1);
    }
    active.delete(item);
  };
  visit(value,0); return bytes;
}
// Both normal retirement and startup-fatal paths must stop waiting when an IPC
// callback never fires. This timer is local to the worker, not its controller.
export function sendFinalAndDisconnect(channel, send, message, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let finished=false, timer;
  const disconnect=()=>{if(finished)return;finished=true;clearTimer(timer);if(channel.connected)channel.disconnect();};
  timer=setTimer(disconnect,250);
  try { if(!channel.connected || !send(message,disconnect)) disconnect(); }
  catch { disconnect(); }
  return disconnect;
}

export function makeBoundedSender(channel, fail) {
  let pending=0, failed=false;
  return (message, completed=()=>{}) => {
    if (failed || !channel.connected) return false;
    try { assertProtocolEnvelope(message); }
    catch { failed=true; fail('IPC-envelope-cap'); return false; }
    if (pending>=PROTOCOL_CAPS.sends) { failed=true; fail('IPC-outstanding-cap'); return false; }
    pending++;
    try { channel.send(message,error=>{ pending--; if(error) { failed=true; fail('IPC-send-error'); } completed(error); }); }
    catch { pending--; failed=true; fail('IPC-send-error'); return false; }
    return true;
  };
}
