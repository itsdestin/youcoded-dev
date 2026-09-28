---
status: draft
created: 2026-09-26
topic: The proposed everyday actions (tools), and answers to Destin's deck notes
---

# Everyday actions — the proposal

Follows Destin's answers in `questions.answers.json`, which were:
- Build it.
- All five groups (calendar, email, contacts, files, to-dos).
- Combine all accounts.
- Draft freely; sending and creating need permission by default; configurable.
- Deleting allowed, with heavy warnings.
- Own the Google sign-in.
- Gmail reading starts on the advanced setup.
- Providers: Google, Microsoft, iCloud.
- Keep or retire the old add-ons depending on what they still add.
- Rare tasks stay as the assistant working through commands.
- The same actions everywhere.

Research behind it: `../../investigations/2026-09-26-integrations-rebuild/`.

## 1. How it works, in one picture

```
 You: "move my dentist thing to Friday and tell Sam"
        │
 Assistant picks from ~20 plain actions  ──►  "find events", "save event", "draft email", "send"
        │
 YouCoded (the app) ── knows your accounts, holds the sign-ins, shows permission cards
        │
   ┌────┴─────────────┬──────────────────┐
 Google            Microsoft           iCloud
```

The assistant never sees passwords or sign-in tokens, and never needs to know which company an
account belongs to. The app does the translation.

## 2. Two kinds of action: "prepare" and "do"

This follows your note to let the assistant do as much as possible before asking.

- **Prepare** actions change nothing outside YouCoded: find, read, look up, and *draft*. They
  always run freely. A draft appears as a card in the chat that you can edit.
- **Do** actions change the outside world: send, create or move an event, reply to an invite,
  archive, delete. Each has a permission setting:
  - **Ask me** — the default for all of them.
  - **Allow** — you can switch this on per action, e.g. "let it reply to emails on its own".
  - **Never** — the action isn't offered at all.
- **Deleting** is off until you turn it on. The first time, a full-screen warning says three things:
  1. AI makes mistakes.
  2. Small and open models make more of them, especially with no one checking.
  3. YouCoded can't undo or take responsibility for what gets deleted.

  Emails go to the trash, not erased; events are cancelled.
- A useful side effect: **Gmail drafts need the expensive "restricted" Google permission, but
  YouCoded's own drafts don't.** A draft lives in YouCoded until you press Send, and sending only
  needs the free-review permission. So "write a reply for me" works for every Gmail user from day one.
  It just can't see the email being replied to unless you paste or forward it, or use the advanced setup.

## 3. The proposed actions

Value = how often people will want it × how much it helps. Effort = building it for all three
providers. **Tier 1** is the first release, **Tier 2** follows soon after, **Tier 3** later.

### Always there

| Action | Kind | What it's for | Value | Effort | Tier |
|---|---|---|---|---|---|
| **My accounts** | prepare | Tells the assistant which accounts are connected and what each can do, e.g. "Gmail: send only". It can then explain a limit instead of failing | Essential | Low | 1 |

### Calendar

| Action | Kind | Real requests it covers | Value | Effort | Tier |
|---|---|---|---|---|---|
| **Find events** | prepare | "What's on tomorrow?" · "When's my dentist appointment?" · "What did I have last Tuesday?" · a morning briefing | Highest | Low (all three providers support it well) | 1 |
| **Find free time** | prepare | "When am I free for an hour this week?" · "Find a slot before Friday" | High | Low for your own calendars. Checking *other people's* free time works for Google and Microsoft work accounts only | 1 |
| **Save event** (create or change) | do | "Add lunch with Sam Thursday at noon" · "Move my 3pm to 4" · "Make it repeat weekly" · adding guests (sends invites) | Highest | Medium: repeating events and time zones are the fiddly part | 1 |
| **Cancel event** | do | "Cancel tomorrow's standup" | Medium | Low | 1 |
| **Answer an invite** | do | "Accept the team offsite" · "Decline anything Friday afternoon" | Medium | Low for Google and Microsoft; medium for iCloud | 2 |

### Email

| Action | Kind | Real requests it covers | Value | Effort | Tier |
|---|---|---|---|---|---|
| **Search email** | prepare | "Did Sam reply about the lease?" · "Find the flight confirmation" · "What's unread from today?" | Highest | Low for Microsoft and iCloud. Gmail needs the advanced setup until we pay for Google's audit | 1 |
| **Read email** | prepare | Opens a message or whole conversation, including attachment names | Highest | Same as above | 1 |
| **Save attachment** | prepare | "Save the PDF Sam sent to my Documents" | High | Low | 1 |
| **Draft email** | prepare | "Write a reply saying yes" · "Draft a thank-you to the team" · attach a file | Highest | Low (it lives in YouCoded) | 1 |
| **Send** | do | Sends a draft; you can edit the card first | Highest | Low | 1 |
| **Organize** (archive, mark read, label or move, trash) | do | "Archive all the newsletters" · "Mark these read" | Medium | Medium: Google uses labels, Microsoft uses folders, iCloud uses folders | 2 |

