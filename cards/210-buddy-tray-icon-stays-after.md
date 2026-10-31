---
id: 210
title: Buddy tray icon stays after turning Minimize to tray off (Linux)
stage: explore
tags: buddy, desktop, bug, linux
related: 85
vision: yours.look.buddy
branch: 210-buddy-tray-icon-stays-after
created: 2026-10-31
why: toggling the minimize to tray option off makes the floater come back, but doesnt remove the tray icon. its supposed to swap back and forth, but ends up just leaving both
---
Progress
Done: Cause found 2026-10-31 (Electron 41.10.7, KDE): BuddyWindowManager.hide() does call tray.destroy(), and the app's tray object is gone, but KDE's StatusNotifierWatcher keeps the entry until the whole app process exits, because Electron registers the icon on the app's one shared D-Bus connection and never drops it. Reproduced outside YouCoded with a 15-line Electron script (busctl RegisteredStatusNotifierItems: still listed after destroy; object answers 'Method is no longer available'). Re-creating a Tray revives the same entry, so toggling never stacks icons. No upstream Electron fix found.
Next: Recommended fix: on Linux only, serve our own StatusNotifierItem (+ dbusmenu for the 3-item menu and the theme icon) on a private D-Bus connection, so closing it removes the icon at once; needs a D-Bus library (e.g. dbus-next). Rejected: a helper Electron process holding the tray (measured ~200 MB PSS). Fallback: on Linux, say in the setting that the icon clears on restart. Windows/macOS untested, probably unaffected.
Blocked: nothing.

Chats
