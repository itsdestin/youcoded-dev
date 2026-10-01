---
status: draft
date: 2026-10-01
source: home-page-v2.questions (Q-where: "mixed"; Q-kind earlier: any-device)
branch: youcoded session/ha-pages-live
---

# A page's socket exchange with its home device

## Why

Home page v2 renames devices and moves them between rooms **in Home Assistant itself**
(deck Q-where, "mixed"). Home Assistant offers those only over its websocket
(`config/entity_registry/update`, `config/device_registry/update`,
`config/area_registry/create|list|update`); there is no REST endpoint. A page's
only door was one-shot HTTP (`pages:fetch`).

## Shape: one exchange through the existing door

Not a new channel. `PageFetchRequest` gains an optional `socket`:

```js
youcoded.fetch(base + '/api/websocket', {
  socket: { send: [jsonString, ...], until: 4, timeoutMs: 8000 }
})
// → { ok: true, status: 101, body: '["{\"type\":\"auth_required\"…}", "{…auth_ok…}", "{…result…}"]' }
```

Main opens `ws://` (`wss://` for https) to the approved host:port, sends the connection's
**greeting**, then `send` in order, collects text messages until it holds `until` (or the
device closes the socket), then closes. `body` is a JSON array of the messages received,
in order, key redacted. Same IPC (`pages:fetch`), same `PageHost` forwarding, same rate
gate (one exchange = one request), so preload / remote-shim / remote-server needed no change.

Why one-shot, not a live socket: nothing stays open behind a hidden or closed page
(performance rule 2), no subscription lifecycle to leak, and the page already polls every
5 s for state. Renames and moves are rare, deliberate actions.

## The key never reaches the page

The device connection's manifest may carry `socketHello`, e.g. Home Assistant's
`{"type":"auth","access_token":"{{key}}"}`. Main substitutes the saved key (JSON-escaped)
into **that message only** and sends it first. The page's own messages are sent exactly as
written — a page that writes `{{key}}` sends the literal token. This matters: if
substitution happened in the page's messages, a page could rename a light to `{{key}}` and
read its key back through the template API (transformed, so redaction would not catch it).

- Every received message is redacted (the full credential and the bare key).
- `socketHello` ≤ 512 chars, the token at most once; otherwise dropped.
- `socketHello` rides the approval fingerprint only when present (`|hello:<greeting>`), so
  existing approvals of pages without one are untouched; adding or changing it re-asks.
- With no greeting, the key rides the upgrade request the way a fetch would (header or query).

## What may be reached

- Only a `device` connection, matched by `covers` (host AND port), approved at the current
  fingerprint, with `access: 'full'` (a look-up-only device never opens a socket).
- `assertHomeHttpUrl` on the address before connecting: home/Tailscale IPv4 only, every
  DNS answer checked. Same DNS-rebind honesty limit as the fetch door (the socket library
  resolves again).
- No redirects: `followRedirects: false`; a 3xx upgrade answer is a refusal.
- Text frames only (binary ignored — it would carry bytes past text redaction).

## Caps

20 messages out, each ≤ 64 KB; `until` 1–50; 1 MB received in total; timeout default 10 s,
max 15 s. Over-cap answers refuse with `reason: 'network'`; shape errors with `'bad-url'`.

## Not a privilege jump

A device connection is already `access: 'full'` with an admin long-lived token that can
call any Home Assistant service over REST (turn anything on/off, run scripts). The socket
reaches the same device with the same key; what it adds is registry edits (names, rooms).
So the approval stays one device, one key. The approval card's device sentence should
still name that it can change settings — draft, not yet shown to Destin:

> **{service}** at {address} — control your devices **and change their names and rooms**.
> Nothing outside your home.

(Only when the connection has a `socketHello`; a device without one keeps today's wording.)

## Files

`src/main/pages/page-socket.ts` (new), `page-connections.ts` (`socketHello`, fingerprint),
`pages-service.ts` (routes `request.socket`), `shared/pages-types.ts`, `page-theme.ts`
(passes `socket`), `PageHost.tsx` (shape check + forward), workbench `mock-shim.ts` +
`fixtures/fake-home-assistant.ts` (pretend socket: area list/create/update, entity rename
and move, device move; template answers carry `device` = the item's device id).
Tests: `tests/page-device-socket.test.ts` (real `ws` server stand-in).

## For the page

- Add `socketHello` to the Home page's `ha` connection.
- Add `'device': device_id(e)` to `ROOMS_TEMPLATE` items (room moves are per device;
  an entity with no device moves with `entity_registry/update` + `area_id`).
- Frames 0–1 are `auth_required` / `auth_ok` (or `auth_invalid` then close): `until` =
  2 + number of commands.
