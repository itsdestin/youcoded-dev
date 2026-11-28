---
status: draft
card: 227
---
# OneDrive online-only files on Windows: plan (card #227)

Written 2026-11-11 from a read of the app at `3b3f52129` and of the paused attempt
(youcoded draft PR #476, branch `session/onedrive-no-auto-download`, one commit, 2,652 commits
behind master). Nothing here is built. Nothing here was run on Windows.

## The fault, in Destin's words

2026-10-18, on a Windows PC: downloads from OneDrive still freeze the computer and the app.

## What is true today

- The app has no idea a file is online-only. A search of `desktop/src` and `app/src` for
  OneDrive, placeholder and the Windows "recall" attributes finds nothing.
- These things read file CONTENTS without the person opening a file, so each can pull a file
  down from OneDrive:
  1. Text search — runs ripgrep over the whole project (`content-search.ts:113`). The strongest trigger.
  2. Thumbnails — visible cards read images (up to 50 MB each) and text/markdown/HTML files
     (`ArtifactThumbnail.tsx:115-157`, `read-service.ts:494-539, 681-683`).
  3. Project skills and instruction files, read on the app's main thread, which is what can
     freeze every window (`skill-scanner.ts:217-266`, `claude-code-context.ts:106`,
     `project-context.ts`, `project-repo.ts:12`).
  4. The project's own record under `.youcoded/`, read on nearly every list and count.
- These only LIST folders or check dates (may or may not trigger a download — unproven):
  folder browsing (`folder-listing.ts:86,115`), the search walk (`project-file-discovery.ts`),
  folder watching (`project-watcher.ts:409`), counts (`projects-index.ts:150-158`).

## What the paused attempt did, and why it is not the starting code

It added a Windows helper that asks Windows whether a file is local (attributes
`RECALL_ON_DATA_ACCESS` and `OFFLINE`), a rule that passive reads skip non-local files, and a
"Download and open / Not now" dialog. It also turned text search and folder watching OFF on
every Windows PC, which Destin did not authorise, left the older readers (item 3 above)
unguarded, and was never run on Windows. It is too far behind to rebase; its helper, rule and
tests are worth copying across file by file.

## Plan

1. **One "is this file here?" check**, Windows only, copied from the attempt's helper. Every
   other system answers "yes" at no cost.
2. **Passive readers skip files that are not here**: thumbnails, counts, skills and instruction
   scans, the `.youcoded` record read. A skipped thumbnail shows the plain file-type icon.
3. **Text search stays on.** ripgrep is given the list of local files only, or a filter that
   leaves online-only files out; the results say that online-only files were not searched.
   (Wording is Destin's.)
4. **Folder watching stays on.** Watching only lists; if step 0 below shows listing is safe,
   nothing changes; if not, online-only folders are left out of the watch.
5. **Opening an online-only file asks first** — the attempt's dialog. This is a new prompt, so
   its wording and look go to Destin on a review deck before it is built.
6. **A guard** (ast-grep rule) that every file reader in the lists above goes through the check.

## Step 0, before any building: one hour on a real Windows PC with OneDrive

The plan's shape depends on answers nobody has:

| Question | Why it matters |
|---|---|
| Does listing a folder or checking a file's date download anything, or only reading contents? | Decides whether browsing, watching and counts need any change at all. |
| Is the freeze the download itself, or the app's main thread waiting on it? | If the second, moving item 3's reads off the main thread fixes the freeze even without the check. |
| Are the two attributes reliable for every OneDrive state, including online-only folders? | The whole check rests on them. |
| Can the attribute question itself hang? | The attempt put it in a separate helper with a time limit for this reason. |
| Does ripgrep skip or download online-only files by default? | Decides step 3. |

## What can be proven without Windows, and what cannot

- **Provable here, by tests with a pretend "is it here?" answer:** passive readers skip; search
  and watching stay on (a test that fails on the attempt's Windows switch-offs); opening waits
  for the answer; the helper's time limit; the guard.
- **Not provable here:** that the freeze is gone; every row of the Step 0 table.

## Decisions for Destin

1. The "Download and open / Not now" dialog: wording and look (review deck).
2. What search says when it left online-only files out.
3. Whether a cloud mark is shown on online-only files in lists.
4. Who runs Step 0: his own Windows PC, or a tester.
