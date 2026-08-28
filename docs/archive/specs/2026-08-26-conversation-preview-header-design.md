---
status: shipped
created: 2026-08-26
related:
  - docs/archive/specs/2026-08-10-chatsearch-session-references-design.md
  - docs/archive/plans/2026-08-25-chatsearch-session-references-plan.md
  - docs/archive/handoffs/2026-08-10-chatsearch-state-of-play.md
---

# Conversation preview — header, actions, and the open ledger

One document covering three things Destin asked for on 2026-08-26, plus every
item still open from the session-references work. **Numbered so each can be
approved or rejected on its own.** Measured defects (Part B) are separated from
taste decisions (Part C) — a defect is not something to have an opinion about.

Every claim about existing code was verified against
`worktrees/chatsearch-refs` on 2026-08-26; file:line references are to that
worktree.

---

## Where this sits

Clicking **Preview** on a chat-search result opens a past conversation
read-only in the session drawer — the same drawer that shows files. It works
today against fake data. Its header is currently: the drawer's own top bar
carrying the conversation title, a ✕, and an expand control, with a quiet
`Past conversation · read-only · Claude Code` caption above the messages.

This spec adds what that header is missing.

---

# Part A — the three new things

## A1. Tags and note — the Resume Browser's tag icon and sheet, reused

**Destin, 2026-08-26:** *"we should have the same tag icon thing and tag/note
editor surface used in the resume browser kinda. similar at least."*

**So it is editable, not display-only, and it copies an existing surface.**
The Resume Browser already does exactly this: a `TagGlyph` icon button on each
past conversation (`ResumeBrowser.tsx:1050-1062`, `aria-label="Organize …"`,
`aria-haspopup="dialog"`) that opens an inline sheet holding `TagPicker` plus a
note field (`:742-760`). The preview header gets the same glyph, opening the
same sheet for the conversation on screen.

Reuse the parts, do not re-draw them: `TagGlyph` (`components/tags/glyphs.tsx`
— shared so the mark cannot drift between surfaces), `TagPicker`, and the note
editor. Note the Resume Browser passes `fieldClassName="bg-well border-edge"`
because its sheet sits on a `bg-inset` card and the field would otherwise be
the same colour as its own background — the same override the close prompt and
model picker make. The preview's sheet will need whatever equivalent its own
surface calls for; check it rather than copying the value blindly.

**Where the tags and note come from — and this replaces my earlier
recommendation.** I previously proposed reading them from the search index and
suggested display-only, because a tag edited here would not appear in search
until the index refreshed. **Two facts undercut that.**

First, the app has an authoritative live source that is not the search index:
`session:get-meta` reads "a live/past session's applied tags + note" straight
from the meta store (`ipc-handlers.ts:3196-3197`), and the write channels
`session:set-tag` / `session:set-note` already fall back to the raw id when it
is not a currently-live session (`:3153, :3179`) — writing to a past
conversation is a path the backend already anticipates. So the preview should
read tags and note from `session:get-meta`, **not** from the search index
snapshot. They are then always current, and an edit shows immediately.

Second, the Resume Browser already writes tags to that same store for past
conversations. So whatever lag exists between the store and the search index
exists today, on a shipping surface, and is not something this feature
introduces. Being consistent with it is better than being cautious alone.

**The division of labour, therefore:**
- **Search index** (`chatsearch:resolve`) supplies title, date, project, and
  whether Resume is possible.
- **Meta store** (`session:get-meta` / `:set-tag` / `:set-note`) supplies and
  edits tags and the note.

This also removes the need to add `note` to `ResolvedConversation` — the index
copy would be the stale one anyway.

**What remains true from before:** the index stores tag *labels*, not ids, so
anywhere index tags are still displayed (the search cards) the colour must be
recovered by matching the label against the live registry —
`resolveChatsearchTags` (`tool-views/chatsearch-tags.tsx`) already does this and
must be reused.

