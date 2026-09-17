---
status: draft
date: 2026-09-17
related: docs/active/plans/2026-09-16-youcoded-pages-phasing.md (the phasing and the build decisions), docs/active/design/2026-09-15-youcoded-pages/youcoded-pages-shell.contract.json (what "done" means)
---

# YouCoded Pages, Phase 1 — technical design

The shell is designed and approved (eight decks). This is how the remaining Phase 1 pieces are
built: where pages live, how the app lists and watches them, per-device pins, a page's own
saved data, and the creator skill. The steer from Destin (2026-09-17) is **the least backend
that makes pages real**: no drafts, no blocking, no rename/delete UI; git is the history.

## 1. Where a page lives

A page is a folder:

```
<home>/<slug>/
  page.html        the working version — a complete document
  page.json        { "name", "description", "icon", "updatedAt" }
  data.json        the page's own saved data (optional, written by the page through the host)
```

Two homes:

- **Personal:** `~/YouCoded/Personal/Pages/<slug>/`. Everything under the Personal space is
  staged and synced by the transport with no registration (`sync-spaces/git-transport.ts`
  stages the whole worktree; `naming-store.ts` header). It syncs the moment it exists.
- **Project:** `<project>/Pages/<slug>/`, a visible folder. Never `<project>/.youcoded/` — that
  is in `DEFAULT_IGNORES` (`sync-spaces/guards.ts`), skipped by the engine's watcher and appended
  to `.gitignore` by the project manager, so a page there would never leave the machine.

`slug` is kebab-case from the name, unique within its home; the skill picks it, the app never
renames. `home` is not stored in `page.json`: it is where the folder is.

**Conflicts.** Sync's policy is remote-wins plus a visible conflict copy named
`<base> (from <device>, <date>).<ext>` (`guards.ts`, `conversations/store-core.ts`). For a
page that means `page.html` or `data.json` may gain a sibling copy after a two-device edit.
Phase 1 folds them on read the way the naming store does: the newest `updatedAt` wins for
`page.json`; for `page.html` and `data.json` the newest mtime wins and the copy is deleted.
Later-save-wins is what Destin chose for page data.

## 2. The bridge: `window.claude.pages`

Already typed in `desktop/src/shared/pages-types.ts` (`PagesBridge`: `list`, `get`,
`setPinned`, `onChanged`). Phase 1 adds two members for page data and wires all six on the
five surfaces (`ipc-handlers.ts`, `preload.ts`, `remote-shim.ts`, `remote-server.ts`,
`SessionService.kt` as a not-implemented arm), pinned by `tests/ipc-channels.test.ts`.

| Member | Channel | Does |
|---|---|---|
| `list()` | `pages:list` | scan both homes for `*/page.json`; return summaries with `home` and `pinned` |
| `get(id)` | `pages:get` | read `page.html` (+ fold conflict copies); `{ ok:false, failure }` when missing/unreadable |
| `setPinned(id, pinned)` | `pages:set-pinned` | write this device's pin file; refuse a fifth pin (`MAX_PINNED_PAGES`) |
| `onChanged(cb)` | `pages:changed` (push) | fresh summaries after any change in either home |
| `getData(id)` | `pages:get-data` | read `data.json` (folded); `null` when absent |
| `setData(id, json)` | `pages:set-data` | write `data.json` under lock; cap 1 MB; refuse otherwise |

`id` is `<home-kind>:<slug>` for personal (`personal:focus-timer`) and
`project:<project-path-hash>:<slug>` for project pages, so an id never collides across homes and
never leaks a full path into the renderer. The main process keeps an id → folder map from the
last scan.

Landing the real channels means deleting the four `pages.*` rows from
`renderer/dev/workbench/mock-only.ts` in the same change (`workbench-mock-contract.test.ts`
refuses a `MOCK_ONLY` entry that has gained a real channel). The workbench fake stays.

## 3. Watching for changes

Copy `main/artifacts/project-watcher.ts`: one chokidar watcher per home root
(`awaitWriteFinish { stabilityThreshold: 500, pollInterval: 100 }`, `depth: 3`, `ignoreInitial`),
own-write suppression for the app's pin and data writes, and a 300 ms trailing debounce per
root (`theme-watcher.ts` pattern) before one `pages:changed` broadcast to every window and
`remoteServer.broadcast`. A sync arriving from another device is just another file change:
this is how "a page built on one device shows up on the other" works, with nothing
Pages-specific in sync.

