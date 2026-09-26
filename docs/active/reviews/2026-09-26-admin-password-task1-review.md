---
status: active
feature: admin-password
commit: e82e11e34c0843355b02ce8cd97219d0a6985bf3
task: "task 1 — admin floor"
---

# Task 1 (admin floor) — code review

Reviewed `desktop/src/main/harness/tools/admin-command.ts`, the `shell-words.ts` diff
(`WRAPPERS.sudo.valueFlags`, `commandIndex(words, stopBefore)`), the `harness-session.ts`
step 3b wiring, and both new test files. Ran `npx vitest run tests/admin-command.test.ts
tests/harness-session-loop.test.ts tests/rm-target.test.ts tests/bash-secret-paths.test.ts
tests/shell-words.test.ts` — 568/568 green, no regression from the `stopBefore` addition
(it defaults to `undefined`, `stopBefore?.has(key)` is then always `false`, so existing
rm-target/bash-secret-paths callers are provably unaffected — confirmed by both reading
the code and the passing suites).

## T1-1 accepted — Severity: High. Missing `splitHeredocs()` call causes false positives, including a silent full REFUSE of a harmless command

**File:** `desktop/src/main/harness/tools/admin-command.ts`, `adminCommandVerdict`'s
`analyse()` (around line 33: `const { tokens, nested } = tokenize(source, !win);`) and
`visibleSudoLines`'s `analyse()` (same pattern).

**Problem:** `rm-target.ts` and `bash-secret-paths.ts` both call `splitHeredocs(source)`
before `tokenize()`, with the comment "Heredoc bodies are text unless a shell runs them."
`admin-command.ts` never imports or calls `splitHeredocs` — it tokenizes the raw source
directly. The shared tokenizer has no heredoc awareness on its own: it emits `<<EOF` as an
ordinary word and treats the following newline as a command-separator `op`, so a heredoc
body's first line is walked as if it were a second top-level shell command.

Reproduced:
```
adminCommandVerdict("cat <<EOF\nsudo x\nEOF")
  => { kind: 'admin', word: 'sudo' }        // sudo never runs here — it's text for `cat`

adminCommandVerdict("cat > install.sh <<'EOF'\npkexec do-something --now\nEOF")
  => { kind: 'refuse', word: 'pkexec' }     // the WHOLE command is blocked, no ask at all
```

The second case is the serious one: writing an install script that merely *mentions*
`pkexec`/`doas`/`su`/`run0` on its own line gets the command refused outright with no card
— a completely ordinary, safe file-write operation is denied because of the missing
heredoc split, not because it does anything dangerous.

**Fix:** import `splitHeredocs` from `shell-words.ts` in `admin-command.ts` and call it the
same way `rm-target.ts` does (`const { text } = splitHeredocs(source); const { tokens,
nested } = tokenize(text, !win);`) in both `adminCommandVerdict.analyse` and
`visibleSudoLines.analyse`, before tokenizing. If a heredoc is itself fed to a shell (`sh
<<EOF`), follow `bash-secret-paths.ts`'s handling of `bodies` for the same nuance those
floors already solve.

**Test gap:** `tests/admin-command.test.ts`'s "everyday commands" describe block reuses
`tests/fixtures/everyday-shell-commands.txt`, which already contains three heredocs (lines
147, 153, 158) — but their bodies mention `rm -rf` (for the rm-target floor's own
regression coverage), never `sudo`/`doas`/`su`/`pkexec`/`run0`. The fixture would stay
100% green even with this bug live, because it happens not to exercise the one case that
breaks. No test in either file constructs a heredoc whose body starts with one of the five
watched words.

## T1-2 accepted — Severity: High. `find -exec`/`-execdir`/`-ok`/`-okdir sudo …` slips past the floor entirely (false negative)

**File:** `desktop/src/main/harness/tools/admin-command.ts`, `adminCommandVerdict`.

