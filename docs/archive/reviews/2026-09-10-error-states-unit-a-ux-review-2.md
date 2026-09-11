# Context-free UX review 2 — reporting a problem, contributing, attaching files

Beta-tester run against the UI Workbench (simulated backend) at 1440x900 in Midnight, plus
one pass at 640px width and one in the Light theme. Ran each of the three tasks twice: once
with the toolbar scenario on `default`, once on `refused`. Screenshots are under
`scratch/ux2/out*/`. I never read the source. I could not test touch input or a 1.5x screen,
and the screenshot tool hides scrollbars, so I make no claim about whether a scrollbar was
visible.

Tasks attempted: (1) report a problem and send it, (2) find "Contribute to YouCoded", read it
and set up a workspace, (3) choose to attach screenshots or files. **All three completed.**
Nothing I typed was ever lost.

---

## Findings

### U1 — I could not tell whether "Continue in GitHub" actually did anything, and it says the same thing when everything is broken
**Trying to do:** attach a screenshot to my report. I ticked "Screenshots or files", wrote my
report, and the main button changed from "Submit public ticket" to "Continue in GitHub". I
pressed it.
**Saw:** the dialog replaced itself with "Finish your ticket in GitHub. / Your ticket is open
in your browser with everything you wrote. Attach your screenshots or files there, then
submit it." and a single "Done" button. I saw no browser open. I ran the identical steps with
the "refused" scenario on — where everything else in the app fails loudly — and got the
**exact same success message**, word for word.
**Why it's a problem:** the app is telling me something happened somewhere I cannot see, with
no link to click, no "didn't open? copy the link", and no way to get back to my typed report
if the browser never appeared. Pressing "Done" throws the draft away. If the browser really
did fail to open, I have just lost a report I wrote and I don't know it.
**Expected:** either a visible link/button I can press myself ("Open it in my browser"), or an
error if it didn't open. At minimum, keep the draft reachable until I confirm I finished.
Shots: `scratch/ux2/out13/midnight/34-continue-github.png`,
`scratch/ux2/out14/midnight/35-refused-continue-github.png`
verdict: accepted, fixed — the most serious of the 17, and the same class as everything else in this feature. openExternal was fire-and-forget, so the screen claimed a browser opened without ever knowing. It is awaited now: a refusal is a failure with the draft intact, and both outcome screens carry a button that opens the link. Guarded, proven by reverting to `void`.

### U2 — "Retry" after a failed send appears to do nothing at all
**Trying to do:** send my report again after it failed.
**Saw:** the error panel "Your ticket wasn't sent / GitHub did not create the ticket (401):
Bad credentials." with a small "Retry". I pressed Retry and waited 3 seconds. The screen was
pixel-for-pixel identical afterwards — no spinner, no "trying again…", no change of any kind,
not even a flicker of the message.
**Why it's a problem:** I cannot tell whether my click registered, whether it is still trying,
or whether it failed again. I would sit there pressing it repeatedly.
**Expected:** the button shows "Trying again…" while it works, and the message visibly
refreshes (or says "Still not sending — tried again just now") when it fails a second time.
Shot: `scratch/ux2/out11/midnight/_unverified/23-retry.png`
verdict: accepted with a limit. The screen DOES swap to "Sending your ticket…" on retry — but a refusal that returns instantly makes it a flash. Real submissions take a network round-trip, so this is a fixture artefact rather than a shipped defect. Not adding artificial delay to make a spinner visible.

### U3 — The failure message blames credentials I don't have, and the main button disappears
**Trying to do:** send my report.
**Saw:** "**Your ticket wasn't sent** / GitHub did not create the ticket (401): Bad
credentials." The "Submit public ticket" button was gone; only the little "Retry" inside the
error box and "Back to draft" remained.
**Why it's a problem:** I have never signed into GitHub and have no credentials, so this
sentence describes a world I'm not in. "(401)" means nothing to me. And because the main
button vanished, the screen reads like a dead end — my only large button now says "Back to
draft", which sounds like giving up. Nothing tells me whether this is my fault, my internet,
or theirs, or whether waiting would help.
**Expected:** plain cause and one useful action, e.g. "**We couldn't send your ticket.** /
YouCoded wasn't allowed to post it. Your text is safe — try again, or open it in your browser
instead." Keep the main action in the same place it was, and offer the browser fallback as a
second way through.
Shot: `scratch/ux2/out10/midnight/22-refused-submit.png`
verdict: accepted, fixed. A 401/403 now takes the browser route rather than reporting "Bad credentials" about credentials the user never set up — a rejected token means the same thing to them as having none, and blaming them for invisible state hides the way forward.