Project homes are watched only for projects the app knows (the central index's project list);
a project added later gets its watcher on the next `list()`.

## 4. Pins, per device

`~/YouCoded/Personal/Pages/.pins/<deviceId>.json` — `{ "pinned": ["personal:focus-timer", …],
"updatedAt" }`. Beside the pages rather than inside `Personal/Devices/<id>.json`: the device
registry rejects any `schemaVersion` it does not know, so extending it would blank the list on
an older build. The device id is `getMachineIdentity()` (`main/device-identity.ts`); when it is
null (remote browser, some Linux builds) pins fall back to a userData-local file and do not sync.
Other devices' pin files are ignored on read; they sync along, which is harmless.

## 5. A page's own data

The frame is an opaque origin: no localStorage, no cookies, nothing survives a reopen. The
host script already injected by `page-theme.ts` gains two messages:

- page → host: `{ type: 'youcoded:data:set', data }` and `{ type: 'youcoded:data:get' }`
- host → page: `{ type: 'youcoded:data', data }` (also sent once at load, before the page's
  own scripts run, so a page reads `window.youcoded.data` synchronously)

The page-side helper is three functions on `window.youcoded`: `data` (the last value),
`save(data)` (posts set), `onData(cb)`. `PageHost` relays to `pages.setData`, debounced 500 ms,
last write wins. This is the only bridge Phase 1 adds; it carries JSON, not files, and it is
what makes the planner's events survive a reopen and a sync.

## 6. The creator skill: `/page-builder`

A bundled plugin skill, like `/theme-builder` (`wecoded-marketplace/wecoded-themes-plugin/
skills/theme-builder/SKILL.md`). It lives in a new plugin `wecoded-pages-plugin` in the
marketplace repo, listed in `BUNDLED_PLUGIN_IDS` and the Kotlin mirror (order pinned by
`bundled-plugins-parity.test.ts`), with a marketplace index entry because
`reconcileBundledPlugins()` resolves ids through the index.

What the skill does, in the user's words:

1. **Make a page.** Asks three things if not given: what the page does, personal or project,
   a name. Writes the folder (§1) with a page built ONLY from the style kit's classes
   (`page-kit.ts` is copied into the skill as its reference, with the tokens it may use). Says
   where it put it and that it is in the library now.
2. **Edit a page.** Given a page name or folder, rewrites `page.html` in place; the open page
   reloads through `pages:changed`. "Put it back" restores from git history (`git log` /
   `git checkout` in the page's repo; the Personal space repo is at `~/YouCoded/Personal/.git`
   by the transport's layout — the skill uses the app's own sync repair path, not raw git, if
   that proves fragile).
3. **Rename, describe, re-icon, delete.** Edits `page.json` or removes the folder; the library
   follows.

Rules the skill is told: pages have no way to reach the user's files or accounts yet; the app
does not block the internet, so say so rather than promising isolation; use `window.youcoded`
for saved data; never use `localStorage`; keep to the eight named icons.

**Starting it from the app.** `SessionCreateRequest` already carries `initialInput` end to end
(`session-manager.ts`, `InputBar.tsx` prefill, Android mirror) though the typed builder omits
it. Make a page → `createSession(cwd, false, …, { initialInput: '/page-builder ' })` with `cwd`
the current project (a project page) or the Personal root (a personal page; the skill asks
which). Edit in chat → the same with `initialInput: '/page-builder edit <folder>'`. The text
is prefilled, not sent, so the person sees and can add to it. For native sessions the same
dispatcher path turns `/page-builder …` into `invokeSkill`.

## 7. What is deliberately not built

- No draft/previous files, no Apply strip (git is the history).
- No CSP or network blocking in the frame; the honest wording says so.
- No rename/delete/icon controls in the library.
- No starter pages on a fresh install (the three samples stay workbench fixtures).
- No page-to-page memory across a switch beyond `data.json`.
- No Android-native execution; the shared renderer is not exercised there this phase.

## 8. Tests that pin it

- `pages-store.test.ts`: scan both homes, ids, conflict-copy folding, pin cap, data cap,
  missing folder → `{ ok:false, failure.kind:'missing' }`.
- `ipc-channels.test.ts`: the six channels on all five surfaces.
- `workbench-mock-contract.test.ts`: `MOCK_ONLY` rows gone.
- `page-theme.test.ts`: `prepareHostedDocument` injects the data handshake; `readThemeCss`
  emits only the token list.
- `bundled-plugins-parity.test.ts`: the new plugin id in both lists.
- Pinning tests for `PageHost`/`PagesView` behaviour rows the contract marks `human`
  (pin cap, Back closes the library too, panel hidden by default).

## 9. Tasks, in order

1. Store + scan + ids + folding (`main/pages/pages-store.ts`) with tests.
2. Pins file + data file, caps, locks.
3. Watcher + `pages:changed` broadcast.
4. Five-surface wiring + parity tests; delete `MOCK_ONLY` rows; keep the workbench fake.
5. Renderer: `getData`/`setData` in `PagesBridge`, the in-frame data helper in `page-theme.ts`,
   `PageHost` relay; `use-pages` unchanged.
6. `initialInput` through `createSession`; Make a page / Edit in chat prefill `/page-builder`.
7. The `wecoded-pages-plugin` skill in the marketplace repo + bundled lists + index entry.
8. Verify (`scripts/verify.sh`), a dev-instance walk-through (`run-dev.sh`) of make → open →
   pin → edit → reopen, then Destin's own check.
