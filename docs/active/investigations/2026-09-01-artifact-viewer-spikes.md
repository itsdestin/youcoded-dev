---
date: 2026-09-01
status: active
type: investigation
topic: Spikes when editing files, copying text, or navigating HTML in the artifact viewer — three code-level suspects, now measurable but not yet measured
---

# Artifact viewer spikes: editing, copying a code block, navigating HTML

**Symptom.** Destin reports stutters when editing a file in the files pane, when copying text
out of a code block, and when moving around an HTML preview. Distinct from the
transcript-replay freeze.

**Status of the evidence.** These are code-level suspects, not measured findings. The
prerequisite the entry named — a perf-lab scenario that opens the drawer, types into the
editor, swaps HTML previews and copies from a code block under both probes — now exists
(`scripts/perf-lab/scenario-artifacts.mjs`, 2026-08-27). No results from it are recorded in
`docs/` as of 2026-09-01, so the suspects below are still unranked.

**Suspects (re-read on master 2026-09-01).**
1. **Copy button walks the code block's AST whenever the message content changes.**
   `youcoded/desktop/src/renderer/components/MarkdownContent.tsx` calls `hastText(node)`
   unmemoized inside the `pre` renderer — a full recursive walk per code block — purely to
   feed the copy button's text. `MarkdownContent` is `React.memo`'d on a plain `content`
   string, so an unrelated re-render skips it; the cost lands while a bubble streams (content
   changes per token) and on a resume (every message mounts at once). Scales with fence count.
<!-- claim: {"path": "youcoded/desktop/src/renderer/components/MarkdownContent.tsx", "contains": "const codeText = hastText\\(node\\);"} -->
2. **HTML previews re-parse the whole document on any change.** `HtmlView.tsx` renders
   `<iframe srcDoc={doc}>`; a change to `doc` tears the document down, re-parses it and re-runs
   its scripts. Switching artifacts remounts the viewer outright. `DocxView.tsx` uses
   `dangerouslySetInnerHTML` with the same shape.
3. **Editing re-tokenises** through CodeMirror/lezer — expected alone, but it lands on top of
   the two costs above.

**Next step.** Run the artifact scenario against master and rank by what it reports; do not
fix by suspicion.

**History.** Filed 2026-08-27 (reported by Destin). Corrected the same day: the copy-button walk
is per content change, not per re-render.