### U4 — Ticking "Screenshots or files" gives me no file picker; it silently changes how my report is sent
**Trying to do:** attach a screenshot.
**Saw:** ticking the box added a grey paragraph: "Review and crop files before attaching them.
GitHub uploads a file as soon as you attach it — before you submit the issue. You'll attach
approved files yourself in the browser; nothing is uploaded here." And on the next screen the
main button had quietly changed from "Submit public ticket" to "Continue in GitHub".
**Why it's a problem:** I ticked a checkbox expecting a "Choose file" button. Instead I got
three sentences of warning about a website I wasn't planning to visit, and — without being
told — the whole way my report gets sent changed. "the issue" also appears here for the first
time, after the app has spent every other sentence calling the same thing a "ticket".
**Expected:** the checkbox should say what it actually does before I tick it, e.g. label it
"Add screenshots or files (finishes in your browser)". Shorten the paragraph to: "You'll add
your files in your browser at the last step. Nothing is uploaded from here." And use one word
— ticket — everywhere.
Shots: `scratch/ux2/out12/midnight/31-attach-checked.png`,
`scratch/ux2/out12/midnight/32-attach-review.png`
verdict: accepted, fixed. The row now says where it ends up, and the (i) says why files cannot be attached here at all.

### U5 — "Improve wording with the assistant" answers "Nothing rewrote it", which reads like a broken thing, and says it even when the app is failing
**Trying to do:** get help tidying my report before sending it.
**Saw:** after pressing the button, a new line appeared: "Nothing rewrote it, so your wording
is unchanged." My text was untouched. I got the *same* sentence in the "refused" scenario,
where nothing in the app works.
**Why it's a problem:** "Nothing rewrote it" is not a sentence I can act on. Did it try? Did
it think my writing was fine? Did it fail? Because it says the same thing when everything is
broken, I have no way to tell a working assistant from a dead one.
**Expected:** say which happened. "Your wording looked fine — nothing to change." for a
no-op, and a real error ("Couldn't reach your assistant. Your text is unchanged.") when it
failed.
Shots: `scratch/ux2/out25/midnight/80-improve-wording.png`,
`scratch/ux2/out26/midnight/81-refused-improve-wording.png`
verdict: accepted as a fixture gap, not a shipped one. The workbench summarize mock ignores the refused scenario, so it answers the same either way. The real path distinguishes them (`unavailable` carries the reason). Filed for the mock rather than pretended fixed.

### U6 — "Development" is the last place I'd look to report a problem, and its description is cut off
**Trying to do:** find where to tell someone about a problem.
**Saw:** eleven rows in Settings. The one I needed is "**Development**", icon `{YC}` (curly
brackets), subtitle clipped mid-word: "Report a bug, contribute, o…". I scanned past it twice
looking for "Help", "Feedback" or "Support".
**Why it's a problem:** "Development" tells me this section is for programmers, and I'm not
one. The code-brackets icon reinforces that. Then the one clue that it's for me — the
subtitle — is chopped off before it finishes.
**Expected:** "**Help & feedback**" (or "Improve YouCoded") with a subtitle short enough to
fit: "Report a problem or share an idea".
Shot: `scratch/ux2/out3/midnight/03-settings-open.png`
verdict: accepted, fixed. The subtitle is shorter, per the design guide's own rule for this row: it must fit one line at 320px, and truncation is a copy bug rather than a layout one.

### U7 — Expanding "How contributing works" pushes the only button off the bottom of the box
**Trying to do:** read what contributing involves before committing to it.
**Saw:** the dialog opens with a paragraph, a "How contributing works" row and a "Set up
development workspace" button. When I expanded the explainer, the box did not grow — step 4
was cut in half at the bottom edge and the "Set up development workspace" button was no
longer on screen at all. It came back only when I scrolled inside the box.
**Why it's a problem:** the sensible thing to do — read first, then act — hides the action.
The list ends mid-sentence, so it also looks broken.
**Expected:** keep the button pinned at the bottom of the dialog while the text scrolls above
it, so reading never removes my way forward.
(Caveat: the screenshot tool hides scrollbars, so I cannot say whether a scrollbar hinted at
the hidden content.)
Shots: `scratch/ux2/out17/midnight/41-how-it-works.png`, `scratch/ux2/out18/midnight/44-scrolled.png`
verdict: accepted, fixed. The expanded walkthrough scrolls instead of pushing the only button off the bottom. This is exactly the gap the ui-mockup skill warns about — a scrolling surface reviewed only at a height where nothing overflows.

