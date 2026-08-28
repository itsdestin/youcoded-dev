---
title: "YouCoded's native tools vs. the other harnesses — Read, Edit, Write, Bash, and the niche tools"
status: active
date: 2026-08-26
supersedes-partially: 2026-08-10-harness-mutation-safety-prior-art.md (its §1 hash recommendation is re-affirmed here, not superseded)
---

# YouCoded's native tools vs. the other harnesses

> **Status 2026-08-28.** Destin picked batches A, B and C plus PDF reading; all shipped the same day — youcoded PRs **#352** (D-2, G-7), **#353** (D-1, D-3, D-4, D-5, D-6, G-4, G-5, G-10, G-11, G-12, G-13, T-3) and **#354** (G-6). **G-2** (Other + note on question cards) shipped as PR **#355** after a 3/3 deck approval. **G-3** waits on an evaluator measurement now that the G-4 wording is live. **G-8** shipped as PR **#357** (bare patterns recurse; hidden entries skipped unless named). **G-1** is in design (2026-08-28, decisions: Claude Code shape — `run_in_background` + `BashOutput`/`KillShell`; killed on conversation close and app quit, survives a switch). Still open, each with a ROADMAP entry: **G-3**, **G-9**, **T-1/T-2**; **G-14** stays documented-and-accepted; **D-7** was fixed 2026-08-26, **D-8** is ROADMAP #133.


**Question asked:** how do YouCoded's native tools (the descriptions the model reads, what they can do, what they refuse) compare with the same tools in Claude Code, Codex CLI, Gemini CLI, OpenCode, Cline, Roo/Kilo, OpenClaw, Hermes, Pi, and Cursor? And what do those harnesses have that YouCoded doesn't?

**Method.** Six parallel research agents, each reading primary sources (YouCoded's own source at `youcoded` master `73e2defe`; the other harnesses' GitHub source or, for closed-source Cursor, published/leaked prompts and official docs). All quoted descriptions are verbatim. Claims about YouCoded that mattered for a finding were re-verified by hand in this session and are marked **[verified]**. Where a harness's own docs contradict its code, the code was taken as truth and the drift is noted. Anything an agent couldn't confirm is marked UNVERIFIED and was not used for a finding.

**How to read this.** §1 is the one-page answer. §2–§5 compare the four core tools one at a time with the actual description text side by side. §6 covers the search tools briefly (they were reviewed on 2026-08-10 already). §7 is the niche-tool landscape. §8 is the ledger — *measured defects* first, *design gaps* second, *taste* last, per the review-format convention. §9 ranks what to do.

---

## 1. The one-page answer

**Read — at parity, with one tighter safety edge and three real holes.** Everyone converged on the same shape: 2,000 lines per call, `offset`/`limit`, ~2,000 chars per line, images for vision models. YouCoded matches that, and is the only harness that *changes the description* by model capability (a text-only model is told images are refused; a vision model is told Read is how it looks at screenshots) and the only one with a "you meant the shell's directory" hint confirmed against disk. The holes: **no per-call byte cap** (OpenCode, Pi, OpenClaw, Cline all stop at ~50 KB; YouCoded can return ~100 K chars of a 2,000-line file of long lines with only a generic notice), **no PDF/Office/notebook reading** (Claude Code, Gemini, OpenCode, Roo, Hermes, Cursor all read PDFs at least), and **no directory read** (OpenCode lists a directory; Claude Code tells you to use `ls`; YouCoded returns a raw `EISDIR` error).

**Edit — the strictest staleness guard in the field, and the least forgiving matcher.** YouCoded is the only harness whose Edit *and* Write both refuse if the file changed on disk since you read it, and the only one whose description explains *why* (`cat` records no timestamp). Claude Code allows an edit to a changed file if the anchor is still unique; OpenCode's description promises a read-first error its code doesn't enforce; Gemini enforces nothing. That is a genuine lead. The trade is that YouCoded's matcher is pure exact-match: no whitespace tolerance, no smart-quote/Unicode normalisation, no multi-edit-per-call. The field split cleanly — exact (Claude Code, Cline, Cursor 2026) vs fuzzy (Gemini 4-stage + optional LLM fixer, OpenCode/Hermes 9-stage chains, Pi/OpenClaw one cheap normalisation pass, Codex whitespace/punctuation-fuzzy patches). For a product whose pillar is *small local models*, the exact camp is the wrong camp: small models reproduce indentation and quotes loosely and will loop on `old_string not found`. Also: YouCoded's Edit has **no parameter descriptions at all** — every other harness describes `old_string`/`new_string`.

**Write — fine, and consistent with Edit.** Same mtime guard, "Created X — this counts as having Read it" is a nice touch nobody else has. Two small things: Gemini's omission-placeholder detector (rejects content containing `// ... rest of code`) is cheap and exactly the failure small models produce; and Write doesn't preserve CRLF while Edit does, so a Write over a CRLF file silently converts line endings.

