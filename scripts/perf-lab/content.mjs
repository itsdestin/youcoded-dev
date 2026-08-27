// perf-lab realistic transcript content generator.
//
// WHY THIS FILE EXISTS
// -------------------
// fixture.mjs's `transcriptLines()` writes assistant turns whose content is a
// sentence of random words. That is the CHEAPEST thing this app can render: one
// <p> of text. Real conversations with YouCoded are full of syntax-highlighted
// code blocks, Edit-tool diffs, tool cards and multi-kilobyte log dumps — all of
// which cost far more per message than prose. So the rig's headline numbers
// ("resuming 50,000 messages blocks the renderer for ~124s") are a FLOOR, not a
// measurement of what the owner actually pays.
//
// This module generates transcript content that looks like a real coding
// session, in the exact JSONL shapes the app's two consumers accept. It is
// import-only: the controller wires it into fixture.mjs. Nothing here reads the
// clock or the entropy pool.
//
// THE TWO CONSUMERS (both must accept every line we write)
// -------------------------------------------------------
// 1. session-browser.ts `loadHistory()` (src/main/session-browser.ts:660-721) —
//    the session-list preview + the rig's `ipcAllMs` metric. It is BRUTALLY
//    narrow: it keeps only
//      user      → has `uuid`, has `promptId`, NOT `isMeta`, non-empty text
//      assistant → `message.stop_reason === 'end_turn'`, non-empty `text` blocks
//    It drops `tool_use` and `tool_result` blocks entirely
//    (session-browser.ts:702, :714 both filter `b.type === 'text'`).
//
// 2. transcript-watcher.ts `parseTranscriptLine()` (src/main/transcript-watcher.ts:18)
//    — the RESUME path, which is what `resumeStableMs` measures. This one does
//    render tool cards and diffs. Its rules differ from loadHistory's in ways
//    that matter here (see the per-shape notes below).
//
// THE INVARIANT THE RIG DEPENDS ON
// --------------------------------
// scenario-history.mjs:184 asserts `loadHistory(all).length === 2 * turns` and
// aborts the whole run if it disagrees. So EVERY turn this module emits
// contributes EXACTLY TWO loadHistory-visible messages — one user prompt and one
// final `end_turn` assistant message — no matter how many intermediate tool
// lines it writes. Intermediate lines are invisible to loadHistory by
// construction (assistant tool turns carry `stop_reason: 'tool_use'`; tool_result
// user lines carry no `promptId`), which is also exactly how real Claude Code
// JSONL behaves. `messagesPerTurn` below is that count, exported so the
// controller never has to re-derive it.

// WHAT ACTUALLY MAKES A TRANSCRIPT EXPENSIVE TO RENDER (measured from the code)
// ----------------------------------------------------------------------------
// This drove every content choice below, so it is recorded here rather than in a
// doc that can drift away from the generator.
//
//  1. ASSISTANT MARKDOWN IS PARSED AND SYNTAX-HIGHLIGHTED SYNCHRONOUSLY INSIDE
//     THE REACT RENDER. MarkdownContent renders react-markdown at
//     MarkdownContent.tsx:296 with FOUR tree passes over every message:
//     remark-gfm, then rehype-highlight (:37), rehypeMarkBlockCode (:22, a full
//     visitParents), and rehypeFilepathTokens (:66, another full visitParents
//     that runs detectFilepaths on EVERY text node). rehype-highlight is
//     highlight.js 11 via lowlight, registered with the whole `common` set
//     (~37 grammars) because no `languages` option is passed. On top of that,
//     the <pre> override at MarkdownContent.tsx:187 calls hastText(node) — a
//     full recursive walk of the code subtree — on every render of every code
//     block, purely to build the Copy button payload.
//     => A fenced code block is the single most expensive thing per byte, and
//        NOTHING in fixture.mjs's plain-prose filler ever produced one.
//
//  2. THE TIMELINE IS NOT VIRTUALIZED. ChatView.tsx:764 plainly maps the full
//     timeline. There is no react-window / virtuoso / tanstack-virtual anywhere
//     in the renderer, and the containment that would have made an unvirtualized
//     list survivable was deliberately removed — globals.css:801-806 records
//     that `content-visibility: auto` was dropped because its implicit
//     `contain: paint` clipped theme box-shadow glows, leaving only
//     `contain: layout style`, which does NOT skip offscreen work.
//     => Cost is O(total transcript), not O(visible), which is exactly why the
//        content of old turns matters and why this file exists.
//
//  3. TOOL RESULT BODIES ARE COLLAPSED AND UNMOUNTED BY DEFAULT.
//     ToolCard.tsx:1083 renders the body only when `expanded`, and
//     useExpandAllToggle.ts:24-28 defaults it to false. A tool_use renders its
//     header without needing the tool_result at all.
//     => THIS IS THE TRAP FOR THIS FIXTURE: a giant payload hidden in a
//        tool_result costs almost nothing on resume. So every expensive payload
//        here (code, diff, log dump) is ALSO placed in the assistant's TEXT,
//        where it is unconditionally parsed and highlighted. Putting it only in
//        tool results would have produced a fixture that looked rich and
//        measured cheap.
//
//  4. WHEN A TOOL BODY *IS* EXPANDED IT MINTS ~3-4 DOM NODES PER LINE WITH NO
//     CAP. UnifiedDiff.tsx:167-176 builds a flex row + gutter/glyph/text spans
//     per diff line, and its 15-line "preview" is CSS max-height only
//     (:129-132) — a 2,000-line diff still mounts 2,000 rows. ReadView does the
//     same (ToolBody.tsx:548-573, comment: "All rows always render (no
//     virtualization needed)"). Diff text is NOT highlighted (:175).
//     => The `diff` kind emits BOTH a structuredPatch (the real diff-card path,
//        collapsed) and a ```diff fence in the answer text (always rendered and
//        tokenized — `diff` is in lowlight's common set, verified).
//
//  5. USER MESSAGES ARE CHEAP BY COMPARISON. UserMessage.tsx renders NO
//     markdown (:17-25, :53) — just detectFilepaths + a span per flowing
//     keyword. So user-prompt richness is not where cost lives; prompts here
//     stay short and realistic rather than being padded.
//
//  6. COMPLETED TURNS ARE MEMOIZED, BUT ONLY AGAINST RE-RENDER, NOT AGAINST
//     FIRST RENDER. assistantTurnPropsAreEqual (AssistantTurnBubble.tsx:344-363)
//     exists precisely because re-parsing markdown "was the dominant per-frame
//     cost while Claude types". On a RESUME every turn is a first render, so the
//     memo saves nothing and the full cost above is paid for all N turns at once.
//     => That is the freeze the rig is trying to size.

