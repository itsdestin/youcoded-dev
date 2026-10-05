---
paths:
  - "**/desktop/src/main/office/**"
  - "**/desktop/src/main/doc-comments/live-comments.ts"
  - "**/desktop/src/renderer/components/office/**"
  - "**/desktop/src/shared/office-types.ts"
  - "**/desktop/office-pin.json"
  - "**/desktop/scripts/fetch-office.mjs"
last_verified: 2026-10-02
verify:
  - path: youcoded/docs/office.md
  - path: youcoded/desktop/src/main/office/office-ipc.ts
    contains: "OFFICE_COMMANDS[.]has[(]cmd[)]"
  - path: youcoded/desktop/src/main/office/office-commands.ts
    contains: "const queues = new WeakMap"
  - path: youcoded/desktop/src/main/office/office-frame-guard.ts
    contains: "sealOfficeFrames"
  - path: youcoded/desktop/src/main/office/office-recovery.ts
    contains: "settleAllRecovery"
  - path: youcoded/desktop/office-pin.json
    contains: "sha256"
  - test: youcoded/desktop/tests/office/office-commands.test.ts
  - test: youcoded/desktop/tests/office/office-protocol.test.ts
  - test: youcoded/desktop/tests/office/office-recovery.test.ts
  - test: youcoded/desktop/tests/office/fetch-office.test.ts
---

# Office (Word / Excel / PowerPoint in the desktop app)

The editors are an AGPL add-on (`itsdestin/youcoded-office`) in a sealed `office://<token>` frame; main converts files with a native `x2t`. Depth: `youcoded/docs/office.md`.

- **A new editor command goes in `OFFICE_COMMANDS` (`office-commands.ts`) and nowhere else.** Main refuses anything off the list and any token the asking window did not open (`office-ipc.ts` `invoke`, then again in `office-commands.ts`). The renderer's relay checks nothing — never treat it as the guard. Guard: `office-commands.test.ts` pins the exact list.
- **Never send the frame a folder path, an fs error, or x2t output.** It gets the file *name*, opaque handles (`yc-picked/…`, `yc-save/…`) that only main maps to paths, and fixed sentences from `toEditorError`. Why: the frame is a separate program whose page could be hostile (a document's own content runs in it).
- **One document, one origin, one queue.** Each open document is its own token/origin; every command of a session runs through its single promise chain, and a close drains it before the temp folder goes. A second writer to `Editor.bin` mid-translation corrupts the save. Guards: `office-sessions.test.ts`, `office-commands.test.ts`.
- **Keep the seal.** Don't add scheme privileges beyond `standard, secure, supportFetchAPI`, loosen `OFFICE_CSP` (no network), or drop `sealOfficeFrames` (CSP cannot stop `location = …`). `allow-same-origin` on the editor iframe is a reviewed ast-grep exception for `EditorFrame.tsx` only. Guards: `office-protocol.test.ts`, `office-frame-guard.test.ts`.
- **A saved file changes only by rename.** Translate into a fresh private folder (`0700`) beside the file, validate, re-authorize, one rename. Every x2t job gets a fresh nested folder, never reused between open and save (old chart parts merged back in), and `unshare -rn` wraps it on Linux. Guard: `x2t.test.ts` covers the no-network wrap; the fresh-folder rule has none — candidate.
- **Recovery journal semantics.** Every `save_changes` batch is appended; a save marks edits as saved only up to the revision its bytes held (`recoveryRev` → `markRecoverySaved`). Close and quit delete an *all-saved* journal and keep one with unsaved edits; the next open replays it — unless the file changed outside Office meanwhile, then it is set aside (`.held`) and the person chooses. Never "simplify" this to delete-on-close. Guard: `office-recovery.test.ts`, `office-no-lost-edits.test.tsx`.
- **Comments on an open file go through the editor, not the file** (`live-comments.ts` + `office-comments.ts`); a file write would be erased by the editor's next autosave. Don't route a comment around `getOfficeSessions()`.
- **Add-on changes ship by pin.** Edit the add-on repo → bump its `PIN.json` version → push tag `vX.Y.Z` → CI release → set `desktop/office-pin.json` `version` plus all four platforms' `url`/`sha256` (from the release's `SHA256SUMS`) → `node scripts/fetch-office.mjs` → verify in a dev instance. A pin that disagrees with the installed `manifest.json` hides Office (`officeAvailable`). Guard: `fetch-office.test.ts`.
- **No `:has()` in the add-on's CSS.** Measured ~23x slower editor style recalculation; set a class from script instead. Guard: the add-on's `test/yc-bridge-perf.test.mjs`.
- **Add-on patches are exact-match.** `build/patch.mjs` fails the build if a pattern is missing or found twice; a euro-office-lite bump means re-checking each by hand.
- **A new `office:*` channel** is also added to `preload.ts`, `remote-shim.ts` (refused), `SessionService.kt` (unsupported) and pinned in `ipc-channels.test.ts`. Desktop only.

Verify with `bash scripts/verify.sh`; real-converter tests need `node scripts/fetch-office.mjs` first. Depth, ship steps, platforms and known limits: `youcoded/docs/office.md`.
