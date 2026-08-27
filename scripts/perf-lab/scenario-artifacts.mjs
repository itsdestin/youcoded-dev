// scripts/perf-lab/scenario-artifacts.mjs — the artifact-viewer journey:
// open files in the session drawer, TYPE into a code editor, swap an HTML
// preview back and forth, and copy a code block out of the transcript — with
// BOTH probes running over every single step.
//
// WHY THIS SCENARIO EXISTS
// Destin reports spikes "when editing files, copying text, and navigating HTML
// in the artifact viewer". Every scenario the rig had before this one measured
// startup, history load, or session switching — NONE of them ever opened the
// artifact drawer, mounted a CodeMirror editor, or rendered an iframe preview.
// So the complaint was, literally, unmeasured: the rig could not have caught it
// and could not catch a regression in it either. This closes that hole.
//
// THREE CODE-LEVEL SUSPECTS this journey is built to separate (all three were
// re-read on master while writing this file — see the notes at each step):
//
//  1. MarkdownContent.tsx:187 calls hastText(node) UNMEMOIZED inside the `pre`
//     renderer — a full recursive walk of the code block's source AST, per code
//     block, per render of that markdown. IMPORTANT CORRECTION found while
//     verifying: MarkdownContent is wrapped in React.memo (MarkdownContent.tsx:265)
//     and its `content` prop is a plain string, so an unrelated re-render of the
//     transcript does NOT re-run it. The cost is therefore paid when `content`
//     CHANGES (a streaming bubble, or a markdown file re-read after an edit) and
//     scales with the number and size of code blocks in that one document. That
//     is why this scenario opens a SMALL and a LARGE markdown artifact through
//     the very same MarkdownContent component and reports both: the delta is
//     the per-code-block parse+walk cost, measured rather than asserted.
//  2. HtmlView.tsx:41 renders <iframe srcDoc={doc}>. Changing `doc` re-parses
//     the whole document and re-runs its scripts; and switching artifacts
//     REMOUNTS the viewer outright (ViewerErrorBoundary is keyed by artifact.id,
//     ActiveArtifactView.tsx:569), so the old frame is destroyed and a new one
//     built. Step 4 swaps a small and a large HTML artifact back and forth and
//     times each swap to the frame's own `load` event.
//  3. CodeMirror re-tokenisation on edit (CodeEditorView.tsx builds its state at
//     :57-77). Step 3 types real key events into a small file and a large one and
//     reports per-keystroke latency for each; suspect 3 predicts the large file
//     is materially worse per keystroke.
//
// READING THE OUTPUT: every step carries `probe` (renderer long tasks / frame
// gaps for exactly that step's window) and `ipc` (main-process ping round trips
// for exactly that step). Together they ATTRIBUTE a stall — see attributeStall()
// below, and the long comment in probe-ipc.mjs. A step whose ipc stalled while
// its renderer sat idle is a MAIN-PROCESS block, i.e. the whole-app freeze;
// a step where both spiked together is the renderer. Neither number alone can
// tell those apart, which is the entire reason both are reported per step.
//
// WHICH NUMBER ANSWERS WHICH SUSPECT (the payoff — read this before the code):
//   1 hastText / markdown parse .. open.mdLarge.openMs vs open.mdSmall.openMs,
//                                  next to files.mdLarge.fences vs mdSmall.fences.
//                                  sizeScaling.markdownOpenRatio should track
//                                  markdownFenceRatio if the cost really is
//                                  per-code-block. copy.clickToCopiedMs covers
//                                  the click itself, which is a SEPARATE and
//                                  much smaller thing (see step 6's comment).
//   2 iframe srcDoc re-parse ..... htmlNav.swapLarge vs htmlNav.swapSmall, and
//                                  sizeScaling.htmlSwapRatio. htmlNav.inPage is
//                                  the control: an in-document navigation that
//                                  does NOT touch srcDoc, so if swaps are slow
//                                  and inPage is fast the cost is the re-parse,
//                                  not the page's own rendering.
//   3 CodeMirror re-tokenisation . typing.codeLarge.keystroke vs
//                                  typing.codeSmall.keystroke, and
//                                  sizeScaling.keystrokeRatio. A ratio near 1
//                                  exonerates suspect 3 at these file sizes.
//   whole-app freeze ............. any step whose `stall.verdict` is 'main'.
//
// Node built-ins only (the workspace root has no package.json and must not gain one).
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { waitFor } from './cdp.mjs';
// The renderer-side probe is deliberately IMPORTED, not re-implemented: it has
// teardown semantics (rAF cancel + observer disconnect) that took a real bug to
// get right, and a second copy of it would drift.
import { installProbe, readProbe, readProbeWindow, stopProbe, median, p95 } from './scenario-workload.mjs';
import { installIpcStallProbe, readIpcStallProbe, stopIpcStallProbe } from './probe-ipc.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round1 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : n);

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in tests/scenario-artifacts.test.mjs)
// ---------------------------------------------------------------------------

/**
 * Deterministic 32-bit PRNG. The fixture files must be byte-identical between a
 * baseline run and a candidate run, or "the large file got slower" could just
 * mean "the large file got different". Math.random() would do exactly that.
 */
export function rng32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['handler', 'session', 'artifact', 'buffer', 'token', 'render', 'commit',
  'watcher', 'payload', 'cursor', 'stream', 'index', 'record', 'viewer', 'draft'];

/**
 * A TypeScript-shaped file of roughly `approxBytes`. Real-ish structure on
 * purpose: CodeMirror's cost is in tokenising and folding actual syntax, so a
 * file of repeated 'x' would under-report suspect 3 rather than measure it.
 */
