#!/usr/bin/env python3
"""PreToolUse hook on Bash: stop two command shapes this harness silently destroys.

Historical name — it began as the glob check below and now carries a second guard
(`pkill -f`, at the bottom). Both are context-free: neither needs to know the working
directory or what is on disk, so neither can be wrong about a particular session.

WHY this exists (measured 2026-08-28 across the 46 sessions started 08-26 → 08-28):
64 tool calls in two days did nothing at all, in 29 different sessions. Claude Code
runs the login shell, which here is zsh. Unlike bash, zsh expands a `*` BEFORE the
command runs and, when nothing on disk matches, aborts the whole command line:

    grep -rn "sessionId" --include=*.ts src
    zsh:1: no matches found: --include=*.ts        <- grep never ran

WHAT IT CHECKS, and why only this: an unquoted glob handed to an option that takes a
PATTERN (`--include`, `-name`, `-g`, …) is wrong unconditionally — the tool wants the
pattern itself, so the shell must never see it. That makes the check context-free:
it needs no knowledge of the working directory, so it cannot be wrong.

WHAT IT DELIBERATELY DOES NOT CHECK: a bare glob argument (`ls -d ~/.config/youcoded*`).
Whether that aborts depends on what is on disk in the directory the glob resolves
against — and almost every command in this workspace `cd`s somewhere first, so the
directory the hook is told about is not the one the glob will be resolved in. Replaying
all 5,086 real Bash calls from those 46 sessions: checking bare globs would have caught
32 more aborts at the cost of **263 wrongly blocked working commands**. Not worth it.
That half of the problem is covered by prose in CLAUDE.md instead ("use `rg`, not `grep`").

Measured on that same replay, the rule below: 29 aborts caught, **0 false positives**.

Fails OPEN on everything — bad parse, missing field, any exception — because wrongly
blocking a Bash call costs far more than the calls this saves. Heredocs are skipped
entirely (their body is data, not shell words, and no tokenizer can tell the difference).

Protocol: exit 0 = allow. exit 2 + stderr = block, stderr goes back to the model.
Tests: node --test .claude/hooks/glob-guard.test.mjs
"""

import json
import re
import shlex
import sys

# Options whose value is a PATTERN the tool parses itself — the shell must never
# see the glob. Covers both the `--include=*.ts` and `-name *.ts` spellings.
PATTERN_OPTS = {
    "--include", "--exclude", "--include-dir", "--exclude-dir",
    "-g", "--glob", "--iglob", "--type-add",
    "-name", "-iname", "-path", "-ipath", "-wholename",
}

# Glob-ish only if it holds a construct zsh would actually expand. A lone `[`
# (as in `[ -f x ]`) is not one.
GLOBBY = re.compile(r"\*|\?|\[[^\]]+\]")
QUOTE = re.compile(r"""['"]""")
# `${pair%%:*}` and `$(ls *.ts)` are expansions, not globs the shell resolves here.
EXPANSION = re.compile(r"\$\{[^}]*\}|\$\([^)]*\)")


def is_unquoted_glob(token: str) -> bool:
    """True when zsh would try to expand this token as a filename pattern."""
    stripped = EXPANSION.sub("", token)
    if QUOTE.search(stripped) or stripped.startswith(("$", "`")):
        return False
    return bool(GLOBBY.search(stripped))


def glob_part(token: str) -> str:
    """The glob itself, with any `--opt=` prefix stripped off."""
    if token.startswith("-") and "=" in token:
        return token.split("=", 1)[1]
    return token


def find_offender(command: str, cwd: str = ""):
    """Return the first token zsh would choke on, else None. `cwd` is unused —
    kept in the signature because this check is deliberately context-free."""
    if "<<" in command:
        return None  # heredoc body is data, not shell words

    try:
        lexer = shlex.shlex(command, posix=False, punctuation_chars=True)
        lexer.whitespace_split = True
        tokens = list(lexer)
    except Exception:
        return None  # unbalanced quotes etc. -> fail open

    prev = ""
    for token in tokens:
        opt = token.split("=", 1)[0] if token.startswith("-") else None
        takes_pattern = prev in PATTERN_OPTS or (opt in PATTERN_OPTS and "=" in token)
        if takes_pattern and is_unquoted_glob(token):
            return token
        prev = token
    return None


# ── guard 2: `pkill -f` ───────────────────────────────────────────────────────────────
# Claude Code runs every Bash call as `zsh -c '<the whole command line>'`. `pkill -f`
# matches against full command lines, and the wrapper's command line CONTAINS the pattern
# — it is the pattern's own argument. So pkill -f always signals its own parent shell,
# and the command it was supposed to run dies with it. Verified 2026-09-03 with a pattern
# matching nothing else on the machine:
#
#     pkill -f "zzz-unique-marker-qq7"; echo survived      ->  exit 144, nothing echoed
#
# It has cost three sessions their shell. There is no "careful" pattern: the argument is
# always in the caller's cmdline, so this is unconditional, which is what makes blocking
# it free of false positives. `pgrep -f` is fine (it signals nothing) and so is a bare
# `pkill name` (matches process NAMES, not command lines).
PKILL_F = re.compile(r"(?:^|[|&;(]\s*|\s)pkill\s+(?:[^|&;\n]*\s)?-[a-zA-Z]*f")


def pkill_offender(command: str):
    """True when the command contains a `pkill -f`, which cannot succeed in this harness."""
    if "<<" in command:
        return False   # heredoc body is data, same reasoning as the glob guard
    return bool(PKILL_F.search(command))


PKILL_MESSAGE = (
    "Blocked before it ran: `pkill -f` cannot work here. Claude Code wraps every Bash call "
    "as `zsh -c '<your whole command>'`, and `-f` matches full command lines — so the "
    "pattern always matches that wrapper, and pkill kills the shell running your command "
    "before it finishes. It has cost three sessions their shell.\n"
    "Instead: find the pids first (`pgrep -af <pattern>` is safe — it signals nothing), "
    "then `kill <pid> <pid>` in a command that does not repeat the pattern. To match "
    "process NAMES rather than command lines, drop the -f (`pkill node`)."
)

MESSAGE = (
    "Blocked before it ran: this shell is zsh, not bash. zsh expands `{tok}` itself "
    "before {cmd} sees it — so the tool searches for whatever filenames matched, and "
    "when nothing matches zsh aborts the whole command with \"no matches found\". "
    "Either quote it:  {cmd} ... '{glob}' ...  or use ripgrep, which takes the glob "
    "directly and needs no quoting fight:  rg -n 'PATTERN' -g '{glob}' PATH"
)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    if payload.get("tool_name") != "Bash":
        return 0

    command = (payload.get("tool_input") or {}).get("command")
    if not isinstance(command, str) or not command.strip():
        return 0

    # Guard 2 first: it is a strict-refusal check, and a command doing both should hear
    # about the one that would have killed the shell.
    try:
        if pkill_offender(command):
            print(PKILL_MESSAGE, file=sys.stderr)
            return 2
    except Exception:
        pass   # fail open, same contract as everything else in this hook

    try:
        token = find_offender(command)
    except Exception:
        return 0

    if not token:
        return 0

    first = command.strip().split()[0] if command.strip().split() else "the tool"
    print(MESSAGE.format(tok=token, glob=glob_part(token), cmd=first), file=sys.stderr)
    return 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        sys.exit(0)  # never let this hook take a session down
