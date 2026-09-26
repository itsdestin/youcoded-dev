# Pieces audit 2b: chat content and status (meadow-mist)

Path prefix `S/` = `/home/destin/youcoded-dev/worktrees/sessions/ui-consistency-audit/scratch/pieces-audit/`. Tool cards, permission prompts (Yes / Always Allow / No) and terminal are exempt per guide "Not covered yet".

| screen | piece | verdict | note |
|---|---|---|---|
| bubbles deliverables `S/shots-bubbles/meadow-mist/deliverables.png` | "Deliverables 1 ..." row with folder icon, bold word, faint number, grey summary, chevron | FOLLOWS | word then smaller number (count style) |
| same | assistant bubbles with "Show reasoning" italic toggle, 3 stacked bubbles | NO RULE | KIND: message bubble with collapsible reasoning |
| same | tool row "Ran a command · Regenerate charts" inside bubble | NO RULE | exempt tool card |
| same | bubble > Deliverables row (bordered pill) | BREAKS | box inside a box (row boxed inside bubble) |
| same | status bar: "PERMISSION UNKNOWN" red text chip | BREAKS | spaced capitals + red body text |
| same | status chips "Qwen2.5 Coder:14b" (purple text), "Add tags", "Meadow Mist" | NO RULE | KIND: dense status-bar chips, coloured text |
| same | quick-chip row (Journal, Inbox ...) | NO RULE | KIND: shortcut chips as buttons |
| same | header: red dot on settings icon; "3" round number bubble on Session Files button | BREAKS | never a number in a bubble (open question in decisions H-4) |
| same | session strip of coloured dots (green / grey / red) | BREAKS | status as bare dot with no word/pill (NO RULE for a tab strip; kind: session switcher strip) |
| bubbles handoff `S/shots-bubbles/meadow-mist/handoff.png` | "Interrupted." italic line with left bar inside bubble | NO RULE | KIND: inline stop/interrupted note in a message |
| same | "Created a file and searched the code - 1 failed" row, greyed | NO RULE | exempt tool card failure row (failure shown as grey text, no tinted box) |
| same | inline code word "raop-discover" in bold green | NO RULE | KIND: inline code/emphasis; coloured body text (green) |
| bubbles mix `S/shots-bubbles/meadow-mist/mix.png` | token names (canvas, panel, inset...) in green text inside bubble | BREAKS | coloured body text (never coloured text; hue in tints only) |
| same | "Response truncated - Your assistant hit the output token limit." italic faint with left bar | NO RULE | KIND: system note inside a message; hard state (limit) shown only as faint italic, no notice box |
| same | "Invoked skill: audit" dashed-outline row | NO RULE | KIND: skill-invocation marker, dashed border unlike any card |
| same | Deliverables row highlighted green fill next to plain rows | NO RULE | inconsistent boxed row fill between sibling rows |
| bubbles reasoning-stop `S/shots-bubbles/meadow-mist/reasoning-stop.png` | tiny bubble with only "Show reasoning" + "Interrupted." | NO RULE | hard state: empty assistant message (reasoning only, no answer) |
| bubbles silent-steps `S/shots-bubbles/meadow-mist/silent-steps.png` | long path in "Read a file · /home/.../2026-09-01-audit.md first 5 lines" fits on one line | FOLLOWS | long text handled (fits) |
| bubbles skills-chain `S/shots-bubbles/meadow-mist/skills-chain.png` | "Invoked 2 skills: ui-mockup and brainstorming" dashed row | NO RULE | KIND: skill-invocation marker |
| same | Deliverables row here has summary right-aligned, other screens left-aligned after number | BREAKS | same piece laid out differently (inconsistent) |
| bubbles skill-first `S/shots-bubbles/meadow-mist/skill-first.png` | user bubble "/audit" | NO RULE | KIND: user message bubble |
| helper asks `S/shots-helper-asks/meadow-mist/group.png` | "Ellis the Eager Explorer · Survey the repo layout" helper rows | NO RULE | exempt tool card / helper row |
| same | "Bringing in a specialist (+2 completed) - 1 waiting on you" in AMBER text | BREAKS | coloured body text (amber) |
| same | "Hiring an explorer · Check the release notes" row with grey cross icon | NO RULE | failed helper row shown as grey; no notice |
| same | status bar amber chip "1 needs you" with clock icon | NO RULE | KIND: attention chip in status bar; amber text on tint |
| same | bubbles all edge-to-edge width (up to 1070px) | NO RULE | KIND: bubble width behaviour |
| helper asks `S/shots-helper-asks/meadow-mist/bottom.png` | permission cards Yes (green) / Always Allow (blue) / No (red) pills, left-aligned | NO RULE | exempt permission prompt (kept as today) |
| same | card inside bubble with inner grey text well (bubble > card > well) | NO RULE | exempt tool card |
| same | header count "12" round bubble on Session Files | BREAKS | number in a bubble |
| cc-subagents `S/shots-cc-subagents/meadow-mist/helpers.png` | popup "Subagents" title + subtitle "2 working · 1 finished" + drawn X + line under | FOLLOWS | shared popup title, X at right |
| same | small labels "WORKING" / "FINISHED" | BREAKS | spaced capitals |
| same | cards with name (dotted underline), kind, "Working" pill with dot at right | FOLLOWS | live status pill with dot inside |
| same | "Finished" pill with check icon, grey | FOLLOWS | small status pill (normal case) |
| same | Briefing / Activity (3) / Response fold-outs, boxed row with chevron at right | FOLLOWS | fold-out = boxed row, arrow at right |
| same | "Activity (3)" bracket count | BREAKS | never "(17)"; should be "Activity 3" |
| same | cards inside a popup, each with boxed fold-outs inside | BREAKS | box inside a box (card > fold-out rows) |
| same | dotted underline under titles "Sweep the artifact panel" | NO RULE | KIND: rename/hint underline, looks like link |
| statusbar-relevance `S/shots-statusbar-relevance/meadow-mist/menu-native.png` | popup "Status Bar Widgets" title, X, tapered line | FOLLOWS | shared popup |
| same | "ALWAYS ON" / "RATE LIMITS" / "SESSION" / "TOKENS" | BREAKS | spaced capitals |
| same | tick-circle + name + (i) rows | NO RULE | KIND: checklist rows with tick on left |
| same | unavailable widgets greyed with italic reason ("Claude Code sessions only") | NO RULE | KIND: disabled item + reason line (good hard state) |
| same | list cut with fade at bottom edge | FOLLOWS | fade at hidden edge |
| statusbar-relevance `S/shots-statusbar-relevance/meadow-mist/bar-native-metered.png` | top strip "This model's context window is small ..." amber dot + text + bare "Details" | BREAKS | bare-text action; strip instead of tinted notice box; status as bare dot |
| same | "Cogitating" pill bottom-left of list | NO RULE | KIND: live activity indicator |
| same | status bar chips "Cost: $1.37", "In: 84.0k", "Out: 3.2k", "Cached: 61.0k" (green text), "Reuse: 73%" (amber text), "+210 -45 lines" | BREAKS | coloured body text in chips; counts as chips "Label: value" (no rule) |
| same | one session shown as a pill with green dot + chevron | FOLLOWS | live status dot inside pill |
| openrouter-trust `S/shots-openrouter-trust/meadow-mist/card-expired.png` | popup title "Assistant settings" + X | FOLLOWS | shared popup |
| same | "This key stopped working on Sep 23. Sign in again, or paste a new API key." in RED text | BREAKS | never red body text; should be tinted notice box inside card |
| same | red dot next to heading "Cloud providers" | BREAKS | status as bare dot with no word |
| same | provider card > boxed cards inside settings area, small outlined My Account / Sign out at right | FOLLOWS | outlined secondary at right |
| same | "Sign in with OpenRouter" filled right of outlined "API Key" | FOLLOWS | filled on right, outlined directly left |
| same | usage meters with green / amber percentage TEXT (42%, 61%) | BREAKS | coloured text; NO RULE for meter kind |
| same | "Your own API keys" small grey label (normal case) | FOLLOWS | small label style |
| same | "Add provider" bare centred text | BREAKS | follow-up action should be full-width outlined button |
| same | "Cloud provide..." left menu item cut off with ellipsis | BREAKS | long text hard state: label truncated beside red dot |

