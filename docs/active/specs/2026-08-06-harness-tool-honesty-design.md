---
status: draft
---

# Native harness tool honesty — design

Every finding in the five-model harness review (`docs/active/investigations/2026-08-01-native-agent-harness-reviews.md`)
reduces to one defect class: **a tool result that lets the model mistake a bounded
view for a complete one, or that advises an action the tool does not support.**
This spec fixes that class structurally rather than fixing eight strings, and adds
two verification layers so it cannot silently return.

Scope is the tool layer only — `youcoded/desktop/src/main/harness/tools/**` plus its
tests. Android has no harness-tool code (`rg` over `app/src` for `WebFetch|truncateOutput|readRegistry|shellCwd`
returns nothing), so there is no cross-platform parity work here.

---

## 1. What the reviews got wrong

Three review claims do not survive verification. Recording them because the spec's
priorities differ from the reviewers' as a result, and because a future session
reading the investigations doc will otherwise re-derive them.

**WebFetch's failure is not truncation.** Opus 5 reported `https://vitest.dev/config/`
returning only a preamble with no truncation notice, and concluded the tail was
silently dropped. Fetching the page directly: 98,298 bytes of HTML, 2,637 tags (far
under the `MAX_TAGS` 15,000 guard), and **zero occurrences of `poolOptions`**, with
`globals`/`testTimeout` appearing 2–3 times in sidebar nav only. `id="include"` does
not appear anywhere in the document. Running the real extraction path
(`linkedom` → `Readability` → `turndown`) against the saved HTML yields 3,647 chars
of markdown from 5,189 chars of visible text — 70.3% coverage, Readability hit, no
truncation, and correctly no trailer since the result is far under the 30,000-char cap.
The content is not in the served HTML at all; it arrives as a JavaScript-fetched chunk.
WebFetch behaved correctly and still produced a false negative.

Related: honoring URL fragments is not implementable at the fetch layer. A `#fragment`
is never transmitted to a server, so the byte-identical response Opus saw was correct
HTTP. The fixable version resolves the fragment *after* extraction (§4).

**Bash's context cost was overstated ~7x.** `BashTool` declares `caps: { maxChars: 30_000 }`
(`tools/bash.ts:206`) and `defineTool` truncates through it before the model sees
anything (`tools/registry.ts:18`). The 60,000-line dump cost ~30 KB of context, not
200 KB. The recommendation to "drop the Bash output cap by ~4x" therefore targets a
cap that is already 30k at the model boundary.

**Two prior complaints do not reproduce, and one is misfiled.** Read's binary guard
exists (`tools/read.ts:50`), contra Deepseek's wish #2. Write refuses to overwrite an
unread file (`tools/write.ts:19`), contra Opus's reading of Kimi's #3 — but Opus and
Kimi tested *different paths*: Kimi overwrote a file it had written itself in-session,
which Grok confirms is deliberately permitted, so Kimi's finding was not wrong, only
narrower than Opus's rebuttal assumed. Write already attaches `structuredPatch` diff
hunks (`tools/write.ts:31`), so the requested post-write diff exists for the UI; only
the model-facing text lacks it. No work here beyond annotating the investigations doc.

## 2. What the reviews missed

Three defects of the same class that no reviewer found. All three are more severe than
most of what was reported, because each produces a confidently wrong answer rather
than friction.

**Bash reports a fabricated total.** The output accumulator stops at 200,000 chars
(`tools/bash.ts:243`), and `truncateOutput` then reports `text.length` of that
already-capped buffer as the original size (`tools/truncate.ts:32`). A 5 MB command
output is announced as `[truncated — 204800 chars total]`. The number is invented, and
it is the number a model would use to decide whether re-running with `| tail` is
worthwhile.

**Glob's headline claim is false whenever it caps.** The walk aborts at 2,000 hits
(`tools/glob.ts:58`) *before* the mtime sort at line 81. A capped result is therefore
an arbitrary 2,000 files in directory-walk order, sorted among themselves — while the
tool description promises "sorted by modification time, newest first." On any large
tree that promise is currently untrue, and nothing in the output says the list is partial.

**Grep truncates twice, silently.** `--max-count 500` per file (`tools/grep.ts:45`) and
a 200,000-char stdout ceiling (`tools/grep.ts:73`), neither disclosed. A count-mode
tally that a session uses to size a subsystem can be short without any indication.

## 3. The contract

One rule, from which every per-tool fix follows:

> A tool result must never let the model mistake a bounded view for a complete one,
> and must never advise an action the tool does not support.

`ToolResultPayload` (`tools/types.ts:35`) gains one optional field:

