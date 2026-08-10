---
status: draft
---

# Harness review claims, verified against ground-truth transcripts

Five frontier models (Kimi K3, DeepSeek v4 Flash 0731, Grok 4.5, GPT-5.6 Luna, Claude
Opus 5) each ran an identical tool battery against the native agent harness
(`youcoded/worktrees/harness-integration/desktop/src/main/harness/tools/`) and wrote a
free-text review. This doc adjudicates twelve claims from those reviews against the raw
JSON transcripts (`docs/active/investigations/harness-review-runs/2026-08-10/*.json`),
pairing every `tool-use`/`tool-result` event and reading the code path that explains each
result.

**Methodology note (load-bearing):** the naive approach — build a dict keyed by
`toolUseId` — silently drops or overwrites calls, because `toolUseId` is **not globally
unique** in these transcripts. Kimi K3's transcript reuses `Glob:0`, `Bash:0`, `Bash:1`,
`Read:0`, `Edit:0`, and `TodoWrite:0` for multiple *different* calls at different
timestamps (confirmed: `Counter` over `tool-use` events' `toolUseId` shows `{'TodoWrite:0':
3, 'Bash:1': 3, 'Bash:0': 4, 'Read:0': 2, 'Glob:0': 2, 'Edit:0': 3}` for Kimi; zero
duplicates for the other four models). A dict-keyed extraction silently discarded Kimi's
first Glob call (`**/*.{ts,kt,toml}`) and duplicated a later one in its place — which
would have wrongly flagged Kimi's brace-glob claim as fabricated. Fixed by pairing
call→result via a per-`toolUseId` FIFO queue in event order. All findings below use the
corrected extraction.

---

## Claim 1 — Read-before-edit enforcement (THE PRIORITY)

**Verdict: REFUTED as stated — the gate is enforced with zero exceptions across all 251
tool calls. Grok's specific self-report is factually wrong (it did Read README.md).
Kimi's specific self-report is technically true but mischaracterizes designed behavior as
inconsistency.**

Programmatic check: for every Edit call in all five transcripts, track a per-run registry
of files established via a **successful** Read or **successful** Write (Write also plants
a read-registry entry — see mechanism below), then flag any Edit whose target was never in
that registry:

```
kimi:      (none)
deepseek:  scratch/bash-created.txt  -> rejected (Invalid arguments, then Edit rejected)
grok:      (none)
gpt5.6:    unread-edit.txt           -> rejected: "Edit rejected: read unread-edit.txt with the Read tool first, then retry."
opus5:     "a dir with spaces/a file with spaces.txt" -> rejected: "Edit rejected: read ... with the Read tool first, then retry."
```

Every single case where a file was genuinely never Read or Written was **rejected**, with
no exceptions, across 44 total Edit calls. GPT-5.6 Luna's and Opus 5's report of the
rejection firing is confirmed verbatim against `edit.ts` line 54:
`Edit rejected: read ${args.file_path} with the Read tool first, then retry.`

**Kimi's claim** ("edited a file it had never Read and succeeded"): Kimi's Edit on
`scratch/test-file.md` did succeed with `read_before=False` — but the transcript shows
Kimi had just `Write`'d (created) that exact file three calls earlier:
`Created scratch/test-file.md (63 chars).` `write.ts` explicitly plants the read-registry
entry on a successful write (`ctx.readRegistry.set(canonical, ...); // our own write stays
"read"`). So the rule is not "you must have called the Read tool" — it's "the file must be
in the read-registry", which Read *or* Write can establish. Kimi's framing ("never Read")
is literally true (it never called the Read tool on that path) but mischaracterizes
designed behavior as a bypass.

**Grok's claim** — specifically: Edit on an unread `README.md` succeeded
(`## Layout` → `## Layout (edited without read?)`). This is **REFUTED**: Grok's very first
tool call in the entire run was `Read README.md` (`isError: false`), 16 calls before the
Edit in question. Grok simply forgot/misreported its own tool-call history — the transcript
proves it read the file it claims it never read.

**The real rule** (from `edit.ts`, lines 48–61): Edit checks `ctx.readRegistry.get(canonical)`
for an mtime. If absent → `Edit rejected: read X with the Read tool first, then retry.` If
present but the file's current mtime doesn't match the recorded mtime → `Edit rejected: X
changed since you read it. Read it again, then retry.` The registry is populated by Read
(`read.ts` line 71) **and** by Write (`write.ts` line 28) — any successful materialization
of a file's on-disk state counts as "having read it," and any subsequent on-disk change
(including the harness's own re-write) invalidates it via mtime comparison. This mechanism
was exercised correctly dozens of times across all five runs (e.g. Kimi's README.md Edit at
call 28: `Edit rejected: README.md changed since you read it` — the prior Read was stale
because an intervening Edit had already changed the file).

---

## Claim 2 — Write's overwrite guard has no freshness check

**Verdict: CONFIRMED.** `write.ts` line 19 checks only `ctx.readRegistry.has(canonical)` —
presence, not the mtime comparison `edit.ts` does at line 56. A read from arbitrarily long
ago in the same session still satisfies Write's guard, even if the file changed on disk in
the interim (Write has no way to detect that; Edit would catch it).

Evidence — Opus 5: `Read /tmp/.../config/settings.toml` at tool-call index 11
(`port = 8080\nhost = "localhost"...`), then `Write /tmp/.../config/settings.toml` at index
38 — **27 tool calls and no intervening touch to that file** — succeeded:
`Overwrote /tmp/.../config/settings.toml (17 chars).` Kimi shows the same shape on
`README.md` (`Overwrote README.md (17 chars).`) though its immediately-preceding Edit had
just re-synced the registry mtime, so that particular instance isn't itself a staleness
exploit — the code-level gap (no mtime check at all) is what matters, and Opus's 27-call
gap demonstrates the guard doesn't care how old the read is.

Opus also hit the guard's actual defense — existence-without-any-prior-registry-entry:
`Write /tmp/.../scratch/unread.txt` → `Write rejected: /tmp/.../scratch/unread.txt already
exists. Read it first so you know what you are replacing.` (`write.ts` line 21, exact
match). So the guard is real and fires correctly for "never touched this session" — it
just doesn't extend to "touched a long time ago, might be stale now" the way Edit's does.

**What Write actually checks:** file exists on disk AND canonical path has *ever* appeared
in `ctx.readRegistry` this session → allowed, unconditionally on recency. Edit additionally
requires the recorded mtime to still match the current on-disk mtime. This is a real
asymmetry between the two tools' guards, not a bug in either individually — but it means a
model that reads a config file early, does a lot of other work, then blind-overwrites it
late in a long session, gets no protection against having missed an external change in the
meantime (only Edit would catch that).

---

## Claim 3 — Glob returns "No files matched." for brace patterns

**Verdict: CONFIRMED for both cited calls.**

```
kimi: {'pattern': '**/*.{ts,kt,toml}'}          -> 'No files matched.'
grok: {'pattern': '**/*.{ts,kt,toml,md,json}'}  -> 'No files matched.'
```

(Kimi's call was initially invisible in a naive extraction due to the `toolUseId` reuse
bug described above — `Glob:0` was assigned to both the brace call and a later
`**/*.ts` call. Fixed extraction recovers it and confirms the claim.)

`glob.ts` is a hand-rolled glob→regex converter (no minimatch/fast-glob or any
brace-aware library — comment at the top: "Dedicated tool, not shell"). Its char-escape set
at line 42, `'.+^${}()|[]\\'.includes(c)`, **includes `{` and `}`** — meaning brace
characters are escaped into *literal* regex characters, not translated into alternation.
`**/*.{ts,kt,toml}` compiles to a regex requiring the path to literally end in the
substring `.{ts,kt,toml}` — which no real file ever does. Braces are genuinely, silently
unsupported; there is no error, just a false "no files matched" that reads as "there are no
TypeScript/Kotlin/TOML files here" when in fact `**/*.ts` alone (which every model also
tried) returns two real hits.

---

## Claim 4 — Grep count mode reports a capped 500 as a total

**Verdict: CONFIRMED, and the underlying mechanism is worse than "print capped, count
exhaustively" would fix.**

All five runs that used `output_mode: 'count'` against `src/big-module.ts` got exactly
`500`:

```
kimi:     'src/big-module.ts:500\n\nNote: these files hit the 500-matches-per-file limit and have more: src/big-module.ts'
deepseek: 'src/big-module.ts:500\n\nNote: ...'
grok:     'src/big-module.ts:500\n\nNote: ...'
gpt5.6:   '500'   <- NO note (see below)
opus5:    'src/big-module.ts:500\n\nNote: ...'
```

`grep.ts` line 100 passes `--max-count 500` **directly to the ripgrep process itself**
(`MAX_COUNT = 500`, line 49). This is not a display truncation of an already-complete
count — ripgrep is told to stop searching a file the instant it finds the 500th match, so
`grep.ts` never learns the true total (2400, per the fixture) at all. The "500" is honest
about what ripgrep counted, but ripgrep counted only up to the point it was told to stop.
**This means the fix cannot be "count exhaustively, then print capped"** — that data isn't
available anywhere in the current pipeline. Getting an honest total requires either
dropping `--max-count` for `output_mode: 'count'` specifically (a real behavior/perf
tradeoff on huge files) or a second, uncapped `--count` pass.

Separately, a **real bug** surfaced by GPT-5.6 Luna's specific call: when `path` names a
single file directly (`path: 'src/big-module.ts'`) rather than a directory, ripgrep's
`--count` output omits the `filename:` prefix and prints a bare `500`. `filesAtMaxCount()`
(line 57) parses count-mode lines via `line.lastIndexOf(':')` — a bare `500` has no colon,
so `at === -1` and the line is silently skipped, meaning **the "hit the 500-match limit"
disclosure note never fires** for this call shape, even though the same cap fired
identically. The other four runs passed a directory (or `.`) as `path`, which keeps rg's
`filename:count` format and lets the note render.

---

## Claim 5 — Bash output cap and elision shape

**Verdict: CONFIRMED, numbers match exactly; elision is character-based, not line-based
(so it can corrupt a line mid-token); NOT shared with Grep.**

Opus 5's `seq 1 20000` (28 chars/line avg × 20000 lines = 108,894 raw chars):

```
result length: 27966 chars (Opus claimed "27,966" — exact match)
trailing metadata: [cwd: /tmp/yc-harness-review-0omyjn · exit 0 · 108894 chars output, showing 27966]
                    [showing 27966 of 108894 chars — pipe through head -n 100, tail -n 100, or wc -l to narrow it]
```

`108894` (Opus's claimed total) matches exactly. Locating the elision boundary by scanning
for the numeric-sequence discontinuity: line index 4621 reads `'46'` (a **truncated,
corrupted number** — the real line `4621` straddles the head/tail boundary), then
`'[...]'`, then resumes at `'19008'`. So Opus's summary ("keeping lines 1–4621 then
19008–20000") is correct in overall shape but slightly imprecise: the cut is at the
**character** level (`HEAD_CHARS = 22_000`, `TAIL_CHARS = 6_000`, `bash.ts` lines
294–295), not a line boundary, and it can and does split a line mid-digit (`4621` →
`46` + discarded `21`). Head:tail ratio = 22000:6000 = **78.6% / 21.4%**, close to but not
identical to `truncate.ts`'s generic 80/20 split (that generic path is a separate fallback
for tools that don't do their own head/tail accounting — Bash has its own bespoke
accumulator specifically to avoid the "dead zone" bug described in the `bash.ts` comment
at line ~269).

**Not shared with Grep.** `grep.ts`'s content-mode accumulator uses different constants:
`head.length < 24_000` / `tailBuf.slice(-6_000)` (lines 166–167) — a 24k/6k split versus
Bash's 22k/6k. Both tools independently target the same 30,000-char pipeline ceiling
(`caps: { maxChars: 30_000 }` on both), but each maintains its own separate head+tail
accumulator with its own head-size constant; the mechanism is duplicated per-tool, not a
shared cap.

---

## Claim 6 — No-op `replace_all` reports success indistinguishably

**Verdict: CONFIRMED.**

```
grok: Edit {file_path: 'test-edit.txt', old_string: 'shared token', new_string: 'shared token', replace_all: true}
      -> 'Edited test-edit.txt.'
```

`edit.ts` never checks whether `old_string === new_string` (or, more generally, whether the
edit is a no-op). It counts matches (`count > 0`), performs the split/join replace, writes
the file (with the same bytes), and returns the generic
`Edited ${args.file_path}.` — textually identical to a real edit. The `structuredPatch`
field (via `toHunks`) would in fact carry zero hunks for a true no-op, but that's a
side-channel the model doesn't read as prose — the text result gives it no signal that
nothing changed.

---

## Claim 7 — Mid-chain shell failure invisible in exit code

**Verdict: CONFIRMED as a factual observation; NOT a harness bug — it's plain POSIX shell
semantics with no `set -e`/`pipefail` applied.**

```
grok: Bash 'echo "..."; false; echo "after false exit should not matter for next"; ls "a dir with spaces"; cat "a dir with spaces/a file with spaces.txt"'
      -> '...\n[cwd: /tmp/yc-harness-review-9GhzHQ · exit 0]'
```

`bash.ts` spawns the shell as `spawn(shell.cmd, [...shell.args, command], ...)` where
`shell.args = ['-c']` for bash (line 83) — a plain `bash -c "<command>"`, no `set -e`, no
`pipefail`, no `-o errexit` anywhere in the invocation. This is exactly what a user would
see running the same `;`-separated chain locally: the reported exit code is the last
command's (`cat`, which succeeded), and `false` in the middle is silently absorbed — normal
bash behavior, not a defect introduced by the harness (and it matches Claude Code's own
Bash tool, which also does not inject `set -e`).

---

## Claim 8 — `exit ?` on timeout

**Verdict: CONFIRMED.** Literal string, from Grok's `sleep 5` (2000ms timeout):
`'Command timed out after 2000ms.\n[cwd: /tmp/yc-harness-review-9GhzHQ · exit ?]'`

Mechanism: `bash.ts`'s timeout handler calls `finish(prefix, true)` with no third `code`
argument (line 459: `finish(\`Command timed out after ${timeout}ms.\n\`, true);`). The
metadata line builder at line 421, `` `exit ${code ?? '?'}` ``, falls back to the literal
character `?` whenever `code` is `undefined` — which it always is on a timeout (the child
was SIGKILLed before a `close` event with an exit code could fire). Same fallback fires for
interrupt/abort, which also calls `finish` without a code.

---

## Claim 9 — WebFetch on JS-heavy page returns an empty body, not distinguished from failure

**Verdict: CONFIRMED — and it is an honesty gap as framed.**

```
deepseek: WebFetch {url: 'https://www.jetbrains.com/help/idea/getting-started.html', ...}
  isError: False
  result: 'Fetched for: Summarize what this page covers about writing functions and dark theme.
            Source: https://www.jetbrains.com/help/idea/getting-started.html
            Title: Getting started | IntelliJ IDEA Documentation

            '
```

Body is empty — literally nothing after the title line. `isError` is `false`. No
`jsNote` disclosure (`web-fetch.ts` line 850, "[This page is a JavaScript-rendered app...]")
is present, meaning `jsRenderDensity()` did not classify this page as JS-rendered (its
marker regex `JS_APP_MARKERS`/`EMPTY_ROOT` apparently didn't match this specific page's
shell, or the density check didn't cross `TEXT_DENSITY_FLOOR`). So the model receives a
response that is structurally identical to "I successfully read this page and it is a
title with no content" — there is no code path here that distinguishes "extraction genuinely
found nothing" from "extraction failed to find the real content." A model reading this has
no honest signal to report anything other than what DeepSeek in fact reported: a
title with an empty body, presented with the same confidence as a real result.

---

## Claim 10 — Read's past-EOF message breaks the "X failed:" prefix convention

**Verdict: CONFIRMED, but the "siblings" framing needs a correction — it's a 3-way
inconsistency within Read itself, not a lone outlier against a single convention.**

Exact strings collected across all Read errors, all five runs:

```
"Read failed: ENOENT: no such file or directory, stat '...'"          <- uncaught exception path
"Cannot read <path>: it is a binary file."                             <- deliberate refusal (binary)
"Cannot read <path>: file is N MB (limit 50 MB)..."                    <- deliberate refusal (size) [not exercised, see below]
"Read <path>: offset N is past the end of the file (M lines)."         <- deliberate refusal (past-EOF)
```

`"Read failed: ..."` comes from `registry.ts` line 37's generic catch-all wrapper
(`` `${def.name} failed: ${err?.message ?? String(err)}` ``) — it only fires when
`execute()` *throws* (here, `fs.statSync` on a nonexistent path throws ENOENT). The other
three are **deliberate, non-throwing `isError: true` returns** from inside `read.ts`
itself: `readSizeError()` and the binary check both use `` `Cannot read ${filePath}: ...` ``
(lines 21, 59), while the past-EOF branch uses a **third** wording,
`` `Read ${args.file_path}: offset ${offset} is past the end of the file (${totalLines}
lines).` `` (line 73) — neither "Cannot read" nor "failed", just the bare tool name and a
colon. So Opus's claim that the past-EOF message "lacks the `Read failed:` prefix its
siblings use" is confirmed as an inconsistency, but its two literal siblings within
`read.ts` (binary/size refusals) don't say "Read failed:" either — they say "Cannot read:".
The real picture is three distinct message shapes for `isError: true` within one tool, not
one shared convention with a single exception. (For context, other tools show the same
lack of a house style: Edit uses `"Edit rejected: ..."` for guard failures and `"Edit
failed: ..."` for business-rule failures; Write uses `"Write rejected: ..."`; Grep uses
`"Grep failed: ..."` for everything.)

---

## Tool-call inventory (all five transcripts combined)

Extraction verified programmatically (`extract.py`, FIFO-queue pairing by `toolUseId` to
correct for Kimi's ID-reuse quirk described above). 251 total tool calls, 41 `isError:
true` results.

| Tool | kimi | deepseek | grok | gpt5.6 | opus5 | **Total** | **Errors** |
|---|---|---|---|---|---|---|---|
| Bash | 15 | 14 | 8 | 12 | 17 | **66** | 10 |
| Edit | 7 | 9 | 8 | 11 | 9 | **44** | 15 |
| Glob | 4 | 2 | 3 | 1 | 5 | **15** | 0 |
| Grep | 3 | 3 | 3 | 4 | 6 | **19** | 0 |
| Read | 12 | 11 | 11 | 12 | 14 | **60** | 12 |
| TodoWrite | 8 | 2 | 0 | 3 | 2 | **15** | 0 |
| WebFetch | 3 | 3 | 2 | 2 | 4 | **14** | 3 |
| WebSearch | 1 | 1 | 1 | 1 | 1 | **5** | 0 |
| Write | 3 | 2 | 1 | 1 | 6 | **13** | 1 |
| AskUserQuestion | 0 | 0 | 0 | 0 | 0 | **0** | 0 |
| **Total** | 56 | 47 | 37 | 47 | 64 | **251** | **41** |

**AskUserQuestion — zero calls across all five runs**, out of the harness's 10-tool
`CORE_TOOLS` set (`tools/index.ts`). None of the five models hit the "genuine ambiguity"
condition the battery prompt explicitly invited them to use it for; every ambiguous
instruction in the battery (e.g. "try to edit a file you haven't Read") was interpreted as
"do it and observe the result" rather than "ask before doing it." This is worth noting as a
prompt-design/battery observation, not a tool defect — the harness's own `asks` counter
independently confirms 0 for all five transcripts.

Friction concentrated in **Edit** (15/44 = 34% error rate — expected, since the battery
explicitly drives Edit into its guard conditions) and **Read** (12/60 = 20%, all from the
battery's deliberate missing-file/binary-file/past-EOF probes). Bash's 10 errors are a mix
of deliberate probes (timeout, missing path) and one genuine timeout-format finding
(Claim 8). WebFetch's 3 errors are all legitimate blocks (localhost, 404) — no false
positives found anywhere in the WebFetch error set.

---

## What is actually worth fixing, ordered by evidentiary weight

1. **Grep count mode's total is architecturally unknowable, not just under-reported**
   (Claim 4). `--max-count` is passed to ripgrep itself, so the true total is never
   computed anywhere in the pipeline — this is the strongest, most reproducible finding
   (5/5 runs, identical `500` cap), and the fix is a real design change (separate
   uncapped-count pass or dropping `--max-count` for count mode), not a one-line notice
   tweak.
2. **Grep count mode's "hit the limit" note silently fails to render when `path` names a
   single file** (Claim 4, GPT-5.6's specific call) — a real parsing gap in
   `filesAtMaxCount()` against ripgrep's own single-file output format. Concrete, narrow,
   cheap fix.
3. **Write's overwrite guard has no freshness check**, unlike Edit's (Claim 2) —
   demonstrated with a real 27-tool-call-old read in the Opus transcript. A one-line
   addition (mirror Edit's mtime comparison) closes a real gap between two tools that share
   the same stated contract ("read it first").
4. **Bash's elision can corrupt a line mid-token** (Claim 5) — cosmetic but real; a model
   piping structured output (JSON, CSV, `seq`) through a long Bash command can get a
   genuinely malformed fragment at the elision boundary with no signal that the corruption
   is an artifact of truncation rather than the command's real output.
5. **A no-op `replace_all` is indistinguishable from a real edit in the text result**
   (Claim 6) — low-severity (the `structuredPatch` field does carry the true empty-diff
   signal) but a cheap, high-value fix: check `old_string !== new_string` or `count of
   actual changes === 0` and say so.
6. **WebFetch's empty-body case has no distinct disclosure from "genuinely short page"**
   (Claim 9) — matches the project's own stated error-message discipline (never let a
   non-committal success read as more confident than it is); worth a low-content-length
   heuristic alongside the existing JS-render density check.
7. **Read's error messages use three unreconciled shapes** (Claim 10) — cosmetic
   consistency issue, lowest priority; doesn't change what a model can infer, just adds
   noise when comparing tools' conventions.
8. **Glob's brace-pattern gap** (Claim 3) — confirmed, but arguably working-as-designed for
   a "no external glob library" tool; worth either documenting explicitly in the tool
   description ("no `{a,b}` alternation") or adding minimal brace-expansion support, lower
   priority than the above since it fails loud (a plausible-looking "No files matched.")
   rather than silently.
9. **Claim 7 (mid-chain `false` invisible in exit code) is not a bug** — matches real bash
   semantics with no `set -e` applied, same as Claude Code's own Bash tool. No fix
   warranted; if anything, document it in the tool description.
10. **Claim 1 (read-before-edit inconsistency) and Claim 8 (`exit ?` string) are both
    working as designed** — no fix warranted for either; Claim 8's `?` is a legible,
    intentional fallback for "no exit code was ever produced," and Claim 1's gate had zero
    exceptions across 44 Edit calls.
