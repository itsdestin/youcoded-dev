---
status: active
date: 2026-09-20
related: docs/active/plans/2026-09-16-youcoded-pages-phasing.md (Phase 2)
---

# YouCoded Pages Phase 2 — connections and refresh, technical design

The screens are approved (four review rounds, `docs/active/design/2026-09-15-youcoded-pages/`).
This is the half behind them: what a page may reach, who holds the key, who makes the request,
and where "Updated 2m" comes from. Decisions it implements are listed in the phasing plan.

## 1 · The promise this has to keep

**A page reaches exactly what its approval lists, and nothing else.** Everything below exists
to make that sentence true rather than merely stated — Phase 1 shipped with no blocking at all,
and the approval screen is worthless while a page can open its own socket.

Two enforcement points, because either alone is a single point of failure:

1. **The document cannot reach the network itself** — a Content-Security-Policy meta baked into
   the page by `prepareHostedDocument`, so the browser refuses `fetch`, `XMLHttpRequest`,
   `WebSocket`, `sendBeacon`, form posts, and remote scripts/styles/images.
2. **The one door it does have is checked in main** — `pages:fetch` resolves the page's approved
   connections from disk and refuses anything that does not match, so a renderer bug or a
   compromised frame cannot widen the grant.

## 2 · The manifest

`page.json` gains `connections`, parsed in `PagesStore.readManifest` beside name/description/icon.
Everything else there is already ignored, so this is additive and old pages keep working.

```jsonc
"connections": [
  { "id": "weather", "kind": "key", "service": "OpenWeather",
    "address": "api.openweathermap.org", "access": "lookup",
    "keyHelp": { "steps": ["Open …", "…"] } },
  { "id": "yc", "kind": "youcoded" },
  { "id": "feed", "kind": "public", "address": "hnrss.org" },
  { "id": "gh", "kind": "github", "access": "lookup" },
  { "id": "open", "kind": "open" }
]
```

Validation is strict and silent-dropping, never throwing: an entry with an unknown `kind`, a
missing/oversized field, an `address` that is not a bare hostname (no scheme, path, port,
wildcard or userinfo), or a duplicate `id` is dropped. Caps: 8 connections, `service` 40 chars,
`address` 253, 6 `keyHelp.steps` of 200. **`open` cannot coexist with `key`, `youcoded` or
`github`** (deck Q-open-mix): if it does, the whole list is dropped and the page reaches nothing
— refusing is safe, guessing which half the author meant is not.

A connection's **fingerprint** is `kind|service|address|access`. It is what an approval is
recorded against, so widening access or changing an address lapses that approval and the page
asks again (deck S-change); a renamed `id` alone does not.

## 3 · Where approvals and keys live

`<userData>/page-connections.json`, per install, **never synced** — the same reasoning as
`native-secrets.json` (`providers/secrets-store.ts`): a key is machine-bound ciphertext, so an
approval that travelled without it would be a promise the other machine cannot keep.

```jsonc
{
  "version": 1,
  "pages":  { "personal:weather": { "weather": { "fingerprint": "key|OpenWeather|api.openweathermap.org|lookup",
                                                 "approvedAt": "…" } } },
  "keys":   { "OpenWeather": { "address": "api.openweathermap.org", "secretRef": "01J…" } },
  "fresh":  { "personal:weather": { "at": "…", "failed": false } }
}
```

Keys themselves go through the existing `SecretsStore` (safeStorage, refuses a plaintext
fallback), so this file holds only pointers. `fresh` is last-updated, written by main when a
fetch finishes, so the band's time is a fact about a request the app made.

## 4 · The one door: `pages:fetch`

`pages:fetch(pageId, { url, method, headers, body })`, main-side, in order:

1. Resolve the page (the store's `locate`), read its manifest connections and its approvals.
2. Find the connection whose `address` **equals** the URL's hostname (exact, case-folded; no
   suffix matching — `evil-api.todoist.com.attacker.example` must not match `api.todoist.com`).
   An `open` page matches any host. No match, or the match is unapproved, or its fingerprint
   moved: refuse with `{ ok: false, reason: 'not-approved' }`.
3. `access: 'lookup'` allows GET and HEAD only; anything else refuses `'method-not-allowed'`.
4. Strip caller headers to a small allowlist (`Accept`, `Accept-Language`, `Content-Type`), then
   attach the credential: the key as the service's documented header, the YouCoded session as
   `Authorization: Bearer`, GitHub as `Authorization: token`. A `public` connection attaches none.
5. `guardedFetch` (`harness/tools/net-guard.ts`) does the request: https/http only, private and
   loopback addresses refused, every redirect hop re-validated **and re-matched against the same
   connection**, so a redirect cannot walk the credential to another host.
6. Cap the body (1 MB, `readBodyCapped`), return `{ ok, status, headers: <allowlist>, body }`.
   Response headers are filtered so `Set-Cookie` never reaches the page.
7. Record `fresh` for the page and broadcast the fresh list.

Caps: 30s per request, 4 concurrent per page, 60 per page per rolling minute. Over the limit
refuses `'too-many-requests'` rather than queueing, so a runaway page cannot spend a paid key.

**The credential never enters the renderer**, so this is also the honest answer for the phone: a
remote viewer's request executes on the desktop exactly as a local one does.

## 5 · What the page calls

The bootstrap gains `youcoded.fetch(url, opts)` → a promise, implemented as a `postMessage`
round trip with a request id; the host forwards to `pages:fetch` and posts the answer back. It
rejects with a plain sentence when refused. The host answers only its own frame (`e.source`), as
the data-save path already does.

`youcoded.onRefresh(cb)` is how the band's refresh button reaches the page: the host posts
`youcoded:refresh`, the page re-fetches. A page that ignores it still shows a true time, because
the time comes from the app's own record of the last request.

## 6 · The CSP

Built by `prepareHostedDocument` from the page's connection kinds:

- no connections: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'`
- any connection: the same (the door is `youcoded.fetch`, not the browser's own network).
- an `open` page additionally gets `img-src https: data: blob:; media-src https:; font-src https: data:`, so a reader page can show pictures. `connect-src` stays `'none'` everywhere.

`'unsafe-inline'` for script and style is not a weakness here: the page's own code is the thing
being sandboxed, and the frame is already an opaque origin with no app access. The CSP exists to
take away the network, not the page's own scripting.

**Honest limits, to be said in the deck wording rather than hidden:** a page can still navigate
its own top-level frame (`allow-popups` opens a link in the real browser, which is a user-visible
act), and CSP cannot stop a page showing a link for the person to click. What it does stop is
silent traffic.

## 7 · Five surfaces

`pages:fetch`, `pages:approve`, `pages:remove-connection`, `pages:refresh`, `pages:saved-keys`,
`pages:delete-saved-key` land on preload, ipc-handlers, remote-server and remote-shim, guarded by
`ipc-channels.test.ts` and `remote-channel-parity.test.ts`. Android answers unsupported through
its catch-all, as Pages already does there.

## 8 · What gets built, in order

1. Manifest parsing + validation, with its own tests (the coexistence refusal, the address shape).
2. The store: approvals, keys through SecretsStore, freshness.
3. `pages:fetch` in main, with tests for host matching, redirect re-matching, method limits and
   header stripping.
4. The CSP in `prepareHostedDocument`, plus `youcoded.fetch`/`onRefresh` in the bootstrap.
5. The five-surface plumbing, then drop the `MOCK_ONLY` rows.
6. The workbench fake keeps its seeded pages so the screens stay reviewable with no network.

## 9 · What this phase still does not do

No sign-in style services (Google and the like). No background refresh for pinned pages. No
website view, so no browser page. No file access, no model tasks, no marketplace. The phone
cannot add a key.
