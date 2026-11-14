---
status: draft
date: 2026-11-14
topic: Chats on every device (YouCoded Mesh) — round 15, every choice that needs Destin after Phase 0
---

# Round 15: what the investigations found that needs you

Written for Destin, no code knowledge needed. Source: the Phase 0 reports in
`docs/active/investigations/2026-11-14-mesh-phase0/` and your round 14 answers. Nothing here
has been decided or built. Section 2 of `design.md` (your decisions) was not changed; where a
finding goes against it, the choice below says so.

Words used: "the relay" is YouCoded's always-on waiting room that holds chats for devices that
are off; it cannot read them. "Your other devices" are the devices you have paired.

**How this is organised.** 35 choices on five pages:
page 1 Pairing and security (13), page 2 Chats and versions (14), page 3 Project files (3),
page 4 Relay and cost (3), page 5 Testing (2). Each has Today, Problem, Proposal, Options (one
marked "recommended" at most, with the reason) and, where engineering could otherwise just pick,
one line on why this cannot be decided for you.

**Not on this deck, being settled elsewhere:** (a) whether chats can ever be rewritten by the
assistant's own program in a way that needs a second "segment" copy; (b) the replacement rules for
deciding who hosts a chat when devices disagree. Their questions to you, if any, will be added
by the people settling them. Two of your own earlier answers are re-asked here in plainer words:
C-1 (pictures, from U-15) and P-5 (computers with no unlock, from Q-2).

---

## Page 1: Pairing and security

### P-1. What should the typed pairing code look like?

**Today.** The design says you can type a short code when there is no camera, and that it
expires after a few minutes. It does not say how long or what characters.

**Problem.** Short and all-numbers is easy to type but easier for a stranger to guess while
you are pairing. Mixed letters and numbers are safer but awkward on a phone's number pad.

**Proposal.** A code like `K7QD-4MXW9R`: the first part says where to meet, the last 6
characters are the secret (no look-alikes such as 0/O or 1/I). It works for 5 minutes and
burns after 3 wrong tries.

**Options.**
- **A. Letters and digits, 6 secret characters (recommended).** Pro: a stranger on the network
  guesses it about 1 time in 358 million, far stricter than other apps that do this. Con:
  letters are awkward on a number pad. Recommended because it is the safest and still short.
- **B. 8 digits only.** Pro: easy on a number pad, easy to read out. Con: about 1 in 33
  million, weaker, longer to read.
- **C. 6 digits only.** Pro: shortest. Con: about 1 in 333,000, which is the weakest that meets
  the minimum we set.

**Why this cannot be decided for you.** It is what you will type on your phone every time.

### P-2. Should both screens show the same short number when pairing?

**Today.** The device already in your set shows the new device's name and asks "Add this
device?". Nothing proves the name is really yours.

**Problem.** Someone who read your code over your shoulder (or from a camera) could pair first
and call their device anything, for example "Destin's phone". You would tap yes.

**Proposal.** After pairing by typed code, both screens show the same 4-digit number and you
confirm they match before "Add this device?" can be answered. (The threat review asked for the
same step.)

**Options.**
- **A. Add the matching number (recommended).** Pro: a stranger's screen is not in front of
  you, so they cannot be added. Con: one extra step every time you pair. Recommended: pairing
  happens rarely and the extra step is a few seconds.
- **B. No matching number.** Pro: one step fewer. Con: your only protection is that a name is
  shown, and an attacker chooses the name.

**Why this cannot be decided for you.** It is a new visible step you have not approved.

### P-3. A Linux computer with no password keyring: refuse, or warn?

**Today.** The design says keys are kept in the computer's secret store.

**Problem.** Some Linux computers have none. Then the app can only hide the keys with a
password built into the app, which any program on that computer can read. The keys let someone
read all your chats and make your assistants run commands on your other devices.

**Proposal.** The mesh refuses to turn on and explains how to set a keyring up.

**Options.**
- **A. Refuse and explain (recommended).** Pro: no weakly protected keys exist. Con: a Linux
  user without a keyring cannot use the feature until they fix that. Recommended because the
  keys are far more powerful than a sign-in token.
- **B. Turn it on and show a warning (like the GitHub sign-in today).** Pro: works everywhere.
  Con: less safe, and many people ignore warnings.

**Why this cannot be decided for you.** It decides who can and cannot use the feature.

### P-4. What may the app say about "encrypted"?

