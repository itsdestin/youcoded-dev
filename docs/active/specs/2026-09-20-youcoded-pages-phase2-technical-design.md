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

1. **The document cannot reach the network itself** — a Content-Security-Policy meta at the top
   of a shell **we** emit (review 1 finding 1: the old regex injection let a page put the policy
   inside a comment), so the browser refuses `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`,
   form posts, and remote scripts/styles/images. The author's HTML is appended into that shell,
   never injected into. A page also cannot navigate its own frame away: main refuses
   `will-frame-navigate`, and the app document carries `frame-src 'none'` (finding 2).
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

A connection's **fingerprint** is `kind|service|address|access`, plus a hash of `keyHelp` when
there is one (finding 16: those steps are author text shown at the moment a key is pasted). It is
what an approval is recorded against, so widening access, changing an address or rewriting the
key instructions lapses that approval and the page asks again (deck S-change); a renamed `id`
alone does not.

An `address` is also shown to a person, and `api.openweathermap.org.evil.example` is a legal
hostname that reads as OpenWeather at a glance (finding 6). The approval screen therefore names
the real website — the registrable part, emphasised — with the rest dim.

That split uses a short built-in list of two-label registry endings, not the full public suffix
list: bundling the PSL for one line of a screen is a dependency this does not justify. An ending
the list does not know emphasises two labels rather than fewer, so it errs towards showing MORE
of the address, never less.

## 3 · Where approvals and keys live

`<userData>/page-connections.json`, per install, **never synced** — the same reasoning as
`native-secrets.json` (`providers/secrets-store.ts`): a key is machine-bound ciphertext, so an
approval that travelled without it would be a promise the other machine cannot keep.

```jsonc
{
  "version": 1,
  "pages":  { "personal:weather": { "weather": { "fingerprint": "key|OpenWeather|api.openweathermap.org|lookup",
                                                 "approvedAt": "…" } } },
  "keys":   { "OpenWeather|api.openweathermap.org": { "secretRef": "01J…", "in": "query", "param": "appid" } }
}
```

A key is keyed by **service AND address** (finding 3): a saved key is offered only when the new
connection's address is byte-equal, so a second page cannot point your OpenWeather key at its
own collector with one press. `in`/`param` record how the service takes the key — a header or a
query parameter — because the fixture service (OpenWeather) takes one in the URL.

The file is written through `mutateFileUnderLock`, the pattern `secrets-store.ts` and
`pages-store.ts` already use, and an unknown `version` refuses everything with a plain message
rather than parsing what it half-understands (finding 10). **Freshness is not in this file**: it
lives in memory and rides the `pages:changed` broadcast, because a fetch can happen 60× a minute
and approvals must not share a hot write path. A record whose page no longer exists is dropped,
and a project page's approval is keyed by the project's canonical path, never its display name,
so two clones named `dashboard` do not share a grant (finding 5).

An approval also records a hash of `page.html` and of the connection's `keyHelp` (findings 5,
16). The hash is not yet a re-ask trigger — whether rewriting a page's code should make it ask
again is a question for Destin, on the next deck.

Keys themselves go through the existing `SecretsStore` (safeStorage, refuses a plaintext
fallback), so this file holds only pointers. On a machine with no keychain that store refuses by
design, so `pages:approve` returns a typed failure the approval card shows as an `<ErrorState>`,
and **no approval is recorded** when the key could not be stored (finding 11).

## 4 · The one door: `pages:fetch`

`pages:fetch(pageId, { url, method, headers, body })`, main-side, in order:

1. Resolve the page (the store's `locate`), read its manifest connections and its approvals.
2. Find the connection whose `address` **equals** the URL's hostname (exact, case-folded; no
   suffix matching — `evil-api.todoist.com.attacker.example` must not match `api.todoist.com`).
   An `open` page matches any host. No match, or the match is unapproved, or its fingerprint
   moved: refuse with `{ ok: false, reason: 'not-approved' }`.
