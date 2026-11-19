# Builds the overnight (2026-11-12) results deck: pictures of visible changes + land/hold + choices.
import json, sys

def o(id, label, pros, cons, rec=False):
    d = {"id": id, "label": label, "pros": pros, "cons": cons}
    if rec:
        d["recommended"] = True
    return d

def q(id, surface, path, headline, today, problem, proposal, options=None, pick=None):
    d = {"id": id, "words": True, "surface": surface, "path": path, "headline": headline,
         "today": today, "problem": problem, "proposal": proposal}
    if options:
        d["options"] = options
    if pick:
        d["pick"] = pick
    return d

def page(id, title, intro):
    return {"id": id, "page": title, "intro": intro}

LAND = lambda pros, cons: o("land", "Land it", pros, cons, True)
HOLD = lambda pros, cons: o("hold", "Hold it", pros, cons)

LOOK_EXTRA = " Also: the Library update check, vote counts (before, a failed read said \"No votes yet\"), a project's conversations and context files, and friends and friend requests (before, a failed read left \"Loading your friends...\" for ever). Ten places in all. Pictures 5 and 6 on the pictures deck show two of them."

steps = [
 # ---------------- pictures ----------------
 {"id": "V-1", "surface": "Chat", "path": "The waiting strip just above the message box",
  "crop": "chat#queue-waiting-after@1440x230+0+660", "runs": ["before", "after"],
  "headline": "A waiting message now shows the names of the files attached to it.",
  "changed": "Under a waiting message, each attached file shows as a small chip with an icon and its name (never the folder path). Up to three show, then \"+N more\". You asked to see this before it lands (wave 2 deck).",
  "notice": "You can tell which files will go out with a waiting message.",
  "risk": "The waiting strip is one row taller when files are attached. Shown with practice data; not yet tried with a real waiting message."},

 {"id": "V-2", "surface": "Chat", "path": "Above the message box, once, after the app had to replace a damaged Claude Code settings file",
  "crop": "dev/toast#settings-repaired@1440x330+0+570", "runs": ["toast"], "new": True,
  "headline": "A one-time notice when a damaged Claude Code settings file had to be replaced.",
  "changed": "You said yes to this notice on the wave 2 deck. It stays 30 seconds and reads: \"YouCoded couldn't read your Claude Code settings file, so it kept the old copy and started a fresh one. Your own settings in the old copy were not carried over.\" A Show old copy button opens the kept file. It guesses no cause.",
  "notice": "You are told once, instead of your settings quietly resetting.",
  "risk": "Computer only for now (the phone question is further down). Proven by a test and this practice picture, not with a really damaged file."},

 {"id": "V-3", "surface": "Settings", "path": "Settings, Local models, pressing Download on a Gemma model (also first-run setup and Add from Hugging Face)",
  "crop": "settings/assistant/local/gemma-terms@panel", "runs": ["gemma"], "new": True,
  "headline": "Download on a Gemma model now asks first, as you described.",
  "changed": "You asked for \"a short confirmation popup after clicking download/continue, that offer a cancel/download buttons\". Checking the terms first turned up a surprise: Gemma 4 (the three builds the app offers) is under the ordinary Apache 2.0 licence with no use limits. Sources read on 12 November: the Hugging Face pages of those builds and Google's own Gemma 4 licence page. So the popup only credits Google and links the licence.",
  "notice": "One extra click before a Gemma download starts. Cancel starts nothing.",
  "risk": "With no use limits to pass on, the popup may not be worth the click. No removes it. Older Gemma versions were not checked; their popup says the terms of that exact model were not checked."},

 {"id": "V-4", "surface": "Phone", "path": "A chat open on the phone while the assistant's browser on your computer asks for approval",
  "crop": [{"crop": "chat#phone-browser-site", "label": "Use a website"},
           {"crop": "chat#phone-browser-final", "label": "A final step"},
           {"crop": "chat#phone-browser-handoff", "label": "Needs you"}],
  "runs": ["phone"], "new": True,
  "headline": "The assistant's browser approval questions now appear on the phone.",
  "changed": "Before, the question only reached the computer's own window, so on a phone the assistant waited, gave up, and said you had declined. Now the phone chat shows the same card as the computer, with the same words and buttons. You asked for this on 26 October (\"build in remote browser approvals like every other approval card\").",
  "notice": "You can approve or refuse from the phone.",
  "risk": "Passed its tests and these practice pictures only. Nobody has answered a real browser question from a real phone; that is step A of the phone checklist."},

 {"id": "V-5", "surface": "Projects", "path": "A project's Conversations tab when the list cannot be read (practice failure)",
  "crop": "projects/conversations#load-failed@1160x300+140+330", "runs": ["lookbefore", "lookafter"], "labels": {"lookbefore": "Before", "lookafter": "After"}, "themes": ["light"],
  "headline": "A list that failed to load now says so, instead of claiming it is empty.",
  "changed": "Before, a failed read showed \"No conversations in this project yet.\" Now it shows \"Couldn't load this project's conversations\" with the real reason and a Try again button. This is one of ten places changed the same way; the full list is on the questions page under Look and wording.",
  "notice": "A failure no longer looks like you have nothing. The red text here says Mock failure because the practice app fakes the reason; the real app shows the real one.",
  "risk": "The project header above still says 0 conversations beside the new message; that is on the card for the next round."},

 {"id": "V-6", "surface": "Library", "path": "The Library when the check for updates fails (practice failure)",
  "crop": "library#update-check-failed@1440x330+0+30", "runs": ["lookbefore", "lookafter"], "labels": {"lookbefore": "Before", "lookafter": "After"}, "themes": ["light"],
  "headline": "A failed update check now shows a message instead of quietly hiding every Update badge.",
  "changed": "Before, if the check failed every Update badge vanished, which read as \"all up to date\". Now a box at the top says \"Couldn't check for updates\" with the reason and Try again, and badges already known stay.",
  "notice": "You can tell \"nothing to update\" from \"could not check\".",
  "risk": "Seen in the practice app only."},

 # ---------------- land or hold ----------------
 page("P-2", "Land or hold: the work with nothing new to look at",
      "Seven sessions ran overnight. Nothing is landed. Every branch is saved on GitHub and passes the full desktop check; I confirmed they combine with today's app and with each other (one small bookkeeping file needs a routine tidy when combined). A Yes on a picture above lands that item; a No removes it. These questions cover the rest."),

 q("L-1", "Files and Office", "Word and Excel previews, closing a window, Office autosave",
   "Land the Files fixes, now that the stuck check is solved?",
   "This is the branch that was stuck after wave 2 (the one you approved on the wave 2 deck). The stray error is found: one Word-preview test ran a real conversion by accident and ended while it was still going. The fault was in the test, not the app. GitHub now passes all four Linux test runs. Added overnight, all from your wave 2 answers: Excel previews stop after 60 seconds like Word; closing a second window no longer ends its chats when the window in fact stays open; an Office autosave over a change made outside the app always keeps the overwritten version in Versions; and closing any window with unsaved files shows the existing \"Unsaved changes\" popup first.",
   "The close popup counts unsaved Office documents as well as typed text, the same rule as quitting the app. An Office document edited in the last second could briefly trigger it. I kept one rule for both rather than two. The window-close fixes passed their tests but nobody clicked through them with a real second window. Windows, Mac and the phone app were not run.",
   "Landing puts the six wave 2 fixes and these four in the next release.",
   [LAND(["The Word preview hang and the lost-work cases close.", "GitHub's checks pass, including the Linux run that failed before.", "No new screen; the popup is the one you already know."],
         ["Window-close behaviour is proven by tests only.", "A genuine Excel file needing over 60 seconds to preview would now fail with a message."]),
    HOLD(["Nothing changes until you have tried a second window yourself."], ["The faults stay; the branch falls behind again."])]),

 q("L-2", "Chat", "File sizes across the app; picture previews when attaching from a phone browser",
   "Land the sizes change and the phone-browser picture previews?",
   "Both come from your wave 2 answers. Sizes: 17 places now count 1000 per step, the way websites and Hugging Face do, through one shared piece of code. Example: a model shown as 74.2 of 113.0 GB now reads 79.7 of 121.3 GB. Places: Local models (sizes, progress, delete confirmation), the model loading bar, file drawer, session card, the too-large-file messages, phone file card, project instruction files, theme publish list, the sync \"history is large\" notice, the memory and free-space warnings, and the assistant's own file-reading notes. Phone browser: a picture you pick there now shows a small preview in the message box.",
   "Limit sentences such as \"50 MB\" were left as they are (the true limit is about 5% higher than the label; changing limits would shrink them). The phone preview cannot be pictured here; it is proven by tests only. An Android app connected to a computer gets the previews too, because it uses the same path. A card (#254) is filed for full previews on phones later.",
   "Landing puts both in the next release.",
   [LAND(["Sizes match what download pages show.", "A test now fails if anyone adds an old-style size again."],
         ["Every size reads about 5 to 7% larger than before for the same file.", "Phone preview unseen on a real phone."]),
    HOLD(["Nothing changes."], ["Sizes keep disagreeing with download pages."])]),

 q("L-3", "Chat engine", "What the assistant is told after a crash; OpenRouter replies",
   "Land the crash-recovery change and the OpenRouter record?",
   "Crash recovery: you asked for a proper review of the leftover change. Result: it is sound, the app has nothing equivalent, and it changes nothing you see. After a crash, a step whose result was lost is described to the assistant as \"completion unknown, check before retrying\" instead of \"Canceled\", so it does not redo an edit or a send that did happen. It also stops a reopened chat from ballooning (one real chat had grown to about 1.09 million tokens from this). It is now on today's app with two more tests. OpenRouter: the app now records which company served each reply, beside the cost figures it already keeps. No chat text is recorded and nothing is shown.",
   "The research confirmed your memory: cost work was done in September (two rounds of fixes; ChatGPT follow-up reuse went from 13 of 20 to 18 of 20). What is still unknown is why OpenRouter re-reads the whole chat on roughly 1 in 5 quick follow-ups, because the serving company was never recorded. With this record, one or two weeks of your normal use answers that for free. No live crash was replayed; the proof is tests plus three real damaged chats repaired offline.",
   "Landing both means no paid test is needed for the OpenRouter question; I would re-measure two weeks after the release.",
   [LAND(["Removes a real double-action risk after crashes.", "Answers the OpenRouter question without spending."],
         ["Not seen with a live crash.", "The OpenRouter answer takes two weeks of use."]),
    HOLD(["Nothing changes."], ["The crash hazard stays; the cost question stays unanswerable."])]),

 q("L-4", "Chat engine", "Chats on YouCoded's own engine that use helpers or background commands",
   "What should happen with the early-stop fix?",
   "The fault: a helper or background command finishes, but its report reaches the assistant late or is lost as the turn ends, so the assistant sits idle until you type. The research found a fix had been built and tested in October in a test lab but never reached the app. Overnight it was rebuilt on today's app. Without it, 19 of the 22 tests written for this fault fail; with it all pass. I then had a second, independent reviewer go through it. It found one real fault (an answer cut off at its length limit could be left unfinished when a report arrived at the same moment), which is fixed with its own test.",
   "It is about 140 lines of timing logic in the heart of the engine. Nobody has watched a real model with it, and it is not proven that this is what caused the stalls you saw. One side effect: when a report is waiting and you send a message, both now go to the model together instead of in two steps (slightly cheaper, same order).",
   "A paid check would run 20 scripted chats on today's app and 20 with the fix, on a cheap model, in a private test copy: \"start a helper, then write a file without being nudged\". Estimated under 1 USD; I would cap it at 3 USD. It would use a cheaper model than the one that stalled for you, so a clean result is good evidence, not proof.",
   [o("land", "Land it now",
      ["Fixes a fault the tests reproduce on today's app.", "Reviewed twice.", "No spending."],
      ["A subtle timing mistake would only show in real use."], True),
    o("paid", "Run the paid check first (cap 3 USD), then land if clean",
      ["More confidence before it reaches a release."], ["Costs up to 3 USD and a day.", "Still not proof for the model you saw stall."]),
    o("hold", "Hold it",
      ["No risk."], ["Idle stalls after helpers stay possible."])]),

 q("L-5", "Look and wording", "Hover hints and failed-load messages across settings, marketplace and the new-session form",
   "Land the look-and-wording changes the approved guide already calls for?",
   "Two kinds of change. Hover hints: about 90 plain browser hints (the small grey system box) now use the app's own hint, with the same words. Honest failure messages: places that showed an empty list or nothing when a load failed now say \"Couldn't load ...: <the real reason>\" with a Try again button, in the standard red-tinted box. Done so far: the new-session model lists (before, Create was greyed out with no reason), Local models, the sync log (before, it said \"No sync log entries yet\"), Blocked users and Web search keys." + LOOK_EXTRA,
   "A No on picture 5 or 6 removes only that one. No before and after pictures of the hover hints exist: a hint cannot be caught in a still picture. Contrast colours and button alignment were not touched (your deferred decisions). The error-message card is large; what remains after this stays on the card.",
   "Landing puts these in the next release. Each group is separate, so any one can be taken out later.",
   [LAND(["Failures stop looking like \"you have none\".", "Hints match the rest of the app.", "A test now fails if a plain browser hint is added again."],
         ["Hover hints proven by tests, not seen by you."]),
    HOLD(["Nothing changes until you have hovered around a test copy."], ["Empty-looking failures stay."])]),

 q("L-6", "Workspace tools", "Speed-measuring tools and the research notes (nothing here ships to users)",
   "Land the speed-tool repairs and the research notes?",
   "Speed session: the first try measured nothing because the computer was too busy, so I re-ran it later. It found and fixed two faults in the measuring tool itself (a safety check that wrongly refused every run, and a memory limit that counted shared memory several times). Then it measured, in the packaged app on practice data: switching chats shows the first picture in 25 to 35 thousandths of a second; typing appears in 3 to 15; the app's window stops being blank after about 0.2 seconds and lists sessions after about 0.7 (the card said 1.3). Nothing was slow enough to justify a risky change, so no app code changed. Research notes: the history of the cost and early-stop cards, the test plan, the review of the crash change.",
   "All numbers are from this computer without its real graphics card in use, on practice chats smaller than yours. Windows, Mac, phone and real-graphics numbers do not exist. Older history pages do get slower to load when you scroll thousands of messages back; the cause is the page itself growing, and the only cure is showing part of a long chat, which is a visible redesign you would need to approve. I left it.",
   "Landing only changes workspace tools and notes.",
   [LAND(["Later speed sessions can measure terminal, files and history, which was impossible before.", "The research is kept where sessions will find it."],
         ["None for users."]),
    HOLD(["Nothing."], ["The next speed session hits the same broken checks."])]),

 # ---------------- choices ----------------
 page("P-3", "Choices the sessions left for you: chat and phone",
      "Each of these is a product choice I should not make for you. Nothing here is built unless the question says so."),

 q("C-1", "Chat", "The damaged-settings notice from the second picture",
   "Should phones and the Android app get the damaged-settings notice too?",
   "The notice appears in the computer's own window only.",
   "The Android app does the same repair, and that is where a silent reset is most likely to go unnoticed. Showing it there means letting phones ask the computer one more question (\"was a settings file replaced?\"); the answer is only the kept file's location.",
   "Yes builds it for phones; No leaves the notice on the computer only.",
   [o("yes", "Yes, phones too", ["Android users are told as well."], ["One more thing a connected phone is allowed to ask."], True),
    o("no", "Computer only", ["Phone abilities unchanged."], ["A reset on Android stays silent."])]),

 q("C-2", "Chat", "Right-clicking a picture in a chat",
   "Design 1 of 3: what should right-click on a picture offer?",
   "You approved designing this on the wave 2 deck. Today right-clicking a picture gives only the general chat menu. Looked at for reference: the chat right-click menu, the Browser panel's Copy and Paste menu, and the file-chip menu.",
   "There is no quick way to copy or save a picture the assistant made or you attached.",
   "The same small menu at the pointer. On a phone browser, saving hides (as file chips already do).",
   [o("four", "Copy image, Save image as, Copy image address (web pictures only), Ask about this",
      ["Covers everything you listed."], ["A save window on each system to get right."], True),
    o("two", "Only Copy image and Ask about this", ["Small; works the same everywhere."], ["No way to save."]),
    o("drop", "Leave it", ["Nothing to build."], ["No picture menu."])]),

 q("C-3", "Chat", "The folder chooser when starting or switching a session",
   "Design 2 of 3: how should recent folders come first?",
   "The folder dropdown lists every saved folder in a fixed order. Looked at for reference: the folder switcher, the Project View list and the Resume browser's grouping.",
   "With many folders, the two or three you use daily are scattered through the list.",
   "Rows, dots and the footer stay as they are either way.",
   [o("group", "A small \"Recent\" group of the last five on top, then the full list",
      ["Clear; the full list never moves."], ["A recent folder appears twice."], True),
    o("reorder", "Reorder the one list by last use", ["No duplicates."], ["The list rearranges itself, so a folder is never where it was."]),
    o("drop", "Leave it", ["Nothing changes."], ["Scrolling stays."])]),

 q("C-4", "Chat", "Pressing a quick chip (Journal, Inbox, Git Status ...) when the message box already has text",
   "Design 3 of 3: what should a quick chip do when you have already typed something?",
   "With an empty box a chip fills it. With text in the box, the chip's words are added in a way that is easy to get wrong. Looked at for reference: the quick chips and the Edit strip on waiting messages.",
   "You can lose or mangle what you had typed.",
   "With an empty box nothing changes in any option.",
   [o("strip", "A slim strip above the box: Replace, Add to end, or cancel",
      ["Nothing is lost by accident.", "Same strip as editing a waiting message."], ["One extra tap whenever the box has text."], True),
    o("append", "Always add to the end", ["No question asked."], ["You cannot swap what you typed for the chip."]),
    o("drop", "Leave it", ["Nothing changes."], ["The awkward merge stays."])]),

 q("C-5", "Phone", "The red dot and chime on the phone",
   "Should the phone chime and show red when the browser asks for approval?",
   "With the fourth picture landed, the approval card appears in the chat on the phone, but the phone does not chime and its dot does not turn red.",
   "If you are not looking at that chat, you may not notice the assistant is waiting. The red-dot rules belong to the notifications work (built, waiting for your testing), and changing them here too would mean two pieces of work editing the same rules.",
   "Either way the card itself works.",
   [o("later", "Add it with the notifications work", ["One consistent meaning of red.", "No clash between two branches."], ["Until then the phone stays quiet for browser questions."], True),
    o("now", "Add it now", ["Alerted straight away."], ["A visible change beyond the card.", "Likely rework when notifications land."])]),

 q("C-6", "Phone", "The phone while your computer is asleep or off",
   "What should the phone say when it cannot reach your computer?",
   "A sleeping or switched-off computer just shows \"reconnecting\" and then \"can't connect\".",
   "The app cannot know the computer is asleep; it only knows it is silent. Nothing tells you what is likely wrong or whether to wait. The session found no new bug in the reconnect code; earlier fixes are in.",
   "Wording only, shown after about 20 seconds of silence. Not built.",
   [o("maybe", "\"Can't reach your computer. It may be asleep or off. YouCoded will keep trying.\"",
      ["Tells you the likely cause and that waiting is fine."], ["\"May be\" is a guess, though labelled as one."], True),
    o("plain", "\"Your computer isn't answering.\"", ["Strictly true."], ["No hint what to do."]),
    o("leave", "Leave as is", ["Nothing new."], ["The confusion stays."])]),

 page("P-4", "Choices: models, themes and looks", "Same as the page before: product choices, nothing built unless the question says so."),

 q("C-7", "Models", "Adding your own model from a provider the app does not know",
   "What size should the app assume for a model whose size it cannot find out?",
   "When a hosted model's conversation size is unknown, the app assumes 250 thousand and starts summarising near 231 thousand. A model on your own computer is assumed to be 32 thousand.",
   "Most hosted models are smaller than 250 thousand (many are 128 thousand; Claude is 200; DeepSeek 64). They refuse a long chat before the app ever summarises, and some word the refusal in a way the app does not recognise, so there is no Summarise button and the chat is a dead end.",
   "Pick what to do now; the options can be combined later.",
   [o("128", "Assume 128 thousand now, and add a size box to the add-model screen later",
      ["Fixes the common 128 and 200 thousand models at once.", "The size box makes any model exact."],
      ["Very large models get summarised earlier (near 111 thousand instead of 231).", "64 and 32 thousand models still fail until the size box exists.", "The size box needs a small design round."], True),
    o("keep", "Keep 250 thousand", ["Nothing changes."], ["Most unknown models keep failing in long chats."]),
    o("small", "Assume 32 or 64 thousand", ["Almost nothing fails."], ["Every unknown model summarises constantly during file work."]),
    o("learn", "Learn the size from the first failure", ["Fixes itself."], ["One failure per model first, and only for refusals the app recognises."])]),

 q("C-8", "Themes", "The model name chip in the bar under the message box, on light themes",
   "Provider brand colours are hard to read on five light themes. How should that be fixed?",
   "The model chip uses each provider's brand colour (Claude's orange, and so on). All 14 themes pass the main contrast checks, but these brand colours fail the readable-text mark in 27 places on Kuromi Dreamer, Cotton Candy Sky, Meadow Mist, Strawberry Kitty and Morning Rounds.",
   "The provider name is faint on those themes.",
   "Not built; this is one of the contrast decisions you deferred.",
   [o("derive", "Adjust each brand colour to the theme it sits on",
      ["Readable on every theme, including community ones."], ["A brand colour is slightly darker or lighter from theme to theme."], True),
    o("darken", "Darken the brand colours used on all light themes",
      ["Simple; one fixed set."], ["Also changes the built-in Light and Creme themes, which you were told would not move."]),
    o("leave", "Leave it", ["Nothing changes."], ["Faint names stay."])]),

 q("C-9", "Help", "The Known issues row in the Help popup",
   "Known issues closes Help and opens a web page with no word in the app. Change it?",
   "Pressing Known issues closes the Help popup and opens your browser.",
   "If the browser opens behind the app, it looks like the click did nothing and Help vanished.",
   "The help bubbles themselves were checked and had no fault.",
   [o("notice", "Keep it, and show a short \"Opening in your browser\" notice", ["You know what happened."], ["One small new message."], True),
    o("open", "Keep Help open behind", ["Nothing vanishes."], ["Help stays in the way when you come back."]),
    o("leave", "Leave it", ["Nothing changes."], ["The small surprise stays."])]),

 q("C-10", "Themes", "The published list of themes that every copy of the app downloads",
   "When should the rebuilt theme list be published?",
   "In wave 1 you landed a fix so a theme shows Update when its files change. It needs the published theme list rebuilt with a fingerprint for every theme file, which nobody had done since 5 October. The rebuilt list is ready on a branch: 131 files fingerprinted, each checked against the real file, version numbers unchanged. I also had the build corrected so it no longer marks all 8 themes as updated today (that would have made the marketplace's New sort treat them all as fresh)." ,
   "Publishing reaches every user at once. What they would see: nothing. No installed theme shows Update, nothing is downloaded again. Only themes installed afterwards by a newer app can show Update on a later edit. Apps that check fingerprints refuse a file that does not match; none mismatch today.",
   "The app fix itself is not in a release yet.",
   [o("with", "Publish when the release containing the fix goes out", ["List and app change together.", "Nothing visible either way."], ["One more step to remember at release time (I will put it on the release card)."], True),
    o("now", "Publish now", ["Done and out of the way."], ["Live for everyone before any app can use it."]),
    o("wait", "Wait for the next real theme change", ["No separate publish."], ["The Update fix stays inert until then."])]),

 q("C-11", "Themes", "The preview picture of a theme you built yourself, when you share it",
   "Self-built themes get a drawn preview, not a real screenshot. What should happen?",
   "Built-in and community themes show a real screenshot. A theme you build gets a picture the app draws from its colours.",
   "The drawn picture does not look like the real app, so your theme looks different from the others in the list.",
   "Nothing was built: a real screenshot means the app photographing itself with the theme on, which is a feature of its own.",
   [o("real", "Make it a card: the app captures a real picture of itself, as its own approved feature later",
      ["Self-built themes look like the rest."], ["A sizeable feature touching every share."], True),
    o("restyle", "Restyle the drawing to look more like the app", ["Small."], ["Still a drawing."]),
    o("leave", "Leave it", ["Nothing to do."], ["The mismatch stays."])]),

 q("C-12", "Themes", "Particle and glass effects on slower computers",
   "Should themes' particle and glass effects stay on by default on weaker computers?",
   "Effects are on for everyone unless Reduced Effects is switched on. They are already capped at 30 pictures a second and stop when the window is hidden.",
   "Earlier readings (5 October): glass themes used 11 to 15% of the processor while the assistant was writing, against 2.4% for a plain theme. On a weak laptop that means heat and battery.",
   "No defaults were changed. Real-graphics-card numbers were not taken overnight.",
   [o("on", "Keep them on", ["Themes look as designed for everyone."], ["Weak laptops pay in battery unless the user finds Reduced Effects."], True),
    o("weak", "Off by default on weak hardware", ["Cooler and smoother there."], ["New users on such machines see plainer themes.", "\"Weak\" has to be guessed."]),
    o("ask", "Ask once at first run", ["The user chooses."], ["One more first-run screen."])]),

 q("C-13", "Chat", "A chat message that lists thousands of file paths",
   "Should very long file lists in a message be shortened with a \"show all\" control?",
   "A message listing 10,000 file paths froze the window for about 0.7 seconds in the speed tests (1.5 seconds at 20,000), because each path is drawn as a button. Measured once, on practice data.",
   "A brief freeze when such a message appears. It is rare.",
   "The cure is visible: show the first 500 and a \"show all\" control.",
   [o("leave", "Leave it for now", ["No change to how lists look.", "It is rare and was measured only once."], ["The freeze stays for huge lists."], True),
    o("design", "Bring me a small design for it", ["Removes the freeze."], ["Long lists are no longer fully shown at first."])]),

 page("P-5", "How I work from here", "One question about how the next waves run."),

 q("W-1", "How we work", "Landing work without waiting for you",
   "From now on, may I land invisible fixes myself once GitHub's checks pass?",
   "Your rule is that nothing lands without your word, except records (cards, archived decks). You told me last night to manage the remaining sessions myself; I ran them, checked them, and held every branch.",
   "Held branches fall behind and start clashing with each other. Five branches are waiting on this deck this morning.",
   "This would cover only changes with nothing to see: fixes proven by tests, tools, notes. Anything you could see or feel still comes to you first with pictures, and I report each landing afterwards. Paid runs still need your OK.",
   [o("green", "Yes, land invisible fixes when checks pass",
      ["Fixes reach the app sooner; fewer questions for you.", "Visible changes still wait for you."],
      ["You learn about those fixes after they are in.", "My judgement of \"invisible\" could be wrong; overnight a second look found two small side effects in work first reported as invisible, both caught and removed before reaching you."], True),
    o("ask", "No, keep asking per wave", ["You approve everything."], ["Work waits for you; branches pile up."])]),
]

