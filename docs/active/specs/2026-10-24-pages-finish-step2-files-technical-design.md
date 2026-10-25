---
status: draft
date: 2026-10-24
related: docs/active/specs/2026-10-24-pages-finish-architecture.md (step 2); approved screens pages-finish-step2.review.answers.json, pages-finish-step2b/2d/2e (the file chooser); card #90, #203 (Android folders)
branch: session/90-pages-finish (youcoded, youcoded-dev, wecoded-marketplace)
---

# Finishing Pages, step 2 — files, technical design

Approved UI (built in the workbench): approval lines per level (pick / remember / folder / all,
read / write / readwrite), the folder chooser on the card, the blunt all-files lines, "wants
access", Page settings → Files (change folder, forget a file, Remove), and YouCoded's own file
chooser for a phone's browser (tiles first, list switch, search, sortable columns, the place you
are in as a menu first in the path, Save as). Paths below are relative to `youcoded/desktop/src/`.

## Changed by design review 1 (all 21 triaged in `docs/active/reviews/2026-10-24-pages-finish-step2-files-design-review-1.md`)

The review's triage lines are the binding version where they differ from the sections below:
a separate write deny list and a wider read list; `all` confined to home; one `openConfined()`
helper (no links, regular files only, identity re-checked); home/root/denied folders refused;
handles bound to page + door + line, dropped on reload, removal and edit; a pending-pick state
with a `pick-choice` op for the phone; byte and rate caps; phone write ops only at folder level;
thumbnails from embedded previews or small images (full thumbnails: card #204); the Android app
in step 2 is pick-and-read only (save-as, remember, folders: card #203).

## Promises

1. **The page never holds a path.** It gets opaque handles and file contents; YouCoded does every
   read and write in main.
2. **Exactly the level approved.** pick → only the file just chosen, only while the page is open;
   remember → only files chosen at that level; folder → only inside the chosen folder (symlinks
   resolved, so a link inside cannot lead out); all → anything the account can reach. Read and
   write are checked separately on every call.
3. **Password and key files are never readable or writable through a page, at any level** — the
   same list the phone's file reads use (`harness/tools/credential-paths.ts` via
   `phone-read-deny.ts`), applied to the real path.
4. **Nothing is synced.** Remembered files and chosen folders are per computer, beside the
   approvals in `<userData>/page-connections.json`.
5. **No main-process stall.** Every file operation is async with size caps; nothing decodes a big
   image on main's thread.

## 1. Store (`connections-store.ts`)

Per page, beside `openSites`: `folders: Record<pageKey, Record<connId, string>>` (canonical real
path) and `remembered: Record<pageKey, Record<connId, Array<{ id, name, path }>>>` (≤ 200 per
line, id = random 16 hex). Cleaned on read (absolute canonical paths only), carried by `toFile`,
pruned with the page, and a line's entries are dropped when its approval is removed. The listing
fills `PageConnectionStatus.folder` (shown as `~/…` when under home) and `.remembered` (names
only — never paths) for approved lines.

## 2. Approving a folder line

`chooseFolder` (desktop only): main shows the folder window for the calling window and keeps
the chosen path behind a one-time token (random, 10 minutes, single use, bound to the calling
window/phone owner). `approve(id, keys, addresses, folders)` resolves each folder line's token;
a missing or expired token refuses with a plain sentence. A folder that is, or contains, a
denied path's parent (`~/.ssh` itself) is refused. `setFolder` (Page settings → Change…) does
the same for an approved line without re-asking (the level and access are unchanged).
Fingerprint unchanged (`files|folder|<access>`): the folder rides beside the approval, like a
device's address.

## 3. The page's file door

Bootstrap (`page-theme.ts`) gains `youcoded.files` only when the page has an approved files line:
`pick({ types, multiple })`, `read(handle, { as: 'text' | 'bytes' })`, `save(handle, data)`,
`saveAs({ suggestedName, types, data })`, `recent()` (remember level), and for folder / all
levels `list(dir)`, `readPath(p)`, `writePath(p, data)`, `remove(p)`, `makeFolder(p)`. Each
posts `youcoded:files` to the host, which checks the page is approved and visible and forwards
to main as ONE request/answer channel `pages:files { id, op, … }` (like `pages:plaid`). Main:

- re-reads the approvals (fingerprints) and the line for the op's level and access;
- **pick / saveAs** on a computer window: the system Open / Save window (`office-dialogs.ts`
  pattern, types as filters, Save asks before replacing). A phone's browser: the host shows
  YouCoded's chooser, whose listing comes from `pages:list-folder` and whose choice comes back
  as `{ folder, file }` relative to home; main resolves and checks it. Answer:
  `{ handle, name, size, type }`. A pick handle lives in memory for that page and window until
  the page closes; at remember level it is also stored (§1) and survives.
- **folder / all paths** are relative to the folder (folder) or absolute / `~/`-relative (all),
  normalised, `..` refused, then `realpath` (or the parent's realpath for a new file) must stay
  inside the folder; the deny list applies to the real path every time.
- **caps:** read 25 MB (bytes answer as base64), text 5 MB; write 25 MB; list 5,000 entries;
  per-page rate through the existing `PageRateGate`.
- **remove** sends to the system bin where the platform has one (`shell.trashItem`), else refuses
  rather than deleting forever (the card's "cannot be undone" line stays true either way, since
  YouCoded itself cannot undo it).

## 4. The phone's browser: `pages:list-folder`

`{ id, folder }` → the entries of `~/<folder>` (folder names and files, never denied paths,
hidden dot-files left out), sorted folders first, with `modified` and `size`. **Only answered
while that page has a pick or saveAs waiting for that same phone**, so it is not a general way
to browse the computer. **Thumbnails:** a JPEG's own embedded preview (EXIF, read from the first
64 KB, async) when it has one; otherwise the kind icon. Full decoding of every photo on main
would stall the app (promise 5) and sending full photos to the phone is too heavy; this is the
honest middle. Said on the next deck if pictures without a preview show icons.

## 5. The Android app

Pick and read work: the host shows the WebView's own file chooser (`<input type=file>`, already
used for attachments) and hands the bytes to main as an in-memory handle. Save-as writes to the
phone's Downloads (the existing download path). **Remember and save-back-to-the-same-file need
Android's persistable document permission and a host bridge, so they join card #203 with
folders** — a narrowing of what the deck promised ("pick and remember now"), said to Destin
before building. On the Android app a remember / folder / all line shows "Not available on the
Android app yet" on the card instead of Allow.

