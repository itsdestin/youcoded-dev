---
status: draft
date: 2026-10-24
related: docs/active/specs/2026-10-24-pages-finish-architecture.md (step 1); docs/active/design/2026-10-24-pages-finish/pages-finish-step1.review.answers.json (approved screens); docs/active/investigations/2026-10-24-pages-finish-audit.md; card #90
branch: session/90-pages-finish (youcoded, youcoded-dev); page-builder skill in wecoded-marketplace
---

# Finishing Pages, step 1 — technical design

Approved UI: the step 1 review deck (all ten screens yes; band gear opens the same popup;
Edit in chat inside Page settings). The screens are built against the workbench; this design
is what makes them real. Paths are relative to `youcoded/desktop/src/`.

## Changed by design review 1 (`docs/active/reviews/2026-10-24-pages-finish-step1-design-review-1.md`, all 17 accepted)

- **Frame navigation:** also blocked on the Android app (sub-frame navigations refused in the
  WebView router). **A phone's own browser (remote access) cannot be guarded** — CSP has no
  navigation rule; what limits it is that the remote door only serves pages this computer
  already approved. Stated, not hidden.
- **Opening a website:** main opens through `platform.openExternal`; a remote screen opens the
  address itself from the confirming click; `mailto:` always asks and never offers "Don't ask
  again", and is refused on the Android app. Silent opening is one pure rule: an approved
  public/key/YouCoded/GitHub address or a remembered site — never for whole-internet, device or
  bank pages. No Enter-to-confirm; one ask at a time; 30 s quiet after a Cancel. The
  "Together…" line also counts remembered sites.
- **Credentials:** never over `http:` (home devices excepted); carried only while scheme, host
  and port all match; every redirect re-checked against `allow`/`writePaths` with its method;
  request paths with `%`, `;`, `\` or `//` refused under a recipe; the saved record remembers a
  multi-part layout and "use the saved key" requires the same layout; approve validates every
  part; every door redacts every secret in raw, URL, JSON-escaped and base64 forms.
- **Name-server pinning:** npm `undici` `fetch` + two shared agents (public, home) that resolve,
  check and connect in ONE lookup — no per-hop agents.
- **Link hints** (`preconnect`, `dns-prefetch`, `prefetch`, `preload`, `modulepreload`,
  script-made hints, `sendBeacon`, images): probed 2026-10-24 in Chrome (headless, the same
  Chromium family as Electron 41) with a sandboxed srcdoc frame carrying the page policy and a
  local listening server — **zero connections** with the policy, twelve without it (control).
  Already closed by the existing policy; nothing to build.

## Built (2026-10-24, youcoded `session/90-pages-finish`; `verify.sh` all green)

Kind registry (pin test) · recipes `allow` + `parts` · https-only credentials, full-origin
carry-over, per-hop re-checks, request-path rules, layout-tied saved sign-ins, fuller
redaction · remembered sites storage · `pages:open-website` / `pages:forget-open-site` on
every surface (phone list widened: Destin "ok", 2026-10-24) · sandbox without popups, page
bootstrap `youcoded.open`, host decision rule, the ask (no Enter, one at a time, 30 s quiet)
· desktop frame guard + Android untapped sub-frame refusal (19/19 router tests) · DNS pinning
with undici · page-builder 0.4.0 (wecoded-marketplace `session/90-pages-finish`).
Not yet: Destin's dev-window try; Plaid and Home as bundled recipes (step 1b).

## Promises this step must keep

1. **Nobody is re-asked.** Every approval recorded today still matches after the change: the
   fingerprint of every existing connection is byte-identical.
2. **Your Money, Home and Work board pages behave exactly as today.**
3. **A page cannot get information out of the computer except through what it was allowed**
   — closing the three holes the audit found (website opening, frame navigation, name-server
   re-binding).
4. **A new connection kind costs one registry entry in main, one place in the renderer's
   wording file (three small functions), and its shared type** — not 9–12 files.

## 1. Kind registry (main)

New `main/pages/kinds/` with one module per kind (`youcoded`, `open`, `github`, `public`, `key`,
`device`, `plaid`, `session`, `chats`, `program`) and `kinds/index.ts` exporting
`KINDS: Record<PageConnection['kind'], KindDef>`:

```ts
interface KindDef<K> {
  parse(o: Record<string, unknown>, id: string, sofar: PageConnection[]): K | null;
  fingerprint(c: K): string;
  covers(c: K, target: string | URL): boolean;          // false for app abilities
  methodAllowed(c: K, method: string, pathname: string): boolean;
  credential(c: K, deps: CredentialDeps): Promise<PageCredential | null>;
  savedKeyTarget?(c: K): { service: string; address: string } | null;
  /** Holds something private (a credential, a chat list): may never share a page with `open`. */
  privateData: boolean;
  onePerPage?: boolean;
}
```

`parseConnections`, `fingerprint`, `covers`, `methodAllowed`, `savedKeyTarget` and
`credentialFor` (pages-service) become thin dispatchers over `KINDS`, keeping their exported
names so every caller is untouched. The `open`-plus-private rule reads `privateData` instead of
a hand list. Each kind's body is moved VERBATIM from today's switch cases (no behaviour
change in the move commit).

**Guard (written before the move):** `tests/page-kind-registry.test.ts` pins the exact
fingerprint string of a corpus covering every kind and option (device profile, key placement,
writePaths, chat scopes, program) captured from the CURRENT code, plus `covers`/`methodAllowed`
truth tables. The move must leave it green. A second test fails when a kind in the
`PageConnection` union has no `KINDS` entry (type-level `satisfies` plus a runtime key check).

## 2. Service recipes on the `key` and `public` kinds

Kept on the existing kinds rather than a new `web` kind, because a new kind would change
every fingerprint (promise 1). Two optional manifest fields:

- **`allow`**: `[{ method: 'GET'|…, path: '/calendars', does: 'See your calendars and events' }]`,
  1–16 entries. `path` is a plain path prefix (`/[A-Za-z0-9_.~-]+` segments, no `%`, no `..`),
  matched exactly or at a `/` boundary against the request's `pathname`; `method` from the
  usual six; `does` ≤ 80 characters. When present, `methodAllowed` answers from `allow` ONLY
  (the general `access` no longer widens it). A list with any invalid entry drops the whole
  connection (the card must show exactly what main enforces — same rule as `socketDeny`).
  Fingerprint gains `|allow:<sorted method path pairs>` only when present; the `does` words
  are NOT in it (rewording does not re-ask; changing what is allowed does).
  The renderer's `does` list is derived from the entries' `does` words, de-duplicated in
  order. The shared `does?: string[]` design field is replaced by `allow`.
- **`parts`** (key kind only): `[{ id, label, hint?, secret?, in: 'header'|'query'|'basic-user'|'basic-password', param? }]`,
  2–4 entries. `basic-user` + `basic-password` together make `Authorization: Basic
  base64(user:password)`; `header`/`query` put that part under `param` (cleaned like
  `keyParam`). The parts are saved as ONE SecretsStore value (JSON keyed by part id — the
  card already builds that), so `savedKey`/`deleteSavedKey`/Connected services are unchanged.
  Fingerprint gains `|parts:<sorted id:in:param>`.
- `PageCredential` becomes `{ headers: Record<string,string>; query: Record<string,string>; secrets: string[] }`
  so one connection can attach several values; `performApprovedFetch` and `page-socket.ts`
  attach all of them and redact every secret (each part's raw value, the Basic string and its
  base64). `guardedFetch` already drops credential headers and query params off-host.
- Plaid's key step uses the renderer's `partsOf` (done in the design). **Plaid itself and
  Home's device stay their own registry entries in this step**; turning Plaid into a bundled
  recipe needs body injection, a host-held per-bank token store and a browser sign-in flow,
  and Home needs protocol profiles — both are step 1b, before files, recorded in the
  architecture spec so they are not lost.

## 3. Ask before opening a website (deck 1 Q-popups; approved S-open-website)