3. `access: 'lookup'` allows GET and HEAD only; anything else refuses `'method-not-allowed'`.
4. Strip caller headers to a small allowlist (`Accept`, `Accept-Language`, `Content-Type`),
   replacing rather than combining with the guard's own (finding 18), then attach the credential:
   a saved key as its recorded header or query parameter, the YouCoded session as
   `Authorization: Bearer`, GitHub as `Authorization: token`. A `public` connection attaches none.
   The URL must be absolute — `//evil.example` is refused, never resolved.
5. `guardedFetch` does the request, with a new `allowHost` callback it consults **before every
   hop** (finding 4: today it spreads the caller's headers into each hop and only re-checks
   public-ness, so a 302 would hand the credential to the redirect target). A hop to a different
   host keeps the request but loses every credential header; a hop the connection does not cover
   is refused outright. The address validated by the guard is the address connected to, so a
   rebinding answer cannot win the race (finding 15).
6. Cap the body (1 MB, `readBodyCapped`), return `{ ok, status, headers: <allowlist>, body }`.
   Response headers are filtered so `Set-Cookie` never reaches the page. **The credential string
   is redacted from the body, the headers, the final URL and every error message** before the
   answer leaves main (finding 7): services echo keys in error text, and a page could otherwise
   harvest its own key and save it into its synced `data.json`.
7. Record freshness for that connection, and only on a 2xx (finding 12), so the band's age cannot
   be kept green by a page pinging an approved URL on a timer.
8. `pages:approve` refuses key material from a remote caller (finding 13). "No keys on the phone"
   was a renderer rule; it is now enforced where a crafted message cannot get past it.

Caps: 30s per request, 4 concurrent per page, 60 per page per rolling minute. Over the limit
refuses `'too-many-requests'` rather than queueing, so a runaway page cannot spend a paid key.

**The credential never enters the renderer**, so this is also the honest answer for the phone: a
remote viewer's request executes on the desktop exactly as a local one does.

## 5 · What the page calls

The bootstrap gains `youcoded.fetch(url, opts)` → a promise, implemented as a `postMessage`
round trip with a request id; the host forwards to `pages:fetch` and posts the answer back. It
rejects with a plain sentence when refused. The host answers only its own frame (`e.source`), as
the data-save path already does — and the page's own bootstrap now ignores any message whose
source is not `parent`, and matches every answer against a request map it owns, so a window the
page opened cannot post forged answers back through `opener` (finding 8).

`youcoded.onRefresh(cb)` is how the band's refresh button reaches the page: the host posts
`youcoded:refresh`, the page re-fetches. A page that ignores it still shows a true time, because
the time comes from the app's own record of the last request.

## 6 · The CSP

Built by `prepareHostedDocument` from the page's connection kinds:

- no connections: `default-src 'none'; connect-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'; frame-src 'none'`. `connect-src` is written out rather than left to the `default-src` fallback: the promise "the page's only door is `youcoded.fetch`" should not rest on a reader knowing the fallback rules.
- any connection: the same (the door is `youcoded.fetch`, not the browser's own network).
- an `open` page additionally gets `img-src https: data: blob:; media-src https:; font-src https: data:`, so a reader page can show pictures. `connect-src` stays `'none'` everywhere.
- every page also gets `webrtc 'block'` and a `x-dns-prefetch-control: off` meta, because ICE
  gathering and DNS prefetch are not `connect-src` and both leak to an attacker's nameserver
  (finding 9).

`'unsafe-inline'` for script and style is not a weakness here: the page's own code is the thing
being sandboxed, and the frame is already an opaque origin with no app access. The CSP exists to
take away the network, not the page's own scripting.

**Honest limits, to be said in the deck wording rather than hidden:** `allow-popups` means one
click anywhere in a page can open the real browser at a URL the page chose, which flashes on
screen but is not something the person authorised in detail. CSP cannot stop a page showing a
link to click. Frame navigation IS stopped (see §1). Two approved sentences also overstate what
this buys, so they change on a deck rather than here: "Cannot send changes" describes a two-way
channel as one-way (a look-up may still carry anything the page knows in its query string), and
the whole-internet bullets do not mention devices on the home network.

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
