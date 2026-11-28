# command-center: file connections

`derive-edges.mjs` reads the desktop app and writes `scratch/command-center/edges.json`
(plus `stats.json` beside it; `scratch/` is not committed). Each row says "file A is
connected to file B, and here is the kind of proof".

| Kind | Plain meaning |
|---|---|
| `import` | A literally loads B in its code. Weight = number of import lines. |
| `channel` | A screen file asks the backend for something by a named request ("tags:list") and B is the backend file that answers it. |
| `android-channel` | Same request name also appears in an Android (Kotlin) file. The phone app reuses the desktop's channel names. |
| `event` | A announces something by name (an event or a state action) and B listens for that exact name. |
| `cochange` | A and B were edited in the same commit at least 3 times since 2026-06-01. Big commits (over 30 files) are ignored. Shows hidden coupling. |
| `test` | A test file and the file it exercises. |
| `doc` | A workspace document (from = the doc) names the file B in its text. |

Regenerate (from the workspace root, about 25 seconds):

    node scripts/command-center/derive-edges.mjs

Cochange reads `origin/master` of `youcoded/`, so fetch first for fresh results.
Paths are relative to `youcoded/` (doc edges: `from` is relative to the workspace root).