- **Frame:** remove `allow-popups` from the page iframe's `sandbox` (`PageHost.tsx`). The page
  bootstrap (`page-theme.ts`) gains `youcoded.open(url)`, overrides `window.open` to call it,
  and intercepts clicks on `<a href>` with an http(s)/mailto target (capture phase, after the
  page's own handlers, skipping `preventDefault`ed clicks), posting `{type: 'youcoded:open', url}`.
- **Host (`PageHost`):** on that message from THIS frame, while the page is approved and
  visible: parse the URL (http/https/mailto only); if its hostname is covered by one of the
  page's approved connections' addresses, or is in `summary.openSites`, call
  `pages.openWebsite(id, url, false)` at once; otherwise show `PageOpenWebsite`. At most one
  ask at a time; a second request while one is open is dropped (a page cannot queue a wall of
  asks). No user-activation requirement: the ask itself is the gate.
- **Main `pages:open-website` {id, url, remember}:** re-parses (http/https/mailto only, ≤ 2,000
  characters), checks the page exists, records the hostname in the page's `openSites` when
  `remember` (≤ 50 sites, lower-case, trailing dot stripped), then `shell.openExternal`.
  **`pages:forget-open-site` {id, site}** removes one. Both return the fresh list.
- **Storage:** `openSites` beside the page's approvals in `<userData>/page-connections.json`
  (per device, never synced, same writer), pruned with the page. `PageSummary.openSites`
  comes from the listing.
- **Main window open handler** (`main.ts`): unchanged for the app's own windows; with
  `allow-popups` gone a page frame can no longer reach it. Pinned by a test that the page
  iframe's sandbox has no `allow-popups`.
- **Phone / remote:** the ask shows on the screen that asked; `openExternal` happens on the
  computer for remote access (as every external link already does), and on the phone's own
  browser for the Android app — the same route `shell.openExternal` takes there today.

## 4. Frame navigation (new hole found while designing)

CSP `form-action 'none'` is already on every page (`page-theme.ts:469`), so a form cannot
post out — the audit's "unverified" form question is answered: closed; a test pins it.
But a page's script can still navigate its OWN frame (`location.href = 'https://x/?data'`):
CSP cannot stop that, and the sandbox allows it. Fix in main, modelled on
`office-frame-guard.ts`: the host gives the page iframe `name="youcoded-page"`; main records
the `frameTreeNodeId` of any subframe created with that name (`frame-created`), and
`will-frame-navigate` refuses any navigation of a recorded frame to anything other than
`about:srcdoc`/`about:blank`. Remembered by id, so a page renaming `window.name` cannot
escape. Pinned by a decision-function test like the Office guard's.

## 5. Name-server re-binding (`net-guard.ts`)

Today the guard checks the DNS answer, then `fetch` resolves the name again. Fix: resolve
once, check, and CONNECT to the checked address. `undici` (already in `node_modules`
transitively; becomes a direct dependency at the same version) provides
`new Agent({ connect: { lookup } })`; `guardedFetch` passes a per-hop dispatcher whose
`lookup` returns only the addresses the guard approved for that hop. TLS still verifies
against the hostname (SNI unchanged). Applies to every caller (web tools, page fetch,
device reach). **Guard:** a test whose fake lookup answers public then private on the second
call must still connect to the public address — red before, green after. If Electron's
bundled fetch rejects the npm undici dispatcher, fall back to undici's own `fetch` for
guardedFetch only (same Response type), decided by that test.

## 6. Page settings and Edit in chat

Already wired to real channels except the two new ones above. `PageSettingsDialog` lists
`openSites` from the summary. No other backend.

## 7. The page builder learns recipes (wecoded-marketplace)

The page-builder skill's connection reference gains `allow` and `parts`, with the rule
"always use the narrowest connection that does what the person asked" (Destin, deck 1
Q-filepick note, applies to every kind) and two worked recipes (a calendar with Basic sign-in,
a task service with a bearer key). Version bump; no app change needed to ship it.

## 8. Channels and parity

`pages:open-website`, `pages:forget-open-site`: `shared/backend-contract.ts`,
`shared/files-channel-types.ts`, `main/ipc/pages.ts` (one definition serves the remote
server), `preload.ts` (generated list), `renderer/remote-pages-bridge.ts`. Remove both rows
from `mock-only.ts`. `ipc-channels.test.ts` and `android-host-channels.test.ts` enforce
parity. The mock fakes stay.

## Build order (each a commit, tests first)

1. Fingerprint/truth-table pin test → kind registry move (no behaviour change).
2. Recipes: `allow` + `parts` parse, fingerprint, enforcement, multi-value credential,
   redaction; renderer derives `does` from `allow`; fixtures switch to `allow`.
3. Frame navigation guard + sandbox change + `youcoded.open` + host decision + the two
   channels + storage.
4. DNS pinning.
5. Page-builder skill reference.
6. `verify.sh`, a dev window for Destin (`run-dev.sh --label "Pages step 1"`), close-out notes.

## Not in this step

Plaid and Home as bundled recipes (step 1b); sign-in accounts (step 5); files (step 2); the
combined-risk line re-asking when a later edit adds the second half — already true, because
the new line is itself unapproved and the card shows the whole page.
