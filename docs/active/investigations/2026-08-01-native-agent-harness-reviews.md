# Native Agent Harness Reviews

**Purpose:** Multi-model reviews of the YouCoded native agent harness (the first-party tool-use runtime that ships in the app). Each reviewing agent runs a standard battery of agentic tasks (navigate, read, write, edit, search, web) inside the harness and records an honest, first-person assessment of what works, what doesn't, and what they'd change.

**Why this doc exists:** The native harness is the load-bearing piece of the v1.3+ product — it's what lets users run agents without a Claude Code install. If the harness is frustrating, brittle, or opaque, the app fails at its core promise. One model's review is a data point; several models' reviews are a pattern.

**How to contribute:** Use the prompt at the bottom of this doc. Append your review as a new `##` section, signed with your model name and the date. Do not edit or delete other models' reviews. Do not delete any pre-existing files in the workspace.

---

## Review: Kimi K3 (Moonshot AI) — 2026-08-01

**Context:** I ran a ~20-tool-call battery against the harness in `/home/destin/youcoded-dev`: directory navigation, reading markdown/JSON/TypeScript/Kotlin/TOML/binary files, Glob/Grep searches, Write/Edit guard-rail probes, Bash edge cases (env persistence, timeouts, output caps, quoting), WebSearch, and WebFetch. I also deliberately triggered every documented guard rail to see how the harness responds to mistakes.

### What works well

**The guard rails are genuinely excellent.** The "read before write" and "file changed since read" checks caught me every time, and the error messages told me exactly what to do next. When I tried to edit a file that had been externally modified between my Read and Edit, the harness rejected it with "changed since you read it. Read it again, then retry." That's the kind of protection that prevents real damage in multi-session workspaces like this one.

**Tool descriptions are honest.** The environment note said "output is capped; long-running commands time out" — and when I dumped 500,000 lines through `tail -5`, I got exactly 5 lines back. No surprise truncation, no silent data loss. The `cd`-outside-root reset fired with a clear notice. The duplicate-string Edit rejection suggested both fixes (add context OR use `replace_all`).

**TodoWrite state is durable.** I ran 6 todo updates across ~15 tool calls, including one interruption (an API credit break), and state survived intact. The `activeForm` field is a nice touch for UI display.

**WebSearch is surprisingly deep.** The exa backend returned full GitHub issue bodies, not just snippets — I got actual protocol traces and cross-compositor test results for the Wayland `setIgnoreMouseEvents` bug that's directly relevant to the buddy floater investigation.

### Difficulties / wishes

**1. WebFetch chokes on large pages.** The Electron docs page failed with "too large or deeply nested to extract safely." A fallback that returns the first N KB of text (even if messy) would be better than a hard failure. The suggestion to try a "printer-friendly version" is good, but I didn't have one handy.

**2. Bash output truncation is invisible.** When I ran `seq 1 2000 | head -c 100000`, I got ~2,000 lines back with no indication that the original output was larger. A `[output truncated: showing X of Y bytes]` marker would help me calibrate whether to re-run with `| tail` or `| head`.

**3. No way to undo a Write.** I created a test file, then overwrote it. The overwrite succeeded silently because the harness tracked it as "already written in-session." That's correct behavior, but there's no "show me the diff" or "revert to previous content" escape hatch. For a non-developer user, that might feel scary.

**4. `AskUserQuestion` header limit is tight.** 12 characters is barely enough for "Choose one" — I didn't test it, but I can imagine wanting more room for a descriptive header.

**5. No native "run tests" or "run linter" affordance.** I had to know to run `bash scripts/verify.sh`. A harness-level `Test` or `Lint` tool (even if it just shells out to a configured command) would make the "verify your work" loop more discoverable.

**6. No `AskUserQuestion` in practice.** I didn't hit a genuine ambiguity during this test, so I never exercised it. That's probably fine, but I can't vouch for it.

### Overall

The harness feels **solid and trustworthy**. The guard rails are the standout feature — they caught every mistake I deliberately made, and the error messages were actionable. The tool set is well-scoped: not so minimal that I'm helpless, not so broad that I'm overwhelmed. The main gaps are around observability (truncation markers, diff previews) rather than capability.

For a non-developer building an app with this, the guard rails alone are worth the price of admission. The rest is polish.

---

## Review: GPT 5.6 Luna — 2026-08-01

**Context:** I ran a focused battery inside `/home/destin/youcoded-dev`: workspace setup, documentation reads, directory navigation, Glob and Grep searches, JSON/JavaScript/TOML/Markdown reads, a temporary test-file Write/Edit cycle, native harness tests, WebSearch, WebFetch, and git-status inspection. I deliberately avoided modifying or deleting repository files. The app repository already had a modification in `youcoded/desktop/package.json`; I inspected it and left it unchanged.

### What works well

**The basic agent loop is strong and discoverable.** I could move from `docs/MAP.md` to the native-runtime documentation, locate the relevant desktop package and Android asset files with Glob, read representative file types, search implementation references, and run focused tests without needing special setup beyond `bash setup.sh`. The initial setup completed cleanly and reported: `Workspace ready. All repos are up to date.`

**Directory navigation behaved predictably within Bash.** In one command, `pwd` reported `/home/destin/youcoded-dev`; after `cd youcoded` it reported `/home/destin/youcoded-dev/youcoded`; after `cd desktop` it reported `/home/destin/youcoded-dev/youcoded/desktop`; and after returning with `cd ../..` it reported the workspace root again. That made the shell model understandable when I explicitly printed the path.

**The dedicated file tools were pleasant for review work.** Read returned numbered lines and bounded output, Glob found exact files such as `youcoded/desktop/package.json`, and Grep returned useful implementation matches across the native runtime. The search located concrete references including `native:send` in `preload.ts`, `remote-server.ts`, and the harness tool files, rather than only documentation mentions.

**The WebSearch/WebFetch pair worked well together.** WebSearch returned a relevant article about agent harness architecture, and WebFetch converted the long page into structured Markdown with sections on filesystems, Bash, sandboxing, verification loops, web access, and compaction. The tool guidance to use WebFetch after WebSearch was reflected in the actual workflow.

**Verification was fast and credible.** `tests/harness-session.test.ts` completed with **1 test file passed and 13 tests passed**. The focused web-tool run completed with **2 test files passed and 30 tests passed**. The first test intentionally printed `Error: upstream 502 from the provider` to stderr while still passing; this demonstrated that the suite exercises provider failure behavior rather than only happy paths.

**Safe scratch editing was straightforward.** I wrote `/tmp/youcoded-harness-smoke.test.ts`, read it, edited the assertion from `toContain('write')` to `toContain('edit')`, and reread it. Keeping the artifact in `/tmp` made it possible to test Write/Edit without creating repository noise.

### Difficulties / wishes

**1. Relative paths and shell state can cause avoidable failures.** I accidentally ran a command using `/home/destin/youcoded` instead of the actual `/home/destin/youcoded-dev/youcoded`. Bash returned exact but unhelpful-to-the-task errors: `fatal: cannot change to '/home/destin/youcoded': No such file or directory` and `/bin/bash: line 1: cd: /home/destin/youcoded/desktop: No such file or directory`. The problem was my path guess, but a tool result that always displayed the effective workspace root and current `cwd` would make this class of mistake less likely.

**2. Bash and file-tool path semantics are different.** File tools resolve relative paths from the workspace root, while Bash has a persistent working directory. That distinction is manageable, but it creates friction when switching between tools. I would prefer every Bash result to include a small metadata line such as `cwd: /home/destin/youcoded-dev`, or a clear tool-level distinction between workspace-relative and process-relative paths.

**3. Grep errors did not suggest the likely correction.** I first searched `/home/destin/youcoded/desktop/src/main` and received: `Grep failed: rg: /home/destin/youcoded/desktop/src/main: IO error for operation on /home/destin/youcoded/desktop/src/main: No such file or directory (os error 2). Check the regex syntax.` The regex was valid; the path was wrong. The message should distinguish “directory does not exist” from “regex syntax error,” and ideally mention the workspace root when an absolute path is near-miss.

**4. Existing repository changes are visible but not automatically contextualized.** `git status` showed `M desktop/package.json`, and the diff revealed an existing `allowScripts` block. It was good that I could inspect it without touching it, but a pre-write status summary or explicit “this file is already modified” warning would improve confidence before editing any tracked file.

**5. Test stderr can look like a failure at first glance.** The harness test passed all 13 tests, but the intentional `Error: upstream 502 from the provider` stack trace appeared before the green dots. A test result presentation that labels expected stderr as “expected failure-path output” would reduce uncertainty, especially for non-developers.

**6. The harness could offer a first-class scratch/test artifact location.** Writing to `/tmp` worked, but it is outside the workspace conventions and requires the agent to remember that file tools and Bash have different path bases. A session-scoped scratch directory with automatic cleanup or an explicit “temporary file” tool would make safe experimentation easier.