**The preview still resolves its own id.** The pane currently receives only
`{ provider, id, title }` and needs the resumability flags for A2. It calls
`chatsearch:resolve` for itself — one call, no new channel, no widening of the
reducer action. Works against the workbench fake today.

## A2. Resume — a new tab, not a new window

**Destin, 2026-08-26:** *"not new 'window' just new tab in session."*

**This makes the feature smaller, not bigger.** Sessions in this app *are*
tabs, and `handleResumeSession` already opens a resumed conversation as one by
default. So there is one Resume control, it opens a new tab, and it passes
`launchInNewWindow` as `undefined` — exactly what every chat-search path
already does.

**Dropped entirely: the detached-window control.** The capability exists
(`detach.openDetached` → `main.ts:1044-1048`, exposed as a toggle in
`SessionStrip` and `ResumeBrowser`) but is not wanted here. Dropping it also
removes the Android/remote hazard that came with it — `openDetached` is a
no-op on both (`remote-shim.ts:1452`), so a button offering it there would have
silently done nothing.

**Resume must state which prerequisite is missing.** A conversation is not
resumable when its project folder is absent from this device, or when its
transcript has not synced here yet. Those are two different sentences, already
worded by the Resume Browser and already in `COPY`. Disabled Resume says which;
Preview stays available in both cases. Never imply the conversation does not
exist.

**The assistant lane behaves differently and that is deliberate.** For a
`native` conversation, Resume does not launch — it opens the model picker
first (`App.tsx:2333-2337`), because a resumed assistant session needs a model
chosen. So the label carries an ellipsis: `Resume…`. Both Resume controls
inherit this.

## A3. "Ask about this"

**The mechanism already exists in this branch.** `askAboutThis(text)`
(`context-menu/build-menu.ts:60`) dispatches `youcoded:compose-insert`, and
`InputBar.tsx:305-319` inserts that text at the front of the composer, focuses
it and places the caret after the insertion. It was built for right-clicking a
chat bubble. Nothing about it is specific to that origin.

**So this needs no new plumbing and no plugin change.** The button composes a
scaffold naming the conversation and drops it in your input box, caret ready.
You type the question; nothing is sent on your behalf.

**Destin, 2026-08-26:** *"ask about this should be contained in right-click as
it is everywhere else."* **So it is not a header control.** Right-clicking
inside a previewed conversation offers the same menu the live chat offers.

**One precise thing blocks it, and it is a two-word fix.** The context menu is
a document-level listener (`ContextMenuHost.tsx:25`), so it already fires
inside the drawer. It targets chat messages by the classes
`.assistant-bubble` / `.user-bubble` (`build-menu.ts:39`) — which the preview's
bubbles now carry, as a side effect of the theming-hook fix landed earlier
today. But `build-menu.ts:298` bails out first: `if
(!target.closest('.chat-scroll')) return null;`. The preview's scroll container
is not `.chat-scroll`, so the menu never builds and the browser's own menu
appears instead.

**Widen that guard — do not add the class.** `.chat-scroll` carries real CSS
(`globals.css:591`, `:614`, and bottom-chrome offsets sized for the composer),
none of which applies inside a drawer. Mark the transcript with a data
attribute instead and accept both. That gets the whole menu — Ask about this,
Copy, Select all, code-block handling — for one changed line, and keeps the
preview's behaviour identical to the chat by construction rather than by
duplication.

