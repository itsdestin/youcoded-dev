---
status: active
---

# "Always allow" across coding assistants vs YouCoded

Researched 2026-11-01. Versions checked: Codex rust-v0.166.0 (source), OpenCode v1.19.5 (source, 2026-10-28), Gemini CLI v0.66.0 (source, 2026-10-27), Aider v0.86.0 (source), Claude Code current docs, Cursor/Cline/Roo/Copilot/Amp current docs. YouCoded read from worktree `session/sec-integration`. Anything I could not confirm says "not confirmed".

## 1. Plain-language summary

**Overall: YouCoded is the strictest and the most explanatory of the group. Nobody else splits "always allow" by the kind of command the way we do.**

- **What most others remember.** When you say "always allow", most tools remember a *prefix* of the command. Claude Code remembers the command with a `*` on the end (its prompt shows e.g. "don't ask again for: npm test *"). OpenCode remembers 1 to 3 words depending on a built-in table (`git status *`, `npm run test *`, but just `curl *` or `rm *`). Gemini CLI remembers only the FIRST WORD of each part (`git`, `curl`, `rm`, `python`). Codex remembers either what the model proposes or the whole command with its arguments, and refuses to remember a short list of too-broad ones (`git`, `rm`, `sudo`, `python`, `node`, `bash -c`, `npm run`). Cursor remembers the first word. Aider remembers the exact command, for this session only.
- **Where we are stricter.** We hold back the dangerous version of a command while still offering the safe version. "Download with curl" can be remembered widely, but a curl that uploads or writes outside the project cannot. "npm install" can be remembered widely only with setup scripts turned off. `git push` is remembered per branch, and a push that does not name its branch cannot be remembered at all. Scripts are remembered per file, and `python -c` / `node -e` only exactly. `rm`, `sudo`, `format`, `del` only exactly, with a warning. None of the others do this family-by-family splitting. Claude Code is the closest (it knows chains, wrappers, redirects) but its button still just says "don't ask again for `<prefix> *`", with no plain-words warning about what it covers.
- **Where we are looser or the same.** Our "never asks" read-only list (ls, cat, grep, git status and the like) is about the same idea as Claude Code's, Codex's and Cursor's. Our remembered choices last forever in that project folder, the same as Claude Code (Bash) and OpenCode (current code). Website visits are remembered per website, same as Claude Code (per domain).
- **Where others are more convenient.**
  1. If the assistant runs `cd app && npm test`, Claude Code, Codex and Gemini remember the `npm test` part by itself, so next time it is quiet. We can only remember the whole chain word-for-word, so the same chain with a different folder asks again.
  2. Codex, Gemini and Copilot offer a middle choice, "for this session only". We offer "once" or "forever in this project", nothing in between.
  3. Claude Code lets a read-only command with a `*` (like `ls *.ts`) run quietly. Ours asks.
  4. File edits: Claude Code offers "allow all edits this session". We remember one exact file forever (new files ask again) unless the person switches to Auto-edit mode.
- **What a user would feel.** Compared with Claude Code or Gemini, YouCoded asks MORE often for: chained commands, commands with `$VARIABLES`, commands starting with `NAME=value`, uploads, installs with scripts, scripts run with `-c/-e`, and any `git push` that does not name a branch. In exchange it never silently remembers "all of git" or "all of curl".

## 2. Comparison table

Cell = what you can choose / what gets remembered. "Prompt" = the approval card.

