---
id: 227
title: OneDrive files on Windows: opening a folder downloads online-only files and freezes the app
stage: explore
tags: files, windows, onedrive, bug
related: 93
branch: 227-onedrive-files-on-windows-opening
finish: On a Windows computer with online-only OneDrive files, browsing a project never silently downloads them; opening one asks first; search and folder watching keep working.
created: 2026-11-09
why: Destin 2026-10-18 on a Windows PC: downloads from OneDrive still freeze the computer and app. An earlier fix (youcoded PR #476 draft, youcoded-dev #97, branch session/onedrive-no-auto-download, Sep 15) was never merged: it showed a cloud icon and asked Download and open / Not now, but it also broke Windows content search and folder watching, and is now 2,600 changes behind. Any rebuild starts from that branch, restores search and watching, covers the older file readers, and needs a real Windows + OneDrive test. Found by the 2026-11-09 work inventory.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