export function buildCodeArtifact({ approxBytes = 2048, seed = 1 } = {}) {
  const r = rng32(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const out = ['// perf-lab generated fixture — deterministic, do not hand-edit.',
    "import { join } from 'node:path';", ''];
  let bytes = out.join('\n').length;
  let i = 0;
  while (bytes < approxBytes) {
    const name = `${pick(WORDS)}${i}`;
    const block = [
      `export interface ${name}Options {`,
      `  ${pick(WORDS)}: string;`,
      `  ${pick(WORDS)}?: number;`,
      '}',
      `export function ${name}(opts: ${name}Options): string {`,
      `  const ${pick(WORDS)} = join('${pick(WORDS)}', opts.${pick(WORDS)} ?? '');`,
      `  if (!opts.${pick(WORDS)}) throw new Error('${name}: missing ${pick(WORDS)}');`,
      `  return \`${name}:\${opts.${pick(WORDS)}}\`;`,
      '}',
      '',
    ].join('\n');
    out.push(block);
    bytes += block.length + 1;
    i++;
  }
  return out.join('\n') + '\n';
}

/**
 * A markdown file of roughly `approxBytes` with a KNOWN number of fenced code
 * blocks. The fence count is the independent variable for suspect 1: every
 * fence becomes one <pre> render, one hastText() subtree walk and one
 * <CopyButton> (MarkdownContent.tsx:185-198).
 */
export function buildMarkdownArtifact({ approxBytes = 2048, seed = 2 } = {}) {
  const r = rng32(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const out = ['# perf-lab generated fixture', '',
    'Deterministic content. Every fenced block below renders one CopyButton.', ''];
  let bytes = out.join('\n').length;
  let fences = 0;
  let i = 0;
  while (bytes < approxBytes) {
    const prose = `## Section ${i}\n\nThe ${pick(WORDS)} reconciles the ${pick(WORDS)} against the ${pick(WORDS)}, then commits.\n`;
    const body = Array.from({ length: 12 }, (_, k) =>
      `  const ${pick(WORDS)}${k} = ${pick(WORDS)}(${k}); // ${pick(WORDS)}`).join('\n');
    const fence = '```ts\n' + body + '\n```\n';
    out.push(prose, fence);
    fences++;
    bytes += prose.length + fence.length;
    i++;
  }
  const text = out.join('\n') + '\n';
  return { text, fences };
}

/**
 * A self-contained HTML page of roughly `approxBytes` split into `sections`
 * route-like panels, plus a tiny inline script that answers a postMessage by
 * performing a REAL in-document navigation and reporting how long it took.
 *
 * WHY the page instruments itself: HtmlView renders the document with
 * sandbox="allow-scripts allow-popups allow-forms" and DELIBERATELY without
 * allow-same-origin (HtmlView.tsx:42, reasoned at :9-13). The frame is therefore
 * an opaque origin and the parent page cannot read `contentDocument` at all —
 * so there is no way to observe an in-page navigation from outside except a
 * channel the page itself opens. postMessage crosses an opaque origin by design.
 * The page is ours, generated here, so this instrumentation measures the app's
 * frame, not somebody's real content.
 *
 * NOTE for the reader: a `srcdoc` frame inherits the embedder's CSP, so this
 * inline script only runs if the app sets none. Verified by search — there is
 * no Content-Security-Policy string anywhere in youcoded/desktop/src. If that
 * ever changes, the in-page navigation leg reports null with the real reason
 * ("the preview frame never announced itself") instead of a fake zero.
 */
export function buildHtmlArtifact({ approxBytes = 4096, sections = 6, seed = 3 } = {}) {
  const r = rng32(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const perSection = Math.max(1, Math.floor(approxBytes / sections / 90));
  const panels = [];
  for (let s = 0; s < sections; s++) {
    const rows = Array.from({ length: perSection }, (_, k) =>
      `<tr><td>${pick(WORDS)}-${k}</td><td>${Math.floor(r() * 100000)}</td><td>${pick(WORDS)}</td><td>${pick(WORDS)}-${k}</td></tr>`
    ).join('\n');
    panels.push(
      `<section id="s${s}" class="route"${s === 0 ? '' : ' hidden'}>` +
      `<h2>Section ${s}</h2><table><tbody>\n${rows}\n</tbody></table></section>`
    );
  }
  // The script is written without any backtick so it survives being embedded in
  // template literals on both the Node and the in-page side without escaping.
  const script = [
    '<script>',
    '(function () {',
    '  // The three message names are spelled out in full on BOTH sides, here and',
    '  // in window.__perfArt.html, so the protocol can be grepped for.',
    '  var ID = "perf-lab-nav";',
    '  function show(hash) {',
    '    var all = document.querySelectorAll("section.route");',
    '    for (var i = 0; i < all.length; i++) all[i].hidden = true;',
    '    var el = document.querySelector(hash);',
    '    if (el) el.hidden = false;',
    '    return !!el;',
    '  }',
    '  window.addEventListener("message", function (e) {',
    '    var d = e.data;',
    '    if (!d || d.t !== ID) return;',
    '    var t0 = performance.now();',
    '    var found = show(d.to);',
    '    location.hash = d.to;',
    '    // Two frames: the first callback runs BEFORE paint, so one frame would',
    '    // time layout-scheduled-but-not-done. The second is after the frame',
    '    // carrying the new section has been presented.',
    '    requestAnimationFrame(function () {',
    '      requestAnimationFrame(function () {',
    '        parent.postMessage({ t: "perf-lab-nav-done", id: d.id, found: found,',
    '          ms: Math.round((performance.now() - t0) * 10) / 10 }, "*");',
    '      });',
    '    });',
    '  });',
    '  parent.postMessage({ t: "perf-lab-nav-ready", sections: document.querySelectorAll("section.route").length }, "*");',
    '}());',
    '<\/script>',
  ].join('\n');
  return {
    text: [
      '<!doctype html><html><head><meta charset="utf-8"><title>perf-lab preview</title>',
      '<style>body{font-family:system-ui;margin:0;padding:16px}table{border-collapse:collapse;width:100%}',
      'td{border-bottom:1px solid #ddd;padding:4px 8px;font-size:12px}[hidden]{display:none}</style>',
      '</head><body>',
      '<h1>perf-lab HTML artifact</h1>',
      panels.join('\n'),
      script,
      '</body></html>',
    ].join('\n'),
    sections,
  };
}

/** median / p95 / max of a sample list; every field null (never 0) when empty. */
export function summarise(samples) {
  const s = (samples ?? []).filter((n) => typeof n === 'number' && Number.isFinite(n));
  if (!s.length) return { count: 0, medianMs: null, p95Ms: null, maxMs: null };
  return {
    count: s.length,
    medianMs: round1(median(s)),
    p95Ms: round1(p95(s)),
    maxMs: round1(Math.max(...s)),
  };
}

/**
 * The whole point of running both probes: decide WHICH thread blocked.
 *
 *   ipc stalled + renderer long task at the same magnitude -> the RENDERER blocked
 *   ipc stalled + renderer essentially idle                -> the MAIN PROCESS blocked
 *   neither                                                -> no stall in this step
 *
 * Thresholds match probe-ipc.mjs's stated perception scale (>250ms "the UI feels
 * stuck"). `verdict` is deliberately 'unclear' rather than a guess when the two
 * signals disagree by less than a factor of two — a confident wrong attribution
 * would send the next session to optimise the wrong process.
 */
export function attributeStall(ipc, probe, { stallMs = 250 } = {}) {
  const ipcMax = ipc && typeof ipc.maxMs === 'number' ? ipc.maxMs : null;
  const ltMax = probe && typeof probe.longtaskMaxMs === 'number' ? probe.longtaskMaxMs : null;
  if (ipcMax === null || ltMax === null) {
    return { verdict: 'unknown', why: 'one of the two probes reported no data for this step' };
  }
  if (ipcMax <= stallMs) {
    return { verdict: 'none', why: `worst IPC round trip was ${ipcMax}ms, under the ${stallMs}ms stall threshold` };
  }
  if (ltMax >= ipcMax / 2) {
    return { verdict: 'renderer', why: `IPC stalled ${ipcMax}ms while the renderer ran a ${ltMax}ms long task — the renderer thread was the one blocked` };
  }
  if (ltMax < ipcMax / 4) {
    return { verdict: 'main', why: `IPC stalled ${ipcMax}ms while the renderer's worst long task was only ${ltMax}ms — the MAIN process was blocked (app-wide freeze)` };
  }
  return { verdict: 'unclear', why: `IPC stalled ${ipcMax}ms and the renderer's worst long task was ${ltMax}ms — too close to attribute either way` };
}

/**
 * CDP Input.dispatchKeyEvent parameters for one printable character.
 *
 * WHY real key events and not a DOM value assignment: CodeMirror's editable
 * surface is a contenteditable div (CodeEditorView.tsx:86 mounts an EditorView
 * whose .cm-content carries contenteditable). Setting textContent, or
 * dispatching an untrusted KeyboardEvent, performs NO edit at all — CM6 would
 * see nothing, we would time nothing, and the step would silently report a fast
 * zero. A dispatched key event with `text` set is processed by Blink's editing
 * machinery exactly like a keypress, which is also what makes the in-page
 * `beforeinput` meter below fire.
 */
export function keyEventsFor(ch) {
  if (typeof ch !== 'string' || ch.length !== 1) {
    throw new Error(`keyEventsFor: expected exactly one character, got ${JSON.stringify(ch)}`);
  }
  const upper = ch.toUpperCase();
  const isLetter = ch >= 'a' && ch <= 'z';
  const code = ch === ' ' ? 'Space' : isLetter ? `Key${upper}` : null;
  if (!code) {
    throw new Error(`keyEventsFor: only a-z and space are supported (the typed sample is restricted so no key needs a modifier); got ${JSON.stringify(ch)}`);
  }
  const vk = ch === ' ' ? 32 : upper.charCodeAt(0);
  return [
    { type: 'keyDown', key: ch, code, text: ch, unmodifiedText: ch, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk },
    { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk },
  ];
}

// ---------------------------------------------------------------------------
// In-page helpers
// ---------------------------------------------------------------------------

const mark = (cdp, label) =>
  cdp.evaluate(`(() => { if (window.__perfProbe) window.__perfProbe.mark(${JSON.stringify(label)}); return true; })()`);

/**
 * Installs `window.__perfArt`. EVERY selector below was read off master and is
 * cited; a selector that matches nothing measures a silent zero, which is worse
 * than a failure, so each helper returns a REASON string rather than a bare
 * false when it cannot find its target.
 *
 *  - `.framed-shell .drawer-pane` is the app's own way of finding the artifact
 *    panel (ChatView.tsx:355 does exactly this query). The pane is CONDITIONALLY
 *    MOUNTED (ChatView.tsx:1021-1036), so its presence is a valid open-check.
 *    `:not(.game-pane)` matters: the Connect-4 panel shares the class
 *    (ChatView.tsx:1024) and takes precedence over the drawer.
 *  - The drawer only renders for the VISIBLE session (the `visible &&` gate at
 *    ChatView.tsx:1021), so there is exactly one, unlike `.chat-scroll` of which
 *    there is one per open session (ChatView.tsx:749). The chat helper below
 *    still filters by aria-hidden the same way scenario-workload does, because
 *    this scenario shares a page with whatever ran before it.
 *  - The artifact list row is a bare <button> holding a `span.font-mono` with
 *    the file's basename (SessionDrawer.tsx:880-892). It has no id, no
 *    data-testid and no aria-label — verified: there is not one data-testid
 *    anywhere under components/artifact-views/. Matching the filename text
 *    inside the pane is the only handle that exists.
 *  - Toolbar buttons are identified by `title` alone (IconBtn, SessionDrawer.tsx:105-117).
 *  - Edit / Save / Cancel are unlabelled <button>s distinguished only by their
 *    text (SessionDrawer.tsx:760, :768, :778).
 */
// Exported so tests/scenario-artifacts.test.mjs can PARSE the in-page source it
// emits. That source is a string until CDP evaluates it, so a typo in it would
// otherwise surface only during a real run, as an opaque CDP exception.
export async function installArtifactHelpers(cdp) {
  await cdp.evaluate(`(() => {
    const $ = (sel, root) => (root || document).querySelector(sel);
    const all = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
    const nextFrame2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const txt = (el) => (el && el.textContent ? el.textContent.trim() : '');

    const pane = () => $('.framed-shell .drawer-pane:not(.game-pane)');
    // The visible chat pane, same rule as scenario-workload: every open session
    // keeps a mounted ChatView and only the on-screen one lacks aria-hidden
    // (ChatView.tsx:676).
    const chatPane = () => all('.chat-scroll').find((el) => !el.closest('[aria-hidden="true"]')) || null;
    const contentPane = () => { const p = pane(); return p ? $('.artifact-content-pane', p) : null; };

    const helpers = {
      pane, chatPane, contentPane, nextFrame2,
      drawerOpen: () => !!pane(),

      /** Click a header/toolbar button identified by its title attribute. */
      clickTitle: async (title, scopeSel) => {
        const root = scopeSel ? $(scopeSel) : document;
        if (!root) return { ok: false, reason: 'scope ' + scopeSel + ' is not in the DOM' };
        const el = $('button[title=' + JSON.stringify(title) + ']', root);
        if (!el) {
          const titles = all('button[title]', root).map((b) => b.getAttribute('title')).slice(0, 25);
          return { ok: false, reason: 'no button[title=' + JSON.stringify(title) + '] under ' + (scopeSel || 'document') + '; titles present: ' + JSON.stringify(titles) };
        }
        el.click();
        await nextFrame2();
        return { ok: true };
      },

      /**
       * The basenames the artifact list is currently showing, or null when the
       * drawer is not mounted at all. Null and [] must stay distinguishable:
       * "no drawer" and "an empty drawer" are different failures.
       */
      rowNames: () => {
        const p = pane();
        if (!p) return null;
        return all('button', p).filter((b) => $('span.font-mono', b)).map((b) => txt($('span.font-mono', b)));
      },

      /**
       * Click the artifact-list row for one file name.
       * Reports every row it DID see when it misses, so a wrong name or an
       * unregistered artifact is instantly obvious instead of looking like a
       * fast open.
       */
      clickListRow: async (name) => {
        const p = pane();
        if (!p) return { ok: false, reason: 'the artifact drawer is not mounted (.framed-shell .drawer-pane is absent)' };
        const rows = all('button', p).filter((b) => $('span.font-mono', b));
        const hit = rows.find((b) => txt($('span.font-mono', b)) === name);
        if (!hit) {
          return { ok: false, reason: 'no artifact row named ' + JSON.stringify(name) + '; rows in the drawer: ' + JSON.stringify(rows.map((b) => txt($('span.font-mono', b))).slice(0, 30)) };
        }
        hit.click();
        await nextFrame2();
        return { ok: true };
      },

      /** Click a button inside the drawer identified purely by its label text. */
      clickPaneButtonByText: async (label) => {
        const p = pane();
        if (!p) return { ok: false, reason: 'the artifact drawer is not mounted' };
        const btns = all('button', p);
        const hit = btns.find((b) => txt(b) === label);
        if (!hit) {
          return { ok: false, reason: 'no button labelled ' + JSON.stringify(label) + ' in the drawer; labels present: ' + JSON.stringify(btns.map(txt).filter(Boolean).slice(0, 30)) };
        }
        // Report the real reason rather than clicking something the user could
        // not have clicked: the Edit pill is rendered with pointer-events-none
        // while the file list is open (SessionDrawer.tsx:751-757), and a
        // synthetic .click() would sail straight through that and report a
        // latency no user could ever experience.
        const cs = getComputedStyle(hit);
        if (cs.pointerEvents === 'none' || cs.visibility === 'hidden') {
          return { ok: false, reason: 'the button labelled ' + JSON.stringify(label) + ' is present but not clickable (pointer-events: ' + cs.pointerEvents + ', visibility: ' + cs.visibility + ') — collapse the file list first' };
        }
        hit.click();
        await nextFrame2();
        return { ok: true };
      },

      /**
       * Everything the scenario needs to know about what the viewer is
       * currently showing. docPath comes from data-doc-path, which
       * CodeEditorView (:157) and MarkdownView (:48) both stamp with the
       * artifact's own path prop — so it proves WHICH file is mounted, not just
       * that something is.
       */
      viewerState: () => {
        const c = contentPane();
        const viewer = c ? $('[data-artifact-viewer]', c) : null;
        const cm = c ? $('.cm-content', c) : null;
        const frame = c ? $('iframe[title="HTML preview"]', c) : null;
        const ta = c ? $('textarea.artifact-edit-textarea', c) : null;
        return {
          hasPane: !!c,
          source: viewer ? viewer.getAttribute('data-artifact-source') : null,
          docPath: viewer ? viewer.getAttribute('data-doc-path') : null,
          hasCm: !!cm,
          // CM6 always emits the attribute and flips its VALUE with edit mode
          // (EditorView.editable, CodeEditorView.tsx:52-55) — so this is the
          // reliable "am I actually in edit mode" probe.
          cmEditable: cm ? cm.getAttribute('contenteditable') === 'true' : null,
          cmTextLen: cm ? cm.textContent.length : null,
          hasTextarea: !!ta,
          textareaLen: ta ? ta.value.length : null,
          hasFrame: !!frame,
          frameSrcLen: frame ? (frame.getAttribute('srcdoc') || '').length : null,
          // Tail of the pane's text, so a failure can quote the app's OWN error
          // copy (ActiveArtifactView renders read errors and save failures
          // inline, :500 and :544-551) instead of a rig-invented guess.
          tail: c ? c.innerText.slice(-240) : '',
        };
      },

      // ── HTML preview watcher ──────────────────────────────────────────────
      // The iframe is REPLACED, not updated, when the selected artifact changes:
      // ViewerErrorBoundary is keyed by artifact.id (ActiveArtifactView.tsx:569)
      // so the whole viewer subtree remounts. A load listener bound once to one
      // element would therefore go quiet after the first swap. A MutationObserver
      // re-binds to whatever frame is currently mounted, and the same listener
      // also catches a plain srcdoc change on a surviving element.
      html: (() => {
        const state = { loads: [], navs: [], ready: null, bound: 0, observing: false, err: null };
        let seen = null;
        const bind = () => {
          const f = $('iframe[title="HTML preview"]');
          if (!f || f === seen) return;
          seen = f;
          state.bound++;
          f.addEventListener('load', () => {
            state.loads.push({ t: Math.round(performance.now()), len: (f.getAttribute('srcdoc') || '').length });
          });
        };
        const onMessage = (e) => {
          const d = e.data;
          if (!d || typeof d.t !== 'string') return;
          if (d.t === 'perf-lab-nav-ready') state.ready = { t: Math.round(performance.now()), sections: d.sections };
          else if (d.t === 'perf-lab-nav-done') state.navs.push({ id: d.id, ms: d.ms, found: !!d.found });
        };
        return {
          state,
          install() {
            if (state.observing) return true;
            try {
              const obs = new MutationObserver(bind);
              obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['srcdoc'] });
              window.addEventListener('message', onMessage);
              state.observing = true;
              bind();
            } catch (err) {
              state.err = String(err && err.message ? err.message : err);
            }
            return state.observing;
          },
          reset() { state.loads.length = 0; state.navs.length = 0; },
          /** Ask the previewed page to navigate to a section. */
          nav(id, hash) {
            const f = $('iframe[title="HTML preview"]');
            if (!f || !f.contentWindow) return { ok: false, reason: 'no iframe[title="HTML preview"] is mounted' };
            if (state.ready === null) return { ok: false, reason: 'the preview frame never announced itself — its inline script did not run, so an in-page navigation cannot be requested or timed' };
            f.contentWindow.postMessage({ t: 'perf-lab-nav', id, to: hash }, '*');
            return { ok: true };
          },
        };
      })(),

      // ── Keystroke meter ───────────────────────────────────────────────────
      // Measures keystroke -> painted, entirely in-page. WHY in-page: driving
      // the keys from Node costs a CDP round trip per key, so a Node-side timer
      // would include the rig's own transport and could not resolve better than
      // that. beforeinput is the browser's own "an edit is about to be applied"
      // event and fires for trusted key input on both contenteditable (CM6) and
      // <textarea> (the markdown editor), so one meter serves both surfaces.
      keys: (() => {
        let el = null, handler = null, samples = [], pendingAt = null, dropped = 0;
        return {
          arm(sel) {
            this.disarm();
            el = $(sel);
            if (!el) return { ok: false, reason: 'no element matches ' + sel + ' — nothing to type into' };
            samples = []; pendingAt = null; dropped = 0;
            handler = () => {
              // One measurement in flight at a time. A second beforeinput before
              // the first has painted means the app is behind; count it rather
              // than overwrite, so a backlog cannot masquerade as fast typing.
              if (pendingAt !== null) { dropped++; return; }
              pendingAt = performance.now();
              requestAnimationFrame(() => requestAnimationFrame(() => {
                samples.push(Math.round((performance.now() - pendingAt) * 10) / 10);
                pendingAt = null;
              }));
            };
            el.addEventListener('beforeinput', handler, true);
            return { ok: true };
          },
          read() { return { samples: samples.slice(), dropped }; },
          disarm() {
            if (el && handler) { try { el.removeEventListener('beforeinput', handler, true); } catch (e) { /* element gone */ } }
            el = null; handler = null;
          },
        };
      })(),

      // ── Copy button on a code block ───────────────────────────────────────
      // The button has NO aria-label, title, id or data-testid — verified by
      // reading it (MarkdownContent.tsx:115-139). Its only stable anchors are
      // the sibling <pre class="yc-code"> (:193, whose comment says the class is
      // load-bearing and must not be dropped) and its own label text.
      copy: {
        // '@chat' is a sentinel for "the visible chat pane", which no CSS
        // selector can express (see chatPane above). Anything else is a plain
        // selector.
        resolve: (scopeSel) => (scopeSel === '@chat' ? chatPane() : $(scopeSel)),
        blocks: (scopeSel) => {
          const root = (scopeSel === '@chat') ? chatPane() : $(scopeSel);
          // -1 means "the scope itself is absent", which must stay
          // distinguishable from 0 ("the scope is there and has no code blocks").
          return root ? all('pre.yc-code', root).length : -1;
        },
        /**
         * Click the copy button belonging to the Nth code block in scopeSel.
         * Success is the label flipping to 'Copied!' (MarkdownContent.tsx:136),
         * which reverts after 2000ms (:121) — so the caller must read it inside
         * that window.
         */
        click: async (scopeSel, index) => {
          const root = (scopeSel === '@chat') ? chatPane() : $(scopeSel);
          if (!root) return { ok: false, reason: scopeSel === '@chat' ? 'no visible .chat-scroll — every ChatView reported aria-hidden, so there is no conversation on screen to copy from' : 'scope ' + scopeSel + ' is not in the DOM' };
          const pres = all('pre.yc-code', root);
          if (!pres.length) return { ok: false, reason: 'no pre.yc-code inside ' + scopeSel + ' — this surface is rendering no fenced code blocks at all' };
          const pre = pres[Math.min(index, pres.length - 1)];
          const wrap = pre.parentElement;
          const btn = wrap ? all('button', wrap).find((b) => txt(b) === 'Copy' || txt(b) === 'Copied!') : null;
          if (!btn) return { ok: false, reason: 'found pre.yc-code but no sibling button labelled Copy — MarkdownContent renders CopyButton only when hastText() returned non-empty text' };
          const t0 = performance.now();
          btn.click();
          await nextFrame2();
          // Poll briefly: the flip is a setState, so it lands on a later frame.
          for (let i = 0; i < 40 && txt(btn) !== 'Copied!'; i++) await nextFrame2();
          const ok = txt(btn) === 'Copied!';
          return {
            ok,
            ms: Math.round((performance.now() - t0) * 10) / 10,
            blocks: pres.length,
            copiedChars: pre.textContent.length,
            reason: ok ? null : 'the button never flipped to "Copied!" — its label is still ' + JSON.stringify(txt(btn)),
          };
        },
      },
    };
    window.__perfArt = helpers;
    return true;
  })()`);
}

// ---------------------------------------------------------------------------
// Step wrapper — this is where "both probes, per step" actually happens
// ---------------------------------------------------------------------------

/**
 * Runs one step of the journey with BOTH probes scoped to exactly it.
 *
 * The renderer probe is installed once for the whole scenario and sliced by
 * marks (readProbeWindow). The IPC probe has no windowing API, so it is
 * install/read/stop around each step instead — installIpcStallProbe is
 * documented to replace any previous probe, so this is its intended use and it
 * costs nothing but a restarted 50ms interval. The consequence, stated plainly
 * so nobody reads the totals wrong: the gaps BETWEEN steps are not covered by
 * any IPC probe, so `ipcTotals` below is a sum over steps, not over the run.
 *
 * A 50ms ping interval (rather than probe-ipc's 100ms default) because these
 * steps are short — a two-second step at 100ms yields ~20 samples, which is too
 * few for a p95 to mean anything.
 */
async function step(cdp, label, fn, { pingMs = 50 } = {}) {
  await mark(cdp, `${label}:start`);
  await installIpcStallProbe(cdp, { everyMs: pingMs });
  let result, thrown = null;
  try {
    result = await fn();
  } catch (err) {
    thrown = err;
    result = { ok: false, reason: err.message };
  }
  await mark(cdp, `${label}:end`);
  let ipc = null;
  try { ipc = await readIpcStallProbe(cdp); } catch (err) { ipc = { error: err.message }; }
  try { await stopIpcStallProbe(cdp); } catch { /* page gone */ }
  let probe = null;
  try { probe = await readProbeWindow(cdp, `${label}:start`, `${label}:end`); } catch (err) { probe = { error: err.message }; }
  const out = { ...result, probe, ipc, stall: attributeStall(ipc, probe) };
  // A step that threw still reports its probes (the numbers are real and often
  // explain the throw), but the error is not swallowed — the caller decides.
  if (thrown) out.threw = thrown.message;
  return out;
}

// ---------------------------------------------------------------------------
// Fixture files
// ---------------------------------------------------------------------------

/**
 * Writes the artifact files to disk and registers each one with the app.
 *
 * There is no "create an artifact" API — verified by reading the whole preload
 * artifacts surface (preload.ts:1301-1370): the methods are list/get/save/
 * appendVersion/rename/..., and no create. Artifacts come into existence as a
 * SIDE EFFECT of the renderer observing a Write/Edit tool call and calling
 * artifacts:append-version, which mints the record (artifact-store.ts:272-284).
 * So the honest way for the rig to produce one is exactly that: put the file on
 * disk, then tell the app an agent wrote it.
 *
 * appendVersion returns { ok, project } and NOT the new id (ipc-handlers.ts:3521),
 * so the ids are read back with artifacts:list-session afterwards.
 */
function writeArtifactFiles(fixture, { dirName, smallBytes, largeBytes }) {
  const root = fixture.projects.alpha;
  const dir = join(root, dirName);
  mkdirSync(dir, { recursive: true });

  const files = {};
  const put = (key, base, text, extra = {}) => {
    const abs = join(dir, base);
    writeFileSync(abs, text);
    files[key] = { key, name: base, rel: `${dirName}/${base}`, abs, bytes: statSync(abs).size, ...extra };
  };

  put('codeSmall', 'perf-small.ts', buildCodeArtifact({ approxBytes: smallBytes, seed: 11 }));
  put('codeLarge', 'perf-large.ts', buildCodeArtifact({ approxBytes: largeBytes, seed: 12 }));

  const mdS = buildMarkdownArtifact({ approxBytes: smallBytes, seed: 21 });
  put('mdSmall', 'perf-small.md', mdS.text, { fences: mdS.fences });
  const mdL = buildMarkdownArtifact({ approxBytes: largeBytes, seed: 22 });
  put('mdLarge', 'perf-large.md', mdL.text, { fences: mdL.fences });

  const htmlS = buildHtmlArtifact({ approxBytes: smallBytes, sections: 4, seed: 31 });
  put('htmlSmall', 'perf-small.html', htmlS.text, { sections: htmlS.sections });
  const htmlL = buildHtmlArtifact({ approxBytes: largeBytes, sections: 6, seed: 32 });
  put('htmlLarge', 'perf-large.html', htmlL.text, { sections: htmlL.sections });

  return files;
}

/** Register every written file with the app and read the assigned ids back.
 *  Exported for the same parse-the-emitted-source reason as above. */
export async function registerArtifacts(cdp, projectRoot, sessionId, files) {
  const rels = Object.values(files).map((f) => f.rel);
  const res = await cdp.evaluate(`(async () => {
    const out = [];
    for (const rel of ${JSON.stringify(rels)}) {
      try {
        const r = await window.claude.artifacts.appendVersion(
          ${JSON.stringify(projectRoot)}, ${JSON.stringify(sessionId)},
          // kind 'internal' + absolutePath null is the shape the app's own
          // tracker sends for a file inside the project root
          // (artifact-tool-use-tracker.ts) and the shape the handler types
          // (ipc-handlers.ts:3475-3482). toolUseId makes the append idempotent.
          { path: rel, kind: 'internal', absolutePath: null, type: 'create', author: 'agent', toolUseId: 'perf-lab-' + rel });
        out.push({ rel, ok: !!(r && r.ok), raw: r });
      } catch (e) {
        out.push({ rel, ok: false, error: (e && e.message) ? e.message : String(e) });
      }
    }
    let listed = null;
    try {
      const l = await window.claude.artifacts.listSession(${JSON.stringify(sessionId)}, ${JSON.stringify(projectRoot)});
      listed = (l && l.ok && Array.isArray(l.artifacts)) ? l.artifacts.map((a) => ({ id: a.id, path: a.path })) : null;
    } catch (e) {
      listed = { error: (e && e.message) ? e.message : String(e) };
    }
    return { appended: out, listed };
  })()`);

  const failed = (res.appended ?? []).filter((a) => !a.ok);
  if (failed.length) {
    throw new Error(
      `artifacts: the app refused to register ${failed.length} of ${rels.length} fixture files — ` +
      `${JSON.stringify(failed.slice(0, 3))}. Every later step opens files by name, so none of them would measure anything.`
    );
  }
  if (!Array.isArray(res.listed)) {
    throw new Error(`artifacts: artifacts:list-session did not return a list after registering (${JSON.stringify(res.listed)}) — the drawer would show no rows to click.`);
  }
  const byPath = new Map(res.listed.map((a) => [a.path, a.id]));
  const missing = rels.filter((r) => !byPath.has(r));
  if (missing.length) {
    throw new Error(
      `artifacts: registered ${rels.length} files but list-session came back without ${JSON.stringify(missing)} ` +
      `(it listed ${JSON.stringify(res.listed.map((a) => a.path))}). Opening them by name would silently miss.`
    );
  }
  for (const f of Object.values(files)) f.id = byPath.get(f.rel);
  return res.listed.length;
}

// ---------------------------------------------------------------------------
// Small waiters
// ---------------------------------------------------------------------------

/**
 * Waits for a fresh session to finish initialising. Same two-phase shape as
 * scenario-workload's: a bare "wait for the overlay to be absent" is satisfied
 * instantly before the overlay has mounted, which would measure nothing. Text
 * is `Initializing session...` (App.tsx:2871).
 */
async function waitForSessionReady(cdp, { appearMs = 1500, clearMs = 60000 } = {}) {
  const gone = `!document.body.innerText.includes('Initializing session')`;
  const t0 = Date.now();
  while (Date.now() - t0 < appearMs) {
    if (!(await cdp.evaluate(gone))) break;
    await sleep(25);
  }
  await waitFor(cdp, gone, { timeoutMs: clearMs, everyMs: 100 });
}

/**
 * Clicks a drawer button by label, retrying until it is present AND clickable.
 *
 * WHY a retry rather than a single click: the Edit pill is gated on
 * `editState.isEditable` (SessionDrawer.tsx:748), which ActiveArtifactView
 * reports through an effect AFTER the viewer has mounted and the content has
 * arrived — so for the first frames after selecting a file the pill does not
 * exist yet. A single click would report "no button labelled Edit" for a button
 * that appears 30ms later, which is a rig failure dressed up as an app finding.
 * The last failure reason is returned verbatim when the wait really does expire.
 */
async function clickPaneButton(cdp, label, { timeoutMs = 10000, everyMs = 60 } = {}) {
  const t0 = Date.now();
  let last = { ok: false, reason: 'never attempted' };
  while (Date.now() - t0 < timeoutMs) {
    last = await cdp.evaluate(`window.__perfArt.clickPaneButtonByText(${JSON.stringify(label)})`);
    if (last.ok) return { ...last, waitedMs: Date.now() - t0 };
    await sleep(everyMs);
  }
  return { ...last, waitedMs: Date.now() - t0 };
}

/**
 * Polls viewerState() until `pred` (a Node-side function over the returned
 * object) holds. Returns the LAST state either way, so a caller that times out
 * can quote what the pane actually showed instead of guessing at a cause.
 */
async function waitForViewer(cdp, pred, { timeoutMs = 30000, everyMs = 50 } = {}) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = await cdp.evaluate(`window.__perfArt.viewerState()`);
    if (pred(last)) return { ok: true, ms: Date.now() - t0, state: last };
    await sleep(everyMs);
  }
  return { ok: false, ms: Date.now() - t0, state: last };
}

// ---------------------------------------------------------------------------
// The scenario
// ---------------------------------------------------------------------------

/**
 * @param {object} app      launch.mjs App — { cdp, family(), … }
 * @param {object} fixture  fixture.mjs FixtureInfo
 * @param {object} [opts]
 * @param {number} [opts.smallBytes=3000]    target size of each "small" artifact
 * @param {number} [opts.largeBytes=400000]  target size of each "large" artifact.
 *   Kept well under EDIT_MAX_BYTES (3 MB, editable-path-policy.ts:99): above
 *   that the pane serves a PREFIX and goes read-only, so the typing step would
 *   have nothing to type into.
 * @param {number} [opts.keystrokes=30]      characters typed into each editor
 * @param {number} [opts.keyDelayMs=45]      gap between keystrokes (fast human)
 * @param {number} [opts.htmlSwaps=4]        HTML artifact swaps to time
 * @param {number} [opts.inPageNavs=4]       in-document navigations to time
 * @param {boolean} [opts.keepSession=false] leave the session + drawer open
 *   (for the screenshot pass)
 */
export async function runArtifactScenario(app, fixture, {
  smallBytes = 3000,
  largeBytes = 400000,
  keystrokes = 30,
  keyDelayMs = 45,
  htmlSwaps = 4,
  inPageNavs = 4,
  keepSession = false,
  dirName = 'perf-artifacts',
} = {}) {
  const cdp = app.cdp;
  const projectRoot = fixture.projects.alpha;
  const warnings = [];
  let sessionId = null;

  await installProbe(cdp);
  await installArtifactHelpers(cdp);

  try {
    // ── 0. A session with a real conversation in it ──────────────────────
    // Resumed, not fresh. WHY: fake-claude creates an EMPTY transcript for a new
    // session (fake-claude.cjs never writes turns of its own), so a fresh
    // session's chat pane has no messages and therefore no code blocks — the
    // copy step would have had nothing to click and would have reported a miss
    // every run. The fixture pre-builds transcripts and `resumeSessionId` is the
    // app's own resume path (used the same way by scenario-history.mjs:230-235).
    const t = fixture.transcripts?.small ?? Object.values(fixture.transcripts ?? {})[0] ?? null;
    if (!t) warnings.push('fixture exposed no pre-built transcripts — the session starts empty and the copy-from-chat leg will fall back to the markdown artifact');

    const created = await step(cdp, 'artifacts:session', async () => {
      const r = await cdp.evaluate(`(async () => {
        const t0 = performance.now();
        try {
          const s = await window.claude.session.create({
            name: 'perf-artifacts',
            cwd: ${JSON.stringify(projectRoot)},
            skipPermissions: true,
            ${t ? `resumeSessionId: ${JSON.stringify(t.sessionId)},` : ''}
          });
          return { id: s && s.id, ms: Math.round(performance.now() - t0) };
        } catch (e) {
          // The app's own message — session-manager throws specific text, and
          // replacing it with a guess would send the next session down the
          // wrong path entirely.
          return { error: (e && e.message) ? e.message : String(e) };
        }
      })()`);
      if (!r || r.error || !r.id) {
        throw new Error(`artifacts: session.create failed in the app: ${r?.error ?? JSON.stringify(r)}`);
      }
      sessionId = r.id;
      await waitForSessionReady(cdp);
      return { ok: true, createMs: r.ms, resumedTurns: t?.turns ?? null };
    });
    if (!sessionId) throw new Error(`artifacts: no session id after create — ${created.reason ?? created.threw ?? 'unknown'}`);

    // ── 1. Register the fixture artifacts ────────────────────────────────
    const files = writeArtifactFiles(fixture, { dirName, smallBytes, largeBytes });
    const registered = await registerArtifacts(cdp, projectRoot, sessionId, files);

    // ── 2. Open the drawer ───────────────────────────────────────────────
    // `button[title="Session Files"]` is the header toggle (HeaderBar.tsx:260).
    // A narrow window moves it into the ||| overflow menu (OverflowMenu.tsx:99
    // carries the same dispatch), which is reported rather than guessed at.
    const drawer = await step(cdp, 'artifacts:drawer-open', async () => {
      const click = await cdp.evaluate(`window.__perfArt.clickTitle('Session Files')`);
      if (!click.ok) throw new Error(`artifacts: could not open the session-files drawer — ${click.reason}`);
      const t0 = Date.now();
      await waitFor(cdp, `window.__perfArt.drawerOpen()`, { timeoutMs: 15000, everyMs: 25 });
      const paneMs = Date.now() - t0;
      // The pane appearing is NOT the list being ready. SessionDrawer's
      // projectRoot comes from useActiveProject, which is gated on the drawer
      // being open (ChatView.tsx:128) and resolves through an async
      // artifacts:list-projects-index — so for the first frames the drawer runs
      // with projectRoot '' and lists nothing. Clicking a row in that window
      // would miss and look like a missing artifact. Wait for the rows instead.
      const probeName = files.codeSmall.name;
      try {
        await waitFor(cdp, `(() => { const n = window.__perfArt.rowNames(); return !!(n && n.indexOf(${JSON.stringify(files.codeSmall.name)}) >= 0); })()`,
          { timeoutMs: 30000, everyMs: 50 });
      } catch (err) {
        const names = await cdp.evaluate(`window.__perfArt.rowNames()`);
        throw new Error(
          `artifacts: the drawer opened but never listed ${probeName} within 30s. It listed ${JSON.stringify(names)}. ` +
          `The files were registered against projectRoot ${JSON.stringify(projectRoot)}; if the drawer resolved a different ` +
          `project root, every open below would have measured a miss instead of a file.`
        );
      }
      return { ok: true, openMs: paneMs, listedMs: Date.now() - t0 };
    });

    if (!drawer.ok) {
      // Everything below this point clicks inside the drawer. Continuing would
      // produce a full report of identical "the drawer is not mounted" misses
      // and bury the one thing that actually went wrong.
      throw new Error(`artifacts: the session-files drawer never opened — ${drawer.reason ?? drawer.threw ?? 'no reason reported'}`);
    }

    // ── 3. Open each artifact, small then large ──────────────────────────
    // The drawer's rows are one click each; the interesting number is how long
    // the VIEWER takes to be genuinely mounted for that file, which is why every
    // open waits on data-doc-path matching the file we asked for rather than on
    // "some viewer exists".
    await cdp.evaluate(`window.__perfArt.html.install()`);

    const opens = {};
    const openOne = async (f, want) => step(cdp, `artifacts:open-${f.key}`, async () => {
      // Bring the list back if a previous step collapsed it. 'Show list' and
      // 'Hide list' are the same IconBtn with a state-dependent title
      // (SessionDrawer.tsx:641), so asking for the wrong one is not an error —
      // it just means the list was already in the state we wanted.
      await cdp.evaluate(`window.__perfArt.clickTitle('Show list')`);
      // For an HTML artifact the iframe ELEMENT and its srcdoc attribute both
      // exist before the document inside has parsed, so "the frame is there" is
      // not "the page is up". Count the frame's own load events across the click
      // instead; anything else would time React and call it a page load.
      const loadsBefore = want.needsLoad ? await cdp.evaluate(`window.__perfArt.html.state.loads.length`) : 0;
      const t0 = Date.now();
      const click = await cdp.evaluate(`window.__perfArt.clickListRow(${JSON.stringify(f.name)})`);
      if (!click.ok) throw new Error(`artifacts: could not open ${f.name} — ${click.reason}`);
      if (want.needsLoad) {
        try {
          await waitFor(cdp, `window.__perfArt.html.state.loads.length > ${loadsBefore}`, { timeoutMs: 60000, everyMs: 25 });
        } catch (err) {
          const st = await cdp.evaluate(`window.__perfArt.viewerState()`);
          throw new Error(
            `artifacts: the HTML preview never fired a load event for ${f.name} within 60s (${err.message}). ` +
            `The pane reports hasFrame=${st?.hasFrame} frameSrcLen=${st?.frameSrcLen}` +
            `${st?.tail ? `, and shows: ${JSON.stringify(st.tail)}` : ''}`
          );
        }
      }
      const got = await waitForViewer(cdp, want.pred, { timeoutMs: 60000 });
      if (!got.ok) {
        throw new Error(
          `artifacts: ${f.name} never reached ${want.label} within 60s — the pane last reported ` +
          `${JSON.stringify({ source: got.state?.source, docPath: got.state?.docPath, hasCm: got.state?.hasCm, hasFrame: got.state?.hasFrame })}` +
          `${got.state?.tail ? `, and shows: ${JSON.stringify(got.state.tail)}` : ''}`
        );
      }
      return { ok: true, openMs: Date.now() - t0, bytes: f.bytes, viewer: got.state.source, docPath: got.state.docPath };
    });

    // Code files route to the lazy CodeEditorView (RendererRegistry.ts:22, :30-38).
    // The SMALL one is opened first ON PURPOSE and its number carries the ~150KB
    // chunk fetch plus a language chunk; the LARGE one is the clean comparison
    // because the chunks are already resolved by then. Both are reported, and
    // `chunkLoadIncluded` says which is which so nobody compares them naively.
    opens.codeSmall = { ...(await openOne(files.codeSmall, {
      label: 'a mounted CodeMirror editor for that path',
      pred: (s) => s.source === 'cm6' && s.docPath === files.codeSmall.rel && s.hasCm,
    })), chunkLoadIncluded: true };
    opens.codeLarge = { ...(await openOne(files.codeLarge, {
      label: 'a mounted CodeMirror editor for that path',
      pred: (s) => s.source === 'cm6' && s.docPath === files.codeLarge.rel && s.hasCm,
    })), chunkLoadIncluded: false };

    // Markdown routes to MarkdownView -> MarkdownContent (RendererRegistry.ts:27,
    // MarkdownView.tsx:55) — the same component, and the same unmemoized
    // hastText() per fence, that the transcript uses. data-artifact-source is
    // 'rendered' for .md (MarkdownView.tsx:52).
    opens.mdSmall = { ...(await openOne(files.mdSmall, {
      label: 'the rendered markdown viewer for that path',
      pred: (s) => s.source === 'rendered' && s.docPath === files.mdSmall.rel,
    })), fences: files.mdSmall.fences };
    opens.mdLarge = { ...(await openOne(files.mdLarge, {
      label: 'the rendered markdown viewer for that path',
      pred: (s) => s.source === 'rendered' && s.docPath === files.mdLarge.rel,
    })), fences: files.mdLarge.fences };

    // HtmlView has no data-artifact-viewer marker at all — it is only an iframe
    // (HtmlView.tsx:39-46) — so the open-check is the frame itself plus a srcdoc
    // long enough to be this file rather than the previous one.
    opens.htmlSmall = await openOne(files.htmlSmall, {
      label: 'a loaded HTML preview iframe',
      needsLoad: true,
      pred: (s) => s.hasFrame && s.frameSrcLen > 0,
    });

    // ── 4. HTML navigation ───────────────────────────────────────────────
    // Two genuinely different things, measured separately because they cost
    // different things and only one of them is suspect 2:
    //
    //  (a) SWAPS — selecting a different HTML artifact. This is the app-level
    //      "navigate to another document": the viewer subtree remounts and the
    //      new document is parsed from scratch by the browser. Timed to the
    //      frame's own `load` event, so it covers parse + script execution, not
    //      just React's render.
    //  (b) IN-PAGE — a navigation INSIDE the previewed document. HtmlView
    //      provides no back/forward/reload/address bar (verified: none exist in
    //      the file), and the frame is an opaque origin, so this can only be
    //      driven and observed through the page's own postMessage channel.
    const htmlNav = await step(cdp, 'artifacts:html-nav', async () => {
      const swaps = [];
      const order = [];
      for (let i = 0; i < htmlSwaps; i++) order.push(i % 2 ? files.htmlSmall : files.htmlLarge);
      for (const f of order) {
        await cdp.evaluate(`window.__perfArt.clickTitle('Show list')`);
        const before = await cdp.evaluate(`window.__perfArt.html.state.loads.length`);
        const t0 = Date.now();
        const click = await cdp.evaluate(`window.__perfArt.clickListRow(${JSON.stringify(f.name)})`);
        if (!click.ok) { swaps.push({ to: f.key, ms: null, ok: false, reason: click.reason }); continue; }
        let loaded = false;
        try {
          await waitFor(cdp, `window.__perfArt.html.state.loads.length > ${before}`, { timeoutMs: 60000, everyMs: 25 });
          loaded = true;
        } catch (err) {
          // Never fall back to "the iframe element exists" — the element is in
          // the DOM before the document inside it has parsed, so that would time
          // React and call it a page load.
          swaps.push({ to: f.key, ms: null, ok: false, bytes: f.bytes, reason: `the preview frame never fired a load event for ${f.name} within 60s (${err.message})` });
          continue;
        }
        swaps.push({ to: f.key, ms: Date.now() - t0, ok: loaded, bytes: f.bytes });
      }

      // In-page navigation happens on whatever document is showing now.
      const navs = [];
      const ready = await cdp.evaluate(`window.__perfArt.html.state.ready`);
      let inPageReason = null;
      if (!ready) {
        inPageReason = 'the previewed page never posted its ready message — its inline script did not run in the sandboxed frame, so no in-document navigation could be requested';
      } else {
        for (let i = 0; i < inPageNavs; i++) {
          const target = `#s${(i % Math.max(1, ready.sections - 1)) + 1}`;
          const before = await cdp.evaluate(`window.__perfArt.html.state.navs.length`);
          const sent = await cdp.evaluate(`window.__perfArt.html.nav(${i}, ${JSON.stringify(target)})`);
          if (!sent.ok) { navs.push({ to: target, ms: null, ok: false, reason: sent.reason }); continue; }
          try {
            await waitFor(cdp, `window.__perfArt.html.state.navs.length > ${before}`, { timeoutMs: 20000, everyMs: 20 });
            const last = await cdp.evaluate(`window.__perfArt.html.state.navs[window.__perfArt.html.state.navs.length - 1]`);
            navs.push({ to: target, ms: last.ms, ok: !!last.found, reason: last.found ? null : `the page reported no element matching ${target}` });
          } catch (err) {
            navs.push({ to: target, ms: null, ok: false, reason: `the page never acknowledged the navigation (${err.message})` });
          }
        }
      }

      const swapMs = swaps.filter((s) => s.ok).map((s) => s.ms);
      return {
        ok: swapMs.length > 0,
        swaps,
        swap: summarise(swapMs),
        // Swap cost split by document size — this is the cost-vs-size read for
        // suspect 2.
        swapSmall: summarise(swaps.filter((s) => s.ok && s.to === 'htmlSmall').map((s) => s.ms)),
        swapLarge: summarise(swaps.filter((s) => s.ok && s.to === 'htmlLarge').map((s) => s.ms)),
        inPage: summarise(navs.filter((n) => n.ok).map((n) => n.ms)),
        inPageNavs: navs,
        inPageReason,
        framesBound: (await cdp.evaluate(`window.__perfArt.html.state.bound`)),
      };
    });

    // ── 5. Typing into the editor ────────────────────────────────────────
    const typing = {};
    for (const key of ['codeSmall', 'codeLarge']) {
      const f = files[key];
      typing[key] = await step(cdp, `artifacts:type-${key}`, async () => {
        // Select the file, then collapse the list — the Edit pill is rendered
        // pointer-events-none while the list is open (SessionDrawer.tsx:751-757),
        // so a user genuinely cannot click it until the list is away.
        await cdp.evaluate(`window.__perfArt.clickTitle('Show list')`);
        const pick = await cdp.evaluate(`window.__perfArt.clickListRow(${JSON.stringify(f.name)})`);
        if (!pick.ok) throw new Error(`artifacts: could not select ${f.name} before typing — ${pick.reason}`);
        const mounted = await waitForViewer(cdp, (s) => s.source === 'cm6' && s.docPath === f.rel && s.hasCm, { timeoutMs: 60000 });
        if (!mounted.ok) throw new Error(`artifacts: ${f.name} did not mount a CodeMirror editor before typing — pane reported ${JSON.stringify(mounted.state)}`);

        const hide = await cdp.evaluate(`window.__perfArt.clickTitle('Hide list')`);
        if (!hide.ok) warnings.push(`type-${key}: could not collapse the file list (${hide.reason}) — the Edit control may be unreachable`);
        const edit = await clickPaneButton(cdp, 'Edit');
        if (!edit.ok) throw new Error(`artifacts: could not enter edit mode on ${f.name} — ${edit.reason}`);

        // Edit mode is proven by CodeMirror's own contenteditable flipping to
        // "true" (CodeEditorView.tsx:52-55 reconfigures EditorView.editable),
        // never by the button having been clicked.
        const editable = await waitForViewer(cdp, (s) => s.hasCm && s.cmEditable === true, { timeoutMs: 20000 });
        if (!editable.ok) {
          throw new Error(`artifacts: clicked Edit on ${f.name} but .cm-content never became contenteditable="true" — the editor is still read-only, so any keystroke timing would be timing nothing. Pane shows: ${JSON.stringify(editable.state?.tail ?? '')}`);
        }

        // Place a real caret: focus alone can leave CM6 without a selection, and
        // an insertion with no selection is a no-op. Clicking the last visible
        // line is what a user does, and CDP mouse coordinates are viewport CSS
        // pixels, the same space getBoundingClientRect reports in.
        const spot = await cdp.evaluate(`(() => {
          const c = window.__perfArt.contentPane();
          const lines = c ? Array.prototype.slice.call(c.querySelectorAll('.cm-line')) : [];
          if (!lines.length) return null;
          const r = lines[Math.min(2, lines.length - 1)].getBoundingClientRect();
          return { x: Math.round(r.left + Math.min(6, r.width / 2)), y: Math.round(r.top + r.height / 2) };
        })()`);
        if (!spot) throw new Error(`artifacts: no .cm-line inside the editor for ${f.name}, so there is nowhere to place a caret (CodeMirror renders only viewport lines).`);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: spot.x, y: spot.y, button: 'left', buttons: 1, clickCount: 1 });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: spot.x, y: spot.y, button: 'left', buttons: 0, clickCount: 1 });
        await sleep(80);

        const armed = await cdp.evaluate(`window.__perfArt.keys.arm('.artifact-content-pane .cm-content')`);
        if (!armed.ok) throw new Error(`artifacts: could not arm the keystroke meter — ${armed.reason}`);
        const lenBefore = (await cdp.evaluate(`window.__perfArt.viewerState()`)).cmTextLen;

        // Only a-z and space, so no keystroke needs a modifier and none of them
        // can open a bracket pair or trigger auto-indent — the measurement is
        // plain insertion, not CodeMirror's input handlers doing something else.
        const sample = 'perf lab typing sample ';
        const dispatchMs = [];
        for (let i = 0; i < keystrokes; i++) {
          const ch = sample[i % sample.length];
          const [down, up] = keyEventsFor(ch);
          const t0 = Date.now();
          await cdp.send('Input.dispatchKeyEvent', down);
          await cdp.send('Input.dispatchKeyEvent', up);
          // The Input command is acknowledged after the renderer has processed
          // the event, so this INCLUDES the app's handling plus CDP transport.
          // Reported next to the in-page number, never instead of it.
          dispatchMs.push(Date.now() - t0);
          if (keyDelayMs > 0) await sleep(keyDelayMs);
        }
        await sleep(200);
        const meter = await cdp.evaluate(`window.__perfArt.keys.read()`);
        await cdp.evaluate(`window.__perfArt.keys.disarm()`);

        // Proof the keystrokes LANDED, by looking for the text we typed.
        //
        // WHY not a length delta: CodeMirror renders only the lines in its
        // viewport (CodeEditorView.tsx:10-12 says so explicitly), so typing can
        // push a line out of view and SHRINK .cm-content's textContent even
        // though the edit worked perfectly. A length check would then throw and
        // blame the app for the rig's arithmetic. The typed characters are
        // inserted contiguously at a caret that stays on screen, so the sample
        // prefix is a substring of the rendered text if and only if the typing
        // reached the editor. The length delta is still reported, as an
        // observation rather than a gate.
        const typedPrefix = sample.slice(0, Math.min(keystrokes, sample.length));
        const after = await cdp.evaluate(`(() => {
          const c = document.querySelector('.artifact-content-pane .cm-content');
          if (!c) return null;
          const t = c.textContent;
          return { len: t.length, has: t.indexOf(${JSON.stringify(typedPrefix)}) >= 0 };
        })()`);
        if (!after) {
          throw new Error(`artifacts: the CodeMirror surface vanished from the pane while typing into ${f.name} — nothing can be concluded from the latencies above.`);
        }
        if (!after.has) {
          throw new Error(
            `artifacts: typed ${keystrokes} characters into ${f.name} but ${JSON.stringify(typedPrefix)} is nowhere in the editor's rendered text ` +
            `(length went ${lenBefore} -> ${after.len}). The keys never reached CodeMirror, so every latency below would be fiction.`
          );
        }
        const grew = after.len - (lenBefore ?? 0);
        // The typing demonstrably worked (the sample is in the document), so a
        // meter with no samples means beforeinput did not fire on this surface —
        // an instrumentation gap, NOT a fast app. Say so, because `keystroke`
        // will be all-nulls and a reader could otherwise mistake it for "not
        // measured because nothing happened".
        if (!meter.samples.length) {
          warnings.push(`type-${key}: the typed text landed but no beforeinput fired on .cm-content, so keystroke-to-paint could not be measured; only the Node-side dispatch times are available for this step`);
        }

        // Save through the app's real path (artifacts:save, ipc-handlers.ts:3849)
        // so the write cost is measured too, and so the next artifact selection
        // is not blocked by the unsaved-changes guard (SessionDrawer.tsx guardUnsaved).
        const tSave = Date.now();
        const save = await clickPaneButton(cdp, 'Save', { timeoutMs: 5000 });
        let saveMs = null, saved = false, saveReason = save.ok ? null : save.reason;
        if (save.ok) {
          const done = await waitForViewer(cdp, (s) => s.hasCm && s.cmEditable === false, { timeoutMs: 30000 });
          saved = done.ok;
          saveMs = Date.now() - tSave;
          if (!saved) saveReason = `Save was clicked but the editor never left edit mode; the pane shows: ${JSON.stringify(done.state?.tail ?? '')}`;
        }
        if (!saved) {
          // Leave no dirty editor behind — it would block the next selection
          // behind a modal that this scenario does not drive.
          await clickPaneButton(cdp, 'Cancel', { timeoutMs: 5000 });
          warnings.push(`type-${key}: ${saveReason}`);
        }

        return {
          ok: true,
          bytes: f.bytes,
          charsTyped: keystrokes,
          // The typed sample was FOUND in the editor's rendered text — that is
          // the proof the edit landed. This delta is only the change in the
          // number of characters CodeMirror currently has on screen, which its
          // viewport can move independently; it is an observation, not a check.
          renderedTextDelta: grew,
          // Keystroke -> painted, measured inside the page.
          keystroke: summarise(meter.samples),
          // Keystrokes that arrived while the previous one had not painted yet.
          keystrokesBehind: meter.dropped,
          // The same thing seen from Node, transport included.
          dispatch: summarise(dispatchMs),
          saveMs, saved, saveReason,
        };
      });
    }

    // ── 6. Copy a code block ─────────────────────────────────────────────
    // The transcript first, because that is the reported symptom. The markdown
    // ARTIFACT is the fallback — it renders through the identical MarkdownContent
    // component with the identical CopyButton, so the measurement means the same
    // thing; which surface was used is reported so nobody has to guess.
    const copy = await step(cdp, 'artifacts:copy-code', async () => {
      // '@chat' resolves to the VISIBLE chat pane inside the helper. It cannot
      // be expressed as a CSS selector: there is one .chat-scroll per open
      // session and only the on-screen one lacks aria-hidden (ChatView.tsx:676,
      // :749), so a plain selector would count some other conversation's blocks.
      const visibleChat = await cdp.evaluate(`window.__perfArt.copy.blocks('@chat')`);
      let scope = null, source = null;
      if (visibleChat > 0) { scope = 'chat'; source = 'chat-transcript'; }
      else {
        // Fall back: open the large markdown artifact, which is full of fences.
        await cdp.evaluate(`window.__perfArt.clickTitle('Show list')`);
        const pick = await cdp.evaluate(`window.__perfArt.clickListRow(${JSON.stringify(files.mdLarge.name)})`);
        if (!pick.ok) throw new Error(`artifacts: the visible chat pane rendered no pre.yc-code (count ${visibleChat}) and the markdown fallback could not be opened either — ${pick.reason}`);
        const mounted = await waitForViewer(cdp, (s) => s.source === 'rendered' && s.docPath === files.mdLarge.rel, { timeoutMs: 60000 });
        if (!mounted.ok) throw new Error(`artifacts: markdown fallback ${files.mdLarge.name} never rendered — pane reported ${JSON.stringify(mounted.state)}`);
        scope = 'artifact'; source = 'markdown-artifact';
      }

      const scopeSel = scope === 'chat' ? '@chat' : '.artifact-content-pane';
      const res = await cdp.evaluate(`window.__perfArt.copy.click(${JSON.stringify(scopeSel)}, 0)`);

      if (!res.ok) throw new Error(`artifacts: copying a code block from the ${source} failed — ${res.reason}`);
      return {
        ok: true,
        source,
        // Note for the reader: navigator.clipboard.writeText is fired and NOT
        // awaited (MarkdownContent.tsx:118-122), so the 'Copied!' flip happens
        // whether or not the OS clipboard write succeeded. This number is the
        // app's render path for the copy, not the cost of the system clipboard.
        clickToCopiedMs: res.ms,
        codeBlocksInScope: res.blocks,
        copiedChars: res.copiedChars,
      };
    });

    // ── Totals ───────────────────────────────────────────────────────────
    const probe = await readProbe(cdp);
    // A LIST, not an object: `opens` and `typing` share the keys codeSmall /
    // codeLarge, so merging them into one object would silently drop the open
    // steps' probes from the totals.
    const allSteps = [created, drawer, ...Object.values(opens), htmlNav, ...Object.values(typing), copy];
    const ipcTotals = allSteps.reduce((acc, s) => {
      const i = s?.ipc;
      if (!i || i.error) return acc;
      acc.pings += i.pings ?? 0;
      acc.totalStallMs += i.totalStallMs ?? 0;
      acc.over250ms += i.over250ms ?? 0;
      acc.over1000ms += i.over1000ms ?? 0;
      acc.maxMs = Math.max(acc.maxMs, i.maxMs ?? 0);
      return acc;
    }, { pings: 0, totalStallMs: 0, over250ms: 0, over1000ms: 0, maxMs: 0 });

    return {
      sessionId: keepSession ? sessionId : undefined,
      projectRoot,
      resumedTranscript: t ? { sessionId: t.sessionId, turns: t.turns } : null,
      artifactsRegistered: registered,
      files: Object.fromEntries(Object.entries(files).map(([k, f]) =>
        [k, { name: f.name, rel: f.rel, bytes: f.bytes, fences: f.fences ?? undefined, sections: f.sections ?? undefined }])),

      create: created,
      drawerOpen: drawer,
      open: opens,
      htmlNav,
      typing,
      copy,

      // Cost-vs-size, pulled out because it is the whole reason both sizes
      // exist. Each ratio is large/small; null if either side failed.
      sizeScaling: {
        bytesRatio: round1(files.codeLarge.bytes / files.codeSmall.bytes),
        codeOpenRatio: ratio(opens.codeLarge?.openMs, opens.codeSmall?.openMs),
        markdownOpenRatio: ratio(opens.mdLarge?.openMs, opens.mdSmall?.openMs),
        markdownFenceRatio: round1((files.mdLarge.fences ?? 0) / Math.max(1, files.mdSmall.fences ?? 1)),
        keystrokeRatio: ratio(typing.codeLarge?.keystroke?.medianMs, typing.codeSmall?.keystroke?.medianMs),
        htmlSwapRatio: ratio(htmlNav.swapLarge?.medianMs, htmlNav.swapSmall?.medianMs),
      },

      // Whole-run renderer probe (covers the gaps between steps too).
      probe,
      // A SUM OVER STEPS, not over the run — the IPC probe is per-step, so the
      // idle gaps between steps are in nobody's total. Named so it cannot be
      // mistaken for a run-length figure.
      ipcSumOfSteps: ipcTotals,
      warnings,
    };
  } finally {
    // Best-effort, and deliberately tolerant: a cleanup failure must never mask
    // the real error above it.
    try { await cdp.evaluate(`window.__perfArt && window.__perfArt.keys.disarm()`); } catch { /* page gone */ }
    // A dirty editor left behind pops the unsaved-changes dialog over every
    // later scenario and every screenshot in this boot.
    try { await cdp.evaluate(`window.__perfArt && window.__perfArt.clickPaneButtonByText('Cancel')`); } catch { /* nothing to cancel */ }
    if (!keepSession) {
      try { await cdp.evaluate(`window.__perfArt && window.__perfArt.clickTitle('Session Files')`); } catch { /* header gone */ }
      if (sessionId) {
        try { await cdp.evaluate(`window.claude.session.destroy(${JSON.stringify(sessionId)})`); } catch { /* already gone */ }
      }
    }
    try { await stopIpcStallProbe(cdp); } catch { /* page gone */ }
    // Leave no rAF loop or PerformanceObserver burning into the next scenario.
    try { await stopProbe(cdp); } catch { /* page gone */ }
  }
}

/** large/small, or null when either side is missing — never a divide-by-zero 0. */
export function ratio(large, small) {
  if (typeof large !== 'number' || typeof small !== 'number' || !Number.isFinite(large) || !Number.isFinite(small) || small <= 0) return null;
  return Math.round((large / small) * 100) / 100;
}
