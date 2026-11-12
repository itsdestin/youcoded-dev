---
id: 210
title: Buddy tray icon stays after turning Minimize to tray off (Linux)
stage: explore
priority: P3
tags: buddy, desktop, bug, linux
related: 85
vision: yours.look.buddy
branch: 210-buddy-tray-icon-stays-after
created: 2026-10-31
why: toggling the minimize to tray option off makes the floater come back, but doesnt remove the tray icon. its supposed to swap back and forth, but ends up just leaving both
---
Progress
Done: Cause found 2026-10-31 (Electron 41.10.7, KDE): BuddyWindowManager.hide() does call tray.destroy(), and the app's tray object is gone, but KDE's StatusNotifierWatcher keeps the entry until the whole app process exits, because Electron registers the icon on the app's one shared D-Bus connection and never drops it. Reproduced outside YouCoded with a 15-line Electron script (busctl RegisteredStatusNotifierItems: still listed after destroy; object answers 'Method is no longer available'). Re-creating a Tray revives the same entry, so toggling never stacks icons. No upstream Electron fix found. 2026-11-11 chat-engine batch: retested stand-alone on Electron 44.10.0 (the app's version since 2026-11-04), KDE Plasma 6.7.5 Wayland: tray.destroy() now removes the icon from the panel at once (3 of 3 runs, plus re-create and destroy again). Electron 44 gives each tray icon its own bus name and releases it. The D-Bus rewrite and new library are NOT needed.
Next: Destin to confirm on a real build (1.3.4 or later, Electron 44): turn Minimize to tray off and see the icon leave. An isolated dev copy has no tray, so it could not be checked there. Then close; remove the stale comment at buddy-tray.ts:101-106.
Blocked: nothing.

Chats
