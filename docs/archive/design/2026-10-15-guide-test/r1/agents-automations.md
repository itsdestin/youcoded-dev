# r1 · agents-automations — builder report and guide-gap notes

## What it built
A new full screen **Automations** (header button after Projects; ||| row on phone; also in the band on Projects/Pages/Library). Tabs: **Automations** — cards grouped "Needs you" / "Active" / "Turned off"; each card: name, status pill only when notable ("Needs you", "Didn't run", "Running"), on/off switch top right, facts (when, who, folder), two-line description, a notice with one button when it needs you, "Next: …" bottom left / "Ran …" bottom right; **Activity** — runs grouped Today / Yesterday / Earlier this week. **Automation details** (DetailPage: what you asked, recent runs; when / who / may do). **New/Edit automation** — one form in four labelled parts, pinned footer, red Delete on edit. Who does the work = your assistant or an existing specialist (managed in Settings → Assistant). Honest limits stated: runs only while YouCoded is open; asks before sending/deleting/spending.
Screens: `automations`, `#empty`, `#failed`, `#short`, `#phone`, `automations/activity` (+`#phone`), `automations/new` (+`#phone`), `automations/edit`, `automations/detail/{invoice-reminders,reading-list,morning-email}`, `…/invoice-reminders#phone`.
References: Projects, Pages library / Your library, Marketplace detail pages, Close session / Submit a ticket.
Named it "Automations". Time picker: half-hour Select (guide Q20 open).
Side effects: added its folder to the `no-hand-rolled-setting-row-toggle` ast-grep rule's out-of-scope list; raised App.tsx line budget by 3. Reported a flaky test (`LocalModelsSection.test.tsx`).

## Where the guide left it guessing (condensed)
1. No recipe for adding a new destination / where its button goes (header, |||, band).
2. Reference screens disagree on tabs + main action (Library pills, Projects hand-rolled segments, Pages button in header).
3. "Large heading" doesn't name the shared piece (TabHeading lives inside project-view/).
4. On/off switch not listed as a card quick action; ast-grep rule assumes switches live in settings rows.
5. Card: "date bottom right" — what goes bottom left?
6. Grid columns / card width not specified (3 columns truncated).
7. No status wording outside sessions/sync (running, needs you, missed).
8. Notice with a filled button inside a card: does the card's own main action stay filled?
9. Detail page for the user's own thing (no Install/Uninstall).
10. No create-form recipe (between one-job card and save-as-you-go settings).
11. Where a disabled control's "why" goes in a pinned footer.
12. Label-above-box piece only exists for one-job popups (used OneJobLabel/OneJobHint elsewhere).
13. No time picker (Q20).
14. 2–4 choice tab strip wraps ~600px; not warned.
15. A log of past runs is neither a settings list nor a menu.

## Pushed toward worse
- "A label comes first / nothing bare" → every short fact on the detail popup became its own heavy labelled card.
- "One button is full width" → lone Edit became a big outlined bar heavier than the content.
- "Cards for things" + "top card has no label" → unclear whether to group by status; added headings, maybe too much.

Not read: the "documents current behaviour" sections, feature-flow spec, review-deck.md, decisions.md.