**Problem:** `find . -exec sudo rm {} \;` never trips the floor:
```
adminCommandVerdict('find . -name x -exec sudo rm {} \\;')  => null
```
`find`'s `-exec CMD ARGS ;`/`-execdir`/`-ok`/`-okdir` is a first-class, extremely common way
to run an arbitrary command (including `sudo`) from ordinary shell syntax — not "inside an
interpreter" the way the design's stated limit (`python3 -c "os.execvp(...)"`) is. This
repo's own sibling floor, `bash-secret-paths.ts`, already has a `FIND_EXEC = new
Set(['-exec', '-execdir', '-ok', '-okdir'])` and a `findSecretMatch` helper built
specifically to catch this shape for its own threat model. `admin-command.ts` has no
equivalent: `find` is not a `WRAPPERS` entry and is not special-cased, so `sudo` sitting in
`find`'s own argv is never seen as "the command" — the whole `find …` line is one simple
command whose word is `find`, and the floor stops there.

Net effect: `find / -exec sudo rm -rf {} \;` (or any `find -exec sudo …`) runs with full
root privileges and never shows the admin card, never asks, and is indistinguishable from a
"safe" `find` call to every check in this codebase.

**Fix:** give `admin-command.ts` the same `find`-exec awareness `bash-secret-paths.ts`
already has: when the command word is `find`, scan its args for `-exec`/`-execdir`/`-ok`/
`-okdir` and recurse `analyse`/verdict-check into the command that follows (up to the
terminating `;` or `+`), the same way `inlineShellScript` recurses into `bash -c` bodies.

**Test gap:** neither `admin-command.test.ts`'s hostile-shape sweep nor the
harness-session-loop tests include a `find -exec sudo …` case, so this false negative is
invisible to the suite even though the sibling floor's own tests presumably cover the
identical `find -exec` shape for secret paths.

## T1-3 accepted — Severity: Medium. `sudo`'s long-option value table is still incomplete — `-R`/`--chroot` and `-T`/`--command-timeout` misparse

**File:** `desktop/src/main/harness/tools/shell-words.ts`, `WRAPPERS.sudo.valueFlags`
(lines 280–284).

**Problem:** the commit's stated purpose is fixing `sudo --user root cmd` reading `root` as
the wrapped command. The fix added long forms for 9 of the pre-existing short flags but
missed two real sudo options that take a separate value: `-R directory, --chroot=directory`
and `-T timeout, --command-timeout=timeout` (confirmed against this machine's `sudo
--help`/`man sudo`, sudo 1.9.x). `--chroot` (the long form) IS in the new list, but its
short pair `-R` is not; `--command-timeout`/`-T` is absent in both forms. Reproduced:
```
visibleSudoLines('sudo -R /jail apt update')                  => [['/jail','apt','update']]
visibleSudoLines('sudo -T 30 apt update')                      => [['30','apt','update']]
visibleSudoLines('sudo --command-timeout 30 apt update')       => [['30','apt','update']]
```
Each should be `[['apt','update']]`. This is the exact bug class the commit claims to have
fixed, left half-done. It's currently dormant only because `visibleSudoLines` isn't wired
into the running app yet (task 5); it ships broken today and nothing will catch it before
task 5 lands. It also means `commandIndex`'s generic wrapper-walk (used unchanged by
`rm-target.ts`/`bash-secret-paths.ts` for a command wrapped by `sudo`) would misparse the
same two flags if a `sudo`-wrapped call ever reached that walk — currently masked only
because `harness-session.ts` now skips those two floors whenever `sudo` is anywhere in the
command (`isAdmin` true), not because the underlying table is correct.

**Fix:** add `'-R'` and `'-T'`/`'--command-timeout'` to `WRAPPERS.sudo.valueFlags`.

**Test gap:** `admin-command.test.ts`'s "strips every long option the design names" test
enumerates exactly the design doc's list and nothing more, so it can never catch an option
the design itself omitted.

## T1-4 accepted — Severity: Low. Refuse message states an inaccurate cause for `doas`/`su`

**File:** `desktop/src/main/harness/harness-session.ts`, line 4007.

**Problem:** the model-facing refusal text is identical for all four refused words:
`"${word} can't be used here: it would open a password window outside YouCoded."` That's
true for `pkexec`/`run0` (they raise the desktop's polkit dialog — the code's own comment
at admin-command.ts's top confirms this is the reason for those two). It is not true for
`doas`/`su`: per that same file's header comment, they're refused because they "have no
askpass mechanism this app can intercept the same way" — running one under `spawnDetached`
(no TTY) would fail or hang, not "open a password window outside YouCoded." The project's
own error-message standard (`docs/error-message-standards.md`) is "never invent an error
cause." A model that reads this message and reasons about *why* doas/su failed is being told
something the code itself knows is false for those two words.

**Fix:** either give `doas`/`su` their own clause (e.g. "…: it has no way to ask for your
password inside YouCoded. Use sudo instead…") or soften the shared sentence to something
true for all four (e.g. "can't be used here — YouCoded can only supply your password to
sudo. Use sudo instead: the user is asked for their password in the app.").