/** loadHistory-visible messages produced per turn. See the note above — the rig
 *  asserts on this, so it is a contract, not a coincidence. */
export const messagesPerTurn = 2;

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------
// WHY a seeded PRNG and not Math.random(): the rig compares runs against each
// other. If the fixture body changed between runs, every delta would be noise
// and no regression could ever be attributed. Same seed + same index => the same
// bytes, forever.

/** FNV-1a 32-bit string hash — mixes a label into the seed so two different
 *  content slots at the same index don't draw the same stream. */
function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small, fast, well-distributed 32-bit PRNG. Chosen over the LCG
 *  in fixture.mjs because an LCG's low bits cycle with a short period — the
 *  reason fixture.mjs has to take the HIGH bits by hand (fixture.mjs:65-66).
 *  mulberry32 has no such caveat, so every draw here is usable as-is. */
function mulberry32(a) {
  let s = a >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a PRNG for one (seed, label) slot. `label` keeps the prose stream, the
 *  code stream and the uuid stream from being correlated. */
function rngFor(seed, label) {
  return mulberry32((hashString(String(seed)) ^ hashString(label)) >>> 0);
}

function int(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * RFC-4122-shaped v4 uuid drawn from the PRNG instead of crypto.randomUUID().
 *
 * WHY: fixture.mjs uses randomUUID(), so its transcripts differ byte-for-byte
 * between runs (its own comment at fixture.mjs:58 admits "only the uuids
 * differ"). uuids are the dedup key in BOTH consumers
 * (session-browser.ts:686 `lastParsedByUuid`, transcript-watcher.ts:34 +
 * :687 `seenUuidsRecent`), so they must be unique across the file — but they do
 * not have to be unpredictable. Deterministic uuids make a whole transcript
 * reproducible, which is what the rig actually needs.
 *
 * Collision risk: 122 random bits per uuid, drawn from a 32-bit-state PRNG. The
 * PRNG's period (2^32) is the real bound, and each turn draws a fresh stream
 * seeded from its own index, so uuids are unique in practice — the test suite
 * asserts this over 2,000 turns rather than trusting the argument.
 */
function uuidFrom(rng) {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 32; i++) {
    if (i === 12) { out += '4'; continue; }                      // version nibble
    if (i === 16) { out += hex[8 + Math.floor(rng() * 4)]; continue; } // variant nibble
    out += hex[Math.floor(rng() * 16)];
  }
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}-${out.slice(20)}`;
}

// ---------------------------------------------------------------------------
// Vocabulary — the raw material every generator draws from
// ---------------------------------------------------------------------------
// Deliberately domain-flavoured (this app's own vocabulary), so the fixture also
// reads plausibly in a screenshot rather than looking like lorem ipsum.

const NOUNS = ['reducer', 'transcript', 'session', 'watcher', 'renderer', 'handler', 'payload', 'channel', 'bridge', 'store', 'worker', 'fixture', 'harness', 'snapshot', 'queue', 'buffer', 'cursor', 'token', 'binding', 'manifest'];
const VERBS = ['parses', 'dedupes', 'replays', 'flushes', 'resolves', 'batches', 'streams', 'validates', 'normalizes', 'reconciles', 'schedules', 'hydrates'];
const ADJS = ['stale', 'pending', 'streamed', 'cached', 'partial', 'orphaned', 'idle', 'bounded', 'resumed', 'inflight'];
const CONNECT = ['because', 'so that', 'which means', 'unless', 'while', 'after'];

function sentence(rng, words) {
  const parts = [];
  for (let i = 0; i < words; i++) {
    const r = rng();
    if (r < 0.34) parts.push(pick(rng, NOUNS));
    else if (r < 0.58) parts.push(pick(rng, VERBS));
    else if (r < 0.78) parts.push(pick(rng, ADJS));
    else parts.push(pick(rng, CONNECT));
  }
  const s = parts.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

/**
 * A prose paragraph that sometimes names a real-looking file path and an inline
 * `identifier`.
 *
 * WHY this is not cosmetic: MarkdownContent runs a THIRD rehype pass,
 * `rehypeFilepathTokens` (MarkdownContent.tsx:66-113), which `visitParents` over
 * every text node, runs `detectFilepaths` on each, and SPLICES new hast nodes in
 * where it matches. Prose with no path-shaped token never triggers the splice,
 * so filler made of bare words (which is all fixture.mjs:59-68 produced)
 * measures that pass at its cheapest. Real answers are full of paths.
 */
function paragraph(rng, sentences = 3) {
  const out = [];
  for (let i = 0; i < sentences; i++) {
    let s = sentence(rng, int(rng, 8, 18));
    const r = rng();
    if (r < 0.35) s = s.slice(0, -1) + ` in \`${pick(rng, FILE_PATHS)}\`.`;
    else if (r < 0.6) s = s.slice(0, -1) + ` via \`${ident(rng)}()\`.`;
    out.push(s);
  }
  return out.join(' ');
}

const IDENT_HEADS = ['load', 'parse', 'resolve', 'flush', 'apply', 'collect', 'emit', 'reduce', 'build', 'watch', 'attach', 'prune'];
const IDENT_TAILS = ['Transcript', 'Session', 'Payload', 'Snapshot', 'ToolCall', 'Message', 'Fixture', 'Window', 'Buffer', 'Index'];

function ident(rng) {
  return pick(rng, IDENT_HEADS) + pick(rng, IDENT_TAILS);
}

