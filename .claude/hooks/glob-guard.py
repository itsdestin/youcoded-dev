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
import os
import subprocess
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
# it free of false positives. `pgrep -f` is fine to RUN (it signals nothing — but see guard 4:
# as a loop condition it never turns false) and so is a bare `pkill name` (process NAMES).
PKILL_F = re.compile(r"(?:^|[|&;(]\s*|\s)pkill\s+(?:[^|&;\n]*\s)?-[a-zA-Z]*f")


HEREDOC = re.compile(r"<<-?\s*(['\"]?)(\w+)\1[^\n]*\n(?:.*?\n)*?\2[ \t]*(?:\n|$)", re.S)


def strip_heredocs(command: str) -> str:
    """The command with every heredoc BODY removed (its `<<TAG` line stays). A heredoc body is
    data, not shell — but the shell AFTER it is still shell. Skipping the whole command whenever
    `<<` appeared let `python3 - <<'EOF' … EOF; pkill -f script-editor` through on 2026-09-04,
    and it killed the shell (and the editor Destin was typing on) exactly as guard 2 warns."""
    return HEREDOC.sub("", command)


def pkill_offender(command: str):
    """True when the command contains a `pkill -f`, which cannot succeed in this harness."""
    return bool(PKILL_F.search(strip_heredocs(command)))


PKILL_MESSAGE = (
    "Blocked before it ran: `pkill -f` cannot work here. Claude Code wraps every Bash call "
    "as `zsh -c '<your whole command>'`, and `-f` matches full command lines — so the "
    "pattern always matches that wrapper, and pkill kills the shell running your command "
    "before it finishes. It has cost three sessions their shell.\n"
    "Instead: find the pids first (`pgrep -af <pattern>` is safe — it signals nothing), "
    "then `kill <pid> <pid>` in a command that does not repeat the pattern. To match "
    "process NAMES rather than command lines, drop the -f (`pkill node`)."
)

# ── guard 4: `pgrep -f` as a loop or if condition ─────────────────────────────────────
# `pgrep -f` signals nothing, so it is safe to RUN — but for the same reason as pkill it
# always MATCHES: the wrapper's command line contains the pattern. So `until ! pgrep -f X`
# never ends and `while pgrep -f X` never stops. On 2026-09-04 six render-wait loops of that
# shape each sat for their full 600 s timeout and reported nothing. To wait for something,
# wait on IT: run the command itself with run_in_background (its exit is the notification),
# or `flock <its lock file> true`, or filter the wrapper out: `pgrep -af X | rg -v pgrep`.
PGREP_LOOP = re.compile(r"\b(?:until|while|if)\b[^\n;]*?\bpgrep\s+(?:[^|&;\n]*\s)?-[a-zA-Z]*f")


def pgrep_loop_offender(command: str):
    """True when a `pgrep -f` is the condition of an until/while/if — it can never turn false."""
    return bool(PGREP_LOOP.search(strip_heredocs(command)))


PGREP_LOOP_MESSAGE = (
    "Blocked before it ran: `pgrep -f` as a loop or if condition never turns false here. Claude "
    "Code wraps every Bash call as `zsh -c '<your whole command>'`, so the pattern always matches "
    "that wrapper — `until ! pgrep -f X` never ends (six render waits each burned their whole "
    "600 s timeout on 2026-09-04).\n"
    "Instead: wait on the thing itself — run it with run_in_background and act on its completion "
    "notification, or `flock <its lock file> true` when it holds one, or filter the wrapper out: "
    "`pgrep -af X | rg -v pgrep`."
)

# ---------------------------------------------------------------------------
# Guard 3: `rg` with r CLUSTERED into a short-option group — `rg -rn`, `rg -nr`.
#
# `-r` is ripgrep's --replace and it TAKES A VALUE, so a clustered group hands it
# the rest of the group (or the next argument) as replacement text. Both failure
# modes are SILENT, which is what makes this worth blocking rather than warning:
#
#     rg -rn alpha file    ->  prints "n beta" / "gamma n", EXIT 0
#                              (matches replaced by the literal "n", no line
#                               numbers — output that reads like real output)
#     rg -nr alpha file    ->  prints NOTHING, EXIT 1
#                              (r swallowed "alpha" as the replacement, leaving
#                               no pattern — indistinguishable from "no matches")
#
# The second one is the dangerous half: CLAUDE.md requires a programmatic search
# behind any claimed negative, and this shape manufactures a clean-looking
# negative for a string that is present. Measured 2026-09-03, ripgrep 14.x.
#
# This is muscle memory that THIS WORKSPACE INDUCES: CLAUDE.md says "Search with
# rg. Never type grep", and the habit it displaces is `grep -rn`. Cost one
# session a re-run and a nearly-believed wrong result.
#
# A bare `-r` is left alone — `rg -r X pat` is a legitimate replace. Only a
# cluster of two or more letters containing `r` is blocked, which no real
# replace invocation ever is.
RG_CLUSTERED_R = re.compile(
    r"(?:^|[|&;(]\s*|\s)rg\s+(?:[^|&;\n]*\s)?-(?=[a-zA-Z]*r)[a-zA-Z]{2,}(?=\s|$)"
)