| Command family | YouCoded | Claude Code | Codex CLI | OpenCode | Gemini CLI | Cursor | Cline / Roo | Copilot CLI | Aider | Amp |
|---|---|---|---|---|---|---|---|---|---|---|
| **Ordinary commands** (e.g. `npm run build`) | Run it / Deny / Always allow. Always allow then asks: "Only this exact command" or "Any npm run command" (program + one plain subcommand, then `*`). Saved for this project folder, forever. | "Yes, don't ask again for: `npm run build *`" (a prefix with `*`). Saved forever for the repo (settings.local.json). Number of words in the suggested prefix: not confirmed. | "Yes, don't ask again for commands that start with `<prefix>`": the model's suggested prefix (rejected if too broad), else the whole command with arguments. Also "this command, this session". Saved forever to ~/.codex/rules. Most commands never prompt because an OS sandbox runs them. | "Always allow": remembers a prefix by a built-in word-count table (`npm run test *`, `git status *`, `ls *`). Current code saves per project; the docs page still says session only (mismatch). Default for bash is allow with no prompt unless configured. | Allow once / this session / all future sessions. Remembers the FIRST WORD of every part (`npm`, `git`). | "Always Run" / allowlist: first word or listed prefix. Sandbox mode runs commands without asking. | Cline: the model itself marks each command safe or needs-approval; one switch auto-approves "safe" commands. Roo: you keep a list of allowed prefixes (e.g. `npm run`). | "Yes" / "Yes, and approve the tool for the rest of the session" (wide) / No. Or flags like `shell(git push)`. | "Yes / No / Don't ask again" for that exact command, this session only. | No built-in approval prompt documented; rules in settings. Docs say it does not ask by default. |
| **Read-only look commands** (ls, cat, grep, git status) | Never asks in Ask-first and Auto-edit. Strict word-by-word allowlist, flags allowlisted, secret-file and git-config checks. | Built-in list, never asks, not editable (ls, cat, grep, find, git read forms...). Unquoted globs allowed if flags are read-only. | Built-in safe list in older versions (cat, ls, grep, head, find without -exec...); exact location in v0.166 not confirmed. | None documented (allows almost everything by default). | Read tools free; shell asks by default. | Not confirmed. | Cline: model's judgement. Roo: toggle "always approve read-only". | Not confirmed. | n/a | Not confirmed. |
| **curl / wget download** | Wide choice "Always allow downloading with curl" covers plain downloads only (not sending data, not saving outside the project folder). | Same prefix as any command (`curl *`); docs warn that URL-restricted rules are easy to get around. | Prefix as above; network host approvals are separate: "allow this host for this conversation / in the future". | `curl *` (one word) covers any curl, uploads included. | `curl` (first word) covers everything curl does. | First word (`curl`) or `Shell(curl:*)`. | Model's judgement / your prefix list. | Whole-tool session approval. | Exact command, session. | n/a |
| **curl upload** (`-d`, `-F`, `-T`...) | Exact command only. Card says why. | Same as any command (a `curl -d` prefix is allowed if you choose it). | Prefix as above. | Covered by `curl *`. | Covered by `curl`. | Covered by `curl`. | Not distinguished. | Not distinguished. | Exact. | n/a |
| **Package installs** (npm, pip) | npm/pnpm/yarn/bun: wide choice only if setup scripts are off (`--ignore-scripts`); otherwise exact only. pip: wide only with `--only-binary=:all:`; otherwise exact. | `npm install *` prefix, no script handling. | Prefix proposed by model; `npm run`, `pnpm run`, `yarn run` are banned as suggestions; `npm install x` can be remembered. | `npm install *` (2 words), no script handling. | `npm` (all of npm). | `npm`. | Cline: install usually flagged needs-approval by the model. | Not distinguished. | Exact. | n/a |
| **git push** | Bare `git push` or `git push origin HEAD`: NO always allow. `git push origin feat/x`: "Always allow pushing to feat/x" (pinned to that remote and branch, never force/delete). `+`, `:` or multi-branch pushes: exact only. Also on the "ask even if allowed" list with a plain-words warning. | `git push *` prefix (or exact). Nothing special. | `git` alone is a banned suggestion; `git push origin main` can be remembered as a prefix. | `git push *` (2 words). | `git` (everything in git, including push --force). | `git` first word. | Not distinguished. | `shell(git push)` can be allowed or denied by name. | Exact. | n/a |
| **Delete commands** (rm, rmdir, del) | Exact only (never a wide choice) + plain warning "This can delete files". A separate floor always asks before removing the project folder, home or system folders. | Prefix like any command; deny rules supported; docs list `rm` among read/write checks for deny rules only. | `rm` alone is banned as a suggestion; `rm -rf` is flagged dangerous by the built-in check. | `rm *` (1 word) covers any rm. | `rm` (first word) covers any rm. | `rm` first word. | Cline: model flags rm -rf as needs-approval. | Can be denied by name `shell(rm)`. | Exact. | n/a |
| **Scripts and interpreters** (python x.py, node -e) | `python build.py`: wide choice for THAT file only. `python -c`, `node -e`, `bash -c`, `sed`, `find`, `xargs`, `env`, `timeout`, `ssh`...: exact only. | Prefix like any command. | `python`, `python -c`, `node`, `node -e`, `bash -lc`, `perl -e`, `env`, `sudo` are all banned suggestions. | `python -c *` style prefix (2 words). | `python` (anything python). | `python` first word. | Roo: your prefix list. | Not distinguished. | Exact. | n/a |
| **Chained commands** (`&&`, `;`, `|`) | A wide choice never covers a chain. Exact choice remembers the WHOLE chain word-for-word. | Every part must be allowed. Choosing always-allow saves one rule per part (up to 5). | Plain chains are split and each part judged; anything with redirects/variables/wildcards is judged as one block. | Each part gets its own saved prefix. | Each part's first word saved; one blocked part blocks the whole. | Each part checked (user forum reports a gap with script blocks); not documented officially. | Roo: not documented. Cline: not documented. | Not documented. | n/a | Not confirmed. |
| **Redirects** (`> file`) | Not read-only; wide choices never cover a command with `>`; exact only. Only `/dev/null` and `2>&1` are tolerated in read-only. | Target is checked like a file edit. | Commands with redirects are judged as one whole block, not split. | Handled in parsing (command + redirect saved together). | Asks by default; stored "allow redirection" flag when you accept. | Not confirmed. | Not documented. | Not documented. | n/a | n/a |
| **File edits** | Always allow = that exact file path, forever, in this project. Auto-edit mode allows all edits in the project. "Allow outside edits for this session" for files outside the folder. Secret files stay blocked. | "Yes, allow all edits this session" (session only). | Sandbox limits where it can write; asking mostly for leaving the sandbox. | One setting for all edits (`edit`), per project when saved (whole-tool text exists in the prompt; exact wording of edit patterns not confirmed). | Allow once / session / forever; edits can be pinned to one file. | Not confirmed. | Cline: "edit project files" switch (inside vs outside folder). Roo: "always approve write" + outside-workspace + protected files toggles. | `write` approval for the session. | Not applicable (asks per file add). | Not confirmed. |
| **Website visits** | Ask first: asks the first time per website; always allow = that site. Other modes: free. | Asks, except a built-in list of documentation sites; always allow = that domain, saved forever. | Host-level: this conversation or all future. | One action for all URLs (no per-site). | Allow once / session / forever. | `WebFetch(domain)` rules; prompts otherwise. | Cline: browser toggle. | Not confirmed. | "Add URL?" exact URL, session. | Not confirmed. |
| **Memory length** | Forever, per project folder. | Bash/web: forever per repo. Edits: session. | Forever (user rules file) or session. | Per project (code); docs say session. | Session or forever, user's pick. | Forever. | Switch stays on. | Session. | Session. | Rules in settings. |