**Today.** The design allows "end-to-end encrypted" at launch if the audits pass.

**Problem.** Some honest limits exist: someone who copies what the relay holds and later steals
one of your unlocked devices can read the last few weeks of what passed through it; any program
running as you on a device can use that device's keys; backups to GitHub, Drive and iCloud are
not locked by default. Wrong claims are worse than none.

**Proposal.** Use only this sentence: "Your chats and project files are encrypted on your devices
with keys that never leave them. YouCoded's servers and Cloudflare store only encrypted data and
cannot read it." Never say "zero-knowledge", "safe if your phone is stolen", "your backups are
private" or "nobody can run commands on your computer".

**Options.**
- **A. Approve that sentence (recommended).** Pro: true and checkable. Con: less punchy.
- **B. Use the stronger "end-to-end encrypted" wording by itself.** Pro: familiar. Con: readers
  assume things that are not true.
- **C. Make no encryption claim until the outside-style audit is done.** Pro: safest. Con: loses
  a selling point.

**Why this cannot be decided for you.** It is launch copy about trust.

### P-5. A computer that has nothing to ask for an "unlock": what should YouCoded do? (asked again, plainly)

You answered "kinda confused about what the point even is of the password thing on some devices
with option a?" Here is the whole picture.

**Today.** The design says adding or removing a device needs the computer's own unlock first
(fingerprint, PIN or password, Windows Hello, Touch ID, Android lock). The investigation found
this does not work out of the box on any system: Windows, Mac and Android each need new code;
Linux's built-in window needs an administrator account and uses a generic message. And some
computers simply have nothing to ask: a Mac without Touch ID, a Windows PC with no sign-in set
up, a phone with no screen lock, a Linux computer with no prompt program. (Only Linux could be
checked here.)

**Problem.** What is the unlock for? It stops a stranger or a bad program sitting at your
already-logged-in computer from quietly adding their own device to your set. On a computer with
nothing to ask, we need a stand-in.

**Proposal.** Use the real unlock wherever the computer has one; on the rest, use option 1.