def rg_replace_offender(command: str):
    """True for `rg -rn` / `rg -nr` style clusters, which silently misbehave."""
    if "<<" in command:
        return False   # heredoc body is data, same reasoning as the glob guard
    return bool(RG_CLUSTERED_R.search(command))


RG_REPLACE_MESSAGE = (
    "Blocked before it ran: in ripgrep `-r` is --replace and it TAKES A VALUE, so a "
    "clustered group like -rn or -nr does not mean what it means in grep. Both ways "
    "of getting it wrong are SILENT:\n"
    "  rg -rn PAT f   prints every match with PAT replaced by the literal \"n\", exit 0\n"
    "  rg -nr PAT f   prints NOTHING and exits 1 — r ate PAT as the replacement, so it "
    "looks exactly like \"no matches\" for a string that is there\n"
    "You almost certainly meant `rg -n PAT` (line numbers) or `rg -l PAT` (names only); "
    "ripgrep recurses by default, so there is no -r to carry over from grep. If you "
    "really do want a replacement, pass it unclustered: rg -r REPLACEMENT PAT."
)


MESSAGE = (
    "Blocked before it ran: this shell is zsh, not bash. zsh expands `{tok}` itself "
    "before {cmd} sees it — so the tool searches for whatever filenames matched, and "
    "when nothing matches zsh aborts the whole command with \"no matches found\". "
    "Either quote it:  {cmd} ... '{glob}' ...  or use ripgrep, which takes the glob "
    "directly and needs no quoting fight:  rg -n 'PATTERN' -g '{glob}' PATH"
)


# ── guard 5: `kill <pid>` aimed at Destin's LIVE app ─────────────────────────────────────
# The live-app-safety rule forbids signalling the built YouCoded app or anything it runs.
# On 2026-09-04 a session typed `kill 208941` from memory — a pid it had seen in an earlier
# diagnostic listing — and stopped the live app's local-model engine. A rule read is not a
# guard; this is. Before any `kill`/`kill -SIG` with numeric pids runs, read each pid's
# command line from /proc and refuse when it belongs to the live app: the built binary
# (`/opt/YouCoded/`) or the live profile directory (`/.config/youcoded/` — the trailing slash
# keeps every dev profile, `youcoded-dev/`, `youcoded-m2a/`…, out of it). `kill -0` is a
# liveness probe and is allowed. Fails open when /proc is unreadable.
LIVE_APP_SIGNATURES = ("/opt/YouCoded/", "/.config/youcoded/")
KILL_CMD = re.compile(r"(?:^|[|&;(]\s*)kill\s+([^|&;\n]*)")
PROC_ROOT = os.environ.get("GLOB_GUARD_PROC", "/proc")


def live_app_pids(command: str):
    """The numeric pids in every `kill …` clause whose /proc cmdline is the live app's."""
    hits = []
    for m in KILL_CMD.finditer(strip_heredocs(command)):
        args = m.group(1).split()
        if any(a in ("-0", "-s0", "-n0") for a in args):
            continue
        for a in args:
            if not a.isdigit():
                continue
            try:
                with open(os.path.join(PROC_ROOT, a, "cmdline"), "rb") as f:
                    cmdline = f.read().replace(b"\0", b" ").decode("utf-8", "replace")
            except OSError:
                continue
            if any(sig in cmdline for sig in LIVE_APP_SIGNATURES):
                hits.append((a, cmdline.strip()[:120]))
    return hits


KILL_LIVE_MESSAGE = (
    "Blocked before it ran: pid {pid} is Destin's LIVE YouCoded app ({cmd}). The live-app-safety "
    "rule forbids signalling it. If you meant your own dev process, look its pid up from its "
    "port or unique command line IN THE SAME COMMAND (e.g. ss -ltnp | rg ':8199') — never "
    "from a number remembered from an earlier listing."
)