## 3. Gaps and recommendations

### A. Where others do something better or more conveniently

1. **Chained commands: remember each part (Claude Code, Codex, Gemini, OpenCode).**
   Today `cd app && npm test` can only be remembered as that exact line. Change the folder and it asks again. Claude Code splits the chain and saves a rule for each part that needed approval (up to 5), so `npm test` is quiet next time.
   *Recommendation: adopt, carefully.* When the user picks always-allow on a chain, offer the grant for each part separately (only parts that would be offered a grant on their own; the dangerous families stay exact-only; skip `cd` which is already read-only). User sees: fewer repeat questions for the most common agent habit. Risk: the card gets one more line to read. Keep the plain-words list ("npm test in this project").
2. **A "for this session" middle choice (Codex, Gemini, Copilot, Claude Code for edits).**
   We have once or forever-in-project. People often want "stop asking for the next hour".
   *Recommendation: adopt for file edits first* (Claude Code does exactly this). Cheap to understand, and leaves nothing behind in Settings. For commands, add only if testing shows people hesitate on the forever choice; it adds a third radio to a card that is already dense.
3. **Edits are remembered per exact file.** A new file asks again; nobody else is this narrow except by choice (Gemini can pin per file but also offers wider).
   *Recommendation: adopt "allow edits to files in this folder"* (or session-wide edits). Trade-off: wider trust; secret and outside-folder files stay blocked by the existing guards, so the added risk is small. Alternative is to point people at Auto-edit mode, which already exists; a one-line hint on the edit card may be enough.
