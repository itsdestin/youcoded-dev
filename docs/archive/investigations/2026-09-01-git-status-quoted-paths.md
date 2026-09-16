---
date: 2026-09-01
status: active
type: investigation
topic: Git surface — a file whose name git C-quotes (quotes, backslashes, non-ASCII) reads as clean; `--numstat` misreads a literal " => " as a rename
---

# Git surface: quoted paths read as clean; numstat rename-arrow ambiguity

**Symptom.** In the files panel's git view, a file whose name contains a quote, a backslash or
a non-ASCII character (an accented filename is the common case) shows no status at all — it
reads as clean however it was changed. Every entry kind is affected. Separately, a real
filename containing a literal ` => ` is displayed as a rename.

**Mechanism (verified against master 2026-09-01).** With `core.quotePath` at its default, git
C-quotes such paths in `--porcelain=v2` output (`"quo\"te.txt"`, `"\303\274n\303\257code.txt"`).
`parsePorcelainV2` in `youcoded/desktop/src/main/git/porcelain.ts` takes the path field raw —
it never unquotes:
`const rawPath = parts.slice(fieldCount).join(' ')` — so the quoted string never equals the
relative path the caller is matching on, and the file falls through as clean.
<!-- claim: {"path": "youcoded/desktop/src/main/git/porcelain.ts", "contains": "const rawPath = parts\\.slice\\(fieldCount\\)\\.join\\(' '\\);"} -->

The same file's `parseRenamePath` documents the second half as an accepted limitation: in
human-readable `--numstat` output a filename containing ` => ` is indistinguishable from a
rename (display-only; the fetch-time path gate still holds).

**Fix direction.** Both are closed by one migration: `-z` output for status and numstat (paths
arrive NUL-delimited and unquoted; rename old/new arrive as separate fields). The file's own
comment already names that migration. The alternative is adding C-unquoting to the v2 parser
and leaving numstat as is.

**Not changed since filed.** `git log --since=2026-08-12 -- desktop/src/main/git/` shows only
a theme commit (`ace280be`); the parser is as it was on 2026-08-12.

**History.** Filed 2026-08-12 (found by the PR #304 review; pre-existing, not introduced by the
conflicted-files fix). The `-z` / numstat residual was filed 2026-07-22 inside the "Git surface
phase 2" feature entry and is merged here.