# ── guard 6: restoring a TRACKED file from a hand-made backup ────────────────────────────
# Mutation testing is standard practice here — `.claude/rules/test-suite-hygiene.md` says
# to break what a guard guards, watch it go red, and put it back. The obvious way to put it
# back is `cp file /tmp/x.bak` … `cp /tmp/x.bak file`, and that is a trap with no warning
# on it: the two halves are separate commands, so a backup that never got written (a cwd
# the session did not expect, an `&&` chain that stopped early) leaves the RESTORE to
# succeed anyway from whatever stale `.bak` happens to be sitting there. On 2026-09-05 that
# silently reverted a finished fix and its comments; only a later grep for a comment that
# should have been present caught it, about six calls after the fact. The failure is
# invisible by construction — the restore prints nothing and exits 0.
#
# git already does this correctly and cannot go stale: `git stash push -- <file>` parks it,
# `git checkout -- <file>` puts it back exactly as committed. So a `.bak`-shaped restore
# ONTO A TRACKED FILE is refused. Making a backup is fine, and an untracked destination is
# none of this hook's business — only overwriting version-controlled work.
BACKUP_SUFFIXES = (".bak", ".orig", ".save", ".backup")
RESTORE_CMD = re.compile(
    r"(?:^|[|&;(]\s*)(?:cp|mv)\s+(?:-[a-zA-Z]+\s+)*(\S+)\s+(\S+)(?=\s|;|&|\||$)"
)


def _is_tracked(path: str, cwd: str) -> bool:
    """Does git know this path? Fails open (False) on any doubt."""
    try:
        r = subprocess.run(
            ["git", "ls-files", "--error-unmatch", "--", path],
            cwd=cwd or None, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5,
        )
        return r.returncode == 0
    except Exception:
        return False


def backup_restore_offender(command: str, cwd: str = ""):
    """(source, destination) of a `.bak`-style restore over a tracked file, else None."""
    if "<<" in command:
        return None   # heredoc body is data, same reasoning as the glob guard
    for src, dst in RESTORE_CMD.findall(command):
        src_clean = src.strip("'\"")
        dst_clean = dst.strip("'\"")
        if not src_clean.endswith(BACKUP_SUFFIXES):
            continue
        if dst_clean.endswith(BACKUP_SUFFIXES):
            continue   # making the backup, not restoring from one
        if _is_tracked(dst_clean, cwd):
            return (src_clean, dst_clean)
    return None


BACKUP_RESTORE_MESSAGE = (
    "Blocked before it ran: restoring `{dst}` from `{src}` overwrites a file git is "
    "tracking, from a copy nothing verified. The two halves of a hand-made backup are "
    "separate commands, so when the SAVE half does not run — a cwd you did not expect, an "
    "`&&` chain that stopped early — this RESTORE still succeeds, silently, from whatever "
    "stale backup is lying around. On 2026-09-05 that reverted a finished fix and nobody "
    "noticed for six calls.\n"
    "Use git, which cannot go stale:\n"
    "  git stash push -- {dst}    # park your version, then mutate\n"
    "  git checkout -- {dst}      # put back exactly what is committed\n"
    "  git stash pop              # and take your version back\n"
    "COMMIT FIRST if the edit you are testing is not committed — `git checkout` throws away "
    "uncommitted work, which is the same accident wearing a different hat. If the "
    "destination is genuinely not source under version control, copy it to a path git does "
    "not track."
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
        hits = live_app_pids(command)
        if hits:
            print(KILL_LIVE_MESSAGE.format(pid=hits[0][0], cmd=hits[0][1]), file=sys.stderr)
            return 2
    except Exception:
        pass   # fail open

    try:
        if pgrep_loop_offender(command):
            print(PGREP_LOOP_MESSAGE, file=sys.stderr)
            return 2
    except Exception:
        pass   # fail open

    try:
        hit = backup_restore_offender(command, payload.get("cwd") or "")
        if hit:
            print(BACKUP_RESTORE_MESSAGE.format(src=hit[0], dst=hit[1]), file=sys.stderr)
            return 2
    except Exception:
        pass   # fail open

    try:
        if rg_replace_offender(command):
            print(RG_REPLACE_MESSAGE, file=sys.stderr)
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
