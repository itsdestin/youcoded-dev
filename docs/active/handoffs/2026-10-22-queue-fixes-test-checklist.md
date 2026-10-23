---
status: active
---
# Testing checklist: message queue fixes

Use the window titled **YouCoded - Queue Fixes**, never your normal app. Each prompt is short and cheap. Copy the
grey box exactly. Tick each item as you go and note anything odd beside it (what you did, what you saw).

> Conversations you start in the dev window are real ones and show up in your history like any other.

---

## 1. Quote chips (the original stuck message)

1. Send: `Write two short sentences about the ocean.`
2. When it answers, **select a few words of its reply → "Ask about this"**. A chip appears in your message box.
3. After the chip, type `what does this mean?` and send.

- [ ] Your message appears **the moment you press Send**.
- [ ] The chip shows as a chip in your sent message (not raw text with odd brackets).
- [ ] Claude answers about the words you selected.
- [ ] Nothing appears in the queue strip above the message box, and no "Unconfirmed".
- [ ] Switch to terminal view (Ctrl+`): the terminal's message box is **empty**. Switch back.
- [ ] Press **Ctrl+R** in the dev window to reload it. Your sent message still shows the chip.

## 2. A pasted image

1. Copy any screenshot, paste it into the message box, type `What is in this image? One sentence.` and send.

- [ ] The message appears at once, with the image chip.
- [ ] The bubble shows **no** "Read this entire file" wording.
- [ ] Claude describes the image correctly.
- [ ] Reload (Ctrl+R): the bubble still shows your words and the image chip, with no extra wording.

## 3. An attached document (the one thing not yet proven with real Claude)

1. Drag any `.md` or `.txt` file into the message box, type `Summarize this file in one sentence.` and send.
2. Repeat with a **PDF**: `What is this PDF about? One sentence.`

- [ ] Claude actually opens and summarizes each file (it should not say it can't see one).

## 4. An @ reference (keeps the read instruction, as you chose)

1. Send: `@CLAUDE.md what is the first heading in this file?` (any file in the project folder works).

- [ ] Claude answers with the real heading.
- [ ] Your bubble shows your message (the file name may appear as its full path).

## 5. Hard-to-type characters

1. Send this exactly (it contains invisible joining characters):

```
Repeat back exactly, nothing else: 👨‍👩‍👧 می‌خواهم a‌b
```

- [ ] It sends at once and is not left in the terminal box or marked "Unconfirmed".
- [ ] The family emoji comes back as one family, not three separate people.

## 6. A message with several lines

1. Type the lines below, using **Shift+Enter** between them, then send:

```
First line
Second line
Third line
```

- [ ] It sends at once and shows on three lines.

## 7. Stacking messages while Claude works, then switching to terminal view

1. Send:

```
Run this bash command and then say done: for i in 1 2 3 4 5 6 7 8; do echo $i; sleep 1; done
```

   If it asks permission, press **Yes**.
2. While it is still counting, quickly send these three, one at a time: `Reply with just A` · `Reply with just B` · `Reply with just C`
3. Straight away, switch to **terminal view** (Ctrl+`) and wait there, without clicking anything.

- [ ] The three show in the queue strip as "Queued" before you switch.
- [ ] Without any clicks, Claude handles A, B and C in order. You can watch it happen in the terminal.
- [ ] Back in chat view: no message is left "Queued", "Paused" or "Unconfirmed". Each reply appears once.

## 8. Text left in the terminal's own box

1. Switch to terminal view and type `hello` into Claude Code's box. **Don't press Enter.** Switch back to chat.
2. Send: `Reply with just OK`

- [ ] The message shows in the queue strip with: "Waiting for the message box in the terminal to be empty."
- [ ] Your `hello` is still in the terminal box, untouched.
- [ ] Go to terminal view and delete `hello` (Backspace). Within a few seconds the waiting message sends by itself.

## 9. A permission question right as a message arrives

1. Send: `Run the bash command: date`

- [ ] The permission card appears. Answering **Yes** from the chat works, and Claude shows the date.
- [ ] Afterwards, typing in terminal view still works normally (type a letter, then delete it).

## 10. If you ever see "Unconfirmed" (not easy to cause on purpose now)

- [ ] The row says it may not have reached Claude Code, and that Dismiss puts the words back.
- [ ] **Dismiss** puts the words back in your message box. If the box already had text, a notice says the words were copied to the clipboard.
- [ ] Any messages queued behind it carry on by themselves.

## 11. Optional: from your phone

Connect your phone to the dev window's remote address and repeat items 1, 2 and 7.

- [ ] The same results. On the phone, your message may appear a moment later than on the computer.

---

If anything fails, tell me the item number and what you saw. A screenshot helps. The dev window's log is separate
from your real app's, so I can read it without touching anything of yours.
