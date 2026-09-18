---
status: shipped
date: 2026-09-17
area: app telemetry
---

# The daily heartbeat keeps going while the app is open

## What Destin saw

The analytics page said nobody had been online that day, while the games panel showed a
friend online ten hours earlier. The page counts **devices that checked in**; the games
panel shows **accounts connected right now** (`worker/src/social/presence-room.ts` writes
`users.last_seen_at` continuously). They can never match exactly — a laptop and a phone are
two devices and one friend — but two real defects were making the gap much wider.

## The two defects

1. **The heartbeat fired only at launch.** An app left open for days was counted on its
   first day only.
2. **The device counts days in UTC; the page counted them in Phoenix time.** Someone who
   used the app after 5 PM Phoenix had already spent that UTC day's single check-in, so
   their next-day use (before 5 PM) sent nothing and the page showed them missing. Measured
   live on 2026-09-16: **2 devices by UTC days, 0 by Phoenix days.**

## What shipped

- `startDailyHeartbeat()` (desktop) and the `serviceScope` loop in `SessionService.kt`
  (Android) re-check the clock just after each UTC midnight, **and never wait more than 3
  hours**, because sleep pauses both platforms' countdowns. The wake-up only reads the
  clock; `runAnalyticsOnLaunch()`/`runOnLaunch()` still send at most one heartbeat per UTC
  day.
- The owner dashboard gained a **Local | UTC** switch (`skills/analytics/dashboard/index.html`,
  labelled *Arizona* in Phoenix). UTC re-buckets **existing** data, so it fixes past days
  with no app update; Local stays the default because Destin reads the page in his own
  time.

## Constraints a future session must keep

- **About → Privacy promises "once per day".** Any cadence change that sends more often
  rewrites user-facing copy — that is a product decision, not an implementation detail.
  Destin, 2026-09-17: *"this is a daily heartbeat, I feel like we should be checking very
  infrequently."*
- The Worker rate-limits `/app/heartbeat` to 30/hour per IP, so a chatty client would drop
  check-ins for everyone behind a school or office network.
- Counting improves only as users update; the graph steps up afterwards without real growth,
  and already-missed days cannot be recovered.