pics = [x for x in steps if x["id"].startswith("V-")]
rest = [x for x in steps if not x["id"].startswith("V-")]
rest[0] = page("P-2", "Land or hold: the work with nothing new to look at", rest[0]["intro"].replace("A Yes on a picture above", "A Yes on the pictures deck"))
d = sys.argv[1]
json.dump({
 "title": "Overnight: six visible changes to keep or remove",
 "key": "overnight-pictures-2026-11-12", "out": "overnight.review.html",
 "images": "images/overnight.review",
 "runs": {"before": "runs/q62before", "after": "runs/q62after", "toast": "runs/chat11",
          "gemma": "runs/chat45", "phone": "runs/phone-20261112-113348",
          "lookbefore": "runs/lookbefore", "lookafter": "runs/lookafter"},
 "themes": ["meadow-mist", "light"], "theme": "fixed", "steps": pics}, open(d + "/overnight.review.json", "w"), indent=1, ensure_ascii=False)
json.dump({
 "title": "Overnight results: six things to land and fourteen choices",
 "key": "overnight-results-2026-11-12", "out": "overnight.questions.html",
 "themes": ["midnight", "light"], "stage": "ask", "steps": rest}, open(d + "/overnight.questions.json", "w"), indent=1, ensure_ascii=False)
print(len(pics), "pictures,", len([x for x in rest if "page" not in x]), "questions")