const FILE_PATHS = [
  'src/main/transcript-watcher.ts',
  'src/main/session-browser.ts',
  'src/renderer/state/chat-reducer.ts',
  'src/renderer/components/AssistantTurnBubble.tsx',
  'src/shared/types.ts',
  'src/main/ipc-handlers.ts',
  'scripts/perf-lab/run.mjs',
];

// ---------------------------------------------------------------------------
// Code-block bodies, one generator per language
// ---------------------------------------------------------------------------
// WHY generate rather than paste a fixed sample: a fixed sample would let the
// renderer's caches (and any memoization we're trying to measure) see the same
// string over and over, which is exactly the case a real conversation does NOT
// hit. Each block is structurally similar but textually distinct.
//
// WHY 10-80 lines: measured against real Claude Code sessions this is the normal
// band — short helper snippets at the low end, a whole edited function at the
// high end. Longer than 80 is rare enough that including it would over-weight
// the tail.

function codeTS(rng, lines) {
  const out = [];
  const name = ident(rng);
  out.push(`import type { TranscriptEvent } from '../shared/types';`);
  out.push(``);
  out.push(`interface ${name}Options {`);
  const fields = int(rng, 3, 6);
  for (let i = 0; i < fields; i++) {
    out.push(`  ${pick(rng, NOUNS)}${i}: ${pick(rng, ['string', 'number', 'boolean', 'string[]', 'Record<string, unknown>'])};`);
  }
  out.push(`}`);
  out.push(``);
  out.push(`export function ${name}(opts: ${name}Options): TranscriptEvent[] {`);
  out.push(`  const events: TranscriptEvent[] = [];`);
  while (out.length < lines - 3) {
    const r = rng();
    if (r < 0.22) {
      out.push(`  // ${sentence(rng, int(rng, 5, 11))}`);
    } else if (r < 0.45) {
      out.push(`  const ${pick(rng, NOUNS)} = ${pick(rng, ['await ', ''])}${ident(rng)}(opts.${pick(rng, NOUNS)}0);`);
    } else if (r < 0.65) {
      out.push(`  if (!${pick(rng, NOUNS)} || ${pick(rng, NOUNS)}.length === 0) {`);
      out.push(`    return events;`);
      out.push(`  }`);
    } else if (r < 0.82) {
      out.push(`  for (const ${pick(rng, NOUNS)} of ${pick(rng, NOUNS)}s) {`);
      out.push(`    events.push({ type: '${pick(rng, ['tool-use', 'assistant-text', 'turn-complete'])}', uuid: ${pick(rng, NOUNS)}.uuid, sessionId, timestamp: Date.now(), data: {} });`);
      out.push(`  }`);
    } else {
      out.push(`  ${pick(rng, NOUNS)}.${pick(rng, VERBS)}(${int(rng, 1, 4096)});`);
    }
  }
  out.push(`  return events;`);
  out.push(`}`);
  return out.slice(0, lines).join('\n');
}

function codeTSX(rng, lines) {
  const out = [];
  const comp = pick(rng, IDENT_TAILS) + pick(rng, ['Panel', 'Card', 'Row', 'Bubble']);
  out.push(`import React, { useMemo, useCallback } from 'react';`);
  out.push(``);
  out.push(`export function ${comp}({ ${pick(rng, NOUNS)}, onSelect }: ${comp}Props) {`);
  out.push(`  const rows = useMemo(() => ${pick(rng, NOUNS)}.map((r) => r.id), [${pick(rng, NOUNS)}]);`);
  out.push(`  const handle = useCallback(() => onSelect(rows[0]), [rows, onSelect]);`);
  out.push(`  return (`);
  out.push(`    <div className="${pick(rng, NOUNS)}-${pick(rng, ADJS)}">`);
  while (out.length < lines - 4) {
    const r = rng();
    if (r < 0.3) {
      out.push(`      <span className="label">{${pick(rng, NOUNS)}.${pick(rng, NOUNS)}}</span>`);
    } else if (r < 0.55) {
      out.push(`      {rows.length > 0 && (`);
      out.push(`        <button type="button" onClick={handle}>${pick(rng, VERBS)}</button>`);
      out.push(`      )}`);
    } else if (r < 0.75) {
      out.push(`      {/* ${sentence(rng, int(rng, 4, 9))} */}`);
    } else {
      out.push(`      <${pick(rng, IDENT_TAILS)} key={${pick(rng, NOUNS)}.id} ${pick(rng, ADJS)} />`);
    }
  }
  out.push(`    </div>`);
  out.push(`  );`);
  out.push(`}`);
  return out.slice(0, lines).join('\n');
}

function codeJS(rng, lines) {
  const out = [];
  out.push(`'use strict';`);
  out.push(`const path = require('node:path');`);
  out.push(``);
  const fn = ident(rng);
  out.push(`function ${fn}(input, opts = {}) {`);
  out.push(`  const acc = [];`);
  while (out.length < lines - 3) {
    const r = rng();
    if (r < 0.25) out.push(`  // ${sentence(rng, int(rng, 5, 10))}`);
    else if (r < 0.5) out.push(`  const ${pick(rng, NOUNS)} = opts.${pick(rng, NOUNS)} ?? ${int(rng, 0, 500)};`);
    else if (r < 0.7) {
      out.push(`  try {`);
      out.push(`    acc.push(JSON.parse(${pick(rng, NOUNS)}));`);
      out.push(`  } catch (err) {`);
      out.push(`    acc.push({ error: err.message });`);
      out.push(`  }`);
    } else out.push(`  acc.push(path.join(input, '${pick(rng, NOUNS)}', '${pick(rng, NOUNS)}.json'));`);
  }
  out.push(`  return acc;`);
  out.push(`}`);
  out.push(`module.exports = { ${fn} };`);
  return out.slice(0, lines).join('\n');
}