**Options.**
- **1. Ask inside YouCoded and warn your other devices (recommended).** A confirm window ("Add
  this device? Only continue if this is you") and your other devices immediately show "A device
  was added from X". Pro: works on every computer with no setup; the notice means nothing is
  quiet. Con: someone sitting at your open, unlocked computer can still add a device; you only
  hear afterwards.
- **2. YouCoded asks you to make its own password on those computers.** (This is the "password
  thing": it exists only for computers with nothing built in.) Pro: stops the person at your
  open computer. Con: one more password to remember, a reset path to build, an extra setup
  screen for a rare case.
- **3. Refuse.** On such a computer, adding or removing a device is not allowed; use another
  device. Pro: simplest and strictest. Con: a person with only such computers is locked out of
  managing devices.

Also needs your yes: on Linux the unlock window will say the system's generic words ("run
/usr/bin/true as the super user"), not YouCoded's.

**Why this cannot be decided for you.** It changes what you must type or confirm.

### P-6. Can another device tell your computer "always allow"?

**Today (2.1 says permission requests can be approved from any device).** If a box asks to run
something and you tap "Allow always" on your phone, the computer remembers that for good.

**Problem.** A stolen or misused phone could quietly widen what your computer is allowed to do.

**Proposal.** From another device you can only answer "allow once" or "no". "Always allow" has to
be tapped on the computer itself.

**Options.**
- **A. Allow once or no from other devices (recommended).** Pro: a lost phone cannot widen
  permissions. Con: one extra trip to the computer.
- **B. Keep as designed (anything, from anywhere).** Pro: no trip. Con: the quiet widening above.

**Why this cannot be decided for you.** It narrows something you approved.

### P-7. A per-chat switch: "Let my other devices type into this chat"

**Today.** Any of your devices can type into a chat running on another.

**Problem.** If your computer is set to skip permission boxes, then every device you own becomes
a remote control for a computer that never asks before running commands.

**Proposal.** One switch per chat, and it is turned off automatically when that computer is
set to skip permission boxes.

**Options.**
- **A. Add the switch (recommended).** Pro: a computer that never asks cannot be driven from
  elsewhere by accident. Con: one more setting; you must turn it on for those chats.
- **B. No switch.** Pro: simpler. Con: that accident is possible.

**Why this cannot be decided for you.** It is a new setting and it can block something you
expect to work.

### P-8. An extra tap for risky approvals from a phone

**Today.** Approving a request on a phone takes one tap.

**Problem.** Phone screens make careless approvals easy, and an assistant reading a bad web page
can ask for something harmful (change files outside your project, download and run something,
touch your passwords).

**Proposal.** For that kind of request from another device, an extra "This can change files
outside your project. Approve?" tap, and on a phone, the phone's unlock.

**Options.**
- **A. Add the extra tap (recommended).** Pro: slows the most dangerous mistakes. Con: slower.
- **B. Keep one tap.** Pro: fast. Con: an easy mistake on a small screen.

**Why this cannot be decided for you.** It adds friction to something you approved.

### P-9. "Keep this chat on this device only"

**Today.** Everything that syncs goes to every device, and into backups you turn on.

**Problem.** If you paste a password or key into a chat, it travels to all devices and backups.
There is no way to keep one chat private to one device.

**Proposal.** An optional per-chat switch: never synced, never in a backup.

**Options.**
- **A. Add it, optional (recommended).** Pro: the only way to keep a secret out of other devices
  and backups. Con: that chat is lost if the device is lost and cannot be continued elsewhere.
- **B. Do not add it.** Pro: simpler. Con: no way to protect such a chat.

**Why this cannot be decided for you.** It is a new feature with a real downside.

### P-10. Two devices remove each other at the same moment: what happens?

Three of the investigations disagree, so this is yours.

**Today.** The design says the device that has been in your set longer wins.

**Problem.** A thief holding your oldest, unlocked device could remove your newer phone and win,
and you would lose the race by design. Counting "longer" also has no clock-free meaning.

**Proposal.** One of the options below.

**Options.**
- **A. Both are removed; a third device is untouched; with exactly two devices the set splits
  into two sets of one that you can pair again (threat review; recommended).** Pro: a thief cannot
  win the race. Con: a real removal tapped at the same moment as another leaves both out until
  you pair again.
- **B. A fixed order decides, based on when each device was added (one investigation's rule).**
  Pro: one answer everywhere. Con: a device you did not mean to remove can vanish until you add
  it again.
- **C. The design's old rule (longest in the set wins).** Pro: simple. Con: a thief with your
  oldest device wins.

**Why this cannot be decided for you.** Every option can lose a device you wanted to keep.

### P-11. How should a device be identified? (a finding against section 2)

**Today.** 2.4 says "a device is identified by the id the app already gives each machine", and
you approved reinstalls recognising a machine by that id.

**Problem.** That id is already sent unscrambled to YouCoded's existing sync service, and the
analytics scrambling uses a value published in the open-source app, so anyone holding that data
could tie your devices to your set. A reinstall that keeps its data is still recognised, because
it keeps its secret keys.

**Proposal.** Identify a device by a number made from its own public key, and do not use the
machine id at all.

**Options.**
- **A. Use the key-made number (recommended).** Pro: cannot be linked to other records; a
  reinstall with data intact keeps it. Con: it changes a line you approved.
- **B. Keep the machine id, as written.** Pro: no change to what you approved. Con: your set
  could be linked to analytics, and a wiped-then-reinstalled device is still a new device either
  way.

**Why this cannot be decided for you.** It contradicts section 2.4.

### P-12. Joining two sets of devices: must both sides say yes? (a finding against section 2)

**Today.** 2.4 says pairing a device that already has others joins the two sets into one, and
the screen names every device that will end up together.

**Problem.** If someone tricks you into scanning their code, your whole set could be merged into
theirs on one tap, and everything on every listed device becomes readable to every other.

**Proposal.** Joining needs your unlock and an explicit yes on both sides, each screen listing
every device of both sets with name, platform and a short fingerprint. A device that was off is
asked on its next start and can refuse (it stays in its old set).

**Options.**
- **A. Both sides confirm (recommended).** Pro: no one-tap merge. Con: more steps and a device
  that was off waits for its own yes.
- **B. As designed (one side's tap, screen lists devices).** Pro: simpler. Con: the trick above.

**Why this cannot be decided for you.** It changes a flow you approved.

### P-13. What happens to a removed device's unsent work? (a finding against section 2)

**Today.** 2.4 says removing a device locks it out and anything it wrote and had not sent "is
lost unless it is paired again". The deeper rules cannot actually bring it back.

**Problem.** A laptop in a drawer for 33 days holds 3 days of finished replies it never synced.
You tap yes on the 30-day offer and those replies are gone, with no warning.

**Proposal.** Removal never deletes: the unsent replies stay on the removed device and on any
device that holds them, hidden. The removal screen first says "Last seen 33 days ago. It may
hold replies that never synced; they are kept aside and can be added back as versions if you
pair it again. Remove anyway?" Pairing it again offers them back.

**Options.**
- **A. Keep aside and offer back, with the warning (recommended).** Pro: no cliff; nothing is
  lost silently. Con: a longer warning; a bit more storage.
- **B. As designed (lost unless paired again, no warning).** Pro: simpler. Con: silent loss.
- **C. Keep aside but add the replies back automatically on pairing.** Pro: no question. Con: a
  hostile removed device could then re-add anything it forged.

**Why this cannot be decided for you.** It rewrites a sentence of section 2.4.

---

## Page 2: Chats and versions

### C-1. Pictures in a chat: do they travel to your other devices? (asked again, plainly)

You answered "kinda confused about the risks/benefits here?" Here is what is actually going on.

**Today.** When you paste a picture into a chat, the picture is saved inside the chat's own
record, so it is already part of the chat. YouCoded also keeps a separate temporary scratch copy
of pasted pictures on the device where you pasted it.

**Problem.** Your answers were read together as: the picture that is part of the chat travels
with the chat; only the scratch copy stays behind. This affects what you see on another device
and how much data a phone uses.

**Proposal.** Pictures inside a chat travel with it. The scratch copy does not.

**Options.**
- **A. The chat's pictures travel, the scratch copy does not (recommended).** Pro: another
  device shows the picture and the assistant there still knows what was in it. Con: pictures
  are large, so chats take more space and a phone on mobile data (it syncs everything) uses
  more; anyone with a device or backup can see those pictures.
- **B. No pictures travel.** Pro: smaller, faster, less private data spread around. Con: other
  devices show a gap where a picture was, and the assistant there loses what it only knew from
  the picture.

**Why this cannot be decided for you.** It trades privacy and data use against continuity.

### C-2. Does a chat that ended on an error count as a finished reply?

**Today.** When you continue a chat on another device, it carries on from the last finished reply.

**Problem.** In 224 of your 1,364 Claude Code chats the last thing is an error message
("something went wrong, try again"). The app treats that as finished, but you never saw an
answer.

**Proposal.** An error does not count; go back to the previous finished reply.

**Options.**
- **A. Error is not finished (recommended).** Pro: you never inherit a reply you never saw.
  Con: a retry that already happened may be dropped and redone.
- **B. Error is finished.** Pro: simple. Con: the new device continues from a failure.

**Why this cannot be decided for you.** It decides what "where I left off" means.

### C-3. A chat only opened and closed on a second device: the same chat?

**Today.** If two devices' copies of a chat differ, you get a "two versions" notice.

**Problem.** Just opening and closing a chat on another computer adds a few housekeeping lines
(title, last-prompt) with no new message. That happened to 5 of your chats, and would trigger a
notice with nothing for you to choose.

**Proposal.** Treat it as the same chat, no notice. The few housekeeping lines of the quiet copy
are dropped when the other copy wins.

**Options.**
- **A. Same chat, no notice (recommended).** Pro: no noise. Con: those few lines are lost.
- **B. Always show "two versions".** Pro: loses nothing. Con: noisy, and nothing to choose.

**Why this cannot be decided for you.** It decides when you are bothered with a notice.

### C-4. Attaching a file with the paperclip from a computer that is only watching a chat

**Today (2.1: a watcher has the limits a phone has).** A phone uploads the file to the computer
running the chat. A computer that is only watching would pick a file from its own disk, which
the other computer cannot open. The "not supported from a remote client" wording does not
exist yet.

**Problem.** Either it works like the phone, or it becomes a limit you can run into.

**Proposal.** Upload the file to the chat's computer, like the phone does.

**Options.**
- **A. Upload like the phone (recommended).** Pro: nothing lost; same behaviour as the phone.
  Con: more to build.
- **B. List it as a limit.** Pro: simpler. Con: a real feature loss on a computer.

**Heads-up, not a choice.** Dragging a file into the message box may already do nothing on the
desktop (not run here); if confirmed it is a separate bug.

**Why this cannot be decided for you.** It changes what you can do on a watcher.

### C-5. Show "12 chats exist only on this device", and what "keep recent" may delete

**Today.** On "recent" a device may clear old chats once another device has them.

**Problem.** Two "recent" devices can each clear the old chat because the other "has" it; if the
only real copy then dies, the chat is gone. A wiped (uninstalled) phone still counts for up to 30
days.

**Proposal.** A device clears a chat only if a keep-everything device that is currently on
confirms it truly holds it. If none is reachable, nothing is cleared and the user is told the
disk is filling. A device with only "recent" friends shows "N chats exist only on this device".
After a reinstall, the app asks "restore from your other devices or cloud backup?".

**Options.**
- **A. All of that (recommended).** Pro: no silent loss; honest about risk. Con: one more line
  on screen; a "recent" phone may fill up if no keep-everything device is on.
- **B. Keep the designed rule.** Pro: phones stay tidy. Con: the loss above.

**Why this cannot be decided for you.** It changes what "keep recent" promises.

### C-6. Deleting many chats at once: wait a day before erasing elsewhere?

**Today (2.1).** Deleting a chat deletes it everywhere, kept 30 days in "Recently deleted".

**Problem.** One mis-tap, or a bad device, could delete 212 chats and every device would purge
them 30 days later with nothing to stop it. It is the most destructive action with the weakest
guard.

**Proposal.** More than 5 chats within 10 minutes (or any chat used in the last 7 days) is held
24 hours on your other devices with "Phone deleted 212 chats. Undo?" before anything is erased.

**Options.**
- **A. 24-hour hold with Undo (recommended).** Pro: a mistake can be undone. Con: other devices
  keep the chats a day longer.
- **B. As designed.** Pro: immediate. Con: no safety net.

**Why this cannot be decided for you.** It changes how delete behaves.

### C-7. When the assistant's program rewrites a chat file, keep the old full copy?

**Today.** The design keeps such an old copy 30 days on that one device and nowhere else.

**Problem.** That old copy would be the only full history, deleted after 30 days.

**Proposal.** Keep it, copy it to your keep-everything devices, and show its size in "Check sync"
with a button to free it.

**Options.**
- **A. Keep and copy (recommended).** Pro: never lose full history. Con: some extra disk.
- **B. Delete at 30 days.** Pro: tidy. Con: loses the only whole copy.

**Why this cannot be decided for you.** It is a storage-versus-safety trade.

### C-8. A notice when work was typed in a terminal on a device that is not hosting the chat

**Today.** Such work is invisible to the mesh and would be replaced when that device later hosts.

**Problem.** The work could vanish.

**Proposal.** Keep it as a separate version and show "Lines written here outside the app were
kept as a separate version."

**Options.**
- **A. Keep and notify (recommended).** Pro: nothing is lost. Con: one more notice, rarely.
- **B. Do nothing.** Pro: quiet. Con: that work is lost.

**Why this cannot be decided for you.** It is a new notice.

### C-9. A chat the devices cannot yet agree on

**Today.** It keeps showing its last host with no notice, and you cannot tap Continue here. It can
last until one particular device is switched on.

**Problem.** You might be stuck for days.

**Proposal.** Show "Checking with Desktop before this chat can move" and allow Continue here after
a short wait.

**Options.**
- **A. Leave it.** Pro: simple. Con: stuck for days.
- **B. Show "checking" and allow Continue here after a short wait (recommended).** Pro: keeps the
  promise you can always continue. Con: may create a second version.
- **C. Always allow Continue here at once.** Pro: fastest. Con: the most second versions.

**Why this cannot be decided for you.** It decides how often you see second versions.

### C-10. Deleting a chat that secretly had a second version

**Today.** If you delete a chat before hearing that a second version exists, only the first is
deleted and the second stays in your list.

**Problem.** A "deleted" chat can reappear.

**Proposal.** Leave it, and label the row so it does not look like a ghost.

**Options.**
- **A. Leave the second version, labelled (recommended).** Pro: nothing you had not seen is
  deleted. Con: a deleted chat can reappear.
- **B. Delete it too.** Pro: no surprise. Con: replies you never saw are erased.

**Why this cannot be decided for you.** It decides whether unseen work is ever erased.

### C-11. A new place the "Two versions" row will appear

**Today.** If you tap the host chip while another device takes over from an older copy at the
same moment, the other device's new reply used to be lost silently.

**Proposal.** It becomes a second version, shown in the existing "Two versions" row.

**Options.**
- **A. Yes, show it (recommended).** Pro: keeps "never thrown away". Con: occasionally a row you
  did not expect.
- **B. No.** Pro: fewer rows. Con: that reply is silently lost.

**Why this cannot be decided for you.** It adds a notice in a new situation.

### C-12. Which of two versions is "the original"?

**Today.** The one with the lower hidden number keeps the chat's name and place, and that can
switch sides when a third device reports.

**Proposal.** Leave it until it is seen to matter.

**Options.**
- **A. Leave as is (recommended).** Pro: no new clock to build. Con: the name can switch sides.
- **B. The version your device ran most recently is the main one.** Pro: matches intuition. Con:
  needs a display-only clock and is not simple.

**Why this cannot be decided for you.** It is about which row you see first.

### C-13. After removing a lost device, another device may look "unknown" for a while

**Today.** If the device you used to remove one had not yet heard about a newer device, the newer
one shows as "unknown" until it reconnects.

**Proposal.** Show "checking" for up to the 30-day window instead of hiding it.

**Options.**
- **A. Show "checking" (recommended).** Pro: honest, nothing seems gone. Con: a row that looks
  half-finished.
- **B. Hide it until it reconnects.** Pro: tidy. Con: you think a device vanished.

**Why this cannot be decided for you.** It is wording and what you see on the Devices screen.

### C-14. Quitting when only the relay holds your last reply (a finding against section 2.6)

**Today.** 2.6 lets the app quit at once if every finished reply reached "another device, the
relay or the super-host".

**Problem.** The relay is a waiting room: it can let a chat go overnight when it is full. If the
phone is the only other holder and you uninstall or hand it in believing the reply is safe, the
reply may exist nowhere else.

**Proposal.** "Reached the relay" counts as "waiting", not "safe", until a keep-everything device
collects it, and the list says what exists where.

**Options.**
- **A. Count the relay as waiting, and say so (recommended).** Pro: honest. Con: "Offline - some
  chats may not have synced" can show a little more often.
- **B. As designed.** Pro: fewer messages. Con: false safety.

**Why this cannot be decided for you.** It changes a line you approved.

---

## Page 3: Project files

### F-1. Project files that can run things: held for you to look at? (a finding against section 2.8)

**Today (2.8).** Changes to different files combine by themselves.

**Problem.** A changed `.claude` setting, a connected-tools file or a page can make a computer run
commands the next time it starts. One crafted file from a stolen or removed device is the most
direct way to command your computer. Pages that arrive from another device are small apps that
would run inside YouCoded.

**Proposal.** Files that can run things are never replaced automatically from another device.
They are kept beside yours as `name (from Device, date)` with a notice. At minimum the first
arrival after pairing needs your unlock. Pages from another device wait for "This page came from
Laptop. Run it?".

**Options.**
- **A. Hold for review (recommended).** Pro: removes the most direct route to commands on your
  computer. Con: a changed setting or hook does not reach your other computers by itself.
- **B. Only the first arrival after pairing asks for your unlock.** Pro: less friction. Con: weaker.
- **C. As designed.** Pro: seamless. Con: the route above stays open.

**Why this cannot be decided for you.** It breaks "files combine by themselves".

### F-2. More "(from Device, date)" copies when three devices catch up at once

**Today.** When files clash, both are kept.

**Problem.** The safe way to merge three devices saved every version in a test; the easy way
silently lost a version in 4 of 1,000 runs. The safe way makes about half again as many copies.

**Proposal.** Keep it safe.

**Options.**
- **A. Safe (recommended).** Pro: no version lost. Con: now and then one more copy file.
- **B. Easy.** Pro: fewer copies. Con: it can lose a version.

**Why this cannot be decided for you.** It is how many extra files you see.

### F-3. One device renames a file while another edits it

**Today.** Not said.

**Problem.** You will see two files: the old name with the edit, and the new name with the old
text. Nothing is lost.

**Proposal.** Accept it. Joining them would need guessing at renames, which can differ between
computers.

**Options.**
- **A. Accept two files (recommended).** Pro: predictable. Con: you must join them yourself.
- **B. Guess and join them.** Pro: one file. Con: guesses can differ and go wrong.

**Why this cannot be decided for you.** It is what you see in your files.

---

## Page 4: Relay and cost

### R-1. Move the relay to the paid Cloudflare plan before it is public?

**Today (2.5).** The relay is "free at the limits".

**Problem.** The free plan only covers roughly 5 heavy users, or 50 medium ones. When its daily
allowance runs out, the relay stops for everyone until midnight UTC and, because it shares the
account, YouCoded's sign-in and marketplace go down too. A phone showing "offline" within 30
seconds also needs a heartbeat every 10 seconds (a little battery).

**Proposal.** Move to the $5-a-month plan before the relay is public; about $5 to $20 a month up
to 1,000 users, more if people park lots of data. Users see no difference; you pay. Payment by
users stays open (O2).

**Options.**
- **A. Pay $5 a month before it opens (recommended).** Pro: no surprise outage; real room to grow.
  Con: a monthly cost.
- **B. Stay free and keep a small waiting list.** Pro: no cost. Con: a few busy users can take
  sign-in and marketplace down.

**Why this cannot be decided for you.** It is your money and your risk.

### R-2. Abuse protection: a small starting allowance, or a sign-in?

**Today (2.5).** No sign-in; at most 1 GB per set.

**Problem.** Anyone can create a set and park up to 1 GB. A thousand of them would cost about
$199 a month and, on the free plan, fill everything.

**Proposal.** A new set starts with 100 MB until a second device pairs, then 1 GB; an overall
ceiling refuses new sets; sets are slowed per network address. A person with one device who
sends more than 100 MB before pairing a second sees "Relay full" earlier (nobody to sync to yet).

**Options.**
- **A. Starting allowance, no sign-in (recommended).** Pro: keeps "no account". Con: the early
  "Relay full" for one-device users.
- **B. Add a sign-in now.** Pro: the real fix. Con: you decided no sign-in unless abuse appears.

**Why this cannot be decided for you.** It touches your "no account" rule.

### R-3. When does "Relay full" show, and what does it say?

**Today.** At 1 GB the relay lets go of whole chats, oldest unused first, and the host shows
"Relay full. 3 older chats are kept only on Desktop until Phone and Desktop are on together."

**Problem.** On the free plan the real limit is about 900 MB, and "waiting for all devices" can
read as a problem when a rarely-used device is simply off.

**Proposal.** Keep the wording; on the free plan it appears at about 900 MB, on the paid plan
at 1 GB; the message names what is waiting for what.

**Options.**
- **A. Keep, tell the truth about what is waiting (recommended).** Pro: honest. Con: longer text.
- **B. Hide it when the cause is just a device that is off.** Pro: calmer. Con: you do not learn
  your chats are only on one device.

**Why this cannot be decided for you.** It is wording you will read.

---

## Page 5: Testing

### S-1. The sleep tests on your desktop: set it up?

**Today.** The test for "does a reply stop acting while the computer sleeps" was only simulated on
Linux; nothing real. You said your desktop is better, because we can wake it over the network
and manage it by ssh while this laptop stays awake.

**Problem.** Until it is set up, sleep and wake cannot be tested for real.

**Proposal.** You (or I with your yes) set up ssh and wake-over-network on the desktop; it is a
system change on your computer.

**Options.**
- **A. Set it up and test there (recommended).** Pro: real sleep tests on Linux. Con: a system
  change on your desktop and some of your time.
- **B. Test on this laptop.** Pro: no setup. Con: you said the desktop is better; a laptop
  asleep also stops me.
- **C. Skip for now.** Pro: nothing to do. Con: the main claim about sleep stays unproven.

Also: the separate long-lived Claude sign-in you chose (Q-4) must be made once by you, and your
own sign-in on this laptop ends between 20 and 23 November.

**Why this cannot be decided for you.** It needs your hardware and permission.

### S-2. Windows and Mac are unproven: what is required before the release?

**Today.** Only Linux (this laptop, your desktop, and a phone "in theory") can be tested. The
unlock prompts, key storage, case-insensitive file names, real sleep and the phone's behaviour on
Windows and Mac have never been run.

**Problem.** The one release goes to everyone, including Windows and Mac users.

**Proposal.** Label every Windows or Mac claim "unproven" in the design and the release notes
until tested.

**Options.**
- **A. Release only when tested somewhere real for each system (recommended).** Pro: no surprise
  for those users. Con: needs a Windows and Mac test device or a helper.
- **B. Release anyway, labelled "not yet tested on Windows or Mac".** Pro: ships. Con: those users
  may hit failures first.
- **C. Make the first release Linux and Android only.** Pro: honest and small. Con: changes your
  "one release for everyone".

**Why this cannot be decided for you.** It sets who the release is for.