```ts
/** What this result omitted, and how to see more. Rendered by defineTool — never
 *  hand-written into `text`, so advice cannot drift from capability. */
bounds?: {
  shown: number;          // units actually returned
  total: number | null;   // units that exist; null = genuinely unknown
  unit: 'lines' | 'chars' | 'bytes' | 'files' | 'matches' | 'results';
  moreHint: string;       // tool-specific: "| head -n 100", "offset=2390", "narrow the glob"
};
```

Three properties the renderer enforces:

1. **`total: null` renders differently from a known total.** `[showing 2000 of at least
   2000 files]` when the walk stopped early, versus `[showing 2000 of 2000 files]` when
   that is all of them. This is the distinction Glob currently erases.
2. **`moreHint` comes from the tool, never the pipeline.** Bash cannot emit "offset/limit"
   because Bash's hint is `| head`/`| tail`/`wc -l`. This kills the boilerplate bug at
   the root rather than correcting eight call sites.
3. **A tool that bounds output without declaring `bounds` fails the manifest test.**
   Silence stops being reachable, including for tools added later.

`truncateOutput` loses its hardcoded advice string and becomes the renderer for a
declared `bounds`. `defineTool` stays the single pipeline, consistent with its existing
charter.

**Two bounds can apply to one result**, and the resolution must be explicit or
implementers will guess. A tool declares `bounds` for the bounding *it* performed (Glob's
hit ceiling, Grep's `--max-count`, Bash's byte total). `defineTool`'s `caps` is a second,
outer bound applied afterward. When both fire, the renderer emits **one** line naming the
tighter constraint first and the tool's own `moreHint`, never two competing notices:

```
[showing 30 KB of 4.2 MB output, and only the first 500 matches per file —
 narrow the pattern, or | head -n 100]
```

When only `caps` fires, the tool's `moreHint` is still used; the pipeline never supplies
advice of its own. A tool that declares no `bounds` and trips `caps` is a manifest-test
failure, not a silent default.

## 4. Per-tool changes

### Bash (`tools/bash.ts`)

**Accumulator rewrite.** The 200,000-char buffer retains 200 KB in order to discard
170 KB, since `truncateOutput` reduces it to 30k regardless — and it is the source of
the fabricated total. Replace with a bounded head (24k) + rolling tail (6k) + an
unconditional `totalBytes` counter incremented on every chunk whether or not the chunk
is retained. This fixes the invented number, drops peak retention ~7x, and preserves
head+tail framing. `moreHint`: `"| head -n 100, | tail -n 100, or wc -l"`.

**Metadata line, always on.** One compact trailer replaces today's `(exit code N)`
prefix and absorbs the cwd-reset notice rather than adding to them:

```
[cwd: /home/destin/youcoded-dev · exit 0]
[cwd: /home/destin/youcoded-dev/youcoded · exit 1 · 4.2 MB output, showing 30 KB]
```

Four of five reviewers asked for this independently, and all four traced it to the same
cause: file tools resolve from the workspace root while Bash resolves from its own
persistent cwd. Opus paid for the ambiguity by prefixing nearly every call with
`cd <root> &&`. The line costs ~15–20 tokens and removes that ritual.

**ANSI.** Set `NO_COLOR=1` and `FORCE_COLOR=0` in the child environment, and strip
CSI/OSC sequences from captured output for tools that honor neither. Strip order is
load-bearing: it runs on the body *after* `extractCwd`, so the `__YC_CWD__` sentinel
cannot be mangled.

### Grep (`tools/grep.ts`)

**Derived error advice.** Replace the unconditional `Check the regex syntax.` suffix
(line 98) with a suffix derived from ripgrep's stderr:

| stderr matches | result |
|---|---|
| `regex parse error` | keep the regex advice — rg's own caret diagnostic is already accurate |
| `No such file or directory` / `IO error` | name the resolved absolute path and the workspace root |
| anything else | **no advice suffix** — the honest general form |

**Workspace-relative paths.** Pass rg a path relative to `ctx.cwd` when the target is
inside it, so rg emits relative paths natively and Grep agrees with Glob. Targets
outside `ctx.cwd` (reachable via the `external_directory` ask) keep absolute paths,
which is the truthful answer there.

**Disclosed caps.** Detection is per mode, because `--max-count` means something different
in each:

- `count` — a per-file tally of exactly 500 is at the cap; name those files.
- `content` — count returned lines per file; any file at exactly 500 is at the cap.
- `files_with_matches` — `-l` stops at the first match per file, so `--max-count` cannot
  bind. No disclosure needed; the only bound here is the output ceiling.

