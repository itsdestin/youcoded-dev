// Bounded controller-side evidence; never used inside the measured renderer window.
import { openSync, closeSync, fstatSync, readSync, opendirSync, constants } from 'node:fs';
export const EVIDENCE_BYTES = 5 * 1024 * 1024;
const MAX_RECORDS = 10000;

// WHY: stat-then-readFile permits growth races and allocates the entire file.
// Read only cap+1 bytes through a fixed-size buffer, rejecting growth/oversize.
export function readBoundedText(path, { maxBytes = EVIDENCE_BYTES, io = {
  open: p => openSync(p, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK),
  close: closeSync, size: fd => { const s = fstatSync(fd); if (!s.isFile()) throw Error('evidence must be a regular file'); return s.size; }, read: readSync,
} } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > EVIDENCE_BYTES) throw Error('invalid evidence byte cap');
  const fd = io.open(path), chunks = [];
  let bytes = 0;
  try {
    if (io.size(fd) > maxBytes) throw Error('evidence byte cap exceeded');
    const buffer = Buffer.alloc(Math.min(65536, maxBytes + 1));
    while (true) {
      const n = io.read(fd, buffer, 0, Math.min(buffer.length, maxBytes + 1 - bytes), bytes);
      if (!n) break;
      bytes += n;
      if (bytes > maxBytes) throw Error('evidence byte cap exceeded during read');
      chunks.push(Buffer.from(buffer.subarray(0, n)));
    }
    return Buffer.concat(chunks, bytes).toString('utf8');
  } finally { io.close(fd); }
}

export function* boundedDirectory(path) {
  const directory = opendirSync(path, { bufferSize: 32 });
  try {
    let entry;
    while ((entry = directory.readSync())) yield entry;
  } finally { directory.closeSync(); }
}

// A torn final record can be retried, but a malformed complete line is not healthy.
// Bounds are checked before slicing a line or allocating parsed event objects.
export function* scanJsonLines(text, { maxLineBytes = 1024 * 1024 } = {}) {
  if (Buffer.byteLength(text) > EVIDENCE_BYTES) throw Error('JSONL evidence byte cap exceeded');
  let start = 0, records = 0;
  while (start < text.length) {
    const newline = text.indexOf('\n', start);
    const end = newline < 0 ? text.length : newline;
    if (end - start > maxLineBytes) throw Error('JSONL line byte cap exceeded');
    const line = text.slice(start, end);
    if (Buffer.byteLength(line) > maxLineBytes) throw Error('JSONL line byte cap exceeded');
    if (line.trim()) {
      if (++records > MAX_RECORDS) throw Error('JSONL record cap exceeded');
      let event;
      try { event = JSON.parse(line); }
      catch { if (newline < 0) return; throw Error('invalid JSONL complete record'); }
      yield event;
    }
    start = end + 1;
  }
}

export function makeByteTail(cap = 65536) {
  if (!Number.isSafeInteger(cap) || cap < 1 || cap > EVIDENCE_BYTES) throw Error('invalid output tail cap');
  let tail = Buffer.alloc(0), truncated = false;
  return {
    push(chunk) {
      if (!Buffer.isBuffer(chunk)) throw Error('output tail requires raw Buffer chunks');
      if (tail.length + chunk.length > cap) truncated = true;
      // Slice BEFORE concat; even a huge incoming chunk cannot grow retained storage.
      const keep = chunk.subarray(Math.max(0, chunk.length - cap));
      tail = Buffer.concat([tail.subarray(Math.max(0, tail.length - (cap - keep.length))), keep]);
    },
    text: () => tail.toString('utf8'),
    get truncated() { return truncated; },
  };
}
