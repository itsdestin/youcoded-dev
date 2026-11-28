// release-lines.mjs — "what users will notice": one to three plain lines per merged change, written when it lands.
//
// WHY (Destin, 2026-11-14: "fine with option a" — the assistant that did the work writes the line when the work
// lands; "a changelog draft would be cool"): the release list showed working titles ("Release safety batch",
// "wave 2 batch") that mean nothing to a user, and the 1.4.0 changelog was empty with 44 changes to translate by
// hand. WHY lines hang on the CHANGE, not the work item: measured 2026-11-14, only 16 of 44 merged changes were
// linked to exactly one finished work item; the rest had none or were batches touching several.
//
// WHY one append-only text file inside cards/: it rides the existing "saved straight to master" path
// (cards-master.mjs commits cards/), so every chat and the Work board see a new line within seconds, and two
// chats adding lines at once touch different lines of the file.
//
// One line of the file:   - youcoded#725 fixes | Long messages now send instead of being cut off.
// WHY no read/unread mark (Destin, 2026-11-14: "kinda confused about the point", "yeah remove those"): a tick per
// line was built first, but he does not review lines one by one; editing the changelog draft is the check. Older
// lines saved with a "[ ]" box still read fine and lose the box the next time the file is saved.
//   change = youcoded#<pull request> or youcoded@<first 9 of a commit> · group = new | fixes | behind
//
// Tests: node --test scripts/release-lines.test.mjs

import fs from 'node:fs';
import path from 'node:path';

export const LINES_FILE = path.join('cards', 'release-lines.md');
export const LINE_GROUPS = ['new', 'fixes', 'behind'];
export const NOTHING = 'Nothing visible.';
const HEADER = '# What users will notice\n\nOne to three lines per merged change, written when it lands by `node scripts/cards.mjs notice`. Read by the Work board\'s "Since the last release" list and its changelog draft.\n\n';
const ROW = /^- (?:\[[ x]\] )?(\S+) (new|fixes|behind) \| (.+)$/;

/** "725", "#725", "youcoded#725", "youcoded@abc123def" → the stored form. Throws on anything else. */
export function changeKey(s) {
  const t = String(s ?? '').trim();
  if (/^#?\d+$/.test(t)) return `youcoded#${t.replace('#', '')}`;
  if (/^[a-z][a-z0-9-]*#\d+$/.test(t)) return t;
  const m = /^([a-z][a-z0-9-]*)@([0-9a-f]{7,40})$/.exec(t);
  if (m) return `${m[1]}@${m[2].slice(0, 9)}`;
  throw new Error(`--change must be a pull request (725 or youcoded#725) or a commit (youcoded@<sha>), not "${t}"`);
}

export function parseLines(text) {
  return String(text || '').split('\n').map((l) => ROW.exec(l)).filter(Boolean)
    .map((m) => ({ change: m[1], group: m[2], text: m[3].trim() }));
}

export function loadLines(root) {
  try { return parseLines(fs.readFileSync(path.join(root, LINES_FILE), 'utf8')); } catch { return []; }
}

function write(root, rows) {
  const file = path.join(root, LINES_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // WHY the header is rewritten each time: the file holds nothing but the header and the lines, so there is nothing else to keep
  fs.writeFileSync(file, HEADER + rows.map((r) => `- ${r.change} ${r.group} | ${r.text}`).join('\n') + '\n');
}

/**
 * Set a change's lines (replacing any it had).
 * `texts` is 1–3 lines, or [] with nothing:true for a change nobody will see.
 */
export function setLines(root, change, group, texts, { nothing = false } = {}) {
  const key = changeKey(change);
  let lines = (texts || []).map((t) => String(t).replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (nothing) { lines = [NOTHING]; group = 'behind'; }
  if (!LINE_GROUPS.includes(group)) throw new Error(`--group must be one of ${LINE_GROUPS.join(', ')} (new: people will see or feel it; fixes: a problem that no longer happens; behind: nothing to see in the app)`);
  if (!lines.length) throw new Error('give one to three --line "…", or --nothing for a change nobody will see');
  // WHY three at most (Destin's deck, 2026-11-14): a batch can have a few noticeable things, but a longer list is a changelog, not a line
  if (lines.length > 3) throw new Error('at most three lines per change — keep the three people will notice most');
  for (const t of lines) {
    if (t.length > 160) throw new Error(`a line is ${t.length} characters; keep it under 160 so it reads as one sentence: "${t.slice(0, 60)}…"`);
    if (t.includes('|')) throw new Error('a line cannot contain "|"');
  }
  const file = path.join(root, LINES_FILE);
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const rows = parseLines(prev).filter((r) => r.change !== key).concat(lines.map((text) => ({ change: key, group, text })));
  write(root, rows);
  return { change: key, group, lines };
}
