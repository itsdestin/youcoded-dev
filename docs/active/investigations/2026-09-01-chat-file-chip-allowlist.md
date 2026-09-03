---
date: 2026-09-01
status: active
type: investigation
topic: Chat file chips are gated by a 28-extension allowlist the artifact pane no longer uses
---

# Chat file chips refuse extensions the files pane can display

**Symptom.** Paste `/tmp/x.log` and `/tmp/x.txt` into chat: only the second becomes a clickable
chip. Destin saw three of eight test files render as plain grey text while five became chips.
Anything an agent commonly writes — `.log`, `.sh`, `.env`, `.sql`, `.toml`, `.go`, `.rs`,
`Dockerfile`, `Makefile` — is affected, in both assistant and user messages.

**Mechanism (verified against master 2026-09-01).** Two lists decide "can YouCoded show this
file" and they disagree. The pane's `getViewer`
(`youcoded/desktop/src/renderer/components/artifact-views/RendererRegistry.ts`) routes an
unknown extension to the code editor whenever the read response sniffed the bytes as text
(`textHint`). The chat chip still gates on a hardcoded `WHITELIST` of exactly 28 extensions
in `youcoded/desktop/src/renderer/hooks/useInlineFilepathDetector.ts`, so a path the pane
would open renders as dead text.
<!-- claim: {"path": "youcoded/desktop/src/renderer/hooks/useInlineFilepathDetector.ts", "contains": "const WHITELIST = new Set\\(\\["} -->

The current behaviour is pinned, not accidental:
`youcoded/desktop/tests/artifacts/inline-filepath-detector.test.ts` asserts that `/tmp/x.log`
produces no match, so any fix updates that test.

**Why it is not a one-line list edit.** The pane decides after reading the file; the chip must
decide from a path inside a sentence before anything is read, and the allowlist is also what
stops `w3.org/intro.html` and every dotted word from becoming a dead chip (the hostname guard
only covers domains). Shapes worth weighing: (a) widen the list with common agent-output
extensions and accept it stays a list; (b) invert to a deny-list plus a stricter path grammar;
(c) render the chip optimistically and resolve on click, falling back to plain text when the
path cannot be opened. A too-loose rule turns ordinary prose into dead chips, which is worse
than today's miss.

**History.** Filed 2026-08-25 (found by Destin). Unchanged since: no commits to the hook or its
test after that date.