### U8 — "You don't need to know how to code" is said twice, then the button says "development workspace"
**Trying to do:** understand whether contributing is for me.
**Saw:** the dialog opens with "You don't need to know how to code. Describe a change to your
assistant and try it in a separate project. Your installed app and existing folders stay
untouched." Expanding the explainer repeats, verbatim: "You don't need to know how to code.
Start with an idea, like clearer wording or an easier-to-use screen." The one button says
"**Set up development workspace**".
**Why it's a problem:** the same reassuring sentence twice in one small box reads like a
mistake. And having just twice been told I don't need to code, the only thing I can press
uses two words a non-coder doesn't own — "development" and "workspace".
**Expected:** say it once. Rename the button "**Set up my copy**" or "Create a practice
project", and drop the duplicate line from the explainer.
Shots: `scratch/ux2/out16/midnight/40-contribute.png`, `scratch/ux2/out17/midnight/41-how-it-works.png`
verdict: accepted. The duplicate "You don't need to know how to code" comes from the sentence being both on the landing and inside the walkthrough. Carrying to the acceptance deck rather than editing copy R2-13 approved on my own reading.

### U9 — Closing the ticket box also closes the menu behind it, and "Known issues" closes everything with no sign anything happened
**Trying to do:** back out of the ticket form to the Development menu; separately, look at
known issues.
**Saw:** pressing the ticket dialog's X (or Escape) closed *both* the ticket box and the
Development menu, dropping me back to the plain Settings list. Pressing "Known issues" did
the same — the menu vanished and absolutely nothing else on screen changed.
**Why it's a problem:** one close press throws away two levels of navigation. And "Known
issues" gives no acknowledgement at all: if it opened a browser I can't see, I'd assume the
button was broken and press it again.
**Expected:** closing the inner box returns me to the Development menu. Buttons that hand off
to a browser should say so ("Opening in your browser…") and leave the menu open.
Shots: `scratch/ux2/out12/midnight/_unverified/33-close-reopen.png`,
`scratch/ux2/out24/light/70-known-issues.png`
verdict: accepted, not fixed here. Closing a child dialog closing its parent menu is shared dialog behaviour, not this feature's; changing it would alter every menu in the app. Filed to unit B.

### U10 — The tooltips explaining what gets shared cover the very rows they explain, and use words I don't know
**Trying to do:** find out what "Error details and version" and "Recent logs" actually send.
**Saw:** pressing the small (i) opens a grey box that sits **on top of** the two rows below
it. For "Error details and version" it covers both "Recent logs" and "Screenshots or files";
for "Recent logs" and for attachments it covers the "Review ticket" button. Wording:
- "Only the originating error and app version, not your conversation. You'll review these before sharing."
- "Logs record app activity and errors. They may contain private information. Review and remove private details before sharing."
- "Attach reviewed files yourself in GitHub."
**Why it's a problem:** "originating error" is not everyday English. "Attach reviewed files
yourself in GitHub" is seven words that left me with three questions — reviewed by whom, in
GitHub where, and does that mean I can't attach them here? And a help bubble that hides the
buttons is worse than no bubble.
**Expected:** open the explanation *below* the row (or inline, pushing the rows down) so
nothing is hidden. Wording: "Just the error message and your YouCoded version — never your
conversation." / "A record of what the app was doing. It may contain private details, so
check it before sending." / "You'll add files in your browser at the last step."
Shots: `scratch/ux2/out7/midnight/08-about-attachments.png`,
`scratch/ux2/out7/midnight/09-about-error-details.png`,
`scratch/ux2/out7/midnight/10-about-recent-logs.png`
verdict: accepted, partly fixed. "Attach reviewed files yourself in GitHub" is rewritten (U4). The (i) bubbles covering their own rows is AnchorTip placement, shared by every settings page — filed to unit B rather than special-cased here.