**Scaffold wording** is then whatever the existing menu already produces
(`scaffold()`, `build-menu.ts:63`: a lead line, the quoted text, then *"The user
has a follow-up: "*). Nothing new to word — another reason to route through the
existing menu rather than invent a header button.

**The conversation id still needs to reach the assistant.** The existing
scaffold quotes the selected text but names no conversation, so the assistant
cannot go read more of it. Add the id to the lead line for this surface only —
that is what lets the assistant run `show`/`turns` against the installed plugin
and pull up the rest. See C4 for the wording decision.

**Why the id is in there — this is the chat-search integration.** The installed
search plugin already accepts `show <id>` and can fetch specific turns of a
transcript (`turns` / `around` / `tail`), and its instructions already tell the
model to do exactly that when it needs the content of a past conversation. So
putting the id in the prompt is what lets the assistant actually go read it.
**No new tool, no new subcommand, nothing that depends on the plugin
updating** — which matters, because bundled plugins install once and are never
upgraded (ROADMAP), so anything requiring a plugin change would not reach
existing installs.

**Deliberately not in v1: quoting a selection.** A sibling branch
(`worktrees/ask-reference`, `feat/ask-claude-reference-ux`) builds a richer
version that captures the exact text you selected and renders the sent
reference as a collapsed pill. It is a better experience and it is unmerged.
Its builders key off the live chat's own DOM classes, so they would not work on
the preview pane as-is. **When that branch lands, this button should adopt it**
rather than keeping a second, weaker path — noted here so the follow-up is not
lost.

## A4. Where the three controls live — decision needed

Destin asked for buttons "like buttons on file headers". The file header's
controls are 28px icon buttons with tooltips: open-externally, copy path,
reveal in folder, expand, close.

**SETTLED — Destin, 2026-08-26.** *"resume should be a button in the bar, ask
about this should be contained in right-click as it is everywhere else."*

So the previewed-conversation bar is, left to right:

`☰ list` · **title** · *(spacer)* · **Resume** · `🏷 tag` · `⛶ expand` · `✕ close`

- **Resume is a labelled button**, not an icon — it is a heavier action than
  the icons around it and its two disabled states each carry a sentence. Use
  the real `Button` primitive, sized to sit in a 28px-tall bar without
  changing the bar's height. `Resume…` with the ellipsis on the assistant lane,
  because that one opens the model picker first.
- **The tag glyph** is the Resume Browser's `TagGlyph`, opening the sheet
  described in A1.
- **Ask about this is not here at all** — it lives in the right-click menu (A3).
- **Expand and close** are the drawer's existing controls, unchanged.
- The file-only icons (open externally, copy path, reveal in folder) stay
  hidden for a conversation, as they already are.

**Check it at 390px.** That is five controls plus a title in a full-width bar;
if Resume's label does not fit there, the fallback is the label collapsing to
its glyph on narrow only — the pattern the Deliverables tile already uses for
its "Open" affordance.

---

# Part B — measured defects still open

Each is a fact with evidence, not a preference.

**B1. Two clicks to reach the buttons.** A chat-search card is inside a tool
group, and both are collapsed by default, so the Preview/Resume buttons are two
expansions away. Found while driving the UI headlessly. Note the tension: cards
were originally expanded-by-default for exactly this reason, and that was
reversed by decision. Options: auto-expand the card inside its group, or accept
it.

**B2. Android shows a header that contradicts its body.** Android has no
search index, so `chatsearch:resolve` will answer `not-implemented-on-mobile`
and the card falls back to plain shell text — but the tool card's *header* is
computed separately and still reads "Found N past conversations" above that raw
text. Header and body disagree. Present in the plan's own design, not an
implementation slip. Fix belongs with the Android channel work (plan Task 11).

**B3. `parseShowId` can mistake a search table for a single result.** It
accepts any line whose first token is a full 36-character conversation id. A
`find` table would need two indexed conversations identical for 35 characters
for this to fire — vanishingly unlikely, currently untested. One-line
narrowing.

**B4. A pre-existing drawer bug, unrelated to this feature.** `SessionDrawer`'s
orphan-check effect can loop forever if a session's artifact list is entirely
absent. Not reachable today because that list is always populated before the
drawer can open. Found in passing; belongs in ROADMAP, not a speculative fix
here.

**B5. The app holds ~247,000 file watches.** Measured 2026-08-26 while
diagnosing repeated workbench crashes: the installed YouCoded app alone held
247,566 inotify watches against a system limit of 524,288, and a second dev
instance held 271,928 — together exhausting the limit and killing Vite with
`ENOSPC`. Raised to 1,048,576 via `/etc/sysctl.d/90-inotify.conf`. **The limit
was raised; the cause was not investigated.** A quarter-million watched paths
for one app is worth its own look.

**B6. The Deliverables card will exist twice.** The locked look for the
presented-conversation card re-expresses `DeliverablesCard`, which lives on the
unmerged `feat/send-user-file-card` branch and cannot be imported across
branches. When it merges, the shared shell (card chrome, header-as-collapse,
tile frame) must be extracted rather than left as two copies that drift.

---

# Part C — taste decisions still open

No evidence decides these; Destin does.

**C1. The "Referenced conversations" list — keep or cut?** A running list in
the drawer of every conversation previewed this session. Built, fenced for
clean removal (`SessionDrawer.tsx:566-586` plus one dispatch). The one surface
in this feature with no evidence of need — the cards stay in the chat, and the
pane alone delivers the goal.

**C2. The presented-conversation card's trigger.** The look is locked (Round 5
`present-row-split`) and deliberately unbuilt, because a component nothing can
display is dead code. **The app cannot give Claude Code a new tool** — verified
by searching for any app-authored MCP server across both repos; YouCoded only
projects third-party servers into Claude's config and otherwise reaches it
through plugins that shell out. So the options are: (a) treat an existing
search subcommand as the "present this" signal; (b) add a `present` subcommand
to the plugin, which existing installs will not receive until the
bundled-plugin upgrade gap is closed; (c) build a real tool on the
YouCoded-assistant lane only, which is small — its tool registry is a plain
array, and it already supports result data that renders in the UI but is
invisible to the model.