| openrouter-trust `S/shots-openrouter-trust/meadow-mist/settings-dot.png` | General settings: boxed setting cards (Default model, Context, Session naming, Step guard) | FOLLOWS | settings-style boxed rows, wide controls below |
| same | Context: two segmented pair strips (250k / 1M) side by side in one box | NO RULE | KIND: two small tab strips sharing a row |
| same | Session naming 3-choice strip Off / Basic / AI | FOLLOWS | 2-4 choices = tab strip |
| same | Close-session prompt switch at right | FOLLOWS | small control beside title |
| same | red dot on "Cloud provide..." menu item, label truncated | BREAKS | bare dot, no word; label cut off |
| same | nested dropdown boxes inside boxed cards | BREAKS | box inside a box (setting card > select box) |
| openrouter-signin `S/shots-openrouter-signin/meadow-mist/si-apikey.png` | "Connect OpenRouter" narrow popup with X, tapered line | FOLLOWS | shared popup |
| same | Connect (filled, top) and Cancel (outlined) stacked full width | FOLLOWS | narrow popup stacks, filled on top |
| same | key text box with Connect as separate button below | BREAKS | a text box's own action sits inside at right (arguable: it is the popup's main action) |
| same | filled Connect looks faded (disabled) with no reason shown | NO RULE | hard state: disabled main action without a hint |
| same | "openrouter.ai" link inside sentence | FOLLOWS | link only inside a sentence |
| openrouter-signin `S/shots-openrouter-signin/meadow-mist/si-broken.png` | "OpenRouter didn't accept this key. Sign in again, or paste a new API key." RED text | BREAKS | never red body text; should be tinted box inside the card |
| same | "Key not accepted" status as plain grey word | BREAKS | status = small tinted pill, not bare grey words |
| same | "Not connected" (si-not-connected) plain grey word | BREAKS | status = tinted pill (kind: idle status) |
| openrouter-signin `S/shots-openrouter-signin/meadow-mist/si-not-connected.png` | "Add provider" bare centred text | BREAKS | follow-up action: full-width outlined button |
| same | Claude Code / ChatGPT cards with plan text and two meters with green / amber % text | NO RULE | KIND: usage meter; coloured percentage text breaks "hues in tints, not text" |
| chatgpt-signin `S/shots-chatgpt-signin/meadow-mist/first-run-sign-in.png` | wordmark, sentence, progress bar "100%" | NO RULE | KIND: full-window setup screen |
| same | five stacked full-width outlined pill buttons (Log in with Claude / ChatGPT / OpenRouter / local model / API key), none filled | BREAKS | one filled main action per view; controls should follow theme roundness (fully round pills here) |
| same | box (card) holding two paragraphs of centred text and the buttons | NO RULE | KIND: sign-in card; centred body text |
| same | permission warning paragraph "the assistant may create, change, or delete files" as plain centred text | BREAKS | warning should be the tinted notice box |
| chatgpt-signin `S/shots-chatgpt-signin/meadow-mist/providers-chatgpt-waiting.png` | ChatGPT card: busy dots, "Waiting for the browser...", outlined Cancel at right | FOLLOWS | waiting state, action at right |
| same | "Add provider" is a dashed-outline empty row with bare text | BREAKS | should be full-width outlined button (here dashed, cut by fade) |
| model-brand `S/shots-model-brand/meadow-mist/statusbar.png` | quoted-conversation cards inside bubble: Preview outlined left of Resume filled, date at left of buttons | FOLLOWS | filled on right, outlined left; dates present |
| same | bubble > card > row nesting; "Resume..." with ellipsis cut | BREAKS | box inside a box |
| same | greyed "Resume" + "Project folder not on this device" plain grey text | NO RULE | KIND: item-level unavailable state |
| same | chips "Follow-Up Needed", "UI", "Native Runtime" under name | FOLLOWS | one chip row under the name |
| same | status bar: "Sonnet | Auto Effort" (red-orange text), "NORMAL", "Priority +1" with two coloured dots, "2 subagents" | BREAKS | "NORMAL" all-capitals; coloured text; counts written "+1" inside chip |
| same | "Chat" filled tab beside icon-only terminal tab | NO RULE | KIND: chat/terminal view switch in top bar |
| model-brand `S/shots-model-brand/meadow-mist/_unverified/model-list.png` (unverified) | empty chat "Start a conversation with your assistant" centred grey text over wallpaper | NO RULE | KIND: empty state (no action offered, low contrast on wallpaper) |
| same | status bar "Sonnet 4.6" brand chip (red text), "PERMISSION UNKNOWN" red, icon-only chip | BREAKS | red body text + spaced capitals; icon-only chip has no label |
| same | screen is titled "model-list" but shows no model list | NO RULE | screenshot did not capture what its name says (unverified) |