### U11 — The word for the thing I'm sending changes four times
**Trying to do:** just follow the flow.
**Saw:** in order — Settings row "Report a Bug or Request a Feature", dialog title "Submit a
ticket", body "Tickets are public on GitHub", tabs "Bug / Feature", explainer "before you
submit **the issue**", step 5 of the contribute explainer "sends a public **proposal** to
GitHub", and the success line "**maintainers** decide what happens next".
**Why it's a problem:** I count four names for one object (bug/feature request, ticket, issue,
proposal) and one for people I've never heard of ("maintainers"). Each new word makes me stop
and ask whether it's the same thing.
**Expected:** pick one word — "report" is the plainest — and use it everywhere. "maintainers"
→ "the YouCoded team". "Bug / Feature" → "Problem / Idea".
Shots: `scratch/ux2/out6/midnight/06-report-bug.png`, `scratch/ux2/out9/midnight/13-submitted.png`,
`scratch/ux2/out18/midnight/44-scrolled.png`
verdict: accepted with a correction. "Ticket" is already pinned as the single noun by DevelopmentDesign.test.tsx and R2-10, and the tester saw "issue"/"proposal" in the walkthrough and the GitHub hand-off, where they name GitHub's own object. "Maintainers" is real jargon; carried to the acceptance deck.

### U12 — "provider usage may apply" — I don't know if this costs me money
**Trying to do:** decide whether to use the AI help.
**Saw:** under "Optional AI help": "Only this draft and selected details go to your chosen
assistant. Review them first. Nothing is sent automatically; provider usage may apply."
**Why it's a problem:** "provider usage may apply" is the kind of phrase that appears next to
charges. It might mean money, it might mean a quota, it might mean nothing. "your chosen
assistant" also assumes I chose one — I never did. And "Review them first" — review what,
where? There is nothing on screen to review.
**Expected:** say it plainly. "Your draft is sent to your assistant to reword. If your
assistant charges for use, this counts towards it." Drop "Review them first" or point at what
to review.
Shot: `scratch/ux2/out9/midnight/12-ai-help.png`
verdict: accepted, carried. "provider usage may apply" cannot be made concrete without knowing the provider and price, and "your chosen assistant" assumes a choice a first-time user has not made. Both are copy Destin approved (R2-12); a rewrite goes on the acceptance deck, not in silently.

### U13 — Clicking the greyed "Review ticket" on an empty form does nothing and never says a title is required
**Trying to do:** see what happens if I press on without filling anything in.
**Saw:** the button is a slightly dimmer grey than normal (I only noticed by comparing two
screenshots side by side). Clicking it produces nothing: no message, no red outline, no
highlight on the Title box. Neither "Title" nor "Description" is marked required.
**Why it's a problem:** dim-grey-versus-grey is not a difference I'd catch on a laptop screen.
When a click does nothing at all, my first thought is that the app is stuck, not that I've
missed a field.
**Expected:** mark the required field, and when I press a not-yet-ready button, put the cursor
in the empty box or show one short line: "Add a title first."
Shots: `scratch/ux2/out6/midnight/06-report-bug.png` (empty),
`scratch/ux2/out7/midnight/07-filled.png` (filled)
verdict: accepted, fixed. The screen now says what would make the button usable, instead of a grey-on-grey control that appears to do nothing.

### U14 — The "review" step looks almost identical to the form I just left
**Trying to do:** check my report before sending.
**Saw:** pressing "Review ticket" gives me the same editable Title box and the same editable
Description box, in the same place, with a new small heading "REVIEW YOUR TICKET" above them.
The only real changes are that the three tick-boxes are replaced by the line "ERROR DETAILS
AND VERSION / YouCoded 1.2.4 · Linux x86_64", and the buttons change.
**Why it's a problem:** I pressed a button and the screen barely moved, so at first I thought
nothing had happened. And "Back to draft" implies I left the draft — but I can still type in
both boxes, so I don't know what "draft" and "review" actually mean here.
**Expected:** make the review step look like a summary, not a form — show the text as plain
text with a small "Edit" link — so it is obvious I have moved a step forward.
Shots: `scratch/ux2/out7/midnight/07-filled.png`, `scratch/ux2/out8/midnight/11-review.png`
verdict: accepted, carried. The review step reading like the form is the design R3-18 approved, and the fields stay editable on purpose. If it reads as "nothing happened" to a fresh user that is worth Destin seeing, but it is not mine to redesign.

### U15 — A failed workspace setup wipes the whole explanation off the screen
**Trying to do:** set up a workspace with the "refused" scenario on.
**Saw:** "**Setup didn't finish** / Could not reach github.com to download the project.
Nothing was left behind, so trying again starts cleanly." with a small "Retry". Everything
else — the "you don't need to know how to code" paragraph, "How contributing works", the main
button — was gone. The dialog was now just the error.
**Why it's a problem:** this error message itself is good (I understood it immediately, and
"nothing was left behind" was exactly what I wanted to know). But losing everything else
means I can't re-read what I was setting up, and if Retry keeps failing my only remaining
control is a small button that has already failed once.
**Expected:** keep the error at the top and the explanation below it, the way the ticket
failure does. That failure kept my text on screen; this one keeps nothing.
Shot: `scratch/ux2/out20/midnight/46-refused-setup.png`
verdict: accepted, fixed. A failed setup keeps the explanation of what this was for, as the ticket screen already kept the draft.

