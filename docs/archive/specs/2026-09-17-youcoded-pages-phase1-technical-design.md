---
status: shipped
date: 2026-09-17
reviewed: docs/archive/reviews/2026-09-17-youcoded-pages-design-review-1.md (12 findings, all accepted and folded in below)
related: docs/active/plans/2026-09-16-youcoded-pages-phasing.md (the phasing and the build decisions), docs/active/design/2026-09-15-youcoded-pages/youcoded-pages-shell.contract.skipped.json (24 rows, never signed — skipped on Destin's call)
---

> Archived: shipped 2026-09-17 in youcoded#507 (Phase 1 of YouCoded Pages).

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
  page.json        { "name", "description", "icon" }
  data.json        { "savedAt", "data" } — the page's own saved data (optional, written through the host)
```

Stamps come from the files, never from the skill: `updatedAt` is `page.json`'s mtime, `htmlStamp`
is `page.html`'s mtime (F11). Slugs are checked case-insensitively (`findCaseCollisions`).

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
`<base> (from <device>, <date>).<ext>` (`guards.ts`; the copy is OURS, written right after
THEIRS is checked out — `git-transport.ts` ~548-560). mtime therefore says nothing about which
save was later (F2). Folding, always under `mutateFileUnderLock`:
- `data.json`: the envelope's `savedAt` decides; the loser is deleted. That is the
  later-save-wins Destin chose for page data.
- `page.json`: same, by mtime-derived `updatedAt` written into the envelope on save.
- `page.html`: no envelope, so the sync policy stands — the checked-out (remote) file wins and
  our copy is deleted. The existing `CONFLICT_RE` in `store-core.ts` is `.json`-only; the pages
  store gets its own matcher for `.html`.

**History.** The Personal space's repository is NOT `~/YouCoded/Personal/.git`: the transport
keeps it at `<root>/.youcoded/sync.git` and runs git with `GIT_DIR`/`GIT_WORK_TREE`
(`git-transport.ts` ~188-244) (F1). "Put it back" in chat therefore runs
`git --git-dir=<root>/.youcoded/sync.git --work-tree=<root> log|show -- Pages/<slug>/page.html`.
A project page has history only where the project is a sync space (same layout under
`~/YouCoded/Projects/<name>/`) or its own git repository; the skill says so when neither holds.
History is per sync cycle (the engine's 15 s debounce), not per edit.

## 2. The bridge: `window.claude.pages`

Already typed in `desktop/src/shared/pages-types.ts` (`PagesBridge`: `list`, `get`,
`setPinned`, `onChanged`). Phase 1 adds one member for page data and wires all five on the
five surfaces (`ipc-handlers.ts`, `preload.ts`, `remote-shim.ts`, `remote-server.ts`,
`SessionService.kt` as a not-implemented arm). Parity is pinned by `tests/ipc-channels.test.ts`
(preload vs `shared/types.ts`) together with `shim-parity.test.ts` and
`remote-channel-parity.test.ts` for the shim and the server (F12).

| Member | Channel | Does |
|---|---|---|
| `list()` | `pages:list` | scan both homes for `*/page.json`; return summaries with `home` and `pinned` |
| `get(id)` | `pages:get` | read `page.html` and the folded `data.json` in ONE call, so the data can be baked into the document before it is framed (F4); `{ ok:false, failure }` when missing/unreadable |
| `setPinned(id, pinned)` | `pages:set-pinned` | write this device's pin file; refuse a fifth pin (`MAX_PINNED_PAGES`) |
| `onChanged(cb)` | `pages:changed` (push) | fresh summaries after any change in either home |
| `setData(id, json)` | `pages:set-data` | write the `{ savedAt, data }` envelope under lock; the 1 MB cap is enforced HERE, not only in the renderer (F4) |

`id` is `personal:<slug>` or `project:<project name>:<slug>`, where the project name is the
folder name sync already keys projects by. Ids are therefore the same on every device, which is
what lets a synced pin match (F3; a path hash would differ per machine, and `PageHome.path`
already carries the path to the renderer). The main process keeps an id → folder map from the
last scan. Summaries carry `htmlStamp` so the host can tell a page rewrite from a data save (F7).

Landing the real channels means deleting the four `pages.*` rows from
`renderer/dev/workbench/mock-only.ts` in the same change (`workbench-mock-contract.test.ts`
refuses a `MOCK_ONLY` entry that has gained a real channel). The workbench fake stays.

## 3. Watching for changes

One chokidar watcher on `~/YouCoded/Personal/Pages` (options as `project-watcher.ts`:
`awaitWriteFinish { stabilityThreshold: 500, pollInterval: 100 }`, `ignoreInitial`, `depth: 3`),
own-write suppression for the app's pin and data writes, and a 300 ms trailing debounce
(`theme-watcher.ts` pattern) before one `pages:changed` broadcast to every window and
`remoteServer.broadcast`. A sync arriving from another device is just another file change:
this is how "a page built on one device shows up on the other" works, with nothing
Pages-specific in sync.

Project homes do NOT get a watcher of their own (F8): `project-watcher.ts` already watches each
known project root to depth 6, so the pages store subscribes to its external-change events and
rescans when a changed path is under `Pages/`. A `Pages/` folder that appears later is found on
the next `list()`. `Pages` is NOT added to the discovery/watch skip sets after all (F9, decided
at build time): the two sets are pinned equal, and skipping `Pages/` in the watcher would also
silence the very events the store relies on. So a page's files appear in the project's Files
tab like any other project file, and the app's own data saves are suppressed as own-writes;
only a synced save from another device shows up as an external change.

## 4. Pins, per device

`~/YouCoded/Personal/Pages/.pins/<deviceId>.json` — `{ "pinned": ["personal:focus-timer", …],
"updatedAt" }`, written through `mutateFileUnderLock`. Beside the pages rather than inside
`Personal/Devices/<id>.json`: the device registry rejects any `schemaVersion` it does not know,
so extending it would blank the list on an older build. The device id is `getMachineIdentity()`
(`main/device-identity.ts`), which reads the BUILT app's identity; it is null when the built app
never ran on this machine or its write failed, and then pins fall back to a userData-local file
and do not sync (F12). A dev instance shares the live app's id and `~/YouCoded/` (PITFALLS →
Shared state), so the walk-through uses a throwaway page and cleans up (F10).

## 5. A page's own data

The frame is an opaque origin: no localStorage, no cookies, nothing survives a reopen.

- **Load.** Nothing can be posted "before the page's scripts run" (F4). Instead `get()` returns
  the data with the document and `prepareHostedDocument` bakes it in, exactly as it bakes the
  theme: `<script>window.youcoded = { data: <json>, save(d) {…}, onData(cb) {…} }</script>`
  ahead of the page's own scripts, so a page reads `window.youcoded.data` synchronously.
- **Save.** page → host `{ type: 'youcoded:data:set', data }`; `PageHost` relays to
  `pages.setData`, debounced 500 ms, last write wins.
- **Source check.** Every sandboxed frame in the app has origin `'null'` (HtmlView's artifact
  previews use the same sandbox), so a `type`-only filter would let a previewed artifact write
  page data. The host listener accepts a message only when `e.source === frame.contentWindow`.
- **Caps.** 1 MB, checked in the renderer before posting AND in main before writing.

This is the only bridge Phase 1 adds; it carries JSON, not files, and it is what makes the
planner's events survive a reopen and a sync.

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
   reloads because its `htmlStamp` changed (a data save never bumps it, so a page is never
   wiped by its own saving — F7). "Put it back" restores from the sync repo with the git-dir
   and work-tree the transport uses (§1, History); where the page has no repository the skill
   says it cannot undo and offers to rewrite instead.
3. **Rename, describe, re-icon, delete.** Edits `page.json` or removes the folder; the library
   follows.

Rules the skill is told: pages have no way to reach the user's files or accounts yet; the app
does not block the internet, so say so rather than promising isolation; use `window.youcoded`
for saved data; never use `localStorage`; keep to the eight named icons.

**Starting it from the app.** `initialInput` exists on main's session options and the InputBar
prefill (`session-manager.ts`, `InputBar.tsx`), but NOT on `SessionCreateRequest` /
`SessionCreateArgs` (`shared/session-create-args.ts`), and Android's `session:create` arm
ignores it; only `dev:open-session-in` reads it everywhere (F5). Phase 1 adds it to both shared
shapes (done). The Kotlin arm is left as is: Phase 1 is desktop plus paired remote, and a remote
client's `session:create` goes through the desktop's session manager, which honours it. A
page built from a standalone Android session is later scope, with the rest of Android. Make a page → `createSession(cwd, false, …, { initialInput: '/page-builder ' })` with `cwd`
the current project (a project page) or the Personal root (a personal page; the skill asks
which). Edit in chat → the same with `initialInput: '/page-builder edit <folder>'`. The text
is prefilled, not sent, so the person sees and can add to it. For native sessions the same
dispatcher path turns `/page-builder …` into `invokeSkill`.

## 7. What is deliberately not built

- No draft/previous files, no Apply strip (the sync repository is the history).
- No CSP or network blocking in the frame; the honest wording says so.
- No rename/delete/icon controls in the library.
- No starter pages on a fresh install (the three samples stay workbench fixtures).
- No page-to-page memory across a switch beyond `data.json`.
- No Android-native execution; the shared renderer is not exercised there this phase.

## 8. Tests that pin it

- `pages-store.test.ts`: scan both homes, ids, case-insensitive slugs, conflict-copy folding
  (data by `savedAt`, html remote-wins), pin cap, data cap, missing folder →
  `{ ok:false, failure.kind:'missing' }`.
- `ipc-channels.test.ts` + `shim-parity.test.ts` + `remote-channel-parity.test.ts`: the five
  channels on all five surfaces.
- `workbench-mock-contract.test.ts`: `MOCK_ONLY` rows gone.
- `page-theme.test.ts`: `prepareHostedDocument` injects the data handshake; `readThemeCss`
  emits only the token list.
- `bundled-plugins-parity.test.ts`: the new plugin id in both lists.
- Pinning tests for `PageHost`/`PagesView` behaviour rows the contract marks `human`
  (pin cap, Back closes the library too, panel hidden by default).

## 9. Tasks, in order

1. The `wecoded-pages-plugin` skill in the marketplace repo + bundled lists + index entry —
   first, because the dev walk-through cannot get it any other way: `reconcileBundledPlugins()`
   returns `skipped-dev` under run-dev and resolves ids through the live index (F6); for the
   walk-through the plugin is copied into `~/.claude/plugins` by hand.
2. Store + scan + ids + stamps + folding (`main/pages/pages-store.ts`) with tests.
3. Pins file + data envelope, caps, locks.
4. Watcher on Personal/Pages + project-watcher subscription + `pages:changed` broadcast.
5. Five-surface wiring + parity tests; delete `MOCK_ONLY` rows; keep the workbench fake.
6. Renderer: `setData` in `PagesBridge`, data baked in by `prepareHostedDocument`, the
   source-checked relay in `PageHost`, refetch on `htmlStamp`.
7. `initialInput` on the shared shapes and the Kotlin arm; Make a page / Edit in chat prefill
   `/page-builder`.
8. Verify (`scripts/verify.sh`), a dev-instance walk-through (`run-dev.sh`) of make → open →
   pin → edit → reopen with a throwaway page, cleaned up after, then Destin's own check.
