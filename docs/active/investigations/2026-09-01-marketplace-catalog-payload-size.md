---
date: 2026-09-01
status: active
type: investigation
topic: GET /catalog sends the whole catalog, card and detail data alike, on every refresh
---

# The catalog payload — two shrink-it items

`GET /catalog` (`wecoded-marketplace/worker/src/catalog/routes.ts`) returns every live listing
in one body — ~4,200–5,000 rows, 4–6 MB raw, ~1 MB on the wire (Cloudflare Brotli-compresses
Worker responses; measured 2026-08-31). It serves a pre-built KV object with a D1 fallback,
and the only narrowing it supports is an `ETag`/`If-None-Match` 304 when nothing changed.
<!-- claim: {"path": "wecoded-marketplace/worker/src/catalog/routes.ts", "contains": "catalogRoutes\\.get\\(\"/catalog\", async"} -->

## 1. Send only what changed (delta)

One listing changing anywhere makes every client re-download all of it, so a refresh costs
proportional to catalog *size*, not to what moved. A `GET /catalog?since=<version>` returning
rows written after that version plus the ids retired since would make a refresh a few KB.
The pieces exist: `catalog_items.updated_at` records content changes only (never "last
seen"); retirement is a `deprecated` flag rather than a delete, so tombstones already exist;
the `catalog_meta` version counter is already the client's cursor. Needs: a `version` stamp
per row, the delta route, and a client-side merge on **both** platforms (the app replaces its
cache wholesale today). Not urgent at ~5,000 rows; the unlock at ~20,000, where the KV object
hits its 25 MB value limit anyway.

## 2. Split card data from detail data

A grid card needs name, blurb, kind, three badges and two counts. The detail page needs
capabilities, scan findings, licence, pinned commit and the member list. `GET /catalog` sends
both for every row, so most of what travels is for pages nobody opens. A slim list payload
with the rest fetched on open cuts the payload several-fold; `GET /catalog/:id` already
returns the full entry, so half of this is built. Do this **before** any paging work — paging
a list the client filters locally does not help until the client stops needing all of it.

Either alone helps; both together decouple refresh cost from catalog size entirely.

History: both added 2026-08-31 (old ROADMAP L918, L921). Re-checked 2026-09-01: no `since`
parameter and no slim variant on the route.
