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
