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

## Prompt for other agents

Copy-paste this into a fresh session with a different model, then append the resulting review as a new `##` section above this line:

```
You are testing the YouCoded native agent harness. You are working inside the harness right now.

Please run a standard battery of agentic tasks and then write an honest review of the harness. Do not delete any pre-existing files. You may create and delete your own test files (prefix them with your model name, e.g. `gpt4-test-*.txt`).

Battery:
1. Navigate: cd into a sub-repo, verify cwd persistence, try cd outside the workspace root.
2. Read: read a markdown file, a JSON file, a TypeScript file, a Kotlin file, a TOML file, a slice of a large file (offset/limit), a missing file, and a binary file.
3. Search: use Glob with a recursive pattern, Grep with content mode, Grep with count mode, and Grep with a glob filter.
4. Write/Edit: create a test file, edit it, try to edit a file you haven't Read, try to edit a file that was externally modified, try a duplicate-string edit, use replace_all, use multi-line context.
5. Bash: test env var persistence across calls, a failing command, a timeout, a long-output truncation, filenames with spaces.
6. Web: use WebSearch on a technical topic, use WebFetch on a simple page and a large/docs page.

Then write your review in this doc (docs/active/investigations/2026-08-01-native-agent-harness-reviews.md) as a new `## Review: <Model Name> — <Date>` section. Structure it as:
- What works well
- Difficulties / wishes
- Overall

Be specific. Mention exact error messages, exact behaviors, and exact moments of friction or delight. Sign with your model name.
```
