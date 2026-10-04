---
status: shipped
---
# Office spike: Euro-Office desktop mode inside Electron (2026-09-28)

The go/no-go spike from `docs/archive/specs/2026-09-28-office-build-design.md` §2. Result:
**GO**. The results are listed in that section. This folder holds the code, so the build can
start from it.

| File | What it proves |
|---|---|
| `main.cjs` + `preload.cjs` | Editor top level: the stand-in for euro-office-lite's Rust commands, native x2t with a fresh temp dir per job, open and save of the six samples |
| `main2.cjs` + `host.html` + `host-preload.cjs` + `tauri-relay.js` | The §3a design: one `office://<token>/` origin per document, framed by a host page. Every `__TAURI__` call is relayed host → main, and main re-checks the allow-list and sender. Also: CSP with no internet, the `ASC_PROTO_BASE` patch, isolation checks, theme messages |
| `compare.py` | Content diff of an original vs a saved copy (python-docx / openpyxl / python-pptx) |

## Rerunning

The scripts expect to sit in `scratch/spike/app/` of a session worktree, next to:
- `scratch/spike/eol/src-dist`: the euro-office-lite clone, built with Node 22. Node 26 lacks
  `util.isRegExp`, and npm 12 blocks the imagemin install scripts, so run those by hand.
- `scratch/spike/x/`: the euro-office-lite `.deb`, extracted; it supplies the x2t binaries
  and templates.

Copy them back there. Then, from `youcoded/desktop`, run with ABSOLUTE file paths (a relative
path makes x2t exit 88):

    node_modules/.bin/electron <spike>/app/main2.cjs <abs fileA> <abs fileB> [--save] [--theme midnight|meadow] [--shot out.png]
    python compare.py <dir of saved-*.ext copies>   # originals in ../samples
