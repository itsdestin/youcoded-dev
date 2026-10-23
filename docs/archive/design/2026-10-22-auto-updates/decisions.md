---
status: active
card: 183
---
# Automatic updates — decisions so far

Source: the questions deck answers (`auto-updates.questions.answers.json`, 2026-10-22) plus
Destin's chat follow-up on Q-mac, which the deck left as "confused. explain further."

| Question | Decision |
|---|---|
| Q-switch | "Install updates automatically" switch, beside Get beta builds, in Settings → Help & feedback **and** the update popup. |
| Q-chip | Keep today's yellow pulse; words change to say the update is ready. |
| Q-busy | Restart to update shows the existing close-window prompt (QuitSessionsPrompt, with its resume-sessions choice). Dismissing that prompt cancels the restart. |
| Q-linux | Package installs still download by themselves; the system password box appears only on Restart to update. |
| Q-mac | See below. |
| Q-brake-how | Pull the release's signed list and mark it not-latest; apps re-check before installing. |
| Q-brake-notice | No automatic notice; post through the announcement chip when worth it. |

## Q-mac (chat, 2026-10-22)

Destin: "if auto updates wont work on those devices, we should do something akin to linux with
auto-download but manual click-to-update when ready."

So on a Mac where YouCoded cannot replace itself (the user is not an administrator): the update
still downloads by itself and the chip still says it is ready, but quitting does not install it.
Restart to update then asks for an administrator password through the Mac's own password box,
exactly as Linux package installs do, and installs. If that box is cancelled or fails, fall back to
opening the disk image as today.