### Contacts

| Action | Kind | Real requests it covers | Value | Effort | Tier |
|---|---|---|---|---|---|
| **Find a person** | prepare | Mostly used by the assistant itself: "email Sam" needs Sam's address · "What's Mom's number?" | High (it makes other actions work) | Low | 1 |
| Add or edit a contact | do | "Save this number as Jake" | Low | Low | 3 |

### To-dos

| Action | Kind | Real requests it covers | Value | Effort | Tier |
|---|---|---|---|---|---|
| **Find to-dos** | prepare | "What's on my list?" | Medium | Low for Google Tasks and Microsoft To Do. **Apple Reminders can't be reached from iCloud** — Mac only (see section 6) | 2 |
| **Save to-do** (add, finish, change) | do | "Remind me to call the bank" · "Mark 'pay rent' done" | Medium-high | Same | 2 |

### Files

| Action | Kind | Real requests it covers | Value | Effort | Tier |
|---|---|---|---|---|---|
| **Find a file** | prepare | "Find last month's budget spreadsheet" | High | Microsoft: easy. Google: searching *all* of Drive needs the paid audit, so at first Google shows only files the assistant made or that you **pick** in a Google file picker. iCloud has no online search — only on computers with iCloud's own app installed | 3 |
| **Read a file** | prepare | "Summarize that doc" · "What's the total in column C?" | High | Medium (converting Docs/Sheets/Word/Excel to text) | 3 |
| **Save a file** | do | "Put this summary in a new Google Doc" · "Upload the report to OneDrive" | Medium | Medium | 3 |

**Count:** 11 in Tier 1, 4 in Tier 2, 4 in Tier 3 — 19 in all, plus the "Advanced request" below. Small models cope with that because the
app offers only the actions that fit the accounts you connected: no to-do actions if you don't use
a to-do app, and deleting only if you turned it on.

### What's NOT covered, and what fills the gap

- **Long-tail work** (spreadsheet formulas, formatting a Doc, Slides, sharing settings, Gmail filters):
  one extra **"Advanced request"** action per provider. It lets a strong model make any request
  Google's or Microsoft's systems allow, within the permissions you granted, through your sign-in,
  guided by skills. It still honors the permission cards. This replaces the old add-ons' 20-odd
  commands without ever handing sign-in tokens to scripts.