function codeJSON(rng, lines) {
  // WHY nested rather than flat: JSON highlighting cost scales with token count
  // and bracket-matching depth, and real config/tool output is nested.
  //
  // WHY the body is filled to EXACTLY `lines`: the first version emitted
  // 5-line groups and then sliced, so a request for 10 lines produced 7 — it
  // undershot the 10-line floor the whole module advertises. The test caught it
  // ("json block had 7 lines"). Now the group loop runs until only the closing
  // brace is left to place, and any remainder is filled with scalar keys.
  const out = ['{'];
  const body = [];                       // everything between the braces
  const want = Math.max(1, lines - 2);   // -2 for the outer '{' and '}'
  while (body.length + 5 <= want) {
    const g = body.length;
    body.push(`  "${pick(rng, NOUNS)}${g}": {`);
    body.push(`    "${pick(rng, NOUNS)}": ${int(rng, 0, 99999)},`);
    body.push(`    "${pick(rng, NOUNS)}": "${pick(rng, ADJS)}-${pick(rng, NOUNS)}",`);
    body.push(`    "${pick(rng, NOUNS)}": ${rng() < 0.5 ? 'true' : 'false'}`);
    body.push(`  },`);
  }
  while (body.length < want) {
    body.push(`  "${pick(rng, NOUNS)}${body.length}": ${int(rng, 0, 99999)},`);
  }
  // Trailing commas are invalid JSON; the last entry must not carry one.
  body[body.length - 1] = body[body.length - 1].replace(/,$/, '');
  out.push(...body);
  out.push('}');
  return out.join('\n');
}

function codeBash(rng, lines) {
  const out = ['#!/usr/bin/env bash', 'set -euo pipefail', ''];
  while (out.length < lines) {
    const r = rng();
    if (r < 0.25) out.push(`# ${sentence(rng, int(rng, 4, 9))}`);
    else if (r < 0.5) out.push(`${pick(rng, NOUNS).toUpperCase()}_DIR="\${${pick(rng, NOUNS).toUpperCase()}_DIR:-/var/lib/${pick(rng, NOUNS)}}"`);
    else if (r < 0.7) {
      out.push(`if [[ ! -d "$${pick(rng, NOUNS).toUpperCase()}_DIR" ]]; then`);
      out.push(`  mkdir -p "$${pick(rng, NOUNS).toUpperCase()}_DIR"`);
      out.push(`fi`);
    } else out.push(`rg -n "${pick(rng, NOUNS)}" ${pick(rng, FILE_PATHS)} | head -${int(rng, 5, 40)}`);
  }
  return out.slice(0, lines).join('\n');
}

function codePython(rng, lines) {
  const out = ['from __future__ import annotations', 'import json', 'from dataclasses import dataclass', ''];
  out.push(`@dataclass`);
  out.push(`class ${pick(rng, IDENT_TAILS)}:`);
  const fields = int(rng, 2, 5);
  for (let i = 0; i < fields; i++) out.push(`    ${pick(rng, NOUNS)}_${i}: ${pick(rng, ['str', 'int', 'bool', 'list[str]'])}`);
  out.push(``);
  out.push(`def ${pick(rng, IDENT_HEADS)}_${pick(rng, NOUNS)}(rows: list[dict]) -> list[dict]:`);
  out.push(`    out: list[dict] = []`);
  while (out.length < lines - 1) {
    const r = rng();
    if (r < 0.25) out.push(`    # ${sentence(rng, int(rng, 4, 10))}`);
    else if (r < 0.5) out.push(`    ${pick(rng, NOUNS)} = row.get("${pick(rng, NOUNS)}", ${int(rng, 0, 999)})`);
    else if (r < 0.72) {
      out.push(`    for row in rows:`);
      out.push(`        if not row.get("${pick(rng, NOUNS)}"):`);
      out.push(`            continue`);
      out.push(`        out.append(json.loads(row["${pick(rng, NOUNS)}"]))`);
    } else out.push(`    out.sort(key=lambda r: r["${pick(rng, NOUNS)}"], reverse=True)`);
  }
  out.push(`    return out`);
  return out.slice(0, lines).join('\n');
}

/** The languages a fenced block can be tagged with, and their body generators.
 *  Weights follow what this repo's own conversations contain: TypeScript
 *  dominates, JSON/bash show up as tool output the assistant quotes back,
 *  Python is the occasional script. */
const LANGS = [
  { lang: 'ts', weight: 34, gen: codeTS },
  { lang: 'tsx', weight: 20, gen: codeTSX },
  { lang: 'js', weight: 12, gen: codeJS },
  { lang: 'json', weight: 14, gen: codeJSON },
  { lang: 'bash', weight: 12, gen: codeBash },
  { lang: 'python', weight: 8, gen: codePython },
];

function pickWeighted(rng, table) {
  const total = table.reduce((n, e) => n + e.weight, 0);
  let r = rng() * total;
  for (const e of table) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return table[table.length - 1];
}

/** One fenced code block: ```lang … ```. 10-80 lines of body. */
function fencedCode(rng) {
  const entry = pickWeighted(rng, LANGS);
  const lines = int(rng, 10, 80);
  return '```' + entry.lang + '\n' + entry.gen(rng, lines) + '\n```';
}

// ---------------------------------------------------------------------------
// Unified diff
// ---------------------------------------------------------------------------

/** A `structuredPatch` hunk, the shape the app's diff renderer consumes.
 *  Shape pinned by StructuredPatchHunk (src/shared/types.ts:353-365): every
 *  string in `lines` begins with ' ' (context), '-' (deletion) or '+' (addition). */
function patchHunk(rng, oldStart) {
  const lines = [];
  const ctxBefore = int(rng, 2, 4);
  const dels = int(rng, 1, 6);
  const adds = int(rng, 1, 8);
  const ctxAfter = int(rng, 2, 4);
  for (let i = 0; i < ctxBefore; i++) lines.push(`   ${pick(rng, NOUNS)}.${pick(rng, VERBS)}();`);
  for (let i = 0; i < dels; i++) lines.push(`-  const ${pick(rng, NOUNS)} = ${ident(rng)}(${int(rng, 0, 99)});`);
  for (let i = 0; i < adds; i++) lines.push(`+  const ${pick(rng, NOUNS)} = ${ident(rng)}(${int(rng, 0, 99)}, { ${pick(rng, ADJS)}: true });`);
  for (let i = 0; i < ctxAfter; i++) lines.push(`   return ${pick(rng, NOUNS)};`);
  const oldLines = ctxBefore + dels + ctxAfter;
  const newLines = ctxBefore + adds + ctxAfter;
  return { oldStart, oldLines, newStart: oldStart, newLines, lines };
}