**Bash — the most honest description in the field, the tightest output window, and the only mainstream harness with no background execution.** YouCoded's description is the only one that states the cwd-persists-but-env-doesn't asymmetry plainly, the only one that warns about `set -e` absence, and the only one that tells the model the *full* output is always saved and how to get it. But the visible window (~4,000 chars / 100 lines) is 7–12× smaller than everyone else's (Claude Code 30 K chars, OpenCode/Pi 50 KB, Hermes 50 K, Cline 48 K, Codex ~40 KB): a 120-line test run needs a second call. That was a deliberate 2026-08-10 decision and it's defensible — but it's an outlier and worth a conscious re-look. More important: **every other harness except Pi can run something in the background** (Claude Code auto-backgrounds at timeout and has `run_in_background`; Codex *never* kills — it hands back a session id and lets the model type into it; Gemini `is_background`; Hermes/OpenClaw `background` + a `process` tool; Cursor backgrounds after 30 s). In YouCoded a dev server or a 12-minute build is SIGKILLed at 10 minutes, full stop. And one measured description defect: YouCoded tells the model to re-run a truncated command "piped through head/tail/grep" — Hermes' description explicitly warns that this masks the exit code (`cargo build | tail` reports `tail`'s 0), and YouCoded's own description admits there is no `pipefail`. The two sentences contradict each other.

**Niche tools — YouCoded is behind on breadth, ahead on two things.** Behind: no background-process control, no memory tool, no scheduler, no browser, no LSP diagnostics after edits, no semantic search, no notebook editing, no "script the tools" primitive, no free-text answer on multiple-choice questions (every other harness auto-adds "Other"). Ahead: `ModelSearch` (delegate a task to a *specific, priced* model by name — nobody else has this), the `Task` tool's refusal of placeholder/too-short briefs, model-tier description variants (`shortDescription` for small models — only Gemini and Claude Code do anything similar, and both do it per *model family*, not per capability), the tested `bounds`/`moreHint` truncation contract, and WebFetch's refusal to fabricate (it says when a page is a JS app and when an anchor doesn't exist, instead of summarising through a small model like Claude Code, which is lossy by design).

---

## 2. Read

### 2.1 The descriptions, side by side

| Harness | Description the model reads (verbatim, trimmed to the operative sentences) |
|---|---|
| **YouCoded** (text-only model) | "Read a TEXT file from the filesystem. Returns numbered lines. Use offset and limit for large files — output is capped at 2000 lines. Images and other binary files are refused." |
| **YouCoded** (vision model) | "Read a file from the filesystem. Text files return numbered lines; use offset and limit for large files — output is capped at 2000 lines. Image files (png, jpg, gif, webp) are delivered to you as the actual picture alongside the result — Read is how you look at a screenshot or image the user mentions by path." |
| **Claude Code** (compact) | "Reads a file from the local filesystem. `file_path` must be an absolute path. Reads up to 2000 lines by default. When you already know which part of the file you need, only read that part… Results are returned using cat -n format… Reads images (PNG, JPG, …) and presents them visually. Reads PDFs via the `pages` parameter… Reads Jupyter notebooks… Reading a directory, a missing file, or an empty file returns an error or system reminder rather than content. Do NOT re-read a file you just edited to verify — Edit/Write would have errored if the change failed, and the harness tracks file state for you." |
| **Codex** | *No read tool.* The prompt says: "When you search for text or files, you reach first for `rg` or `rg --files`… You parallelize tool calls whenever you can, especially file reads such as `cat`, `rg`, `sed`, `ls`, `git show`, `nl`, and `wc`." Output capped at ~10,000 tokens, middle-out. |
| **Gemini CLI** (gemini-3 family) | "…To maintain context efficiency, you MUST use 'start_line' and 'end_line' for targeted, surgical reads of specific sections. For your safety, the tool will automatically truncate output exceeding 2000 lines, 2000 characters per line, or 20MB in size; however, triggering these limits is considered token-inefficient. Always retrieve only the minimum content necessary for your next step. Handles text, images (PNG, JPG, GIF, WEBP, SVG, BMP), audio files (…), and PDF files." |
| **OpenCode** | "Read a file or directory from the local filesystem… By default, this tool returns up to 2000 lines from the start of the file… Use the grep tool to find specific content in large files or files with long lines… Contents are returned with each line prefixed by its line number as `<line>: <content>`… For directories, entries are returned one per line… Any line longer than 2000 characters is truncated. Call this tool in parallel when you know there are multiple files you want to read. Avoid tiny repeated slices (30 line chunks)… This tool can read image files and PDFs and return them as file attachments." |
| **Cline** (SDK) | "Read the content of text or image files at the provided absolute paths, or return only an inclusive one-based line range… When you already know multiple files you need, read them together in one call… Each read returns at most 2000 lines / ~47k characters; longer files report their total line count…" |
| **Hermes** | "Read a text file with line numbers and pagination. Use this instead of cat/head/tail in terminal. Output format: 'LINE_NUM\|CONTENT'. Suggests similar filenames if not found… Reads exceeding ~100K characters are truncated on a line boundary and return a next_offset… Jupyter notebooks (.ipynb), Word documents (.docx), and Excel workbooks (.xlsx) are auto-extracted… NOTE: Cannot read images or other binary files — use vision_analyze for images." |
| **Pi** | "Read the contents of a file. Supports text files and images (jpg, png, gif, webp, bmp). Images are sent as attachments. For text files, output is truncated to 2000 lines or 50KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete." |
| **OpenClaw** | "Read text/image file (jpg/png/gif/webp/bmp); images attach to model context. Text caps 2000 lines or 50KB. Continue with offset/limit, or cursor within a long line." |
| **Cursor** (2026 leak) | Whole-file read recommended; `LINE_NUMBER\|LINE_CONTENT`; images + PDF; "You MUST use the Read tool at least once before editing." |

### 2.2 Limits, side by side

| | Line cap | Per-line cap | Byte/char cap per call | File-size refusal | PDF | Notebook / Office | Directory | Re-read dedupe |
|---|---|---|---|---|---|---|---|---|
| **YouCoded** | 2,000 | 2,000 chars | 100,000 chars *pipeline* cap, generic notice **[verified `read.ts:76`]** | 50 MB | no | no | no (raw EISDIR) | no |
| Claude Code | 2,000 | (token budget) | token budget → "PARTIAL view" | 100 MB notebooks | yes (`pages`) | .ipynb | no (says use ls) | yes |
| Gemini | 2,000 | 2,000 | — | 20 MB | yes | — | no | no |
| OpenCode | 2,000 | 2,000 | **50 KB** | — | yes | — | **yes** | no |
| Cline | 2,000 | 2,000 | **48,000 chars** | 100 MB | no | no | no | no |
| Hermes | 2,000 | 2,000 | 100,000 chars, line boundary, `next_offset` | — | yes (text layer) | .ipynb .docx .xlsx | no | yes |
| Pi | 2,000 | — | **50 KB** | — | no | no | no | no |
| OpenClaw | 2,000 | — | **50 KB**, scaled to model context | — | no | no | no | no |
| Roo (final) | 2,000 | 2,000 | — | — | yes | .docx | no | no |

### 2.3 What stands out

**YouCoded does that nobody else does**
- **Capability-aware wording.** Read's description changes with `supportsVision`, and so does the small-model `shortDescription`. Gemini and Claude Code vary text per model *family*; nobody else varies it per *capability*. This is the right axis for a product that runs arbitrary OpenRouter and local models. (`read.ts:56-70` — the comment cites Roo Code issue #10440, the exact failure it prevents.)
- **"It exists relative to the shell's current directory instead."** A did-you-mean confirmed on disk before it's offered (`guards.ts:89-97`). Hermes and OpenCode suggest similar *filenames*; nobody else bridges the shell-cwd/workspace-root gap, which YouCoded has because Bash's `cd` persists and Read's paths don't follow it.
- **Records mtime on every read** — the input to the Edit/Write staleness guard (§3).

**Where YouCoded is behind**
- **No byte cap per call.** A file with 2,000 lines of 1,500-char lines is 3 MB of numbered text; YouCoded's pipeline cap cuts it to 100 K chars with `[output truncated: showing X of Y chars — use offset and limit to read a smaller slice]`. Fine advice, but the description promises "capped at 2000 lines" and says nothing about chars, so the model can't plan for it. OpenCode/Pi/OpenClaw state both caps in one sentence ("2000 lines or 50KB, whichever is hit first") and return a precise "Use offset=N to continue" footer. The `read.ts:77-85` comment already knows this case exists.
- **No PDF.** Seven of ten harnesses read PDFs. For an app whose pillar is students and professionals editing documents alongside the assistant, a Read that refuses `syllabus.pdf` as "binary" is a visible gap. Hermes goes furthest (docx/xlsx/epub via a converter); Claude Code's `pages` parameter (max 20 per call) is the pattern to copy.
- **No directory read.** A model that asks to Read a folder gets `Read failed: EISDIR: illegal operation on a directory` — a Node error string, not a tool message. OpenCode lists entries with a `/` suffix; Claude Code at least says "use ls". Small models do this often.
- **No re-read dedupe.** Claude Code returns a "reuse cached content" notice when the file hasn't changed; Hermes dedupes too. YouCoded already has the mtime in `readRegistry` — the comparison is free.
- **No token-frugality nudge.** Claude Code: "only read that part"; Gemini-3: "MUST use start_line/end_line… token-inefficient"; OpenCode: "Avoid tiny repeated slices". YouCoded's description is neutral. Not a defect; a lever the others pull.

---

## 3. Edit

### 3.1 The descriptions

| Harness | Description (verbatim, operative sentences) |
|---|---|
| **YouCoded** | "Replace an exact string in a file. old_string must match exactly once (or pass replace_all). This file must have been Read or Written by you in this session first, and not have changed on disk since — those tools record the file's modification time, which is what detects a stale edit. Viewing the file another way (cat, grep) does not count: it records no timestamp." — **params have no descriptions** **[verified `edit.ts:54-59`]** |
| **Claude Code** (compact) | "Performs exact string replacement in a file. You must Read the file in this conversation before editing, or the call will fail. `old_string` must match the file exactly, including indentation, and be unique — the edit fails otherwise. Strip the Read line prefix (line number + tab) before matching. `replace_all: true` replaces every occurrence instead." Plus a fragment: "Keep `old_string` minimal — usually 1-3 lines, only enough to be unique in the file. Including excess context wastes tokens and is an error." |
| **Codex** | "The `apply_patch` tool can be used to edit files. This is a FREEFORM tool, so do not wrap the patch in JSON." (a Lark grammar constrains the format server-side; the prompt adds "Do not waste tokens by re-reading files after calling `apply_patch` on them. The tool call will fail if it didn't work.") |
| **Gemini** (legacy) | "…This tool requires providing significant context around the change to ensure precise targeting. Always use the read_file tool to examine the file's current content… `old_string` MUST be the exact literal text… Include at least 3 lines of context BEFORE and AFTER the target text… NEVER escape `old_string` or `new_string`… Prefer to break down complex and long changes into multiple smaller atomic calls…" plus a required `instruction` param ("A clear, semantic instruction for the code change… a high-quality prompt for an expert LLM assistant"). |
| **OpenCode** | "Performs exact string replacements in files. You must use your `Read` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file. When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix… Never include any part of the line number prefix in the oldString or newString… The edit will FAIL if `oldString` is not found… found multiple times…" |
| **Hermes** (`patch`) | "Targeted find-and-replace edits in files. Use this instead of sed/awk in terminal. Uses fuzzy matching (9 strategies) so minor whitespace/indentation differences won't break it. Returns a unified diff. Auto-runs syntax checks after editing." |
| **Pi** | "Edit a single file using exact text replacement. Every edits[].oldText must match a unique, non-overlapping region of the original file. If two changes affect the same block or nearby lines, merge them into one edit instead of emitting overlapping edits. Do not include large unchanged regions just to connect distant changes." |
| **OpenClaw** | "Exact single-file replacements. oldText unique/non-overlapping against original. Merge nearby changes; omit large unchanged spans." |
| **Cursor** (2026) | "Performs exact string replacements in files. The edit will FAIL if old_string is not unique in the file. Use replace_all for replacing and renaming strings across the file." |

### 3.2 Rules and matching, side by side

| | Read-before-edit | Staleness check | Matching | Multi-edit per call | Post-edit feedback |
|---|---|---|---|---|---|
| **YouCoded** | enforced (Read *or* Write) | **mtime, enforced** **[verified `edit.ts:65-84`]** | exact only; BOM/CRLF-normalised for matching, restored on write | no | `structuredPatch` diff |
| Claude Code | enforced (relaxed for newest models when reading wouldn't prompt) | **not enforced** — edits a changed file if anchor still unique, then warns | exact only | no (MultiEdit removed Oct 2025) | — |
| Codex | none | none | context-line search from a cursor; whitespace + Unicode-punctuation fuzzy; **no uniqueness check** | yes (multi-file patch) | fail = didn't apply |
| Gemini | prose only | re-hash only inside the LLM fixer | exact → trimmed-line → regex-tokens → Levenshtein ≤0.1 → (opt-in) LLM fixer | no | diff snippet |
| OpenCode | **description promises it; code doesn't enforce** | none | 9-stage chain + "disproportionate match" guard | no | **LSP diagnostics appended** |
| Hermes | none | read-timestamp external-edit detection | 9 fuzzy strategies, re-indents on fuzzy hit | no (V4A patch mode) | unified diff + syntax check |
| Pi / OpenClaw | none | none | exact, then one pass: NFKC, trailing-ws strip, smart quotes→straight, dashes→`-` | **yes (`edits[]`)** | — |
| Cline SDK | none | none | exact (`old_text` ≤ 6,000 chars) | no (`insert_line` instead) | diff preview |
| Roo (final) | prose | none | `apply_diff` with `:start_line:` + 40-line fuzzy window (threshold 1.0 = exact) | yes (multi-block) | diagnostics after write |

### 3.3 What stands out

**YouCoded leads on safety.** It is the only harness where "the file changed since you looked at it" is a hard stop on *both* Edit and Write, and the only one whose description tells the model the mechanism so the refusal doesn't read as arbitrary. The 2026-08-10 prior-art doc's remaining recommendation — content hash instead of mtime (Gemini hashes for its fixer; OpenCode V2 compared bytes) — still stands; nothing found this round changes it.

**YouCoded trails on forgiveness, and that matters more here than elsewhere.** The exact-match camp (Claude Code, Cline, Cursor) is populated by harnesses that run frontier models. Every harness that has to serve weaker or varied models (Gemini, OpenCode, Hermes, Kilo, Pi) added tolerance. The cheapest, lowest-risk version is Pi's single normalisation pass (Unicode NFKC, strip trailing whitespace per line, smart quotes → straight, Unicode dashes → `-`, special spaces → space), which still requires uniqueness *in normalised space* and never re-indents. OpenCode's guard against a fuzzy match that is "much larger than oldString" is the safety valve that makes the deeper chains acceptable. Gemini's LLM fixer is off by default even at Google — skip it.

**Three description-level gaps, all cheap:**
1. **No parameter descriptions.** `file_path`, `old_string`, `new_string`, `replace_all` are bare. Every other harness describes them; Pi's `oldText` description alone carries the uniqueness rule.
2. **No "strip the line-number prefix" warning.** YouCoded's Read emits `%6d\t` prefixes. Claude Code and OpenCode both warn explicitly that the prefix must not be included in `old_string`; a small model that copies a Read line verbatim will fail with "not found" and no hint why.
3. **No "keep old_string minimal" guidance.** Claude Code added it in 2.1.91 and measured an output-token reduction.

**Two things nobody but YouCoded would need to explain:** `readRegistry` resets on resume (`types.ts:213`), so the first Edit after resuming a session is always refused with "has not been Read… in this session" — true, but the model's memory says otherwise. The refusal could name resume as a cause. And Write does not preserve CRLF while Edit does (§4).

---

## 4. Write

| Harness | Description (operative sentences) | Notable rule |
|---|---|---|
| **YouCoded** | "Create a new file or fully overwrite an existing one. Overwriting requires that the file have been Read or Written by you in this session, and not have changed on disk since… Creating a file that does not exist yet needs no prior Read." Success: "Created/Overwrote X (N chars). This counts as having Read it — you can Edit it now without reading it first." | mtime guard **[verified `write.ts:26-59`]**; parent dirs created; **no CRLF/BOM preservation** (Edit has both) |
| Claude Code | "Writes a file to the local filesystem, overwriting if one exists. When to use: creating a new file, or fully replacing one you've already Read. Overwriting an existing file you haven't Read will fail. For partial changes, use Edit instead." | read-first (relaxed for newest models); "NEVER create documentation files unless explicitly requested" |
| Gemini (gemini-3) | "Writes the complete content to a file, automatically creating missing parent directories. Overwrites existing files… Best for new or small files; use 'replace' for targeted edits to large files." Content param: "Provide the full file; do not use placeholders like '// ... rest of code'." | **rejects content containing omission placeholders**; CRLF preserved; returns diff snippet |
| OpenCode | "…If this is an existing file, you MUST use the Read tool first… This tool will fail if you did not read the file first. ALWAYS prefer editing existing files… NEVER proactively create documentation files…" | read-first **not enforced in code**; LSP diagnostics for this file + up to 5 others |
| Hermes | "…OVERWRITES the entire file — use 'patch' for targeted edits. Auto-runs syntax checks on .py/.json/.yaml/.toml…; only NEW errors introduced by this write are surfaced… The result's verified:true means the on-disk content hash was confirmed — do NOT re-read the file to check the write landed." | syntax check; system-path deny; approval for agent-instruction files |
| Pi / OpenClaw | "Write/overwrite file; creates parent directories." Guideline: "Use only new files/complete rewrites." | none |

**Verdict.** YouCoded's Write is at or above parity. The staleness guard is unique; "this counts as having Read it" closes a loop nobody else closes. Three small items: (1) Gemini's placeholder detector is a ~10-line regex and catches the single most common small-model failure in a full-file write; (2) a "prefer Edit for existing files" sentence, which every harness but Pi carries; (3) preserve CRLF/BOM the way Edit already does, so the two tools agree.

---

## 5. Bash

### 5.1 The descriptions

**YouCoded** (Linux/macOS rendering, verbatim, **[verified `bash.ts:356-406`]**):
> Run a shell command (bash on this machine). The working directory PERSISTS between calls: a `cd` carries to your next Bash call. Changing directory outside the workspace root is reverted (you get a reset notice). ASYMMETRY: only the working directory persists. Environment variables, aliases, and shell functions do NOT carry to your next call (e.g. `export FOO=bar` here is gone by your next call, unless you pass `persistent_env: true` to carry exported vars — not aliases/functions — forward) — every call is a fresh shell that inherits your `cd` and nothing else. Note that the other tools (Read/Edit/Write/Glob/Grep) resolve relative paths from the workspace root, NOT from this shell directory — prefer absolute paths with them. No `set -e`: a multi-command chain (`a; b; c`) reports the LAST command's exit code, so an earlier failure in the middle can be silently absorbed — use `&&` between commands, or check intermediate results yourself, when that matters. Output over ~4,000 chars OR ~100 lines shows only the first and last ~50 lines — whichever cap trips first, so a 120-line result is truncated even when it is short. The FULL output is then always saved to a file, with its path in the result — read that file (e.g. with the Read tool) or re-run the ORIGINAL command piped through head/tail/grep rather than guessing from the truncated preview; do not just re-run the same command hoping for more. Long-running commands time out (default 2 minutes, max 10 via `timeout`); a timeout force-kills the process (SIGKILL) and is reported as exit 124.

**Claude Code** (this session's assembled variant):
> Executes a bash command and returns its output. Working directory persists between calls, but prefer absolute paths — `cd` in a compound command can trigger a permission prompt. Shell state (env vars, functions) does not persist; the shell is initialized from the user's profile. Command output is displayed to you, not reliably to the user. `timeout` is in milliseconds: default 120000, max 600000. `run_in_background` runs the command detached: it keeps running across turns and re-invokes you when it exits. No `&` needed. Foreground `sleep` is blocked; use Monitor with an until-loop to wait on a condition. [+ Git section]

Other configurations add: "Avoid using this tool to run find, grep, cat, head, tail, sed, awk, or echo commands… File search: Use Glob (NOT find or ls) / Content search: Use Grep (NOT grep or rg) / Read files: Use Read (NOT cat/head/tail) / Edit files: Use Edit (NOT sed/awk)…"

**Codex** (`exec_command`): "Runs a command in a PTY, returning output or a session ID for ongoing interaction." Params: `yield_time_ms` "Wait before yielding output. Defaults to 10000 ms", `max_output_tokens` "Defaults to 10000 tokens". A companion `write_stdin`: "Writes characters to an existing unified exec session and returns recent output."

**Gemini**: "This tool executes a given shell command as `bash -c <command>`. To run a command in the background, set the `is_background` parameter to true. Do NOT use `&` to background commands. Command is executed as a subprocess that leads its own process group… Output: Combined stdout/stderr… Exit Code: Only included if non-zero… Background PIDs… Process Group PGID…"

**OpenCode**: "Executes a given bash command in a persistent shell session with optional timeout… AVOID using `cd <directory> && <command>` patterns - use `workdir` instead… IMPORTANT: This tool is for terminal operations like git, npm, docker, etc. DO NOT use it for file operations… If the output exceeds 2000 lines or 51200 bytes, it will be truncated and the full output will be written to a file… Do NOT use `head`, `tail`, or other truncation commands…" (+ a full Git-etiquette section).

**Hermes** (`terminal`): "Execute shell commands on a Linux environment. Filesystem, current working directory, and exported environment variables persist between calls. Do NOT use cat/head/tail (use read_file), grep/rg/find/ls (use search_files), sed/awk (use patch)… **NEVER pipe a build/test command through tail/head/cat to shorten output (e.g. `cargo build | tail -20`): output is auto-truncated with the full text saved to a file, and the pipe makes exit_code report the LAST pipeline command's status (tail's 0), masking real failures.** Run the command bare… Background: set background=true (returns a session_id). Pair with notify_on_complete=true for bounded tasks… Never use nohup/setsid/trailing '&'… PTY: set pty=true for interactive CLIs."

**Pi**: "Execute a bash command in the current working directory. Returns stdout and stderr. Output is truncated to last 2000 lines or 50KB (whichever is hit first). If truncated, full output is saved to a temp file. Optionally provide a timeout in seconds." (no default timeout)

**OpenClaw** (`exec`): "Run shell now; background continuation supported. Use yieldMs/background, then process for logs/status/input/intervention… No sleep/delay loops for reminders/follow-ups; use cron. TTY CLI/UI/coding agent: pty=true."

**Cursor** (2026 `Shell`): "…Commands that don't complete within `block_until_ms` (default 30000ms / 30 seconds) are moved to background. Set `block_until_ms: 0` to immediately background." + `AwaitShell`.

### 5.2 Limits, side by side

| | Default timeout | Max | On timeout | Background | Interactive stdin | Visible output | Overflow | cwd persists | env persists | Sandbox |
|---|---|---|---|---|---|---|---|---|---|---|
| **YouCoded** | 2 min | 10 min | **SIGKILL, exit 124** | **no** | **no** | **~4,000 chars / 100 lines** (head+tail) **[verified `bash.ts:576-578`]** | always spilled to file, path given | yes (in-workspace) | opt-in `persistent_env` | no; deny-list asks in full-auto |
| Claude Code | 2 min | 10 min | **auto-backgrounds** (except `sleep`/`git`) | `run_in_background`; Monitor | no | 30,000 chars | file path + preview | yes (in-project) | no | Seatbelt/bwrap modes |
| Codex | 10 s yield | none | **returns session id, keeps running** | inherent | `write_stdin` | ~10,000 tokens middle-out | — | `workdir` param | login shell | Seatbelt/bwrap + escalation w/ `justification` + `prefix_rule` |
| Gemini | 5 min **inactivity** | — | cancels | `is_background` + PGID | no | 16 MB buffer | head trimmed | `dir_path` param | no | optional; **command substitution `$()` blocked** |
| OpenCode | 2 min | none | kill | (subagents only) | no | 50 KB tail | file | `workdir` param, no `cd` | no | none; tree-sitter parse → per-segment permission |
| Hermes | 3 min | 10 min fg | reject >600 s fg; use background | `background` + `process` tool, `notify_on_complete`, `watch_patterns` | `process write/submit` | 50,000 chars (40% head / 60% tail) | file | yes | **yes** | container backends; 12 hardline blocks + 47 dangerous patterns + LLM "smart" approval |
| Pi | none | — | kill | no | no | 50 KB tail | file | yes | yes | none by design |
| OpenClaw | 10 s yield → background | 30 min | background | `background` + `process` | `process write/send-keys/paste` | 200,000 chars | file | `workdir` | `env` param | host/sandbox/node routing; `elevated` |
| Cline SDK | 30 s | — | — | ("redirect to a tmp file") | no | 48,000 chars middle-out | — | root of workspace | — | plan-mode command guard hook |
| Cursor | 30 s block | — | **backgrounds** | `AwaitShell` | no | UNVERIFIED | — | yes | yes | Seatbelt/Landlock; auto-review classifier |

### 5.3 What stands out

**YouCoded's description is the most honest one in the set.** Nobody else states the cwd/env asymmetry as a labelled sentence; nobody else warns about `set -e`; only OpenCode/Pi/Hermes also promise the full output is *always* on disk. The "120-line result is truncated even when it is short" sentence pre-empts the exact confusion the small window causes.

**Measured defect — the description contradicts itself.** It says "No `set -e`… an earlier failure in the middle can be silently absorbed" and then, four sentences later, tells the model to "re-run the ORIGINAL command piped through head/tail/grep". There is no `pipefail` either (`bash -c` plain, `bash.ts` comment at :377-380), so `npm test | tail -50` reports `tail`'s exit 0 even when the tests fail. Hermes' description names this precise trap and forbids the pipe. The fix is a sentence, not code: prefer "Read the saved file" and, if re-running, `cmd > out.txt 2>&1; echo exit=$?` or `set -o pipefail; cmd | tail`.

**The visible window is an outlier.** 4,000 chars / 100 lines vs 30 K–50 K for everyone else — a 7–12× gap. The 2026-08-10 truncation prior-art doc chose this deliberately (small local models; the full output is one Read away, and Read is permission-free). It is defensible, but it means every test run, every `git log`, every build over 100 lines costs a second tool call. Worth a re-look with the evaluator: the cost is model steps, the benefit is context. Hermes' 40/60 head/tail split (tail matters more for builds) is also a better ratio than 50/50 for the same budget.

**Design gap — no background execution, no interactive stdin.** This is the single largest functional gap in the four core tools. Every harness that isn't Pi (which is deliberately minimal) lets a command outlive the call: Claude Code backgrounds automatically at the timeout rather than killing; Codex never kills at all and hands the model a session it can type into; Hermes/OpenClaw pair `background` with a `process` tool (poll/log/write/kill) and completion notifications; Cursor backgrounds after 30 s. In YouCoded, `npm run dev`, a 12-minute Android build, or anything that prompts for input dies at the 10-minute SIGKILL with "if it was mid-write to a file, that write may be incomplete". The YouCoded harness already has the machinery a background mode needs — the specialists' background delivery (`Task … background: true` → "Their report will be delivered to you automatically") is the same shape. Claude Code's "auto-background instead of kill" is the least-new-surface version: no new tool, no new param, just a different timeout outcome.

**Bash bypasses the secret-file guard** (`guards.ts:6`, documented as accepted). Claude Code applies `Read(.env)` deny rules to recognised Bash file commands (`cat`, `head`, `sed -n`, `rg` on one file); Gemini blocks `$()` substitution outright. Not new — recording that the field does close this hole in two different ways.

---

## 6. Glob and Grep — briefly

These were reviewed against prior art on 2026-08-10 (`docs/archive/investigations/2026-08-10-harness-search-tools-prior-art.md`) and the recommendations shipped. What this round adds:

| | YouCoded | Claude Code | Gemini | OpenCode | Pi | Hermes |
|---|---|---|---|---|---|---|
| Grep engine | bundled ripgrep | ripgrep | ripgrep (fallback git grep) | ripgrep | ripgrep | ripgrep |
| Case-insensitive | **no param** **[verified `grep.ts:517-528`]** | `-i` | `case_sensitive` default **false** | no | `ignoreCase` | — |
| Literal/fixed-string | no | no | `fixed_strings` | no | `literal` | — |
| Type filter | no | `type` | — | — | — | — |
| Multiline | no | `multiline` | — | — | — | — |
| Result cap | 100 matches (content), 500/file | `head_limit` (~250), `offset` | 100 total (`total_max_matches`) | 100 | 100 (`limit`) | 50 (`limit`, `offset`) |
| Search timeout | **none** (ROADMAP #136) | — | **30 s** | — | — | — |
| Glob gitignore | **no** | no (Grep yes) | yes | ripgrep-backed | yes (`fd`) | — |
| Glob cap | 2,000 (50,000 walk ceiling) | 100 | none | 100 | 1,000 | — |
| Glob engine | hand-rolled walk | — | — | ripgrep | `fd` | ripgrep |
| Bare `*.ts` recurses? | **no** (anchored to root-relative path) | — | — | — | — | Cursor auto-prepends `**/` |

**One measured footgun, verified:** every YouCoded tool's schema is a plain `z.object`, and no tool uses `.strict()` (`rg "\.strict\(\)" src/main/harness` → nothing), so **unknown parameters are silently dropped**. A model trained on Claude Code that sends `Grep {pattern, -i: true}` gets a case-*sensitive* search and no error. Claude Code's harness rejects unknown params; OpenCode returns "The X tool was called with invalid arguments… Please rewrite the input so it satisfies the expected schema." This compounds the missing `-i`: the most common Grep flag in the world is both absent and silently ignored.

Grep's per-search timeout is already ROADMAP #136 (spec `2026-08-17-search-scope-and-timeout-design.md`); Gemini's 30 s + "consider narrowing your search scope" is the reference.

---

## 7. The niche tools — what others have, what YouCoded has

### 7.1 Present elsewhere, absent in YouCoded

| Capability | Who has it | Shape worth copying | Relevance to YouCoded |
|---|---|---|---|
| **Background processes + a process tool** | Claude Code (`run_in_background`, Monitor, auto-background), Codex (sessions + `write_stdin`), Gemini (`is_background`, `list_background_processes`, `read_background_output`), Hermes/OpenClaw (`background` + `process` poll/log/write/kill), Kilo (`background_process` with `ready.port`), Cursor (`AwaitShell`) | Claude Code's auto-background-instead-of-kill needs no new tool; Hermes' `notify_on_complete` reuses the same delivery path YouCoded's background specialists already use | **High** — §5 |
| **Free-text answer on multiple-choice questions** | Claude Code ("Users will always be able to select 'Other'"), Gemini (auto-adds "Other"), OpenCode/Kilo (`custom` default on: "Type your own answer"), Cursor, Hermes (open-ended mode), Codex (`request_user_input` — "the client will add a free-form 'Other' option automatically") | The client adds it; the schema doesn't change | **High** — YouCoded's card has no free-text path **[verified `ToolCard.tsx:775-800`]**; Dismiss ends the turn |
| **Memory tool** | Hermes (`memory` — 2,200/1,375-char hard caps, atomic batch, two stores), OpenClaw (`memory_search`/`memory_get` semantic over MEMORY.md), Codex (`memories.*`, off by default), Claude Code (file-based memory dir, no tool), Cursor 2025 (`update_memory`, dropped by 2026) | Hermes' *capped* stores are the interesting design: the budget forces curation, and it's injected as a frozen snapshot to preserve prompt caching | Medium — YouCoded has plugin-level memory (encyclopedia, journaling); a harness-level store is a product question |
| **Scheduler** | OpenClaw (`automations`: at/every/cron/**stream watchers**, trigger scripts, paced self-wake), Hermes (`cronjob` with `monitor` change-detector), Claude Code (`CronCreate`, `ScheduleWakeup`) | — | Medium — assistant-app feature, not a coding-tool gap |
| **LSP / diagnostics after edit** | OpenCode/Kilo (LSP errors appended to every edit/write result; `lsp` tool with 9 operations), Claude Code (LSP tool via plugin; diagnostics after edit), Hermes (syntax check on write/patch), Cursor (`read_lints`), Roo (diagnostics after write) | OpenCode's "append the diagnostics for the file you just touched" is the low-friction version | Medium for the Coder preset; the workspace already runs Serena's LSP for Claude Code |
| **Semantic code search** | Cursor (`SemanticSearch`, server-side encrypted index — "your MAIN exploration tool"), Roo (`codebase_search`, Qdrant), Kilo (`semantic_search`) | Requires an embedding index; Roo's was gated on an OpenAI key + Qdrant | Low — heavy infrastructure; ripgrep + specialists cover it |
| **Script-the-tools** | Hermes (`execute_code`: Python calling tools, 50 calls/5 min/50 KB), Codex (code mode `exec`: JS in V8 over `tools.*`), OpenCode (`execute` over MCP), Claude Code (`Workflow` scripts) | Hermes' rationale: "3+ tool calls with logic between them: filtering/reducing large outputs before they enter context" | Low–Medium — a context-economy tool; interesting for small models |
| **Browser** | OpenClaw (single `browser` tool, action enum, accessibility-ref snapshots), Hermes (`browser_*` family + `browser_exec` Python), Cline/Kilo-legacy (`browser_action`, Puppeteer, screenshot per action), Cursor (Browser subagent), Claude Code (Chrome extension MCP) | OpenClaw's "navigate returns the loaded page's compact snapshot inline" | Medium — the research pillar; today WebFetch declares JS-rendered apps honestly and stops |
| **Notebook edit** | Claude Code (`NotebookEdit`), Cursor (`EditNotebook`) | — | Low unless students are the target |
| **Multi-file read in one call** | Gemini (`read_many_files`), Cline (`read_files` array) | — | Low — parallel Read calls do this |
| **Skills self-management** | Hermes (`skill_manage` create/patch/delete + a forked post-turn "should I save a skill?" review + an idle curator that archives, never deletes) | The loop, not the tool | Medium — maps directly onto the "create new personalized app features from within the app" pillar; YouCoded's Skill tool is read-only and has no `args` |
| **Send file to user** | Claude Code (`SendUserFile`), Kilo (`send_file`, `notify_user`) | — | **Built** on `feat/send-user-file-card`, not merged (ROADMAP) |
| **Spawn another harness** | OpenClaw (`sessions_spawn runtime="acp"` → codex/claude/gemini/opencode), Cursor (`codex-rescue` subagent) | — | YouCoded does this at the GUI level (Claude Code is a first-class session type), not as a tool |
| **Delete file** | Cursor (`Delete`, with "File-Deletion Protection"), Kilo-legacy (`delete_file`) | — | Low — Bash `rm` with the deny-list ask covers it |
| **Image generation / TTS** | OpenClaw, Hermes, Roo (`generate_image`), Cursor 2026 | — | Product question |
| **Session recall** | Hermes (`session_search`, FTS5, "No LLM calls"), Kilo (`recall`), OpenClaw (`sessions_search`) | — | YouCoded has this as the bundled `youcoded-chatsearch` skill — but ROADMAP #157 says its Bash invocation fails because `${CLAUDE_PLUGIN_ROOT}` is unset in the native shell |
| **Plan mode as tools** | Claude Code, Gemini (`enter_plan_mode`/`exit_plan_mode` with a plans directory), OpenCode/Kilo (`plan_enter`/`plan_exit`), Cursor (`SwitchMode`) | — | Low — YouCoded's permission modes are a status-bar chip |
| **Shell-command parsing for permissions** | OpenCode (tree-sitter parse, per-segment ask, arity dictionary for "always" prefixes), Codex (segment split at control operators; redirections/substitutions never match rules), Gemini (root-command prefix rules; `$()` blocked) | — | YouCoded's `bashGrantOptions` + `HOSTILE_CORPUS` is comparable; noted for the ROADMAP #47 wide-grant work |

### 7.2 Present in YouCoded, rare or absent elsewhere

| YouCoded feature | Closest peer | Why it's a lead |
|---|---|---|
| **`ModelSearch`** — look up a specific model id with price and context length, for delegating a Task to it | none | Nobody else lets the model pick a *priced* delegate by name; the "budget"/"frontier" tiers + explicit refusal to substitute an unconfirmed id is careful design |
| **Task refuses bad briefs** — <40 chars, or matching a placeholder regex (`todo`, `tbd`, `<…>`, `{{…}}`), or a task_id not owned by this session | Hermes ("Children know nothing of this conversation"), Claude Code ("Trust but verify") say it in prose | YouCoded *enforces* the self-contained-brief rule; also the only harness with a lifetime spawn budget (30) as a runaway guard |
| **Capability-keyed descriptions** (`descriptionFor(caps)`, `shortDescription` for `simplified` presentation) | Gemini/Claude Code vary per model family | Per-capability is the correct axis for a multi-provider app |
| **`bounds`/`moreHint` contract, pinned by tests** — every truncation notice states shown/total/unit and a specific next step; `total: null` says "more may exist — exact total unknown" | Gemini's `IMPORTANT: … truncated. Status: Showing lines X-Y of N` header; OpenCode's "Use offset=n to continue" footer | YouCoded's is the only one enforced by a manifest test (`tool-registry-manifest.test.ts`) |
| **Staleness guard on Edit *and* Write, explained in the description** | Claude Code (Edit only, not enforced on changed files) | §3 |
| **Bash spill-at-first-overflow + always-on-disk** | OpenCode, Pi, Hermes spill too | YouCoded starts the spill the moment the head fills, so no middle is ever lost (`bash.ts:599-639`) |
| **Three-direction did-you-mean, confirmed on disk** (Read → shell cwd; Bash "No such file" → workspace root; Glob/Grep missing root) | Hermes/OpenCode suggest similar filenames | Only offers what exists |
| **WebFetch refuses to fabricate** — discloses JS-rendered apps ("The server sent N KB of text; content that loads in a browser is not included"), missing anchors, the 5 MB cut; no summarising model | Claude Code's WebFetch is "lossy by design" (a small model answers your `prompt`; the research agent for this very report had to fall back to `curl` because the summariser paraphrased instead of quoting) | Better for a research tool; the `prompt` param is cosmetic though (see ledger) |
| **Net guard on WebFetch** (private/link-local/v4-mapped-v6 blocked, redirects re-validated) | OpenClaw (SSRF guard), Gemini (blocked in code; legacy description *claims* private addresses are supported — drift), Claude Code | OpenCode has **no** private-IP block |
| **Doom-loop detection** (identical call ×2 small / ×3 cloud → ask) | Roo `ToolRepetitionDetector` (3), Cursor prose ("DO NOT loop more than 3 times") | Comparable; YouCoded surfaces it as a user ask rather than a silent stop |

---

## 8. Ledger

Numbered so decisions can reference them. **D** = measured defect (code or description is wrong on its own terms). **G** = design gap (works as designed; the field does something better). **T** = taste (a choice; reasonable people differ).

### Defects

| # | Kind | Finding | Evidence | Fix size |
|---|---|---|---|---|
| **D-1** | D | Bash description tells the model to re-run truncated commands "piped through head/tail/grep", which masks the exit code — and the same description says there is no `set -e`. No `pipefail` is set. `npm test \| tail -50` reports success on failing tests. | `bash.ts:356-406` (the pipe advice vs the `set -e` warning in the same description; the "no `pipefail` injected" note is the comment at `:377-380`); Hermes' `terminal` description forbids exactly this | one sentence |
| **D-2** | D | Unknown tool parameters are silently dropped on every tool (`z.object` without `.strict()`). A model sending Claude-Code-shaped `Grep {-i: true}` or `Read {pages}` gets a different call than it asked for and no error. | `rg "\.strict\(\)" src/main/harness` → 0 hits **[verified]**; OpenCode returns an invalid-arguments error | `.strict()` on each schema + one error path in the driver; expect a burst of "Invalid arguments" from CC-trained models, which is the point |
| **D-3** | D | Read on a directory returns Node's raw `EISDIR` string via the generic catch, not a tool message. | `read.ts` → `registry.ts:37` | small — either list the directory (OpenCode) or say "use Glob/Bash ls" |
| **D-4** | D | Edit refuses the first edit after a session resume with "has not been Read… in this session" — true (`readRegistry` resets, `types.ts:213`) but the message doesn't say resume is why, so the model reads it as a contradiction of its own memory. | `edit.ts:70-75`, `types.ts:213` | one clause |
| **D-5** | D | Write does not preserve CRLF/BOM; Edit does. A Write over a CRLF file converts it to LF. | `write.ts:64` vs `edit.ts:20-33` | reuse Edit's `preserveFormat` |
| **D-6** | D | WebFetch's `prompt` parameter ("What you want to learn from this page") is only echoed as a header — it invites the model to expect an answer that never comes. | `web-fetch.ts:823-826` | rename the description ("Optional note, echoed back; the full page is returned regardless") or drop the param |
| **D-7** | D | Documentation drift: `youcoded/docs/native-runtime.md` claimed Bash retains 22,000/6,000 chars (code: 4,000/4,000) and that null totals render "at least S" (code: "more may exist"). | — | **Fixed this session** — youcoded PR #329, merged `c04739df` |
| **D-8** | D (known) | WebFetch/WebSearch subjects run through the file-path guard (`NON_PATH_SUBJECT_TOOLS` = Bash/Skill/Task only). A normal URL resolves *inside* the workspace so it doesn't prompt every call, but a query starting with `/` or containing `.env` trips a file-permission card or a "credential file" hard deny. | `harness-session.ts:48,2531-2555` **[verified]** | Already ROADMAP #133 with a plan (`2026-08-21-full-auto-external-read-bypass.md`, unbuilt, blocked on a copy-approval gate) |

### Design gaps

| # | Kind | Finding | Field reference | Size |
|---|---|---|---|---|
| **G-1** | G | **No background execution / interactive stdin.** Long commands are SIGKILLed at 10 min; nothing can outlive a call; nothing can answer a prompt. | Claude Code auto-backgrounds at timeout; Codex sessions + `write_stdin`; Hermes/OpenClaw `background` + `process` | medium–large; auto-background-on-timeout is the smallest version |
| **G-2** | G | **No free-text "Other" on AskUserQuestion.** The card only accepts listed choices; Dismiss ends the turn. | Every other harness adds "Other"/"Type your own answer" client-side | small (UI only; answer text already flows as a string) |
| **G-3** | G | **Edit is exact-match only.** Small local models loop on `old_string not found` over indentation, smart quotes, trailing whitespace. | Pi's one normalisation pass (NFKC, trailing ws, quotes, dashes) + OpenCode's disproportionate-match guard | small–medium; keep uniqueness in normalised space; never re-indent |
| **G-4** | G | **Edit has no parameter descriptions, no "strip the line-number prefix" warning, no "keep old_string minimal" guidance.** | Claude Code, OpenCode, Pi all carry these | text only |
| **G-5** | G | **No per-call byte cap on Read**, and the description promises only the line cap. | OpenCode/Pi/OpenClaw/Cline: "2000 lines or ~50 KB, whichever first" + exact continuation footer | small; `bounds` already supports it |
| **G-6** | G | **No PDF (or Office) reading.** | 7 of 10 harnesses read PDF; Claude Code's `pages` (max 20/call); Hermes' text-layer-only with a coverage warning | medium (needs a PDF text extractor dependency) |
| **G-7** | G | **Grep has no case-insensitive, literal, type, or multiline option** (and D-2 hides a model's attempt to send one). | Claude Code `-i`/`type`/`multiline`; Gemini `case_sensitive` default false; Pi `ignoreCase`/`literal` | small — pass-through flags |
| **G-8** | G | **Glob is hand-rolled**: not gitignore-aware, includes hidden files, and a bare `*.ts` doesn't recurse (anchored to the root-relative path) — the parameter description doesn't say so. | Pi uses `fd`; OpenCode uses ripgrep `--files`; Cursor auto-prepends `**/` | small (auto-prepend `**/` when no `/` in pattern, or say it) — or medium (switch to `rg --files --glob`, which YouCoded already bundles) |
| **G-9** | G | **No diagnostics after edit.** | OpenCode appends LSP errors for the touched file to every edit/write result; Hermes runs a syntax check | medium (Coder preset only; a syntax-only check for JSON/YAML/TS via `tsc` is the cheap first rung) |
| **G-10** | G | **Write has no omission-placeholder detection.** `// ... rest of code ...` in a full-file write silently destroys the file. | Gemini `detectOmissionPlaceholders` rejects it | small (regex) |
| **G-11** | G | **No re-read dedupe on Read.** | Claude Code, Hermes return a "unchanged since last read" notice | small — `readRegistry` already has the mtime |
| **G-12** | G | **Skill tool has no `args`** and is absent on small models; a 30 K+ SKILL.md is head/tail cut mid-instructions. | Claude Code `args`; OpenCode returns a sampled file list so the model can Read more | small (`args`) |
| **G-13** | G | **No "prefer the dedicated tools over cat/grep/sed" guidance in Bash's description.** The Edit read-gate makes `cat` useless indirectly, but the model isn't told up front. | Claude Code, OpenCode, Hermes, Cursor 2026, Kilo all say it | text only — but see T-2 |
| **G-14** | G | **Bash's secret-file guard is bypassed** (documented, accepted). | Claude Code applies `Read(.env)` deny to recognised Bash file commands; Gemini blocks `$()` | medium; recorded, not re-argued |

### Taste

| # | Kind | Finding |
|---|---|---|
| **T-1** | T | **The 4,000-char / 100-line Bash window.** 7–12× smaller than every peer; chosen 2026-08-10 for small-model context economy, with the full output always one permission-free Read away. Defensible. The cost is one extra step on every >100-line result. Hermes' 40/60 head/tail split favours the tail (where build errors live) — a better ratio for the same budget. Worth an evaluator run before changing. |
| **T-2** | T | **Claude Code's "avoid cat/grep/sed" instruction is permission-mode dependent.** In bypass-permissions mode Claude Code tells the model the *opposite* ("Do your work through the Bash tool wherever it can"). The rationale for dedicated tools is reviewability and permission UI, not capability — so in YouCoded's full-auto mode the guidance could reasonably flip too. |
| **T-3** | T | **The descriptions carry no token-frugality nudges** ("only read the part you need", "keep old_string minimal"). Claude Code, Gemini-3, OpenCode all do. Small models may not honour them; frontier models measurably do. |
| **T-4** | T | **Codex's "no Read tool at all" and Pi's "four tools, no permissions"** are coherent philosophies YouCoded shouldn't copy — Codex relies on a grammar-constrained decoder and frontier models; Pi assumes a container. Both confirm that `read/edit/write/bash` is the settled core; the differentiation is in the guards and the descriptions, which is where YouCoded already invests. |

---

## 9. What to do, ranked

Ordered by (what the user experiences) ÷ (effort). Each is independent.

1. **D-1 — fix the Bash description's pipe advice** (one sentence). Today a model that follows the description can report a failing build as passing.
2. **G-2 — add a free-text "Other" to the question card** (UI only). Today a user who doesn't like any of the 2–4 options can only dismiss, which ends the turn and makes the model start over.
3. **D-2 + G-7 — reject unknown params, then add Grep `-i`/`literal`/`type`.** Together, not separately: strict schemas alone will make CC-trained models fail on `-i`; `-i` alone will keep silently dropping `multiline`. Expect the eval battery to surface the models that guess.
4. **G-3 + G-4 — Pi-style normalisation pass in Edit, plus parameter descriptions and the two warnings.** This is the small-local-model item. Ship the description text first (free), measure the "not found" rate with the evaluator, then the matcher.
5. **G-1 — background execution.** Smallest version: at timeout, detach instead of SIGKILL and deliver the completion the way background specialists already are. Larger version: a `process` tool. This is the one item on the list that changes what the app can *do* (dev servers, long builds, installers that ask a question).
6. **G-5, G-11, D-3, D-4, D-5, D-6 — Read/Write/Edit polish.** Each is under an hour; batch them.
7. **G-6 — PDF reading.** Product-pillar item; needs a dependency decision.
8. **G-10, G-9, G-12, G-8** — as they come up.
9. **T-1 — re-evaluate the Bash window** with the harness evaluator, not by argument.

Nothing here is captured in `ROADMAP.md` yet — that's the next step once Destin picks which items he wants; D-7 is done, D-8 is already there.

---

## Appendix A — sources

- **YouCoded:** `youcoded/desktop/src/main/harness/tools/*.ts`, `shared/harness-manifest.ts`, `shared/permission-types.ts`, `main/harness/harness-session.ts`, at master `73e2defe`; renderer `components/ToolCard.tsx` for the question card. Prior rounds: `docs/archive/investigations/2026-08-10-harness-output-truncation-prior-art.md`, `…-search-tools-prior-art.md`, `docs/active/investigations/2026-08-10-harness-mutation-safety-prior-art.md`.
- **Claude Code:** this session's live tool schemas; `Piebald-AI/claude-code-system-prompts` (v2.1.246 mirror, 515 prompt strings); `code.claude.com/docs/en/tools-reference`, `/sub-agents`; `anthropics/claude-code` CHANGELOG.
- **Codex CLI:** `openai/codex` main @ `a26f1806` (2026-08-26): `codex-rs/core/src/tools/handlers/*_spec.rs`, `core/src/unified_exec/mod.rs`, `apply-patch/src/*.rs`, `models-manager/models.json` (the live per-model prompts — the `core/*.md` prompt files are dead), `prompts/templates/permissions/*`.
- **Gemini CLI:** `google-gemini/gemini-cli` @ `64b5b79a` (2026-08-25): `packages/core/src/tools/definitions/model-family-sets/{default-legacy,gemini-3}.ts`, `tools/*.ts`, `utils/editCorrector.ts`, `utils/llm-edit-fixer.ts`.
- **OpenCode:** `sst/opencode` @ `1cc53890` (2026-08-26): `packages/opencode/src/tool/*.txt|*.ts`, `tool/truncate.ts`, `tool/registry.ts`.
- **Cline:** `cline/cline` main (v4.1.16): `sdk/packages/core/src/extensions/tools/{definitions,schemas,presets,model-tool-routing}.ts`, `executors/output-limits.ts`. Note: the VS Code extension now runs on the Cline SDK; the old XML tools survive only as aliases.
- **Roo Code:** `RooCodeInc/Roo-Code` — **archived 2026-05-15** (final 3.53/3.54; community fork Zoo Code, unread): `src/core/prompts/tools/native-tools/*.ts`, `src/services/ripgrep/index.ts`.
- **Kilo Code:** `Kilo-Org/kilocode` (v7.4.23, now an OpenCode fork): `packages/opencode/src/tool/*`, `kilocode/tool/*`; legacy Roo-fork `Kilo-Org/kilocode-legacy` (v5.16.2, archived) for Morph `fast_edit_file`.
- **OpenClaw:** `openclaw/openclaw` @ `a6a3fd9` (2026.8.1): `src/agents/sessions/tools/{read,edit,write}.ts`, `bash-tools.descriptions.ts`, `tool-description-presets.ts`, `tool-catalog.ts`, `extensions/{browser,canvas,memory-core}`, `docs/`.
- **Hermes:** `NousResearch/hermes-agent` main (2026-08-26): every `registry.register` in `tools/**` (86), `tools/fuzzy_match.py`, `tools/approval.py`, `toolsets.py`.
- **Pi:** `earendil-works/pi` (formerly `badlogic/pi-mono`), coding-agent 0.84.3: `packages/coding-agent/src/core/tools/*.ts`; Mario Zechner's 2025-11-30 and 2025-11-02 posts.
- **Cursor:** closed source. Leaked prompts from `x1xhlol/system-prompts-and-models-of-ai-tools` (2025-06 → 2025-11), `jujumilk3/leaked-system-prompts` (2.0, 2025-10), `asgeirtj/system_prompts_leaks` (2026-06-04); official `cursor.com/docs` + changelog (2026-08-26). Leaked text is "published, plausible", not authoritative.