- **Instant "new email" alerts** (the old add-on's "watch"): later; needs a background service.

## 4. What the YouCoded Google sign-in looks like in practice

**What you'd see as a user:**
1. Settings → Connections → **Sign in with Google**.
2. Your browser opens Google's own page: "YouCoded wants to access your Google Account", with a
   list: see and edit your calendars · send email as you · see and edit your Docs and Sheets ·
   see your contacts and tasks. Each has a checkbox. You click **Allow**.
   - Before Google approves us, this page first shows a grey "Google hasn't verified this app"
     warning with a small "continue" link, and only the first 100 people ever can connect.
3. Back in YouCoded: **Connected — you@gmail.com**, with a row of ticks: Calendar ✓ Send email ✓
   Docs & Sheets ✓ Contacts ✓ Tasks ✓ · Read email: *needs advanced setup*.
4. That's it. No re-signing every week. It works in every chat, on this computer only. Your
   phone signs in separately, once; a paired phone uses the computer's connection.

**What we'd need to do once:**

| Step | Who | Time |
|---|---|---|
| Create a Google Cloud project under the LLC's Google account | Me (you click through sign-ins) | 1 hour |
| Prove we own **youcoded.ai** (the site's domain), via Google Search Console | Me + you (a DNS record) | 1 hour |
| Write a **privacy policy page** on youcoded.ai. It must say what Google data we touch, that it stays on your device, that it goes only to the AI you chose to answer your request, and Google's required "Limited Use" wording | Me drafting, you approving | A day |
| Consent screen: name, logo, support email, homepage, privacy link, each permission with a reason | Me | Hours |
| Record a **demo video** (unlisted YouTube) showing sign-in and each permission being used | Me, from a dev build | A day |
| Submit, then answer Google's reviewer emails | Me + you (their emails go to the LLC's address) | 4–6 weeks, mostly waiting |
| Build the sign-in into the app (same approach as our existing OpenRouter and ChatGPT sign-ins), with tokens kept in the computer's secure password store | Me | 1–2 weeks with the Connections screen |
| Android: a separate Google registration tied to the app's signing key | Me | Days |

**What it takes on afterwards:**
- Keep the privacy page accurate.
- Re-submit when adding a permission (e.g. Drive search).
- Answer Google if they email.
- There is no yearly fee for this level. The yearly audit applies only if we later add Gmail
  reading or full Drive search.

**Risks to know about:**
- **The AI-provider question (worth raising with Google early).** Google forbids using Google data
  to *train* AI models, but allows sending it to an AI to carry out what the user asked. YouCoded
  lets users pick any AI provider, including ones via OpenRouter, and we can't promise every one of
  them never trains on what it's sent. One developer publicly claimed Google's reviewers objected to
  a competing AI being connected. I couldn't read that post, so it's unconfirmed. Mitigations:
  - say it plainly in the privacy policy;
  - possibly warn when a Google-connected chat uses a provider without a no-training promise.
- **One app for everyone.** If Google suspended it, every user's Google connection would stop at once.
- **Anthropic itself hit walls** getting its Gmail connector approved for the organizing permission (a
  public bug report). That's a reminder that the restricted tier is hard even for big companies.

## 5. Gmail "option C" (app password) explained

Google lets people who have 2-step verification turned on create an **app password**: a
16-letter code for one app that isn't your real password and can be revoked anytime. Email programs
like Apple Mail or Thunderbird can use it to log in to Gmail the old-fashioned way, with the same
standard email protocols email has used for decades.

In YouCoded it would look like this:
1. Settings → Connections → Google → "Let the assistant read Gmail".
2. A short guide opens Google's app-password page (myaccount.google.com/apppasswords).
3. You name it "YouCoded", copy the 16 letters, paste them into YouCoded.
4. The assistant can then search and read all your mail.

**Pros:**
- Free.
- No Google review.
- Works today.
- The same flow iCloud needs anyway, so we build it once for both.

**Cons:**
- An extra fiddly step.
- Only works if 2-step verification is on.
- Some work and school Google accounts turn app passwords off.
- Google has been shrinking password logins for years, so it could disappear.
- Searching is cruder than Gmail's own search, and labels show up as folders.

**How it fits with your choice (the first option):** launch with send-only Gmail plus the advanced
setup for reading. Add this app-password route as the second way to turn on Gmail reading, since
iCloud needs the same machinery anyway. Keep the Apps Script experiment in the background. Pay
Google's audit when enough people use it that one-click reading is worth ~$540–$3,000+ a year.

## 6. Your YouCoded Pages idea (later follow-up)

A YouCoded calendar and to-do Page that merges every provider fits this design well. It also solves
the Apple Reminders gap:
- "Remind me to…" on Windows is saved in YouCoded as a *waiting* item.
- The next time YouCoded runs on your Mac, it's added to Apple Reminders and marked done.
- The Page shows it as "waiting for your Mac" until then.

The same holding space could serve people with no calendar account at all. Suggest filing it as its
own roadmap item once the actions exist.

Note: you left **Android phone calendars** and **Mac Calendar** out of the first version. So Apple
Reminders and Notes won't be reachable at first, even on a Mac, until this or the old Apple add-on covers them.

## 7. Should the old add-ons stay?

| Old add-on piece | Covered by the new actions? | Suggestion |
|---|---|---|
| Google: calendar, send, reply, forward, contacts | Yes | Retire |
| Google: read, search, triage Gmail | Only with the advanced setup | **Keep a slimmed version as the "advanced setup"** for Gmail reading, until the audit or app password makes it unnecessary |
| Google: Sheets, Docs, Slides, Drive upload, moving files between accounts | Via "Advanced request" + skills, through the new sign-in | Rewrite those skills onto the new sign-in; drop the old setup |
| Google: instant new-mail alerts | Not yet | Drop for now; it needs its own Google project anyway |
| Apple: calendar, contacts | Yes (iCloud) | Retire |
| Apple: Reminders, Notes, the Mail app, iCloud Drive on a Mac | No | **Keep as a Mac-only extra** (and fix its likely Mac bug) until the Pages idea covers Reminders |

So neither disappears outright. Google shrinks to "advanced Gmail reading", and Apple shrinks to
"Mac extras". Current users get the one-time "reconnect with the new sign-in" offer.

## 8. Decided 2026-09-27, and still open

- **To-dos:** a follow-up, not the first release (Destin: "we can have to-dos be a follow up").
- **Connections are per device** for now. Syncing them across devices is parked on the roadmap
  (`docs/roadmap/sync.md`). Destin: "i dont want to deal with the risk rn".
- **Still open:** how to handle the AI-provider risk in section 4. Destin found the question
  confusing; it is re-explained in chat and belongs on the next deck.