## 6. Channels and parity

New: `pages:files`, `pages:choose-folder` (desktopOnly), `pages:set-folder`, `pages:forget-file`,
`pages:list-folder`. Phone list (`phone-open-channels.json`): `pages:files`, `pages:set-folder`,
`pages:forget-file`, `pages:list-folder` — covered by Destin's answers (Q-filesphone "remote access
to desktop → desktop"; Q-remote-pick "YouCoded's own file chooser"), cited in the fixture.
Remove the mock-only rows; the fakes stay.

## 7. Combined risk and the builder

`combinedRisk` already counts readable files (renderer). The page-builder skill learns the files
kind, the narrowest-level rule (Destin, deck 1 note), and the `youcoded.files` calls.

## Build order

1. Store fields + listing (folder display, remembered names) + tests.
2. Main `page-files.ts`: handles, level/access checks, path confinement, deny list, caps, ops +
   table tests (escape attempts: `..`, symlink out, denied names, Windows stream names).
3. Channels + host forwarding + bootstrap `youcoded.files`.
4. Folder approval (choose / token / approve / setFolder / forget).
5. Phone chooser wiring + `list-folder` gate + EXIF thumbnails.
6. Android app: pick/read/save-as via WebView; "not available" lines.
7. Page builder; `verify.sh`; dev window.
