// Line splitting that matches the S1 contract: split on byte 0x0a ONLY.
// WHY: Node's readline also splits on lone CR, U+2028 and U+2029, and Claude Code writes U+2028
// raw inside JSON strings (JSON.stringify does not escape it), so readline cut real lines in
// pieces and the first scan reported ~150 false "bad JSON lines". The adapter never had the problem.
import fs from 'node:fs';
export async function* linesOf(p) {
  let carry = Buffer.alloc(0);
  for await (const chunk of fs.createReadStream(p, { highWaterMark: 4 << 20 })) {
    let data = carry.length ? Buffer.concat([carry, chunk]) : chunk; let start = 0, nl;
    while ((nl = data.indexOf(0x0a, start)) !== -1) { yield data.toString('utf8', start, nl); start = nl + 1; }
    carry = Buffer.from(data.subarray(start));
  }
  if (carry.length) yield carry.toString('utf8'); // partial trailing line: reported by the caller via noTrailingNewline
}