## NO RULE kinds (new relative to chat.md)
- Message bubbles and their inline markers: "Show reasoning" toggle, "Interrupted." note, "Response truncated" note, dashed "Invoked skill" rows, inline code words (`S/shots-bubbles/meadow-mist/mix.png`, `.../handoff.png`, `.../skills-chain.png`).
- Live activity pill ("Cogitating") (`S/shots-statusbar-relevance/meadow-mist/bar-native-metered.png`).
- Status-bar chips "Label: value" with coloured values (`.../bar-native-metered.png`, `S/shots-model-brand/meadow-mist/statusbar.png`).
- Attention chip "1 needs you" (`S/shots-helper-asks/meadow-mist/group.png`).
- Usage meters with coloured percentage text (`S/shots-openrouter-signin/meadow-mist/si-not-connected.png`).
- Full-window sign-in / setup card (`S/shots-chatgpt-signin/meadow-mist/first-run-sign-in.png`).
- Two segmented strips in one row (`S/shots-openrouter-trust/meadow-mist/settings-dot.png`).
- Checklist rows with tick-left and unavailable-with-reason lines (`S/shots-statusbar-relevance/meadow-mist/menu-native.png`).
- Empty chat state (`S/shots-model-brand/meadow-mist/_unverified/model-list.png`).
- Disabled main action with no reason (`S/shots-openrouter-signin/meadow-mist/si-apikey.png`).
- Helper/specialist rows and helper-ask permission cards (exempt tool cards) (`S/shots-helper-asks/meadow-mist/bottom.png`).
- Session-strip dots in top bar (`S/shots-bubbles/meadow-mist/deliverables.png`).