The 200,000-char stdout accumulator is replaced by the same head/tail + true-total scheme
as Bash, so `total` is honest rather than the capped buffer's length.

### Glob (`tools/glob.ts`)

Complete the walk under a memory ceiling (~50k hits), sort everything, return the top N,
and declare `{ shown, total }`. "Newest first" becomes true, and the cap becomes visible.
Emit workspace-root-relative paths rather than paths relative to `args.path`, matching
Grep. Declare `caps` explicitly instead of inheriting `DEFAULT_CAPS`.

### WebSearch (`tools/web-search.ts`)

Cap each snippet at ~500 chars with per-snippet elision noted, dedup by normalized URL,
and declare `{ shown: 8, total: results.length, unit: 'results', moreHint: 'narrow the query' }`.
This addresses the 34,377-char single-query result Opus measured, which contained the
same Electron type-support table three times.

### Read (`tools/read.ts`)

Behavior unchanged. Its existing trailer moves into the `bounds` contract so it renders
through the same path as every other tool. Read is the model the others are being
brought up to.

### WebFetch (`tools/web-fetch.ts`)

**JS-shell disclosure.** An extraction-coverage ratio cannot work — measured against
four real pages, the failure case and a known-good case are indistinguishable:

| page | raw HTML | visible text | extracted md | coverage | Readability |
|---|---|---|---|---|---|
| vitest.dev/config *(the failure)* | 98,298 | 5,189 | 3,647 | **70.3%** | hit |
| docs.python.org asyncio *(Grok's success)* | 25,455 | 4,072 | 2,814 | **69.1%** | hit |
| nodejs.org/api/fs | 1,095,279 | 264,914 | 389,806 | 147% | hit |
| example.com | 559 | 142 | 149 | 105% | hit |

What does separate them is text density plus framework markers. Detect an app shell —
`__VP_HASH_MAP__`, `__NEXT_DATA__`, `__NUXT__`, `__remixContext`, an empty
`<div id="root">`/`<div id="app">` — combined with low visible-text-to-bytes ratio
(vitest 5.3%; the three working pages 16–25%). On a hit, append a non-committal
advisory that states what was observed and never guesses what is missing, per
`docs/error-message-standards.md`:

```
[This page is a JavaScript-rendered app. The server sent 5.2 KB of text; content that
loads in a browser is not included. If a section you expected is absent, it is likely
rendered client-side.]
```

**Fragment resolution, post-extraction.** Match the fragment against `id="…"` attributes
in the raw HTML, which are authoritative and independent of markdown rendering. Matching
against extracted heading *text* does not work: VitePress emits
`## Config Options [​](#config-options)`, so naive slugification of the heading fails
even when the section is present — verified against the saved fixture. Three outcomes:

1. **id in raw HTML and in the extraction** → return that section with surroundings.
2. **id in raw HTML but not in the extraction** → extraction dropped it. Say so, and
   offer the surrounding raw text. This is the genuine "extraction lost content"
   detector, and it works where the coverage ratio did not.
3. **id absent from raw HTML** → the page as served has no such section. Verified: this
   is Opus's exact case (`id="include"` appears nowhere in the 98 KB), and it converts a
   confident preamble into an explicit statement.

**Soft fallback replacing hard refusal.** `tooComplexToExtract` currently dead-ends
(Kimi's #1). The DoS concern is specifically Readability's quadratic parse; tag-stripping
is O(n) and safe on any input. When the guard trips, skip Readability and return plain
stripped text with a note about the degraded extraction. The guard keeps its teeth and
the dead end disappears.

## 5. Guards

Strongest available enforcement per invariant, following the workspace knowledge ladder.

**Pinning tests**, extending existing files rather than adding suites:

- `harness-truncate.test.ts` — the renderer prints a declared `moreHint` verbatim and
  cannot substitute a default; `total: null` renders "at least N".
- `harness-tools-core.test.ts` — Bash reports true byte totals past the retention window
  (the fabricated-204800 regression); the metadata line appears on success, non-zero
  exit, and timeout; ANSI stripping leaves the cwd sentinel intact.
- New `harness-tool-bounds.test.ts` — Glob returns the genuinely newest N when capped;
  Grep names files that hit `--max-count`; Grep's error suffix is derived from stderr and
  absent when neither pattern matches.
- `web-fetch-tool.test.ts` — the three fragment outcomes, JS-shell disclosure, and the
  complexity-guard soft fallback, pinned against the four saved HTML fixtures so
  thresholds are calibrated on real pages rather than synthetic ones.

**Manifest test** — extend `tool-registry-manifest.test.ts`. "Whose result can be bounded"
needs to be mechanical, not a judgment call, so the test is concrete: for every tool in
`NATIVE_TOOL_NAMES`, drive it against a fixture engineered to exceed its `caps`, and
assert the result carries a `bounds` object whose `moreHint` is non-empty. Tools that
genuinely cannot exceed their cap (`AskUserQuestion`, which `defineTool` does not even
wrap) are listed as explicit exemptions with a one-line reason, so the exemption list is
itself reviewable rather than an implicit gap.

**Schema cross-check** — the strongest assertion available here, and new: scan every
tool result's text for parameter-shaped advice and fail when the named parameter is
absent from that tool's own zod schema. This turns "don't say offset/limit in Bash" from
a rule someone must remember into an executable scan across all ten tools.

**ast-grep rule** (`scripts/ast-grep/`) — fail any tool file that string-concatenates a
truncation or advice notice into `text` instead of declaring `bounds`.

**Docs** — one invariant line in `.claude/rules/native-runtime.md` under "Native tools";
depth in `youcoded/docs/native-runtime.md`; a correction note appended to the
investigations doc recording §1 and §2.

## 6. Verification harness

Two layers answering different questions. Neither substitutes for the other.

> **Implementation split.** This spec ships as two plans in parallel worktrees.
> **Plan A** — §3, §4, §5, and §6a: the contract, every tool change, and all guards
> including the conformance suite, which asserts the contract and so cannot precede it.
> **Plan B** — §6b alone: the live review runner drives whatever the harness currently
> is, so it builds against master today and lands independently of A. Once both are in,
> re-running B against A's result is the acceptance check for the whole spec.

### 6a. Conformance suite — deterministic, free, CI-gated

`desktop/tests/harness-tool-conformance.test.ts` drives each tool against seeded
fixtures and asserts *contract properties* rather than exact prose, so wording can change
without breaking tests. This is what actually ensures the complaints are fixed; a model's
opinion cannot regress-test a string.

### 6b. Live review runner — on demand, costs money

`desktop/test-engine/review-harness.mjs`, following the existing `probe-*.mjs` precedent.
`HarnessSession(opts, modelFactory)` needs only a manifest, binding, tool list, and an
injected factory — `decide` and `askUser` are both injectable and ten test files already
construct it — so no Electron process is required.

Per model in a JSON roster:

- **Seed a disposable fixture workspace** in `os.tmpdir()`: a mini-repo with markdown,
  JSON, TypeScript, Kotlin, TOML, a 4,000-line file, a binary, a directory containing
  spaces, and a file with a deliberately duplicated string for the Edit probe. This
  matters twice: the real workspace stops accumulating `grok45-test-*` artifacts, and
  runs become comparable because every model faces an identical tree. The existing five
  reviews all ran against a workspace that was changing underneath them.
- **Construct the session** with the real tool set, an OpenRouter-backed model factory
  (single `OPENROUTER_API_KEY` reaches Kimi, Deepseek, Grok, GPT, and Claude, so the
  roster is a config list), `decide` auto-approving inside the fixture while the
  destructive deny-list stays live, and a deterministic `askUser` — which finally
  exercises `AskUserQuestion`, the one tool no reviewer reached (Kimi's #6).
- **Append the free-form review** to the investigations doc as a new section, never
  touching existing ones.
- **Save the full transcript** per model to a run directory. Opus's context-cost claim
  was falsifiable only because the source was read by hand; with transcripts stored, any
  future claim is checkable against what the harness actually returned.

The battery prompt moves into the runner as its single source, with the investigations
doc referencing it, so prompt and doc cannot drift.

Safety: the fixture lives under `os.tmpdir()` and becomes the session `cwd`, so
`checkPathGuard` confines the file tools to it and Bash's reset fence applies to it. The
runner is a plain Node process — no Electron, no `userData`, no `~/.youcoded/` writes
(`skillCatalog` and `triggers` are injected empty). It never reads the live app's
safeStorage secrets. `--dry-run` prints the roster and prompt without spending.

## 7. Out of scope

Deferred deliberately, each traceable to a review item:

- A sticky-env mechanism for Bash (Grok #1) — a real feature with secret-lifetime
  implications, not a fix.
- A session scratch directory (GPT 5.6 Luna #6) and a `Test`/`Lint` tool (Kimi #5) — new
  affordances.
- Transcript presentation for non-developers: expected-stderr labelling (GPT 5.6 Luna #5)
  and surfacing Write's existing `structuredPatch` as a diff card (Kimi #3, Grok #5) —
  renderer work, not tool work.
- A `setup.sh` freshness short-circuit (Grok #7) — workspace tooling.
- WebFetch charset-aware decoding — pre-existing, noted in `web-fetch.ts:140`.