### U16 — The finished ticket shows me a raw web address instead of a link I'd press
**Trying to do:** see where my report went.
**Saw:** "Your ticket is submitted. / Anyone can read it, and maintainers decide what happens
next. / https://github.com/itsdestin/youcoded/issues/471" and a "Done" button.
**Why it's a problem:** the address is underlined so it's presumably clickable, but it's shown
as raw text at small size — it reads like a serial number, not something to press. "Anyone can
read it" is good and clear; "maintainers" is not a word I use.
**Expected:** "**Your report was sent.** / Anyone can read it, and the YouCoded team decides
what happens next." with a normal button: "**Open my report**".
Shot: `scratch/ux2/out9/midnight/13-submitted.png`
verdict: accepted, fixed. A pressable "Open my ticket" instead of a raw address — which on Android does nothing at all as a plain link.

### U17 — Two promises I have no way to check
**Trying to do:** trust what the dialogs told me.
**Saw:** "Your installed app and existing folders stay untouched." (Contribute) and "Nothing
else on your computer changed." (after setup). Also "Nothing is uploaded here." on the
attachments note.
**Why it's a problem:** these are reassurances about my whole computer that I can't verify
from inside the app, and the more absolute the claim, the more I wonder what it's covering
for. There's no "see what was created" anywhere.
**Expected:** anchor the claim to something I can see. The success screen already names the
folder — say "Everything new lives in this one folder" and let me open it, instead of a
blanket claim about the rest of my computer.
Shots: `scratch/ux2/out16/midnight/40-contribute.png`, `scratch/ux2/out17/midnight/42-setup.png`
verdict: accepted, and the promise is now true rather than softened. "Existing folders stay untouched" holds because setup walks to a folder that does not exist; "nothing else on your computer changed" holds because the project is registered as a saved folder, not a synced space. Both are pinned by tests rather than by wording.

---

## What worked well (no action needed)

- Nothing I typed was ever lost. Closing the box with X or Escape and reopening it brought
  back both my title and my description exactly (`scratch/ux2/out15/midnight/36-esc-then-reopen.png`).
  A failed send also kept my text, and "Back to draft" restored the form intact.
- The waiting states are good and reassuring: "Sending your ticket…" and, for setup,
  "Setting up your development workspace… This can take a few minutes. You can close this —
  setup keeps going, and you'll find it here when you come back."
  (`scratch/ux2/out21/…/50-submit-inflight.png`, `scratch/ux2/out19/…/45-setup-inflight.png`)
- "Tickets are public on GitHub" appears at the top of every step of the form. I never once
  wondered whether this was private.
- Switching to the "Feature" tab correctly drops the error/log options and changes the
  description prompt to "What would you like to do, and how would it help?".
- The layout survives a 640px-wide window with nothing clipped or overlapping, and the Light
  theme is as readable as Midnight.

## Answers to the questions I was asked

- **Do I always know what just happened and what to do next?** No — three times not: after
  "Continue in GitHub" (U1), after pressing "Retry" (U2), and after pressing "Known issues"
  (U9). All three end with the screen either unchanged or claiming something happened
  somewhere I can't see.
- **When something fails, is it in words I understand, with something useful to do?** Half.
  The setup failure is excellent plain English. The send failure is not ("401: Bad
  credentials"), and its only offered action repeats the same thing with no visible response.
- **Is anything I typed lost?** No. This is the strongest part of the whole flow.
- **Confusing, jargon-filled or unverifiable copy?** Yes: "originating error", "maintainers",
  "provider usage may apply", "development workspace", "the issue" vs "ticket" vs "proposal",
  "Nothing rewrote it", and two whole-computer promises I can't check (U17).
- **Anything that looks broken?** The explainer list cut in half with its button pushed
  off-screen (U7), the help bubbles sitting on top of the buttons (U10), and Retry producing
  a completely unchanged screen (U2).

**Single most confusing moment:** ticking "Screenshots or files" and finding that instead of a
file picker I got a warning about a website, and that the button I was going to press had
quietly become "Continue in GitHub" — which then told me my ticket was "open in your browser"
when no browser had opened, and said exactly the same thing in the scenario where every
operation fails.
