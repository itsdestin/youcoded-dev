---
status: shipped
date: 2026-10-04
reviews: youcoded commit 88e70c04e (step 1 of 2026-10-04-page-live-socket-and-camera-video.md)
---

# Code review: live-socket step 1 (device profile, message check, shared access check)

Ran: `page-socket-profile.test.ts` + `page-device-socket.test.ts` = 31 pass. Edge cases below were
checked by running a copy of the check logic in node.

Summary: the profile cleaning, fingerprint and shared access check are correct and match the spec.
One real gap (raw-text duplicate check is both leaky and over-strict), two test gaps, a few smaller items.

## Findings

### 1. MEDIUM — duplicate-"type" check on raw text can be bypassed AND wrongly refuses real messages
`desktop/src/main/pages/page-socket.ts` (checkOutgoingSocketMessage, the `text.match(/"type"\s*:/g)` line)

Problem, two sides:
- **Bypass (verified):** `{"type":"auth/long_lived_access_token","type":"ping"}` -> allowed. JSON
  treats `type` as the key `type`, so JSON.parse keeps the last one ("ping"), but the regex sees only
  one literal `"type":`. A device that acts on the FIRST duplicate would run the denied message. Home
  Assistant (orjson) keeps the last, so today this is theoretical; but the whole point of the duplicate rule
  is to not depend on that, and the rule currently only holds for plain-text spelling. (The reverse order,
  denied one last, is caught.)
- **False refusal (verified):** it counts `"type"` keys at ANY depth. `{"id":1,"type":"lovelace/config/save",
  "config":{"views":[{"cards":[{"type":"entities"}]}]}}` is refused as unreadable. Nested `"type"` keys are
  normal in Home Assistant: dashboard saves, automation/script/blueprint configs, `call_service` data. The
  Home page's current calls (entity/device/area registry rename and move, subscribe_entities, render_template
  text) are NOT affected (a template's quotes are escaped as `\"type\"`, which the regex does not match;
  verified), so nothing in the Home page breaks today. A future page that saves a dashboard or edits an
  automation would be refused with a message that says nothing useful.

Fix (pick one):
- (a) Best: scan the text once with a tiny tokenizer, counting only TOP-LEVEL keys (depth 1), with key
  strings decoded (so `type` counts as `type`); refuse if `type` appears twice at depth 1. Fixes both
  sides. About 30 lines, test with escaped-key duplicates and nested-type messages.
- (b) Send `JSON.stringify(parsed)` instead of the original text, so what is checked is exactly what is
  sent (duplicates collapse to the last, which is what was checked). Drops the raw-text rule entirely, but
  re-serialising can change numbers beyond 2^53 and `1.0` -> `1`; and the live-socket step must then send the
  canonical text too, not the page's.
- Add tests: escaped-key duplicate (both orders), nested `"type"` in a legit message is allowed.

Triage: accepted — sent to step 2: drop the raw-text duplicate check; parse, check the top-level type, send JSON.stringify(parsed) so what is checked is what is sent; tests for escaped duplicates and nested type.

### 2. LOW — `socketDeny` entries that break the format are silently dropped, which loosens a safety list
`desktop/src/main/pages/page-connections.ts` (cleanSocketDeny; test "Bad (upper-case) entry dropped")

Problem: a manifest author writing `socketDeny: ['Config/']` gets NO deny at all and no warning, while
believing the type is blocked. The checker lower-cases both sides anyway, so accepting upper-case costs
nothing. The cap of 16 also truncates silently (`break`) before sorting, so which 16 survive
depends on input order. Fail-open for a deny list.

Fix: lower-case entries before testing the pattern instead of dropping them. For an entry that is still
invalid, or more than 16, refuse the whole connection line (or surface a manifest warning) rather than keep a
partial deny list. Add a WHY comment for the choice.

Triage: accepted — sent to step 2: lower-case entries; an invalid entry rejects the whole socketDeny field (strict), tested.

### 3. LOW — test "still allows a registry rename" does not prove the rename was sent
`desktop/tests/page-socket-profile.test.ts` (last `it`)

Problem: the stand-in server sends `auth_ok` on connect and the request has `until: 1`, so the exchange
ends on that first reply. The test asserts only `ok` and `connections === 1`; the server never records what
it received, so a bug that stopped forwarding allowed messages would still pass. Same stand-in cannot show
the greeting is still sent unchecked either.

Fix: have the server collect received frames and assert the greeting arrives first, then the rename text
byte-for-byte; use `until: 2` with the server replying to each message. (No fixed sleeps anywhere in the
file; the `connections` count after a refusal is read right after the call returns, which is fine because
the refusal returns before any connect.)

Triage: accepted — sent to step 2: the stand-in records and asserts forwarded messages.

### 4. LOW — approval card does not yet show the new profile
`desktop/src/main/pages/page-connections.ts` fingerprint / spec "the approval card says what it allows"

Problem: the fingerprint now covers the profile (good: changing anything asks again), but the person is
asked to approve something the card does not describe (deny list, video target prefix). Not required by this
commit's brief; flagging so the later UI step does not forget it. Also note the Home page will ask for
approval once more after shipping (spec R2-13, intended).

Triage: accepted — the approval card's wording for the profile goes with the re-approval Destin will see (step 5, with the Home page).

### 5. LOW — `videoProfile.send` is not checked as a message anywhere yet
`desktop/src/main/pages/page-connections.ts` (cleanVideoProfile)

Problem: a manifest can set `send` to a template whose `type` is `auth/long_lived_access_token`. Spec says
the FILLED template passes `checkOutgoingSocketMessage`; that is a later step, but it must not be missed
(and `socketDeny` must be applied to it too). Also `targetPrefix` allows one character (`a`) or `.`, which
widens "what a page may ask to watch" beyond a domain; consider requiring it to end in `.` since the
Home Assistant form is `domain.`; and the approval card should print it.

Fix: in step 2, run the filled template through the check with the connection's `socketDeny`; add a test.
Optionally require `targetPrefix` to end with `.`.

Triage: accepted — step 3 (video) checks the filled template and requires targetPrefix to end with ".".

### 6. INFO — things checked and found sound
- Unicode escapes in the value (`"auth/long_..."`), leading/trailing whitespace, upper-case, and
  `config/auth_provider/...` are all caught; a BOM is refused as unreadable (JSON.parse fails). Arrays,
  `null`, numbers, missing/non-string `type` refused. Arrays being refused is right: Home Assistant accepts
  batched lists.
- Page text is sent as-is with no `{{key}}` substitution; only the app's greeting is filled. The deny check
  runs on page messages only, never the greeting. One-shot behaviour is otherwise unchanged: same checks, same
  order, same refusals (the deny check now runs after the DNS/home-address check, so a denied message costs
  one lookup before refusal; harmless).
- Fingerprint: stable (sorted keys, sorted de-duplicated deny list, JSON.stringify), unchanged for a device with
  no profile fields, a greeting-only device changes once (`|hello:` -> `|profile:`; intended and tested), and
  changes when any single field changes (tested for all five). Access/address changes still change it via the
  existing parts. Profile strings are all length-limited and character-limited; nothing becomes a pattern
  main runs.
- `{{key}}` in `videoProfile.send` is rejected; `Buffer.byteLength` used for the 2048 cap (correct for
  non-ASCII).
- Cosmetic: `pages-types.ts` has two stacked doc comments before `socketReady` (the first documents the group
  but attaches to `socketReady`).