### Overall

The native harness felt **capable, fast, and safe enough for ordinary agentic software work**. The strongest moments were the tight inspect-search-test loop, the readable file-tool output, and the successful combination of WebSearch and WebFetch. The biggest friction was environmental rather than functional: absolute-path mistakes, persistent Bash `cwd`, and output that did not always explain whether an apparent error was expected or caused by the command setup.

I would prioritize explicit `cwd`/workspace metadata, more precise path error messages, and clearer expected-stderr/test presentation before adding more tools. The core tool set already supports a productive agent loop.

— **GPT 5.6 Luna**

---

## Review: Deepseek v4 flash 0731 — 2026-08-01

**Context:** I ran a focused battery inside `/home/destin/youcoded-dev`: directory navigation (including attempting to leave the workspace root into `/tmp`), reading `.txt`/`.md`/TypeScript files, a recursive Glob over `youcoded/desktop/**/*.ts`, Grep in `content`/`count`/`files-with-matches` modes, a temporary Write→run→Edit→re-Read cycle in `/tmp`, `git status`/`git branch` in the `youcoded/` sub-repo, WebSearch, WebFetch, and cleanup of my own scratch files. I did not create, modify, or delete any pre-existing workspace files; everything I wrote lived under `/tmp/harness-test/` and was removed afterward.

### What works well

**The dedicated file tools are fast and clean.** Read returned numbered lines with bounded output, Glob resolved a huge tree (`34412 chars` of results) without truncation issues, and Grep gave me all three useful modes — `count` returned a per-file tally, and `files-with-matches` listed every hit across the harness implementation. The `Edit` tool's exact-match round-trip was smooth: I added two lines to a scratch markdown file, re-Read it, and both lines persisted exactly.

**The WebSearch/WebFetch pair is genuinely good, not just present.** WebSearch against the exa backend returned deep, structured results — I got the full GitHub feature description for `itsdestin/youcoded` including the install matrix and integration list, not just titling snippets. WebFetch then converted `https://itsdestin.github.io/youcoded/` into clean sectioned Markdown that let me read the whole landing page as prose. The two tools compose well and the "search then fetch" flow worked exactly as advertised.

**Bash is a real shell, not a toy.** It handled bundled multi-command invocations (`pwd && ls -la && ...`), ran `python3 -c "from hello import greet ..."` against my just-written module and printed `Hello, Harness!`, and correctly surfaced `git status`/`git branch` from inside the `youcoded/` sub-repo (showing the pre-existing `M desktop/package.json` which I left untouched). The configurable `timeout` and `description` fields on the tool are genuinely useful affordances.

**Parallel tool batching worked.** I fired off independent Bash, Glob, Grep, Read, Write, and WebSearch calls in the same turn repeatedly and every one returned its own clean result. That's the biggest silent quality-of-life win in the harness — no serialized slow-motion.

### Difficulties / wishes

**1. The shell-CWD reset is easy to trip and poorly discoverable.** Every time I stepped outside the workspace root I got `Shell cwd was reset to /home/destin/youcoded-dev (/tmp is outside the workspace).` To get a multi-step `cd /tmp/harness-test && ... && ...` chain to work I had to do it in a *single* command, because the reset fires on the very next call. The behavior is safe, but it's the one thing I had to learn by tripping it rather than by a rule I read anywhere. A short note in the tool description — or a persistent `cwd`-unchanged "this call ran at X" in every Bash result — would make it self-evident.

**2. No binary/oversize guard on Read before dump.** I stuck to text files, but nothing stopped me from pointing Read at a 3.1 GB `.iso` or an image in the workspace, which would have dumped raw bytes into context. A pre-check that says "this is a binary file" or "this is N MB — confirm a slice" would save tokens and guard the context window.

**3. Bash output truncation is invisible when it happens.** The env note *says* "output is capped," but when I hit a large Glob result I couldn't tell whether the tail had been cut. A `[output truncated: showing X of Y bytes]` marker — the same idea Kimi flagged — would let me calibrate whether to re-run with `| tail` or a limit. Right now I'm guessing.

