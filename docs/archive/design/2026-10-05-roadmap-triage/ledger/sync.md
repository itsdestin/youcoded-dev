# sync ledger

| # | original (first ~70 chars) | new entry |
|---|---|---|
| 1 | A project where a password file (like `.env`) was uploaded by an older app version | Sync security gaps: three things (a) |
| 2 | Two projects created before 2026-09-23 whose names differ only by capital letters | Sync housekeeping: six leftovers and rare edge cases (a) |
| 3 | If the app crashes in the middle of a sync, the copies it saved of files git doesn't | Sync housekeeping: six leftovers and rare edge cases (b) |
| 4 | The Android app's GitHub backup copies `mcp.json` (which can hold service keys) | Sync security gaps: three things (b) |
| 5 | Very long conversations (over 50 MB) stop updating on your other devices | Very long conversations (over 50 MB) stop updating (standalone) |
| 6 | If a conversation is over the sync size limit on this device AND another device | Sync housekeeping: six leftovers and rare edge cases (c) |
| 7 | A dev copy of the app syncs the same Personal folder as the real app | Sync housekeeping: six leftovers and rare edge cases (d) |
| 8 | "Last synced" on the Backup & Sync self row is the NEWEST time across all your spaces | Backup & Sync panel: three wording and status gaps (a) |
| 9 | With the SyncHub down, force-taking-over a session from a second install | Same conversation on two computers: four gaps (a) |
| 10 | A device that slept past its 300 s lease can come back still writing | Same conversation on two computers: four gaps (c) |
| 11 | Verify whether a conversation resumed on another computer includes the latest helper | Same conversation on two computers: four gaps (d) |
| 12 | Backup & Sync transparency pass on lease handoffs | Backup & Sync panel: three wording and status gaps (b) |
| 13 | The sync worker accepts whatever device id a lease message claims | Sync security gaps: three things (c) |
| 14 | You can open a conversation your OTHER machine is actively working in | Same conversation on two computers: four gaps (b) |
| 15 | Star a model as a favourite on one device and the model picker on your other device | Starring a model as a favourite (model picker empty on other device / fresh install) |
| 16 | Backup & Sync popup follow-ups still owed from the PR #126 redesign | Backup & Sync panel: three wording and status gaps (c) |
| 17 | Legacy conversation-index full retirement | Sync housekeeping: six leftovers and rare edge cases (e) |
| 18 | Decided 2026-09-02: ignore stray `*.tmp` files everywhere | Sync housekeeping: six leftovers and rare edge cases (f) |
| 19 | When two devices edit the same file, the only sign is one amber line | Two devices editing the same file: no way to see or resolve the conflict |
| 20 | Idea: same-machine takeover handoff without the hub | Parked ideas: sync (four things) (a) |
| 21 | Idea: restore-from-backup redesign (removed in Plan 2c) | Parked ideas: sync (four things) (b) |
| 22 | Idea: YouCoded Cloud sync transport | Parked ideas: sync (four things) (c) |
| 23 | Idea: a synced per-device SystemState file | Parked ideas: sync (four things) (d) |