**C3. Tags on the presented card.** Absent by decision: three placements were
tried and all overflowed the row, because a real tag label is wide
("Follow-Up Needed", not "perf"). Tags remain on the search card, which has the
room.

**C4. Wording.** The "Ask about this" scaffold (A3), the button labels, and
whether the caption stays `Past conversation · read-only · Claude Code`.

---

# Part D — not in this spec

The remaining implementation plan: the sign-off gate (Task 7), the main-process
reader that makes previews show *real* conversations instead of fake ones
(Tasks 8-11), Resume wiring (Task 12), the unknown-segment guard (Task 13), and
the optional `show`-as-segment change (Task 14). Everything above is renderer
work that sits on top of those.

---

# Open questions

1. **C1** — does the Referenced conversations list stay?
2. **C2** — which trigger for the presented-conversation card, if any?
3. **B1** — auto-expand the search card inside its group, or accept two clicks?
4. **C4** — the wording of the conversation reference added to the right-click
   scaffold.

*Settled since the first draft:* A1 is editable and copies the Resume Browser's
tag icon and sheet, reading tags/note from the meta store rather than the search
index; A2 is one Resume that opens a new tab, with the detached-window control
dropped; A4 is Resume as a labelled button in the bar; A3 lives in the
right-click menu, not the header.

# Risks

- **A1's edits write to the meta store, which the search index only re-reads on
  app launch and at session end.** So a tag added here will not change search
  results until the index refreshes. This is pre-existing — the Resume Browser
  already writes to the same store — and reading tags from `session:get-meta`
  rather than from the index means the *preview itself* is always current. Worth
  knowing, not worth blocking on.
- **A1 writes to a past conversation's id.** The handlers anticipate it
  (`ipc-handlers.ts:3153, :3179` fall back to the raw id), but nothing in the
  renderer does it today, so this is the first caller on that path. It needs a
  test, and a failed write must surface rather than fail silently — the Resume
  Browser's own handlers roll the optimistic update back on error
  (`ResumeBrowser.tsx:621-634`); match that.
- **A3** puts a conversation id into the composer. If the user sends it without
  a question, the assistant receives a bare reference; the scaffold should read
  as an unfinished sentence so that is obviously incomplete.
- **A4 Option 1** would put five controls in a 390px-wide bar on a phone.