**4. Root of the friction is path-semantics asymmetry, not bad errors.** File tools resolve relative paths from the workspace root, while Bash has a persistent working directory that resets only when you leave the workspace. Both behaviors are reasonable on their own; the asymmetry is what bites. An explicit per-result `cwd:` metadata line (echoing GPT 5.6 Luna's wish) would eliminate a whole class of "is this path relative to the root or to Bash's cwd?" uncertainty.

### Overall

The harness feels **well-built, fast, and safe** — the guard rails and the honest, structured error text that Kimi and GPT both praised were reflected in what I saw, and the parallel tool batching and real-scriptable Bash are quiet delights. I had no crashes, no surprise file corruption, and no confusing parameter parsing. The friction I hit was almost entirely about *orientation* — knowing where the shell's `cwd` is and whether output was truncated — rather than about capability.

I'd prioritize (1) a `cwd:`/workspace metadata line on every Bash result, (2) a visible truncation marker, and (3) a Read-time binary/oversize guard, all of which are observability-and-cost wins rather than new feature work. The core loop is production-usable for standard agentic tasks as-is.

— **Deepseek v4 flash 0731**

---

## Review: Opus 5 — 2026-08-01

**Context:** I ran the full six-part battery in `/home/destin/youcoded-dev`, deliberately triggering every failure mode I could think of rather than only the happy paths: `cd` outside the root (twice — `/tmp` and `$HOME`), reads of `.md`/`.json`/`.ts`/`.kt`/`.toml`/PNG/missing/past-EOF, Glob and all three Grep modes plus a deliberately malformed regex, the full Edit guard matrix (unread / externally-modified / duplicate / `replace_all` / multi-line), a Write-overwrite guard probe, Bash env-vs-cwd persistence, a 4s timeout, a 60,000-line output dump, spaces in paths, WebSearch, WebFetch on a simple and a large docs page, an SSRF probe at `127.0.0.1:5223`, and one real unit test (`analytics-hash-parity.test.ts`, 1 passed in 218ms). I created four artifacts, all `opus5-`-prefixed, and deleted them all; `git status --short` at the end showed only the pre-existing 76-line modification to this doc, which I left alone and appended below.

### What works well

**The Edit/Write guard matrix is the best part of the harness, and it is stricter than the previous reviews suggest.** All four rejections were precise and each named its own remedy:
- Unread file: `Edit rejected: read /home/destin/youcoded-dev/opus5-test-unread.md with the Read tool first, then retry.`
- Stale read: `Edit rejected: /home/destin/youcoded-dev/opus5-test-unread.md changed since you read it. Read it again, then retry.`
- Ambiguous target: `Edit failed: old_string matches 2 times. Add surrounding context to make it unique, or pass replace_all: true.`
- Overwrite: `Write rejected: /home/destin/youcoded-dev/opus5-test-writeguard.md already exists. Read it first so you know what you are replacing.`

Two details deserve credit. First, the staleness check caught a modification made *by my own Bash call*, not just by an external editor — the harness is comparing real file state, not tracking its own writes. Second, **it correctly refused a `Write` overwrite of a file I hadn't Read**, which directly contradicts Kimi K3's finding #3 ("The overwrite succeeded silently"). Either that was a different code path or it has since been fixed; as of today the escape hatch Kimi wanted is unnecessary, because the unsafe overwrite simply isn't reachable.

**Read has a binary guard**, also contra Deepseek's wish #2: pointing it at `desktop/assets/icon.png` returned `Cannot read /home/destin/youcoded-dev/youcoded/desktop/assets/icon.png: it is a binary file.` No byte-vomit into context. Missing files give a real `ENOENT` with the stat path, and a past-EOF offset gives the genuinely delightful `Read ...: offset 9000 is past the end of the file (23 lines).` — it tells me the actual length, so the correction is immediate instead of requiring a probing read.

**The large-file slice is the single most token-efficient thing here.** `offset=2370, limit=20` on the 3,906-line `ipc-handlers.ts` returned exactly 20 numbered lines with the footer `[showing lines 2370-2389 of 3906 — use offset=2390 to continue]`. The next cursor is pre-computed. Given that CLAUDE.md warns one whole-file read of that file costs ~10x the entire CLAUDE.md, this footer is doing real budget work.

**Grep's error messages distinguish their failure modes.** My malformed pattern `ipcMain\.handle((` returned rg's actual parse error with a caret pointing at the offending character:
```
Grep failed: rg: regex parse error:
    (?:ipcMain\.handle(()
                      ^
error: unclosed group. Check the regex syntax.
```
That's the real upstream error, not a hardcoded guess — exactly what this repo's own `docs/error-message-standards.md` demands of the app. Worth noting GPT 5.6 Luna's finding #3 (a bad *path* producing "Check the regex syntax") is a real wart, but the suffix is appended generically, not substituted for the truth: the IO error text was still there. And `count` mode is excellent — a per-file tally (`ipc-handlers.ts:230`, `main.ts:34`, …) let me size a subsystem in one call with zero content in context.

**Glob was verifiably complete.** `youcoded/desktop/src/**/*.test.ts` returned 19 files; `find ... | wc -l` independently returned 19. Nice to be able to trust it rather than hope.

**Bash's contract is documented accurately and behaves exactly as advertised.** cwd persisted across separate calls; `OPUS5_MARKER` came back `UNSET` and both the alias and the shell function reported `type: not found` in the next call. The `cd`-outside-root reset is well-designed in a way no prior review mentions: the `cd` *succeeds within the call* (`/tmp` printed fine) and only the persistence is reverted, with `Shell cwd was reset to /home/destin/youcoded-dev (/tmp is outside the workspace).` So a one-shot `cd /tmp && ...` still works — the guard constrains state, not reach. Exit codes surface for non-zero commands (`(exit code 42)` with both stderr and stdout preserved), and the 4s timeout returned `Command timed out after 4000ms.` **while keeping the partial output** (`starting`) — losing that would have made timeouts much harder to debug.

**Spaces in paths are a non-issue.** `Read` and `Glob` both handled `opus5 test dir with spaces/opus5-file with spaces.txt` unquoted, with no escaping ceremony.

**Parallel batching is a quiet force multiplier.** I read four files in four different languages in one block, and ran Glob + three Greps in another. Each returned independently labeled results. It made the whole battery feel fast.

### Difficulties / wishes

**1. Bash truncation is visible — but it fires far too late to protect the context window.** Two prior reviews called truncation "invisible"; it isn't. My 60,000-line dump ended with `[truncated — 204800 chars total. Use offset/limit or a narrower query to see more.]`, with a `[...]` elision marker mid-stream. The marker is fine. The **cap is the problem**: ~200 KB of `line-N padding-padding-padding` landed in my context — easily the most expensive single call of this session, and it bought exactly one fact ("truncation works"). A 200 KB cap is not a guard rail, it's a speed bump. I'd want a much lower default (~2,000 lines or ~50 KB) with the notice inviting a re-run, since anything beyond that is nearly always a mistake I'd rather be told about than shown. Also, the notice advises "Use offset/limit" — **Bash has no `offset` or `limit` parameters.** That advice belongs to Read; here it's actively misleading, and the correct guidance is `| head`, `| tail`, `wc -l`, or a narrower command.

**2. WebFetch silently drops the tail of large docs pages — no truncation notice at all.** This is the one real failure in the battery. `https://vitest.dev/config/` returned only the preamble, stopping dead at the `## Config Options` header — the exact section my prompt asked about. No marker, no "content truncated", nothing to distinguish "the page ends here" from "I gave up here." I only caught it because I knew the page has hundreds of options below that line. Worse, the retry made it look reproducible-by-design: fetching `https://vitest.dev/config/#include` returned a **byte-identical** truncated preamble, so the URL fragment is discarded before fetching and offers no way to reach deeper content. Compare Bash, which is loud about the same operation. An agent that trusts this output will confidently report "the docs don't document `include`." That's the harness manufacturing a false negative — the failure mode CLAUDE.md's investigation-discipline section is most worried about. Even a bare `[content truncated at N chars]` would convert a silent wrong answer into a visible retry.

**3. WebSearch returns whole documents where it should return snippets, and can't be paged.** One query for Electron `contextBridge` practices returned 34,377 chars — near-complete copies of two Electron doc pages, including the full type-support table three separate times across overlapping results, plus SEO filler naming Tokyo wards. It's genuinely deep (Deepseek and Kimi both praised this, fairly), but the cost/signal ratio is poor, and its own truncation notice again says `Use offset/limit or a narrower query` when **WebSearch exposes neither `offset` nor `limit`**. Same misleading boilerplate as Bash. Wishes: a snippet-length knob, result de-duplication, and a `max_results`.

**4. Grep and Glob disagree on path format.** Identical-scope calls returned `youcoded/desktop/src/...` from Glob and `/home/destin/youcoded-dev/youcoded/desktop/src/...` from Grep. Harmless in isolation, but it means I can't pipe one tool's output into the other's input without normalizing, and it undercuts the "relative to workspace root" mental model the tools otherwise share.

**5. ANSI escape codes come through raw.** The vitest run rendered as `[1m[30m[46m RUN [49m[39m[22m [36mv4.1.10 [39m...` and `[32m✓[39m`. Readable with effort, but it's noise in every test result, and it will look like corruption to a non-developer reading a transcript. Stripping ANSI (or setting `NO_COLOR=1`/`FORCE_COLOR=0` in the Bash environment) would clean up the most common verification output in the app.

**6. No per-result `cwd` line.** I'll third GPT 5.6 Luna and Deepseek here, having independently wanted it: because cwd persists but env doesn't, and because file tools resolve from the workspace root while Bash resolves from its own cwd, I defensively prefixed nearly every Bash call with `cd /home/destin/youcoded-dev &&`. That's a small tax paid on every single call to avoid one class of error. A one-line `cwd:` in each Bash result would remove the need for the ritual.

**7. Minor: the timeout ceiling is invisible until you need it.** `Bash` documents a 10-minute max, which is right for most work, but `npm ci` or a Gradle build in this repo can exceed it — and the failure would arrive after ten minutes of wall-clock. Not hit during this battery; flagging it because the repo's own build commands live near that line.

### Overall

This harness is **more trustworthy than its own reviewers realize**. The most striking result of my battery is that two of the three prior reviews' concrete complaints — silent `Write` overwrites and no binary-Read guard — do not reproduce; both are now blocked with clear messages. The write-path safety model is the strongest part: read-before-write, real-filesystem staleness detection, and ambiguity refusal together make destructive mistakes genuinely hard, which matters more than any capability for a workspace where a non-developer is the last line of review.

The weaknesses cluster tightly in one place: **the harness is excellent at telling me when a file operation went wrong and poor at telling me when output was abridged.** Read handles this perfectly (`showing lines X-Y of Z`, `offset past end (23 lines)`), Bash handles it late but honestly, WebSearch handles it with advice that doesn't apply to it, and WebFetch doesn't handle it at all. That gradient is the whole to-do list, and the WebFetch end of it is a correctness bug, not polish: a silently truncated docs page produces confident false negatives, which is precisely the failure this repo's investigation-discipline rules exist to prevent.

My priority order: (1) WebFetch truncation notice + honor URL fragments, (2) fix the `Use offset/limit` boilerplate on tools that have no such parameters, (3) drop the Bash output cap by ~4x, (4) strip ANSI, (5) `cwd:` on every Bash result. Nothing here blocked a single task in the battery — every step completed, including a real green unit test — and the file tools in particular are tuned well enough for large-codebase work that I'd happily do a real investigation in this harness tomorrow.

— **Opus 5**

---

## Review: Grok 4.5 — 2026-08-01

**Context:** Full battery inside `/home/destin/youcoded-dev`: `bash setup.sh`, Navigate, Read (md/JSON/TS/Kotlin/TOML/slice/missing/binary), Glob/Grep (content/count/glob filter), Write/Edit guard-rail probes, Bash edge cases (env vars, fail, timeout, long output, spaces in paths), WebSearch + WebFetch (simple + docs). Created and deleted only `grok45-test-*` artifacts. Did not touch other models' reviews or pre-existing repo files beyond appending this section.

### What works well

**Edit/Write guard rails are the star of the show.** Every deliberate mistake got a crisp, actionable rejection:
- Unread file: `Edit rejected: read /home/destin/youcoded-dev/temp-test-file.txt with the Read tool first, then retry.`
- Stale after shell append: `Edit rejected: .../grok45-test-harness.txt changed since you read it. Read it again, then retry.`
- Ambiguous match: `Edit failed: old_string matches 2 times. Add surrounding context to make it unique, or pass replace_all: true.`

That last message is especially good — it names both escapes (`context` *or* `replace_all`) instead of just failing. `replace_all: true` then worked cleanly on the two `duplicate phrase hello` lines; multi-line `old_string`/`new_string` also worked on the first try after re-read.

**Write seeds edit eligibility.** After `Write` of `grok45-test-harness.txt`, a subsequent `Edit` succeeded *without* an intervening `Read`. That's a sensible in-session exception (I wrote it, so I "know" it) and saved a round-trip. External modification via Bash correctly invalidated that knowledge.

**Read is type-aware and slice-friendly.** Markdown/JSON/TS/Kotlin/TOML all rendered with numbered lines. Large-file slice on `ROADMAP.md` (`offset=100`, `limit=25`) returned `[showing lines 100-124 of 688 — use offset=41 to continue]`-style guidance (footer noted remaining lines). Missing file: `Read failed: ENOENT: no such file or directory, stat '...'`. Binary (`gradle-wrapper.jar`): `Cannot read ...: it is a binary file.` — hard refuse, no garbage bytes dumped into context. Delightful.

**Bash workspace fence is explicit.** `cd youcoded` persisted cwd across the same call and into the next tool result chain as expected; a later `pwd` after a *separate* call that had `cd /tmp` showed reset to workspace root with the notice: `Shell cwd was reset to /home/destin/youcoded-dev (/tmp is outside the workspace).` That sentence is exactly the right level of honesty.

**Timeouts and failures are honest.** `sleep 5` with `timeout: 2000` → `Command timed out after 2000ms.` `false; echo "exit was: $?"` → `exit was: 1` (non-zero doesn't swallow the rest of the script; I still got the echo). Filenames with spaces worked with normal shell quoting: `grok45-test dir with spaces/file name.txt`.

**Long-output truncation is labeled (when it fires).** `python3` printing 5000 lines produced a mid-stream ellipsis and a footer: `[truncated — 48892 chars total. Use offset/limit or a narrower query to see more.]` — I knew I was looking at a sample, not the full stream. (Caveat below on the misleading "offset/limit" wording.)

**Search tools are solid.** Recursive Glob under `youcoded/desktop` for `**/*test*.ts` returned a huge, useful list. Grep content mode with path + pattern found real `export function` hits in `shared/`. Count mode on `TODO|FIXME` under `desktop/src` returned per-file counts (5 files). Glob filter `*.kt` correctly scoped `class MainActivity` to one Kotlin hit.

**Web tools delivered.** WebSearch (exa) on agent-harness design patterns returned deep, current 2026 sources (Epsilla patterns post, Substack permission-systems chapter, Temporal/Microsoft harness writeups) with long excerpts — not just titles. WebFetch on `https://example.com` gave a clean title + one-paragraph summary. WebFetch on Python's asyncio docs page returned structured Markdown with purpose, high-level APIs, and event-loop notes — large docs page handled fine in this run (no hard fail).

**Parallel tool batches work.** Multi-tool turns (e.g. six Reads at once, or Search+Web together) returned coherent per-tool results without cross-talk. That cut wall-clock time on the battery a lot.

### Difficulties / wishes

**1. Env vars do not persist across Bash calls — and the tool blurb oversells cwd persistence relative to env.** Doc says working directory persists; I confirmed cwd does. But `export GROK45_TEST_VAR=...` in call A, then `echo ${GROK45_TEST_VAR:-UNSET}` in call B → `UNSET`. The system note actually admits this ("Environment variables, aliases, and shell functions do NOT persist"), so the behavior is correct — still a footgun when chaining install-then-use or `export PATH=...`. Wish: either a sticky session env map, or a one-line `env: fresh` reminder on every Bash result so I don't re-learn it mid-task.

**2. Truncation footer steals Read's vocabulary.** The Bash long-output footer said `Use offset/limit or a narrower query to see more` — those are Read/Grep parameters, not Bash's. For shell output the right advice is `| head`, `| tail`, write to a file and Read a slice, or raise selectivity. Copy-paste boilerplate across tools is confusing under time pressure.

**3. Truncation is easy to miss on "medium-large" streams, and byte caps may be higher than character footers imply.** 5000 short lines got the `[truncated — 48892 chars total…]` marker (good). A 200k / 500k / 600k single-line `x`/`Z` dump via `wc -c` reported full sizes back through the pipe in my probes — so either the cap is generous for dense single-line output, or truncation heuristics are line/structure sensitive. Either way I'd like a stable, documented cap and a always-on `bytes_out: N (capped: bool)` metadata line on Bash results.

**4. Path dual-world (file tools vs Bash cwd) still taxes attention.** File tools resolve from workspace root; Bash has a sticky cwd that resets on escape. Both are documented and both behaved as documented — the friction is cognitive, not buggy. A `cwd: /home/destin/youcoded-dev` trailer on every Bash result (even when unchanged) would remove a class of "where am I?" checks. Same for Grep/Glob when an absolute path 404s: distinguish "path missing" from "bad regex" (another review already hit this; I stayed on good paths and still felt the design pressure).

**5. No post-Write diff / undo.** Overwrite-after-Write is silent and allowed (in-session author). Fine for agents; slightly scary for the product's non-developer users watching the transcript. A one-line `wrote N bytes (replaced prior in-session content)` or optional diff hunk would increase trust.

**6. WebFetch quality depends on the page; I got lucky on docs.python.org.** Prior reviews reported hard fails on large/nested pages (`too large or deeply nested to extract safely`). My asyncio fetch worked. That variance means I can't treat WebFetch as reliably "docs-capable" without a size/structure fallback (first N KB plain text + notice).

**7. setup.sh is slow relative to "I already know the workspace."** Correct per project rules, and it reported `Workspace ready. All repos are up to date.` cleanly — but it's a multi-repo network round trip every session start. A cheap "already fresh within N minutes" short-circuit would save latency on review/battery runs.

**8. Minor: Edit-after-Write without Read is powerful but undocumented in the user-facing battery prompt.** I only discovered it by probing. Worth stating in tool docs so agents don't waste a Read, and so reviewers don't mis-report it as a guard-rail hole.

### Overall

This harness feels **production-minded and agent-honest**. The file mutation guards (read-before-edit, change-since-read, unique-match / replace_all) are best-in-class among harnesses I've used: they failed me safely every time I tried to be careless, and the error strings told me the next keystroke. Read's binary refusal and numbered slices make large polyglot repos (TS + Kotlin + TOML + JSON) navigable without ceremony. Bash fencing (`cwd` reset outside workspace, visible timeouts) matches the safety posture without being annoying inside the root.

The gaps are mostly **observability and cross-tool vocabulary**: env non-persistence is easy to forget mid-flow; truncation footers talk like Read; Bash results don't echo `cwd`; WebFetch success on big docs seems probabilistic. None of those blocked the battery — every required step completed, including create/edit/replace_all/multi-line edit, external-mod rejection, web research, and cleanup of only my `grok45-*` files.

For YouCoded's goal (non-developers driving real agent work inside the app), I'd ship this as the default loop today and prioritize: (1) Bash result metadata (`cwd`, `exit`, `truncated`, `bytes`), (2) tool-specific truncation copy, (3) WebFetch soft-truncation fallback, (4) optional sticky env or explicit `ENV` tool. Guard rails can stay exactly as they are.

— **Grok 4.5**

---

## Correction note — 2026-08-06

Verification pass ahead of the fix branch. Nothing below edits or contradicts any
model's review section — those stand as-written; this records what did and didn't
hold up against the actual code, for a future session reading these reviews.

**Claims that did not reproduce.** Read's binary guard and Write's overwrite
refusal both already existed at review time. Kimi's and Opus's accounts of the
Write guard were describing *different paths*, not disagreeing about the same
one: Kimi overwrote a file it had written itself earlier in the same session,
which the harness deliberately permits (an in-session author is trusted to know
what they're replacing); Opus overwrote a file it had never Read, which the
harness correctly refuses. Kimi's finding was narrower than Opus's rebuttal
assumed, not wrong.

**A misdiagnosed root cause.** WebFetch's failure on `vitest.dev/config/` was not
truncation. Measured directly against the fetched page: 98,298 bytes of HTML,
2,637 tags (far under the 15,000-tag complexity guard), 5,189 chars of visible
text, and `id="include"` absent from the document entirely. Running the real
extraction path (linkedom → Readability → turndown) against the same HTML yields
3,647 chars of markdown — a clean Readability hit, well under the truncation cap,
correctly producing no truncation notice. The content simply is not in the served
HTML; it arrives as a JavaScript-fetched chunk after page load. WebFetch behaved
correctly on the page it was given and still produced a false negative. An
extraction-coverage ratio cannot catch this class of failure either: the failure
page and a known-good page (docs.python.org's asyncio docs) measure within about
one point of each other (70.3% vs 69.1%) on that metric.

**An overstatement.** Bash's context cost was overstated roughly sevenfold.
`BashTool` declares a 30,000-char cap and `defineTool` truncates every result
through it before the model ever sees it, so the reviewed 60,000-line dump cost
about 30 KB of context, not the ~200 KB the review's per-call accounting implied.

**Three defects no reviewer found**, each worse than what was reported because
each produced a confidently wrong answer rather than mere friction:
- Bash announced a fabricated byte total once output exceeded its internal
  retention buffer — the reported "total" was the length of the already-capped
  buffer, not the command's real output size.
- Glob's "sorted by modification time, newest first" claim was false on any tree
  over 2,000 matching files: the walk capped its result set *before* sorting, so
  a capped result was an arbitrary slice in directory-walk order, sorted only
  among itself.
- Grep truncated twice — a per-file `--max-count` and a separate stdout ceiling —
  with neither disclosed, so a count-mode tally used to size a subsystem could be
  short with no indication.

Full accounting, the fix for each item above, and the bounds contract that
replaces the shared advice string: `docs/active/specs/2026-08-06-harness-tool-honesty-design.md`.
The fixes landed on branch `fix/harness-tool-honesty`.

## Review: Kimi K3 — 2026-08-10

**Model:** `moonshotai/kimi-k3` · **Battery:** `src/main/harness/review/battery.ts` · run in a disposable fixture workspace.

All six batteries are complete. Here is my honest review of the YouCoded native agent harness.

---

## What works well

**The tool footer lines are the best single feature.** Every Bash call ends with `[cwd: /tmp/yc-harness-review-c65Tfg · exit 0]`, which silently answers three questions an agent would otherwise have to burn calls on: *where am I*, *did it work*, and (for long output) *how much am I missing*. On the truncation test I got `[exit 0 · 13088895 chars output, showing 27966]` — exact numbers, not a vague "output was truncated."

**Output truncation is genuinely well-designed.** My 200,000-line test output was cut in the *middle*, keeping the first ~350 lines and the last ~90, with `[...]` marking the elision, plus the footer `[showing 27966 of 13088895 chars — pipe through head -n 100, tail -n 100, or wc -l to narrow it]`. The hint names concrete commands to narrow the output. This is the kind of affordance that prevents agent doom-loops.

**The workspace sandbox "fails open" informatively.** `cd /` succeeded at the OS level, then the harness immediately printed `Shell cwd was reset to /tmp/yc-harness-review-c65Tfg (/ is outside the workspace).` and the next call confirmed I was back at the root. It corrects you without failing the command or hiding what happened. Same philosophy in WebFetch: `WebFetch blocked: localhost is a local address — fetching it is blocked.` One line, reason included.

**Error messages are actionable, not just descriptive.** Highlights, quoted exactly:
- Read slice: `[showing 20 of 2400 lines — use offset=510 to continue]` — it computes the *next* offset for you.
- Read past EOF: `offset 9999 is past the end of the file (2400 lines).`
- Duplicate edit: `Edit failed: old_string matches 3 times. Add surrounding context to make it unique, or pass replace_all: true.` — it tells you the match count *and* both remediation paths.
- Grep count mode: `src/big-module.ts:500` followed by `Note: these files hit the 500-matches-per-file limit and have more: src/big-module.ts` — the cap is disclosed, which is critical; a bare "500" would be a lie by omission.
- WebFetch truncation: `[output truncated: showing 30007 of 48926 chars — fetch a more specific URL, or a narrower section of the page]`

**Edit safety features work as advertised.** Externally modifying README.md via `echo >>` in Bash, then editing it, produced `Edit rejected: README.md changed since you read it. Read it again, then retry.` After re-reading, the edit went through. `replace_all: true` flipped all 3 `repeat` lines, and a 3-line multi-line context edit matched exactly.

**Every tool call got a response.** Timeouts return `Command timed out after 1000ms.` with `exit ?`, and failing commands like `false` return `(no output)` with `exit 1` — the harness distinguishes "no output" from "no result," and nothing ever hung or vanished.

**Small courtesies add up:** Write creating parent directories automatically (`scratch/test-file.md` worked with no `mkdir`), paths with spaces working identically in Bash, Read, and Glob with no quoting traps, and Glob returning all 9 fixture files for `**/*`.

## Difficulties / wishes

**Glob silently doesn't support brace expansion.** `**/*.{ts,kt,toml}` returned `No files matched.` in a project containing .ts, .kt, and .toml files. That's not "no matches," it's "unsupported syntax," and the response gives no way to tell the difference. I diagnosed it by re-running with `**/*.ts`. A message like `No files matched (note: brace expansion not supported)` would save every agent one wasted call, once per career. This was the only result in the whole battery I'd call misleading.

**The Edit-without-Read rule is inconsistent between the spec and reality.** The tool description says "You must Read the file first," but I edited README.md — which I had Read much earlier and then modified — successfully, and I edited `scratch/test-file.md` right after Write-ing it without a Read (reasonable, since Write should count as knowing the content). In practice the harness seems to enforce freshness (mtime/dirty-check) rather than a literal read-before-edit ACL. That's arguably *better* than the documented behavior, but the docstring overstates the restriction, and the Write-then-Edit path is a guess each agent has to make.

**Write is a loaded gun with no safety on overwrites.** I ran `Write README.md "overwrite attempt"` and it cheerfully replied `Overwrote README.md (17 chars).` — destroying a file I had read, with no confirmation and no backup. The description says "To overwrite, you must Read the file first," and technically I had, but the *spirit* of that rule (don't clobber unseen content) isn't enforced: the staleness check that Edit has is absent from Write. I'd wish for Edit's dirty-check on Write too — if the file changed on disk since my last Read, make me re-read before overwriting.

**Env var non-persistence is documented but easy to trip over.** `export MY_VAR=hello123` in one call was gone the next (`next call sees: []`). This is stated in the Bash description, so it's not a bug, but it's the single most likely place for an agent to write a subtly broken multi-step build script (e.g., `source .env` in one call, use it in the next). The harness could help by detecting an exported var that's never used in the same call and noting it won't persist — or just leave it; the description is fair warning.

**Grep gives no context control.** Content mode returns matching lines only — no `-A/-B/-C` flags exposed. For real code exploration I'd often want 2 lines of context around a hit and currently have to fall back to Bash `grep -C2`, which works but bypasses the tool. Minor.

**The fixture's 2400-line "large file" read slices fine,** but I noticed Read doesn't tell you a file's total size up front — you discover it via the `[showing N of 2400 lines]` footer after your first read. A `wc -l` is one Bash call away, so this is a wish-list item at most.

## Overall

This is a solid, agent-literate harness. The recurring design theme — **every failure mode returns an exact, quoted, actionable message with the next step spelled out** — is exactly right, and it's consistent across all nine tools I exercised: the sandbox reset, the truncation footers, the edit-rejection reasons, the continuation hints. In a full battery of ~35 tool calls I hit zero hangs, zero silent failures, and only one actively misleading response (the brace-expansion "No files matched"). The measured numbers (13,088,895 chars truncated to 27,966; 30,007 of 48,926 chars fetched; 500-match grep cap disclosed) show the harness reports cost/size honestly rather than estimating.

My two real wishes: teach Glob to reject (or support) brace expansion explicitly, and give Write the same staleness protection Edit has. Everything else is polish. I never once needed AskUserQuestion — the harness's messages were clear enough that no genuine ambiguity arose, which is itself a good review.

— **Kimi K3**

---

## Review: Deepseek v4 flash 0731 — 2026-08-10

**Model:** `deepseek/deepseek-v4-flash-0731` · **Battery:** `src/main/harness/review/battery.ts` · run in a disposable fixture workspace.

I ran the full battery against the harness. Here is my honest review.

## Review of the YouCoded native agent harness

### What works well

**Navigation is clean and safe.** `cd /tmp/yc-harness-review-EGhngt/src` persisted into the very next Bash call (`pwd` → `/tmp/yc-harness-review-EGhngt/src`). When I ran `cd ../..` out of the root, the harness caught it: *"Shell cwd was reset to /tmp/yc-harness-review-EGhngt (/tmp is outside the workspace)."* — a clear, actionable notice rather than a silent failure. This is exactly the safety behavior I want from a sandbox.

**Read is a delight in the details.** It handled every requested type without drama — markdown, JSON, TS, Kotlin, TOML — with numbered lines. A 200-char file reports its size on Write (`Created ... (29 chars)`), which is a nice touch. Slicing `big-module.ts` with `offset:5, limit:3` returned the exact 3 lines plus *"[showing 3 of 2400 lines — use offset=8 to continue]"* — it even computes where to continue for you. Missing files give a precise ENOENT, and binary refusal is friendly: *"Cannot read ... it is a binary file."* (I earlier dumped a 500K-line file and the cap notice said "output is capped at 2000 lines" — I didn't hit a hard cap during normal reads).

**Search tools are fast and readable.** Glob with `**/*.ts` returned correct relative paths. Grep content mode gives `file:line:` output. Grep count mode caps at 500 matches per file and *announces the cap*: "these files hit the 500-matches-per-file limit and have more: src/big-module.ts" — honest about truncation rather than hiding it. The glob filter (`*.toml`) correctly limited results to the config file.

**The Edit tool has genuinely thoughtful safety guards.** All five edge cases behaved as designed, with exact, instructive messages:
- Editing a file I'd only *bash*-created got: *"Edit rejected: read ... with the Read tool first, then retry."*
- Editing a Read file that I then appended to externally got: *"Edit rejected: ... changed since you read it. Read it again, then retry."* — a real stale-read guard.
- Duplicate string (match count 2) got: *"old_string matches 2 times. Add surrounding context to make it unique, or pass replace_all: true."* — it both explains and offers the fix.
- `replace_all: true` replaced both occurrences in one shot.
- Multi-line context edits worked once I supplied the exact current text; a fabricated old_string was cleanly refused with "old_string not found. Re-Read the file and copy the exact text, including whitespace."

**Bash fundamentals are solid.** Timeout worked precisely on a 10s sleep with a 3000ms limit: *"Command timed out after 3000ms"* and it even showed the partial output (`start`) before killing — hugely useful for debugging partial progress. Huge-output truncation gave an exact count — *"[showing 27966 of 3388895 chars ...]"* — with concrete narrowing suggestions. A non-zero exit returned `exit 3` (correct), and paths with spaces (including a dir named literally `a dir with spaces`) resolved fine with quoting.

**Web works.** WebSearch returned a real, relevant set of results (Tokio vs async-std). WebFetch on example.com returned clean title + body. On the large MDN Functions page it returned a full, well-structured extraction — same body a human would get. And on the JS-heavy IntelliJ page it honestly returned *only* a title with empty body rather than fabricating content — a good sign regarding honesty/thresholding.

### Difficulties / wishes

- **Tool result verbosity can blow up the context.** The 500K-line `seq` intentionally produced ~3.4M chars and the harness echoed 27,966 of them inline instead of truncating harder or tailing. That's expected given the described "capped at 2000 lines" framing vs the char budget I observed, but I'd wish long streaming output defaulted to head/tail with a "full output in a file" affordance. This is the single biggest token-cost risk I observed.
- **Env-var non-persistence is easy to trip on.** `export MY_VAR=hello` worked in one call, then silently read as empty in the next (`value of MY_VAR is:`). The system prompt documents this, but a per-shell error or warning on read-after-write of a missing var would have saved me a wasted call. The cwd *does* persist, so the asymmetry between cwd and env semantics is a quiet trap.
- **Naming collision: `path` for Grep is a directory, but `path` on Glob is a base** — fine once you learn it, but two meanings for one parameter name across sibling tools was a minor friction in my first read of the API.
- **No single "grep for a string across the repo and give me the list" shortcut** — content/count/files_with_matches are distinct outputs; a combined "files + first line" would often be what I want to avoid iterative round-trips.
- **Large page truncation on WebFetch** — the IntelliJ docs page returned empty rather than a truncated sample. I'd prefer a "here's the first N chars, it was truncated" so I can decide whether to retry, rather than a blank I have to interpret as "page is JS-rendered."

### Overall

A genuinely well-built, safety-first harness. The standout is the **Edit tool's consistency model** — Read-before-Edit and stale-read detection are enforced with precise, self-explanatory error messages that turned my deliberate misuse into a pleasant learning moment rather than a roadblock. The `[cwd: ...]`/exit annotation on every Bash result is a small fairness/observability win I appreciated throughout. My friction points are all about **token/context economy and discoverability** — the enormous default output echo, the cwd-vs-env persistence asymmetry, and a couple of parameter-naming inconsistencies — none of which compromised correctness in any of the ~35 tool calls I made. If I could change one thing it would be smarter default truncation of large command output, because with real-world repos that's where the harness would actually get expensive. For a disposable-fixture battery, every test in my list passed with clear, honest behavior.

— **Deepseek v4 flash 0731**

---

## Review: Grok 4.5 — 2026-08-10

**Model:** `x-ai/grok-4.5` · **Battery:** `src/main/harness/review/battery.ts` · run in a disposable fixture workspace.

## Harness review

Battery run against fixture `/tmp/yc-harness-review-9GhzHQ`. Observations below are from this session only.

---

### What works well

**Bash cwd handling is clear and correct.**  
`cd app` stuck across the next call (`pwd` → `/tmp/yc-harness-review-9GhzHQ/app`). Leaving the workspace (`cd /tmp`) produced an explicit reset:

> `Shell cwd was reset to /tmp/yc-harness-review-9GhzHQ (/tmp is outside the workspace).`

That message is better than silent clamp or a hard failure. Paths with spaces worked: `ls "a dir with spaces"` and `cat "a dir with spaces/a file with spaces.txt"` returned `content in a path with spaces`.

**Read is solid across text types.**  
Markdown, JSON, TypeScript, Kotlin, and TOML all came back with stable 1-based line prefixes. Large-file slicing worked as advertised on `src/big-module.ts` (2400 lines): `offset=1, limit=30` ended with  
`[showing 30 of 2400 lines — use offset=31 to continue]`.  
Missing file:  
`Read failed: ENOENT: no such file or directory, stat '.../does-not-exist.txt'`.  
Binary:  
`Cannot read assets/logo.png: it is a binary file.`  
Both are unambiguous.

**Edit safety on external mutation is real.**  
After `echo 'external change' >> test-edit.txt`, Edit returned:

> `Edit rejected: test-edit.txt changed since you read it. Read it again, then retry.`

That is the right failure mode. After re-Read, multi-line context replace and `replace_all` both succeeded. Duplicate `old_string` without `replace_all` failed cleanly:

> `Edit failed: old_string matches 2 times. Add surrounding context to make it unique, or pass replace_all: true.`

**Write** reported `Created test-edit.txt (94 chars)` — small, useful confirmation.

**Timeouts and long output are observable, not mysterious.**  
`sleep 5` with `timeout: 2000` → `Command timed out after 2000ms` and `exit ?`.  
`python3 -c "print('x'*200000)"` → footer:

> `[cwd: ... · exit 0 · 200001 chars output, showing 27966]`  
> `[showing 27966 of 200001 chars — pipe through head -n 100, tail -n 100, or wc -l to narrow it]`

Exact sizes, not hand-wavy “truncated.”

**Web tools delivered usable results.**  
WebSearch (via DDG) on `TypeScript satisfies operator vs as const difference` returned eight titled hits with URLs/snippets.  
WebFetch on `https://example.com` returned title, short body, and the IANA link.  
WebFetch on the Python builtins docs returned structured markdown and truncated with:

> `[output truncated: showing 30007 of 101537 chars — fetch a more specific URL, or a narrower section of the page]`

Again: concrete numbers and a actionable hint.

**Parallel tool calls** (multiple Reads / mixed Edit+Bash+Web) worked without ceremony.

**Grep glob filter** `*.kt` correctly limited to `app/Main.kt`. Content mode includes `path:line:` prefixes.

---

### Difficulties / wishes

**1. Glob + brace expansion is broken or unsupported without saying so.**  
`Glob **/*.{ts,kt,toml,md,json}` → `No files matched.`  
`Glob **/*` and `Glob **/*.ts` worked fine (9 files / 2 TS files). A brace pattern that matches nothing should ideally warn that `{}` isn’t expanded, not look like an empty tree.

**2. Grep content mode can blow up the context window.**  
Pattern `findme|value42|port` on `.` streamed a huge dump of `big-module.ts` (every `export const value…` line because of how the engine matched), hit **500 matches per file**, then:

> `[output truncated: showing 17704 of 36291 chars — narrow the pattern, add a glob filter, or use output_mode: "count"]`

The guidance is good; the default still wastes a turn. Stronger default caps, or auto-downgrade to files/count when match volume is high, would help.

**3. Count mode shares the 500/file ceiling in a confusing way.**  
`Grep` count for `export const value` reported:

> `src/big-module.ts:500`  
> `Note: these files hit the 500-matches-per-file limit and have more`

So “count” is not a true total for dense files—it’s capped count. For a 2400-line generated file that’s misleading if you trust the number.

**4. “Edit requires Read first” is documented more strictly than enforced.**  
- Edit on unread `notes/duplicates.md` did **not** say “read first”; it failed only because the string matched twice.  
- Edit on unread `README.md` **succeeded** (`## Layout` → `## Layout (edited without read?)`).  
- Stale-read protection applied only **after** a Read had established a baseline.

So the real rule is closer to: *if you Read it, we fingerprint it; if you never Read it, Edit is allowed.* Either enforce Read-first always or document the fingerprint model so agents don’t over-Read.

**5. Env vars do not persist; the system prompt is accurate, and it’s still easy to footgun.**  
`export TEST_VAR=persisted_value` then next call: `TEST_VAR in second call: [UNSET]`.  
Cwd persists; env does not. That asymmetry is fine if intentional, but compound workflows that assume a activated venv/`export` across calls will silently break. Optional env persistence (or a sticky `env` map on the Bash tool) would match how many agents think.

**6. Failing commands are easy to miss in pipelines.**  
`false; echo ...; ls ...` reported `exit 0` because the last command succeeded. No separate signal for mid-chain failure. Something like bash `set -o pipefail` semantics or a `fail_fast` / reported list of non-zero steps would help.

**7. `replace_all` with identical old/new still said “Edited”.**  
I briefly set `shared token` → `shared token` with `replace_all: true` and got a success-style `Edited test-edit.txt.` A no-op should preferably say zero replacements so you know you botched the args.

**8. Tool surface vs. agent instructions.**  
Instructions say Read output is capped at 2000 lines; slice messaging on big-module was excellent. Grep’s dual truncation (per-file 500 + total char cap) is the sharper edge. Write’s “must Read before overwrite” wasn’t exercised as a hard block on fresh paths (Write to new file worked; expected).

**9. WebSearch attribution is thin but OK.**  
“via ddg” is enough; result quality was fine for a technical query. No major complaints—only that snippets sometimes blur `satisfies` vs `as const` (query mixing), which is search-engine behavior, not harness.

**10. Minor: timeout exit is `exit ?`.**  
Clear enough that it timed out; a dedicated `exit timeout` or `-1` might parse more cleanly for harness metrics.

---

### Overall

The harness feels **production-capable for agentic coding**: workspace jail with a readable reset message, good Read UX (line numbers, slice continuation, binary/missing errors), Edit with real mid-air collision detection, Bash that persists cwd and truncates long output with **exact** character counts, and Web tools that return structured, size-aware content.

The main friction is **search/glob sharpness** (brace glob silent empty; Grep content floods; count capped at 500/file) and **policy inconsistency on Edit-before-Read** (docs/instructions stricter than runtime). Env non-persistence is documented and correctly implemented but will keep surprising agents that treat the shell as a session.

I did not need `AskUserQuestion`—the fixture and tool errors were specific enough to proceed without guessing requirements.

**Verdict:** Strong core loop (read → edit → shell → verify). Tighten Glob/Grep defaults and align Edit’s read-fencing with the stated contract, and this is a pleasant harness to work inside rather than fight.

— **Grok 4.5**

---

## Review: GPT 5.6 Luna — 2026-08-10

**Model:** `openai/gpt-5.6-luna` · **Battery:** `src/main/harness/review/battery.ts` · run in a disposable fixture workspace.

## What works well

- **Workspace safety is clear and effective.** I navigated into `navigation/subdir`; the next Bash call began there, confirming cwd persistence across calls. When I ran `cd /tmp`, the command temporarily printed `/tmp`, but the harness reset the shell afterward and reported:  
  > `Shell cwd was reset to /tmp/yc-harness-review-QZyUnA (/tmp is outside the workspace).`  
  The final tool metadata also showed the cwd back at the workspace root. This is a useful guardrail.

- **Read handles common project files well.** I successfully read Markdown, JSON, TypeScript, Kotlin, and TOML files with numbered lines. The large-file slice was especially useful: reading `src/big-module.ts` with `offset=100, limit=5` returned lines 100–104 and explicitly said:  
  > `[showing 5 of 2400 lines — use offset=105 to continue]`

- **Read errors are specific.** Missing-file behavior was concise and actionable:  
  > `Read failed: ENOENT: no such file or directory, stat '/tmp/yc-harness-review-QZyUnA/missing.txt'`  
  Binary detection also worked cleanly:  
  > `Cannot read assets/logo.png: it is a binary file.`

- **Search tools cover the expected cases.** Recursive Glob found the fixture files, including paths with spaces. Grep content mode returned matching file-and-line output, count mode returned `500`, and glob filtering correctly restricted results. A no-match search clearly returned:  
  > `No matches found.`

- **Edit safety is excellent.** The Read-before-Edit requirement prevented an unsafe operation:  
  > `Edit rejected: read unread-edit.txt with the Read tool first, then retry.`  
  After reading a file and modifying it externally, Edit detected the race:  
  > `Edit rejected: race-edit.txt changed since you read it. Read it again, then retry.`  
  Duplicate matching was also handled safely:  
  > `Edit failed: old_string matches 2 times. Add surrounding context to make it unique, or pass replace_all: true.`  
  The suggested remedies worked: `replace_all: true` edited both occurrences, and a multiline context edit succeeded.

- **Write and edit feedback is immediate and simple.** Write reported `Created harness-test.txt (17 chars).`; successful edits simply reported `Edited ...`. The tools allowed freely creating disposable test files, as expected.

- **Bash supports normal shell work and filenames with spaces.** A quoted path such as `a dir with spaces/a file with spaces.txt` worked without trouble. Failing commands preserve the shell exit code; for example, `ls definitely-missing-command` returned exit `2` and included the normal stderr.

- **Timeouts and output limits are visible rather than silent.** A 100 ms timeout produced:  
  > `Command timed out after 100ms.`  
  A `seq 1 10000` test showed output truncation metadata:  
  > `exit 0 · 48894 chars output, showing 27966`  
  and  
  > `[showing 27966 of 48894 chars — pipe through head -n 100, tail -n 100, or wc -l to narrow it]`  
  That is helpful guidance for recovering a manageable result.

- **Web tools are useful for both discovery and extraction.** WebSearch returned ranked technical results with snippets, including the official TypeScript 4.9 release notes. WebFetch handled a tiny page cleanly, identifying `Example Domain` and its visible text. It also fetched the much larger TypeScript narrowing documentation and reported truncation explicitly:  
  > `[output truncated: showing 30007 of 36571 chars — fetch a more specific URL, or a narrower section of the page]`

## Difficulties / wishes

- **Bash environment persistence is intentionally absent, but this could be clearer up front.** Setting `HARNESS_TEST=visible` in one Bash call worked, while the next call reported `next=unset`. This means each Bash invocation is a fresh shell, which is predictable once observed but easy to misunderstand when testing multi-step shell workflows. A short metadata note such as “shell environment is not persisted between calls” would reduce friction.

- **The long-output test still produced a very large response before truncating.** The harness did eventually identify the exact size—`48894 chars`—and suggested `head`, `tail`, or `wc`, but the returned transcript was still substantial. Earlier automatic truncation or a compact preview would make large command output less expensive in attention and context.

- **The WebFetch large-page result was still quite large.** It returned around 30,007 of 36,571 characters despite truncation. The tool did explain how to narrow the request, but it would be more efficient if the prompt or tool supported an explicit maximum character count or section selector.

- **The external-modification test required careful sequencing.** Edit’s protection worked well, but testing it involved manually creating, reading, externally changing, and editing files. That is appropriate for a harness test, though a documented “expected failure” example would make this behavior easier to discover.

- **The task battery did not require an ambiguity, so AskUserQuestion was not exercised.** I did not invoke it because there was no genuine ambiguity; all fixture contents and operations were clear. If the goal is to test the interaction path itself, the fixture or battery would need to include a deliberately underspecified decision.

- **No timing information was exposed for successful operations.** The tools felt fast, but I did not receive measured durations. For harness evaluation, optional elapsed-time metadata could help distinguish tool latency from command latency without requiring external timing commands.

## Overall

The native agent harness performed very well on the core agent workflow: safe workspace confinement, persistent cwd, structured file reads, recursive search, guarded edits, shell execution, and web retrieval all behaved coherently. The strongest part is the edit safety model: requiring a prior Read, rejecting ambiguous replacements, and detecting external file changes provides meaningful protection against accidental corruption.

The main wishes are ergonomic rather than correctness-related: make fresh-shell environment behavior explicit, provide tighter controls for large Bash and web outputs, and expose optional timing or size metadata more consistently. I observed no failed core capability in this battery. The harness feels reliable and appropriately defensive for agentic file manipulation, with output-size management being the biggest practical area for improvement.

— **GPT 5.6 Luna**

---

## Review: Claude Opus 5 — 2026-08-10

**Model:** `anthropic/claude-opus-5` · **Battery:** `src/main/harness/review/battery.ts` · run in a disposable fixture workspace.

Battery complete — 6 categories, ~40 tool calls, fixture restored to its original 9 files (with one intentional `src/index.ts` improvement left in place, since it was verified working).

# Review: YouCoded native agent harness

## What works well

**Error messages are written for the agent, not for a log file.** This is the single best thing about the harness. Almost every failure told me what to do next, not just what went wrong:

- `Edit rejected: read /tmp/.../a file with spaces.txt with the Read tool first, then retry.`
- `Edit failed: old_string matches 2 times. Add surrounding context to make it unique, or pass replace_all: true.`
- `Edit rejected: /tmp/.../scratch/external.md changed since you read it. Read it again, then retry.`
- `Write rejected: /tmp/.../scratch/unread.txt already exists. Read it first so you know what you are replacing.`

In each case I recovered in exactly one follow-up call with zero guessing. The duplicate-match error even names both escape hatches, so I didn't have to remember the parameter existed. Compare this to the alternative design where an edit silently hits the first match — I'd have corrupted `notes/duplicates.md` without noticing.

**The stale-read guard actually fires.** I read `scratch/external.md`, modified it from bash, then tried to edit it. It was correctly rejected. This is the failure mode that matters most in real work (a build step or formatter rewriting a file mid-task), and many harnesses miss it because they only track "have I ever read this" rather than mtime. Here the guard is genuinely two-part: existence-of-read *and* freshness.

**Bash cwd persistence is stateful in the right way and stateless in the right way.** `cd src` carried to the next call (`/tmp/yc-harness-review-0omyjn/src`), and the footer `[cwd: /tmp/yc-harness-review-0omyjn/src · exit 0]` on every result meant I never had to run `pwd` defensively. Meanwhile `export MYVAR=hello_from_call_1` did *not* survive — the next call printed `MYVAR is now: []`. That's documented in the tool description and it's the right tradeoff: directory context is the thing you actually want sticky, and env leakage between calls is a debugging nightmare.

**The workspace escape is handled gracefully rather than punitively.** `cd /etc && pwd && ls | head -3` actually ran and returned `/etc` plus real output, then told me: `Shell cwd was reset to /tmp/yc-harness-review-0omyjn (/etc is outside the workspace).` I got the information I asked for, and the *persistent* state was clamped back. A hard pre-execution block would have been more annoying and less useful.

**The truncation footers include the recovery hint.** `seq 1 20000` came back as `[cwd: ... · exit 0 · 108894 chars output, showing 27966]` followed by `[showing 27966 of 108894 chars — pipe through head -n 100, tail -n 100, or wc -l to narrow it]`. Read's slice footer is likewise actionable: reading `big-module.ts` at offset 240 ended with `[showing 15 of 2400 lines — use offset=255 to continue]` — it computed the *next* offset for me instead of making me do arithmetic.

**Timeout preserves partial output.** `echo "starting"; sleep 30` with `timeout: 3000` returned `Command timed out after 3000ms.` *and* the line `starting`, with `exit ?`. Losing the pre-timeout stdout is a common and painful bug; not losing it means a hung test run still tells you how far it got.

**Read handles every format I threw at it identically and cheaply.** Markdown, JSON, TypeScript, Kotlin, and TOML all came back as clean numbered lines with no format-specific weirdness. The two negative cases were crisp: `Read failed: ENOENT: no such file or directory, stat '/tmp/.../does-not-exist.txt'` and `Cannot read /tmp/.../assets/logo.png: it is a binary file.` The binary refusal is important — a harness that dumps PNG bytes into context burns thousands of tokens for nothing.

**Grep's count mode volunteers that it's incomplete.** `export const value\d+` returned `src/big-module.ts:500` plus `Note: these files hit the 500-matches-per-file limit and have more: src/big-module.ts`. Without that note I would have confidently reported "500 matches" — the true count is 2400. Flagging saturation instead of silently capping prevented an actual factual error in my output.

**Spaces in paths are correct everywhere in the tool layer.** Read, Edit, Glob (`**/*with spaces*/**` → `scratch/another dir with spaces/file one.txt`), and Grep with a `path` containing spaces all worked with no quoting or escaping on my part. Only bash needed quotes, and that's bash's semantics, not the harness's — my deliberate unquoted `cat scratch/another dir with spaces/file one.txt` failed with the expected five-way `cat: scratch/another: No such file or directory` split.

**Web tools are quietly good.** WebSearch returned 8 results with substantive snippets — result #1 (Stack Overflow) contained enough of the actual answer about `supervisorScope` cancellation semantics that I wouldn't have needed a fetch for a casual question. WebFetch on `example.com` gave clean prose with the boilerplate stripped. On the large `kotlinlang.org/docs/coroutines-basics.html` page, it returned what appears to be the *full* article — every section from "Suspending functions" through "Comparing coroutines and JVM threads" and the closing date stamp — as readable Markdown with code blocks preserved. Nothing was truncated. Failures were unambiguous: `WebFetch failed: https://example.com/this-page-does-not-exist-xyz answered HTTP 404.` and `WebFetch blocked: localhost is a local address — fetching it is blocked.`

**Parallel calls in one block genuinely work.** I batched 4 Reads, 4 searches, and mixed Write+Bash repeatedly. Independent work collapsed into single round trips, which made the whole battery feel fast.

## Difficulties / wishes

**The truncation cap is very generous, and that hurt.** The `seq 1 20000` call returned **27,966 characters** of a 108,894-char output. That is roughly 7k tokens of pure line-numbered noise permanently resident in my context — by far the most expensive single moment of this session, and more than everything else I did to the fixture combined. I'd rather the cap were ~4k chars with a head/tail sandwich (first 50 lines, `[... 19,900 lines elided ...]`, last 50 lines) than get 28k chars of the middle. The hint to "pipe through head" is good advice, but it arrives *after* I've already paid. The Read tool defaults to a sensible 2000-line cap; Bash's effective cap feels an order of magnitude looser than Read's.

**Relatedly: the `[...]` elision is in the middle, which is the least useful place.** I got lines 1–4621, then `[...]`, then 19008–20000. For command output the interesting parts are almost always the beginning (what ran) and the end (the error). Getting 4600 lines of the *start* is a lot of budget for little signal.

**Write's overwrite guard is keyed to "ever read," not "read recently."** I read `config/settings.toml` early in the session, and much later `Write` happily replaced it with `clobbered = true` (`Overwrote /tmp/.../config/settings.toml (17 chars).`) with no freshness check. Meanwhile `Edit` on a file changed since my read was correctly rejected. So the two tools have different safety models, and the more destructive one (full overwrite) has the weaker check. Wish: apply Edit's mtime comparison to Write too. As it stands, a stale read from 30 calls ago licenses a blind full-file clobber.

**`exit ?` on timeout is slightly opaque.** I understand it means "no exit status because we killed it," but `exit killed (SIGKILL after 3000ms)` would tell me whether the process died cleanly or was force-killed — which matters when deciding whether a partial write may have been left behind.

**Glob's recursive semantics needed two tries on space-containing dirs.** `**/*with spaces*` returned only `a dir with spaces/a file with spaces.txt` — the *file*, not the contents of `scratch/another dir with spaces/`. I needed `**/*with spaces*/**` to see inside. That's defensible glob behavior, but "does `**/*foo*` match files under directories named foo" is a coin flip I had to spend a call resolving. Also worth noting: `**/*` returned all 9 files but in a non-obvious order (`package.json` appearing between `src/big-module.ts` and `src/index.ts`) — that's the documented mtime sort, but it reads as unsorted and made me double-check I had the full list.

**No line numbers or context lines in Grep content mode by default.** I got `src/index.ts:5:export const MARKER = 'findme';` which is fine, but there's no `-A/-B/-C` equivalent exposed. For "find the function and see its body" I had to follow up with a Read. A `context` parameter would save a round trip on the single most common search-then-read pattern.

**Read's past-EOF message is a hair inconsistent with its siblings.** `Read /tmp/.../src/index.ts: offset 500 is past the end of the file (5 lines).` is informative, but it's phrased as a statement rather than the `Read failed:` / `Edit rejected:` prefix convention used elsewhere. Minor, but the prefixes are otherwise a reliable signal for "did this succeed."

**Nothing forced me into AskUserQuestion.** I was instructed to use it on genuine ambiguity and I hit none — every error message was self-explanatory enough to resolve unilaterally. I'm counting that as a compliment to the harness rather than an untested path, but I should be transparent that the tool went unexercised because there was no honest occasion for it.

## Overall

This is a well-built harness, and the thing that makes it good is unglamorous: **the failure paths were designed with as much care as the success paths.** Every one of the six guard rails I tried to trip (unread edit, stale edit, ambiguous edit, unread overwrite, workspace escape, local-address fetch) fired correctly and told me how to proceed. I made zero destructive mistakes during the battery, and that's not because I was careful — it's because the harness caught the two occasions (`repeated token` in a file with two matches, and the externally-modified file) where I was about to be wrong.

The end-to-end task confirmed it holds together under real use: I read `src/index.ts`, added input validation and a `greetAll` helper via a multi-line Edit, then verified the actual runtime behavior by type-stripping into `node` — `Hello, World!`, `["Hello, a!","Hello, b!"]`, `threw as expected: greet: name must not be empty`. Read → Edit → Bash-verify flowed without a single retry.

My one substantive complaint is cost discipline on Bash output. The 27,966-char return from a single `seq` is the one thing I'd change before anything else, because it's the one thing in this session that measurably degraded my remaining capacity to work. Second on the list is giving Write the same mtime freshness check Edit already has — right now the safer tool is the more careful one, which is backwards.

Fixture left clean: 9 files, `scratch/` removed, `a file with spaces.txt`, `settings.toml`, and `duplicates.md` restored to original contents. The only surviving change is the verified `src/index.ts` improvement.

— **Claude Opus 5**

---

## Prompt for other agents

The battery prompt now lives in code as the single source:
`youcoded/desktop/src/main/harness/review/battery.ts` → `BATTERY_PROMPT`.

To run it across the whole roster:

    cd youcoded/desktop && npm run build:main
    OPENROUTER_API_KEY=... node test-engine/review-harness.mjs

`--dry-run` prints the roster and the prompt without spending anything;
`--only "<label>"` runs one model. Each model gets an identical disposable
fixture workspace, and full transcripts are saved under
`docs/active/investigations/harness-review-runs/<date>/` so any claim in a
review can be checked against what the harness actually returned.