4. **Quiet read-only commands with wildcards (Claude Code).** `ls *.ts` or `wc -l src/*.py` run silently there when every flag is read-only; ours asks for any `*` or `?`.
   *Recommendation: adopt narrowly* (allow unquoted globs only for commands whose flags are all on our read-only list, and never for find/sort/sed/git, as Claude Code does). User sees fewer needless cards. Low risk.
5. **Host-level network approval (Codex).** Codex can say "allow this host". Our curl wide choice is "any download from anywhere"; a URL can carry data in its address, so a download is not purely harmless.
   *Recommendation: consider, not urgent.* A "downloads from github.com only" choice would be safer, but Claude Code's own docs warn that URL-limited rules are easy to sidestep (redirects, variables). If built, it must come from a parsed address and fall back to exact-only on anything odd.
6. **Model-proposed rule with human review (Codex).** The model suggests the prefix, the system rejects broad ones.
   *Recommendation: don't adopt.* Our rule comes from the command text, so the sentence the user reads and the rule stored cannot disagree. A model-made rule adds a way to be misled.

### B. Where we are stricter than everyone, and whether it hurts

| Our strictness | Others | Annoyance vs. safety | Recommendation |
|---|---|---|---|
| Bare `git push` / `git push origin HEAD` cannot be remembered at all | Everyone else allows some push prefix | Annoying for people who always push the current branch. Real safety value: the branch changes underneath the grant. | Keep. Consider making the card suggest "push to `<current branch>`" as a named choice if that is acceptable. |
| Commands beginning `NAME=value`, or containing `$VAR`, `{a,b}`: exact only | Claude Code covers many of these as ordinary prefixes | Moderate annoyance (build/test commands often set variables). Safety: variables like PATH change what runs. | Keep; maybe allow harmless names (CI, NODE_ENV) later. |
| Read-only list refuses any `$ ` `*` `{}` `< >` `&` and unknown flags | Claude Code allows safe globs and `$()`-free variables in some cases | Mild: some `ls`/`grep` calls ask. | Adopt the narrow glob allowance (item A4). |
| `python -c`, `node -e`, `timeout`, `env`, `find`, `xargs`, `sed`, `sort`, `rg`, `tar`, `rsync`, `ssh`, `docker run/exec`, `npx/uv run`: exact only | Claude Code strips `timeout`, `nice`, `nohup`, `time`, `stdbuf` and then matches the real command | `timeout 30 npm test` is exact only for us; Claude Code treats it as `npm test`. Mild. | Adopt wrapper-stripping for `timeout`, `time`, `nice`, `nohup`, `stdbuf` only; leave the rest exact. |
| Installs with setup scripts exact only | No one else distinguishes | Everyday `npm install` asks every time unless run with `--ignore-scripts`. This one will annoy; npm installs are the most common risky command. | Keep; make sure the card tells people the fix ("installs with setup scripts off can be remembered"), which it already does. Consider a hint to the assistant to prefer `--ignore-scripts` where it works. |
| Uploads (`curl -d`, `scp`, `rsync`, `ssh`...) exact only | Everyone else lets one grant cover them | Rare for most users. Strong safety value (data leaving the machine). | Keep. |

### C. Where we are better (for context)
- Plain-words limits under every choice ("doesn't cover sending data out, or this command chained onto another one").
- Danger families split by what the command does (download vs upload, install with vs without setup scripts, named branch push).
- Old, too-wide saved grants are narrowed at decision time and Settings says so.
- Gemini's and OpenCode's first-word or one-word defaults (`git`, `curl`, `rm *`, `python`) can cover force-pushes, deletes and arbitrary code from one click; Cursor's "Always Run" was reported (forum, user bug report, not official docs) to store a bare tool name that did not even unblock the command.

### D. Open items I could not confirm
- Claude Code: how many words its suggested prefix has (docs only show `npm test *`); its source is not public.
- Codex v0.166: where the "known safe command" list lives now (the list is confirmed in v0.100.0 snapshot only).
- OpenCode: docs say session, code (v1.19.5) saves per project; exact save pattern for edit/webfetch not confirmed.
- Cursor: official docs pages for the approval card options were not retrievable; semantics here come from the CLI permissions page plus forum bug reports.
- Cline, Roo (chains/redirects), Copilot CLI (what "approve tool" covers for shell, dangerous commands), Amp (current prompt options): not confirmed.
- This comparison covers the approval cards only, not operating-system sandboxes (Codex, Cursor and Copilot lean on those; I did not compare ours).