function structuredPatch(rng) {
  const hunks = [];
  let at = int(rng, 10, 200);
  const n = int(rng, 1, 4);
  for (let i = 0; i < n; i++) {
    hunks.push(patchHunk(rng, at));
    at += int(rng, 20, 120);
  }
  return hunks;
}

/** The same patch rendered as a text `diff` fence, for the markdown path. */
function unifiedDiffText(rng, filePath, hunks) {
  const out = [`--- a/${filePath}`, `+++ b/${filePath}`];
  for (const h of hunks) {
    out.push(`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`);
    for (const l of h.lines) out.push(l);
  }
  return '```diff\n' + out.join('\n') + '\n```';
}

// ---------------------------------------------------------------------------
// Long single-line output (stack traces, log dumps)
// ---------------------------------------------------------------------------

/** A Node stack trace — the single most common "wall of text" in this app's
 *  transcripts. Long lines are their own cost class: they defeat wrapping
 *  heuristics and force wide layout work. */
function stackTrace(rng) {
  const frames = int(rng, 25, 70);
  const out = [`Error: ${sentence(rng, int(rng, 5, 12))}`];
  for (let i = 0; i < frames; i++) {
    out.push(`    at ${ident(rng)} (/home/u/app/${pick(rng, FILE_PATHS)}:${int(rng, 1, 3900)}:${int(rng, 1, 120)})`);
  }
  return out.join('\n');
}

/** A log dump: many long, timestamp-prefixed lines. `linesHint` lets the caller
 *  ask for a genuinely large payload without changing the shape. */