## BREAKS by rule
| rule | examples |
|---|---|
| Never red / coloured body text | red provider errors `S/shots-openrouter-signin/meadow-mist/si-broken.png`, `S/shots-openrouter-trust/meadow-mist/card-expired.png`; PERMISSION UNKNOWN chip on every chat shot; amber "1 waiting on you" `S/shots-helper-asks/meadow-mist/group.png`; green token names `S/shots-bubbles/meadow-mist/mix.png`; green/amber percentages on all provider shots |
| No spaced-out capitals | WORKING / FINISHED `S/shots-cc-subagents/meadow-mist/helpers.png`; ALWAYS ON / RATE LIMITS `S/shots-statusbar-relevance/meadow-mist/menu-native.png`; NORMAL and PERMISSION UNKNOWN chips `S/shots-model-brand/meadow-mist/statusbar.png` |
| Counts never "(17)" / never a number in a bubble | "Activity (3)" `.../helpers.png`; round "3"/"12" on Session Files header button on every chat shot |
| Status = tinted pill, not bare dot / grey word | red dot on Cloud providers `S/shots-openrouter-trust/meadow-mist/settings-dot.png`; "Key not accepted", "Not connected" `S/shots-openrouter-signin/meadow-mist/si-broken.png`; session strip dots |
| Follow-up action = full-width outlined button, never bare text | "Add provider" `S/shots-openrouter-signin/meadow-mist/si-not-connected.png`, `S/shots-chatgpt-signin/meadow-mist/providers-chatgpt-waiting.png`; "Details" `S/shots-statusbar-relevance/meadow-mist/bar-native-metered.png` |
| No box inside a box | bubble > quoted card > row `S/shots-model-brand/meadow-mist/statusbar.png`; card > fold-outs in popup `.../helpers.png`; bubble > Deliverables row `S/shots-bubbles/meadow-mist/deliverables.png` |
| Notice = tinted box, not strip/dot | amber-dot strip with bare Details `.../bar-native-metered.png`; first-run warning paragraph as plain text `S/shots-chatgpt-signin/meadow-mist/first-run-sign-in.png` |
| One filled button per view / shape follows theme | five outlined pills, none filled `.../first-run-sign-in.png` |
| Text box with own action inside at right | Connect below the key box `S/shots-openrouter-signin/meadow-mist/si-apikey.png` (arguable) |
| Long text hard state | "Cloud provide..." truncated `.../settings-dot.png`; "Resume..." cut `.../statusbar.png` |

## Counts (rows in the table above, by script-free tally)
About 70 rows: FOLLOWS about 24, BREAKS about 27, NO RULE about 20 (approximate, hand tally). 21 images viewed.

## Could not judge
- `S/shots-bubbles/meadow-mist/skills-spread.png` (skipped as near-duplicate of skills-chain), `approval.png` (covered by chat.md).
- `S/shots-statusbar-relevance/meadow-mist/bar-claude-code`, `bar-native-delegated`, `bar-native-local`, `bar-native-unpriced`, `menu-claude-code` (not opened; only metered bar and native menu seen).
- `S/shots-openrouter-trust/meadow-mist/card-rejected|card-unchecked|card-verified|card-wrong-type|chat-key-rejected` and `_unverified/modal-fake-key.png` (near-duplicates of card-expired; not opened).
- `S/shots-openrouter-signin/meadow-mist/si-connected.png` (not opened).
- `S/shots-chatgpt-signin/meadow-mist/providers-chatgpt-signed-in.png`, `providers-chatgpt-signed-out.png`, `providers-local-models.png`, `_unverified/*` (not opened; signed-in state judged from other provider shots).
- `S/shots-model-brand/meadow-mist/model-dialog.png`, `providers-local-scrolled.png`, `resume-browser.png` (not opened here; model-dialog covered in chat.md). The `_unverified/model-list.png` shot shows an empty chat, not a model list, so the model list itself was not judged.
- Shadow depth of cards, 12px gaps and exact pixel spacing cannot be judged from these screenshots.
- No screenshot shown at 390px width; long-text and error hard states only where visible above.