## 4. YouCoded side: files read
Worktree `/home/destin/youcoded-dev/worktrees/sessions/sec-integration/youcoded/desktop/src`
- `shared/bash-grant-shapes.ts` (choices offered, git push shape, script runs, NO_WIDE_RUNG, safe families)
- `shared/bash-risky-variants.ts` (curl/wget sending, installs, git remote/config, network tools, variable prefix and expansion)
- `shared/bash-hostile-corpus.ts` (destructive and code-running corpora)
- `shared/subject-glob.ts` (safety rules 1-5; operators `&& & || ; | \` $( > <` newline)
- `shared/permission-types.ts` (destructive deny list: rm, rmdir, del, git push, git reset --hard, sudo, format; mode baselines; WebFetch ask in Ask first)
- `shared/safe-readonly-commands.ts`, `main/harness/tools/readonly-guard.ts` (never-asks list)
- `main/harness/harness-session.ts` `rememberedRuleFor` (edits and other tools: exact path; Bash: derived rung)
- `main/harness/permission-store.ts` (saved per project folder)
- `renderer/components/ToolCard.tsx` (card: Run it / Deny / Always allow, then width radio, "Nevermind, allow once")
- `main/harness/tools/edit.ts`, `write.ts`, `web-fetch.ts` (subject = file path / site)

## 5. Sources
- Claude Code permissions: https://code.claude.com/docs/en/permissions (fetched 2026-11-01; compound commands, wrappers, read-only list, redirections, "don't ask again" table)
- Codex rules docs: https://learn.chatgpt.com/docs/agent-configuration/rules (redirected from https://developers.openai.com/codex/rules)
- Codex source (tag rust-v0.166.0): https://github.com/openai/codex/blob/main/codex-rs/core/src/exec_policy.rs (BANNED_PREFIX_SUGGESTIONS, amendment derivation), https://github.com/openai/codex/blob/main/codex-rs/tui/src/bottom_pane/approval_overlay.rs (prompt labels), https://github.com/openai/codex/blob/main/codex-rs/shell-command/src/command_safety/is_dangerous_command.rs; older safe list from v0.100.0 snapshot (scratchpad/codex/sc-rust-v0.100.0.rs)
- OpenCode docs: https://opencode.ai/docs/permissions/
- OpenCode source (v1.19.5, anomalyco/opencode): packages/core/src/shell/parse.ts (ARITY table, prefix), packages/core/src/permission.ts and permission/saved.ts (always = saved per project), packages/tui/src/util/permission.ts (labels), packages/core/src/tool/plugin/shell.ts
- Gemini CLI policy docs: https://geminicli.com/docs/reference/policy-engine/ ; source (v0.66.0, google-gemini/gemini-cli): packages/core/src/tools/shell.ts (getPolicyUpdateOptions), packages/core/src/utils/shell-utils.ts (getCommandRoots), packages/core/src/scheduler/policy.ts, packages/core/src/policy/utils.ts, docs/tools/shell.md
- Cursor CLI permissions: https://cursor.com/docs/cli/reference/permissions ; terminal page https://cursor.com/docs/agent/terminal ; forum report https://forum.cursor.com/t/command-allowlist-always-run-widens-the-allowlist-to-a-bare-tool-name-without-unblocking-the-command-it-was-attached-to/167418 (unofficial)
- Cline auto-approve: https://docs.cline.bot/features/auto-approve
- Roo Code: https://roocodeinc.github.io/Roo-Code/features/auto-approving-actions
- GitHub Copilot CLI: https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-copilot-cli
- Aider source (v0.86.0): https://github.com/Aider-AI/aider/blob/main/aider/io.py (confirm_ask, never_prompts keyed by question + subject), aider/coders/base_coder.py (Run shell command? uses allow_never)
- Amp: https://ampcode.com/notes/permissions , https://ampcode.com/manual/appendix/legacy-permissions-rules.txt (default: does not ask; current prompt options not confirmed)