function logDump(rng, linesHint) {
  const n = linesHint ?? int(rng, 40, 160);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(`[2026-08-26T12:${String(int(rng, 10, 59)).padStart(2, '0')}:${String(int(rng, 10, 59)).padStart(2, '0')}.${int(rng, 100, 999)}Z] ${pick(rng, ['INFO', 'WARN', 'DEBUG', 'ERROR'])} ${pick(rng, NOUNS)}/${pick(rng, NOUNS)} ${sentence(rng, int(rng, 10, 26))} (${pick(rng, NOUNS)}=${int(rng, 0, 999999)}, ${pick(rng, NOUNS)}=${pick(rng, ADJS)})`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Markdown prose
// ---------------------------------------------------------------------------

/** Prose with real markdown structure: headings, paragraphs, bullet and numbered
 *  lists, inline code and the occasional table. WHY structure matters: a heading
 *  or list is a separate markdown AST node and a separate DOM subtree, so a
 *  structured answer costs meaningfully more than the same characters as one
 *  paragraph — which is all fixture.mjs's `prose()` ever produced. */
function markdownProse(rng, { long = false } = {}) {
  const out = [];
  if (rng() < 0.55) out.push(`## ${pick(rng, ADJS)} ${pick(rng, NOUNS)}`);
  out.push(paragraph(rng, int(rng, 2, long ? 6 : 4)));
  const r = rng();
  if (r < 0.4) {
    out.push('');
    const items = int(rng, 3, 7);
    for (let i = 0; i < items; i++) {
      out.push(`- \`${ident(rng)}\` — ${sentence(rng, int(rng, 6, 16))}`);
    }
  } else if (r < 0.6) {
    out.push('');
    const items = int(rng, 3, 6);
    for (let i = 0; i < items; i++) {
      out.push(`${i + 1}. **${pick(rng, NOUNS)}** ${sentence(rng, int(rng, 6, 14))}`);
    }
  } else if (r < 0.72) {
    // A GFM table — only renders as a table if remark-gfm is enabled; if it is
    // not, it degrades to a paragraph of pipes, which is still valid content.
    out.push('');
    out.push('| field | meaning |');
    out.push('|---|---|');
    for (let i = 0; i < int(rng, 3, 6); i++) {
      out.push(`| \`${pick(rng, NOUNS)}\` | ${sentence(rng, int(rng, 4, 10))} |`);
    }
  }
  if (long || rng() < 0.5) {
    out.push('');
    out.push(paragraph(rng, int(rng, 2, 5)));
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// MIX — how often each content kind appears
// ---------------------------------------------------------------------------
//
// REASONING FOR THESE RATIOS
// --------------------------
// A "turn" here is one user prompt plus everything the assistant does before it
// stops. The mix is modelled on what a real YouCoded/Claude Code coding session
// looks like, not on an even split:
//
//  * `prose` 0.30 — the plurality. Plenty of turns are questions, explanations,
//    confirmations and planning with no code and no tools. This is also the only
//    kind whose cost the CURRENT fixture represents, so keeping it the largest
//    single slice means the new fixture is a superset of the old one rather than
//    a different workload.
//  * `code` 0.24 — a large minority. When the assistant writes or quotes code it
//    goes in the answer text as a fenced block, and that is the single most
//    expensive thing per byte the renderer does (syntax highlighting).
//  * `tool` 0.24 — tool calls are common; in an agentic session most substantive
//    turns read a file, grep, or run a command before answering. Equal weight
//    with `code` because in practice a coding turn is about as likely to be
//    "look something up and report" as "here is the code".
//  * `diff` 0.14 — edits are frequent but strictly less common than reads: an
//    agent reads several files for every one it edits. This is the kind that
//    exercises the Edit-tool diff card, a distinct and costly renderer.
//  * `long_output` 0.08 — the tail. Build logs, test output and stack traces
//    show up regularly but not in most turns. Small weight, disproportionate
//    cost, which is exactly why it must be represented at all: an average that
//    omits its tail understates the freezes the owner reports.
//
// The weights sum to 1.00. They are integers over 100 so the distribution is
// exactly representable and the test suite can assert on it.
export const MIX = Object.freeze([
  Object.freeze({ kind: 'prose', weight: 30, why: 'plurality of turns are explanation/planning with no code' }),
  Object.freeze({ kind: 'code', weight: 24, why: 'large minority carry a fenced, syntax-highlighted code block' }),
  Object.freeze({ kind: 'tool', weight: 24, why: 'agentic sessions read/grep/run before answering' }),
  Object.freeze({ kind: 'diff', weight: 14, why: 'edits are frequent but rarer than reads' }),
  Object.freeze({ kind: 'long_output', weight: 8, why: 'log/stack dumps: rare per turn, outsized render cost' }),
]);

/** Every kind MIX can select, in a stable order. */
export const KINDS = Object.freeze(MIX.map((e) => e.kind));

/** Pick a kind for turn `index` deterministically. */
function kindForIndex(seed, index) {
  const rng = rngFor(`${seed}:${index}`, 'kind');
  return pickWeighted(rng, MIX).kind;
}

// ---------------------------------------------------------------------------
// assistantContentBlocks
// ---------------------------------------------------------------------------

/**
 * The `message.content` array for ONE assistant JSONL line of the given kind.
 *
 * Block shapes, and the code that proves each one survives:
 *
 *  { type: 'text', text }
 *      loadHistory keeps it (session-browser.ts:714 filters `b.type === 'text'`
 *      and reads `b.text`). transcript-watcher emits `assistant-text`
 *      (transcript-watcher.ts:156-166), skipping the block if the text is empty
 *      after `stripSystemTags` — so `text` is never blank here.
 *
 *  { type: 'tool_use', id, name, input }
 *      transcript-watcher.ts:169-186 reads exactly `block.id` -> toolUseId,
 *      `block.name` -> toolName, `block.input` -> toolInput. loadHistory DROPS
 *      this block (it is not `type: 'text'`), which is why a tool turn also
 *      carries a text block and why tool turns are not counted as history
 *      messages.
 *
 * Callers who want the matching tool_result use `toolResultContentBlocks()`
 * below — in Claude Code JSONL a tool_result is NOT an assistant block, it comes
 * back on a following `type: 'user'` line (transcript-watcher.ts:72-100 scans
 * user lines for it; the assistant switch at :197 sends `tool_result` to
 * `default: break`, i.e. it is silently dropped if you put it here).
 *
 * @param {'prose'|'code'|'tool'|'diff'|'long_output'} kind
 * @param {number|string} seed
 * @returns {Array<object>} message.content for an assistant line
 */
export function assistantContentBlocks(kind, seed) {
  const rng = rngFor(seed, `assistant:${kind}`);
  switch (kind) {
    case 'prose':
      return [{ type: 'text', text: markdownProse(rng, { long: true }) }];

    case 'code': {
      // Intro prose, one or two fenced blocks, closing prose. WHY put the code
      // in the ASSISTANT TEXT rather than in a tool result: loadHistory only
      // ever returns text blocks, so code in a tool result would leave the
      // `ipcAllMs` / session-preview path measuring plain prose. Code in the
      // answer makes BOTH measured paths pay realistic cost.
      const blocks = [];
      const parts = [markdownProse(rng), fencedCode(rng)];
      if (rng() < 0.35) {
        parts.push(paragraph(rng, int(rng, 1, 3)));
        parts.push(fencedCode(rng));
      }
      parts.push(paragraph(rng, int(rng, 1, 3)));
      blocks.push({ type: 'text', text: parts.join('\n\n') });
      return blocks;
    }

    case 'diff': {
      const filePath = pick(rng, FILE_PATHS);
      const hunks = structuredPatch(rng);
      return [{
        type: 'text',
        text: [markdownProse(rng), unifiedDiffText(rng, filePath, hunks), paragraph(rng, int(rng, 1, 3))].join('\n\n'),
      }];
    }

    case 'tool': {
      // A short lead-in then the tool call, which is how a real assistant turn
      // reads. stop_reason on this LINE must be 'tool_use' — see realisticTurn.
      const tool = pickWeighted(rng, TOOLS);
      return [
        { type: 'text', text: sentence(rng, int(rng, 6, 16)) },
        { type: 'tool_use', id: toolUseId(rng), name: tool.name, input: tool.input(rng) },
      ];
    }

    case 'long_output': {
      // The assistant quoting a wall of output back at the user, inside a fence.
      //
      // WHY the two variants are fenced DIFFERENTLY, and why that is not a
      // detail: rehype-highlight is constructed with no `languages` option
      // (MarkdownContent.tsx:37), so it uses lowlight's `common` set and
      // `detect` defaults to FALSE (node_modules/rehype-highlight/lib/index.js:47).
      // An UNLANGUAGED fence is therefore never tokenized. A stack trace is
      // genuinely written as a bare fence in real transcripts, so it stays bare
      // and its cost is pure DOM + layout (very long lines, no wrap point).
      // A command-output dump is normally fenced ```console, which IS
      // registered, so it pays tokenization on top. `console` (not `bash`) so a
      // reader — and the test suite — can tell an OUTPUT dump apart from a
      // generated bash CODE block, which has a different size contract (10-80
      // lines). Verified registered against this repo's own lowlight: ts, tsx,
      // js, jsx, json, bash, sh, shell, console, python, py, diff, text.
      const asTrace = rng() < 0.5;
      const body = asTrace ? stackTrace(rng) : logDump(rng, int(rng, 60, 200));
      const fence = asTrace ? '```\n' : '```console\n';
      return [{
        type: 'text',
        text: [paragraph(rng, 2), fence + body + '\n```', paragraph(rng, int(rng, 1, 3))].join('\n\n'),
      }];
    }

    default:
      // Never a silent fallback: an unknown kind means the caller and this file
      // disagree, and a quietly-substituted paragraph would make the fixture
      // cheaper than intended without anyone noticing.
      throw new Error(
        `assistantContentBlocks: unknown kind ${JSON.stringify(kind)}. Known kinds: ${KINDS.join(', ')}.`,
      );
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
// Names and input shapes copied from the real tools so the renderer's tool card
// picks the right icon/summary rather than falling back to a generic card.

const TOOLS = [
  {
    name: 'Read', weight: 30,
    input: (rng) => ({ file_path: `/home/u/app/${pick(rng, FILE_PATHS)}`, offset: int(rng, 1, 500), limit: int(rng, 40, 400) }),
    result: (rng) => numberedFileBody(rng, int(rng, 40, 220)),
  },
  {
    name: 'Bash', weight: 26,
    input: (rng) => ({ command: `rg -n "${pick(rng, NOUNS)}" ${pick(rng, FILE_PATHS)} | head -${int(rng, 10, 60)}`, description: sentence(rng, int(rng, 3, 7)) }),
    result: (rng) => logDump(rng, int(rng, 20, 90)),
  },
  {
    name: 'Grep', weight: 22,
    input: (rng) => ({ pattern: `${pick(rng, NOUNS)}\\s*=`, path: 'src', output_mode: 'content', '-n': true }),
    result: (rng) => grepHits(rng, int(rng, 15, 120)),
  },
  {
    name: 'Edit', weight: 12,
    input: (rng) => ({ file_path: `/home/u/app/${pick(rng, FILE_PATHS)}`, old_string: `const ${pick(rng, NOUNS)} = ${int(rng, 0, 99)};`, new_string: `const ${pick(rng, NOUNS)} = ${int(rng, 0, 99)}; // ${sentence(rng, 5)}` }),
    result: () => 'The file has been updated.',
  },
  {
    name: 'Glob', weight: 10,
    input: (rng) => ({ pattern: `**/*.${pick(rng, ['ts', 'tsx', 'mjs', 'kt'])}` }),
    result: (rng) => Array.from({ length: int(rng, 20, 120) }, () => `/home/u/app/${pick(rng, FILE_PATHS)}`).join('\n'),
  },
];

function toolUseId(rng) {
  const hex = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 24; i++) s += hex[Math.floor(rng() * hex.length)];
  return `toolu_${s}`;
}

/** `cat -n`-style body — what a Read result actually looks like. */
function numberedFileBody(rng, lines) {
  const out = [];
  for (let i = 1; i <= lines; i++) {
    out.push(`${String(i).padStart(6, ' ')}\t${rng() < 0.25 ? '// ' + sentence(rng, int(rng, 4, 10)) : `  ${pick(rng, NOUNS)}.${pick(rng, VERBS)}(${int(rng, 0, 999)});`}`);
  }
  return out.join('\n');
}

function grepHits(rng, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(`${pick(rng, FILE_PATHS)}:${int(rng, 1, 3900)}:  const ${pick(rng, NOUNS)} = ${ident(rng)}(${int(rng, 0, 99)});`);
  }
  return out.join('\n');
}

/**
 * The `message.content` array for the `type: 'user'` line that carries a
 * tool_result back.
 *
 * Shape pinned by transcript-watcher.ts:72-100, which scans USER lines for
 * `block.type === 'tool_result'` and reads:
 *   block.tool_use_id  -> event.data.toolUseId   (:90)
 *   block.content      -> extractToolResultContent (:91, string | text-block array)
 *   block.is_error     -> event.data.isError, default false (:92)
 * This scan runs BEFORE the `promptId` gate at :103, which is why a tool_result
 * line legitimately has no promptId — and why loadHistory (which REQUIRES
 * promptId, session-browser.ts:696) drops it. That asymmetry is what keeps the
 * per-turn history count at exactly 2 while the resume path still renders cards.
 */
export function toolResultContentBlocks(toolUseIdValue, resultText, { isError = false } = {}) {
  return [{ type: 'tool_result', tool_use_id: toolUseIdValue, content: resultText, is_error: isError }];
}

// ---------------------------------------------------------------------------
// realisticTurn
// ---------------------------------------------------------------------------

const USER_ASKS = [
  'Why does', 'Can you check whether', 'Walk me through how', 'Fix the bug where',
  'Add a test for', 'What happens when', 'Refactor', 'Explain why',
];

function userPrompt(rng, index) {
  // The "Turn N:" prefix is inherited from fixture.mjs:92 on purpose: the session
  // list's title scan (session-browser.ts:322-347) skips a first prompt whose
  // text starts with '<', and a numbered prefix makes screenshots stable and
  // makes it obvious in a screenshot which turn you are looking at.
  const body = `${pick(rng, USER_ASKS)} the ${pick(rng, ADJS)} ${pick(rng, NOUNS)} in \`${pick(rng, FILE_PATHS)}\` ${pick(rng, CONNECT)} ${sentence(rng, int(rng, 8, 22))}`;
  return `Turn ${index + 1}: ${body}`;
}

/** Fields every JSONL line carries, matching what fixture.mjs already writes
 *  (fixture.mjs:90-96) so nothing downstream sees a shape change. */
function envelope(sessionId, cwd, iso) {
  return {
    sessionId, cwd, version: '2.1.229', gitBranch: '', userType: 'external',
    timestamp: iso,
  };
}

/**
 * One complete user+assistant turn, as JSONL strings.
 *
 * Deterministic: the same {index, seed} always produces byte-identical lines,
 * including uuids. Nothing here reads the clock — `startedAt` is supplied.
 *
 * Line layout per turn:
 *   1. user prompt      — promptId, isMeta:false, string content   [history: +1]
 *   2. (kind 'tool' | 'diff' | 'long_output') assistant tool turn,
 *      `stop_reason: 'tool_use'`                                    [history: +0]
 *   3. (same kinds) user line carrying the tool_result, no promptId [history: +0]
 *   4. final assistant answer, `stop_reason: 'end_turn'`            [history: +1]
 *
 * WHY step 2 uses stop_reason 'tool_use': that is what real CC writes, AND it is
 * load-bearing twice over — loadHistory only keeps `end_turn` assistant lines
 * (session-browser.ts:707), and transcript-watcher only fires `turn-complete`
 * when `stop_reason && stop_reason !== 'tool_use'` (transcript-watcher.ts:219).
 * Getting this wrong would both break the rig's 2x-turns assertion and make the
 * app think every tool call ended a turn.
 *
 * @param {object} args
 * @param {number} args.index         0-based turn number
 * @param {number|string} args.seed   run seed; same seed => same bytes
 * @param {string} args.cwd           project cwd stamped on every line
 * @param {string} args.sessionId     CC session id
 * @param {string|null} args.parentUuid  uuid of the previous turn's last line
 * @param {number} args.startedAt     epoch ms for turn 0; each turn is +60s
 * @returns {{lines: string[], lastUuid: string, kind: string, historyMessages: number}}
 */
export function realisticTurn({ index, seed, cwd, sessionId, parentUuid = null, startedAt }) {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`realisticTurn: index must be a non-negative integer, got ${JSON.stringify(index)}`);
  }
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new Error(`realisticTurn: sessionId must be a non-empty string, got ${JSON.stringify(sessionId)}`);
  }
  if (typeof cwd !== 'string' || !cwd) {
    throw new Error(`realisticTurn: cwd must be a non-empty string, got ${JSON.stringify(cwd)}`);
  }
  if (!Number.isFinite(startedAt)) {
    throw new Error(`realisticTurn: startedAt must be a finite epoch-ms number, got ${JSON.stringify(startedAt)}`);
  }

  const slotSeed = `${seed}:${index}`;
  const kind = kindForIndex(seed, index);
  const idRng = rngFor(slotSeed, 'ids');
  const textRng = rngFor(slotSeed, 'text');

  const base = startedAt + index * 60000;
  const iso = (offsetMs) => new Date(base + offsetMs).toISOString();

  const lines = [];
  let parent = parentUuid;

  // ---- 1. user prompt (history-visible) ----
  const userUuid = uuidFrom(idRng);
  lines.push(JSON.stringify({
    type: 'user', uuid: userUuid, parentUuid: parent,
    promptId: uuidFrom(idRng), isMeta: false,
    ...envelope(sessionId, cwd, iso(0)),
    message: { role: 'user', content: userPrompt(textRng, index) },
  }));
  parent = userUuid;

  // ---- 2 + 3. tool round-trip, for the kinds that have one ----
  // 'diff' always uses the Edit tool so the result can carry a structuredPatch,
  // which is the ONLY input the app's diff renderer takes off a transcript
  // (transcript-watcher.ts:79-81 reads `parsed.toolUseResult.structuredPatch`;
  // shape = StructuredPatchHunk, src/shared/types.ts:353-365).
  //
  // NOTE for a future reader: this builds the tool_use blocks inline rather than
  // calling assistantContentBlocks('tool', ...). That is deliberate — 'diff' has
  // to use the Edit tool (only Edit results carry a structuredPatch) and
  // 'long_output' has to use Bash, whereas assistantContentBlocks('tool') picks
  // a tool at random because it has no turn context. Both paths emit the same
  // block shape; the exported one is the documented single-line API, this one is
  // the turn-aware version.
  const hasTool = kind === 'tool' || kind === 'diff' || kind === 'long_output';
  if (hasTool) {
    const toolRng = rngFor(slotSeed, `tool:${kind}`);
    let tool;
    if (kind === 'diff') tool = TOOLS.find((t) => t.name === 'Edit');
    else if (kind === 'long_output') tool = TOOLS.find((t) => t.name === 'Bash');
    else tool = pickWeighted(toolRng, TOOLS);

    const tid = toolUseId(toolRng);
    const toolAssistantUuid = uuidFrom(idRng);
    lines.push(JSON.stringify({
      type: 'assistant', uuid: toolAssistantUuid, parentUuid: parent,
      ...envelope(sessionId, cwd, iso(4000)),
      message: {
        role: 'assistant', model: 'claude-sonnet-4-5',
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: sentence(toolRng, int(toolRng, 6, 16)) },
          { type: 'tool_use', id: tid, name: tool.name, input: tool.input(toolRng) },
        ],
      },
    }));
    parent = toolAssistantUuid;

    const resultText = kind === 'long_output'
      ? (toolRng() < 0.5 ? stackTrace(toolRng) : logDump(toolRng, int(toolRng, 120, 400)))
      : tool.result(toolRng);

    const resultUuid = uuidFrom(idRng);
    const resultLine = {
      type: 'user', uuid: resultUuid, parentUuid: parent,
      // NO promptId on purpose — see toolResultContentBlocks()'s note. Real CC
      // omits it here too, and it is what keeps loadHistory's count at 2/turn.
      ...envelope(sessionId, cwd, iso(6000)),
      message: { role: 'user', content: toolResultContentBlocks(tid, resultText) },
    };
    if (kind === 'diff') {
      // Top-level sibling of `message`, exactly where the watcher looks.
      resultLine.toolUseResult = {
        filePath: tool.input(rngFor(slotSeed, 'diff-path')).file_path,
        structuredPatch: structuredPatch(rngFor(slotSeed, 'patch')),
      };
    }
    lines.push(JSON.stringify(resultLine));
    parent = resultUuid;
  }

  // ---- 4. final assistant answer (history-visible) ----
  // For tool kinds the answer is the summary that follows the tool output; for
  // the others it is the whole response. Either way it is the ONE line per turn
  // with stop_reason 'end_turn'.
  const answerKind = kind === 'tool' ? (textRng() < 0.4 ? 'code' : 'prose') : kind;
  const answerUuid = uuidFrom(idRng);
  lines.push(JSON.stringify({
    type: 'assistant', uuid: answerUuid, parentUuid: parent,
    ...envelope(sessionId, cwd, iso(9000)),
    requestId: `req_${index}`,
    message: {
      role: 'assistant', model: 'claude-sonnet-4-5',
      stop_reason: 'end_turn',
      content: assistantContentBlocks(answerKind, `${slotSeed}:answer`),
      usage: {
        input_tokens: 1200 + index,
        output_tokens: 300 + (index % 700),
        cache_read_input_tokens: 20000,
        cache_creation_input_tokens: 0,
      },
    },
  }));

  return { lines, lastUuid: answerUuid, kind, historyMessages: messagesPerTurn };
}

/**
 * Convenience: a whole transcript body, drop-in compatible with
 * fixture.mjs's `transcriptLines()` signature (fixture.mjs:84) plus a `seed`.
 * Returns an array of JSONL strings, same as the function it replaces.
 */
export function realisticTranscriptLines({ sessionId, cwd, turns, startedAt, seed = 'perf-lab' }) {
  const lines = [];
  let parent = null;
  for (let i = 0; i < turns; i++) {
    const turn = realisticTurn({ index: i, seed, cwd, sessionId, parentUuid: parent, startedAt });
    for (const l of turn.lines) lines.push(l);
    parent = turn.lastUuid;
  }
  return lines;
}
