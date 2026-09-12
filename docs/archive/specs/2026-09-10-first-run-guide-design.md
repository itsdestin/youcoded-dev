---
status: shipped
created: 2026-09-10
shipped: 2026-09-11
type: spec
topic: A new user's first days — the buddy gives a tour, tips arrive when relevant, empty screens explain themselves, help has a home, and the first dangerous switch is explained before it flips.
decisions: docs/archive/design/2026-09-10-first-run-guide/first-run-guide.questions.answers.json
contract: docs/archive/design/2026-09-10-first-run-guide/first-run-guide.contract.json
---

# First-run guide — design

Every decision below is Destin's deck answer (2026-09-10, fifteen of fifteen, every
recommendation taken) or one of the three notes he attached. Where this document says
"decided", the source is that answers file; where it says "proposed", it is the builder's
call and the review deck is where he sees it.

## 1. What a new person gets

1. The setup wizard is unchanged up to sign-in. The sign-in step gains one sentence, in
   Destin's words (review deck 2026-09-10, Z-1): "With your permission, the assistant may
   create, change, or delete files on your device. Create backups for anything you cannot
   replace."
2. The "You're all set" card no longer lists three things to try. It says the buddy will show
   them around, and the app opens with the tour already started (decided: right after setup,
   once).
3. The tour: the buddy in a corner of the real app with a speech bubble, eight stops, Next /
   Back / Skip on the bubble, the control each stop talks about ringed on screen, and the
   screen it talks about opened for real (Settings pages, the Projects screen, the session
   drawer) so the person sees the thing while the buddy explains it (decided, plus Destin's
   note on Q-3). A stop with an obvious action offers a "Do it now" button and the tour
   carries on either way (decided: explain, with a button).
4. After the tour: tips, one at a time, each at the moment it becomes relevant, delivered by
   the same buddy-and-bubble in the main window; every tip carries Got it and Stop showing
   tips; Settings holds the Tips for new users switch and a Show me around button that
   replays the tour (decided: S-2, Q-5, Q-6).
5. Screens that must explain themselves to someone who skipped the tour: the Projects screen
   with no projects (an explainer card), the between-sessions screen for someone with no
   sessions (a first-time version), and two smaller empty screens: a project's Conversations
   tab and the session note's placeholder (decided: Q-7, Q-8, S-3; the chat pane's extra
   line was declined on the review deck, C-1).
9. A "No folder" choice at the top of the new-session form's folder list (decided: round 2,
   N-6, from Destin's note on W-1). The renderer sends a sentinel; main swaps it for an
   empty folder the app owns, `<userData>/No folder`, before the session starts, so the
   assistant begins with no instructions and no files and every header shows "No folder".
   Desktop and remote only: the phone's runtime creates sessions from the folder it is
   handed. The fuller idea, a "Home" folder every install starts with that holds settings
   applying everywhere, is on the roadmap (native-harness → sessions).
6. Settings gains a Help & feedback page: Show me around, the tips switch, the community at
   r/youcoded, Report a bug, Known issues, the version. Report a bug stays reachable from
   Development too (decided: Q-9, Q-10).
7. First-time warnings (Destin's note on Q-4): the first time a person turns on Skip
   Permissions or picks Full auto, a dialog explains plainly that the assistant will change
   files without asking and mistakes reach files before they are seen; it requires an
   "I understand" checkbox before Continue. The first session started on a small model gets a
   plain explainer that small models make more mistakes, with Got it. Honest, not scary.
8. Rollout: the tour and tips run only for someone who finishes setup after this ships;
   existing users see nothing pop up and get the Settings entries. The tour and tips ship on
   desktop; the empty screens, the wizard sentence, the Help page and the warnings reach the
   phone and browser because they share the same screens (decided: Q-11, Q-12).

## 2. The eight stops (decided: S-1 holds)

| # | Stop | What is on screen | Ring | Do it now |
|---|---|---|---|---|
| 1 | Meet the buddy | the between-sessions screen | the buddy itself | — |
| 2 | Sessions | the same screen, New Session form open | the session strip area / New Session | Start a session |
| 3 | Projects | the Projects screen | Add a project | Add a project |
| 4 | Models and providers | Settings → Assistant settings → Cloud providers | the providers list | — |
| 5 | Tags and notes | the session drawer (a sample session in the workbench; in the app, the drawer of the session just made, or the Resume browser when there is none) | the tag and note fields | — |
| 6 | Files | the Projects screen, Files tab | the Files tab | — |
| 7 | Make it yours | Settings → Appearance (themes) | the theme grid | Open the Marketplace |
| 8 | Help | Settings → Help & feedback | the page | — |

Each stop is one or two sentences. The stop list is data, so a stop can be reordered or
dropped without touching the bubble.

## 3. Pieces

| Piece | Where | Notes |
|---|---|---|
| Guide bubble | `components/guide/GuideBubble.tsx` | The hint bubble that already points at the chat/terminal switch, generalised: accent fill and accent-derived outline, a tail, an eyebrow ("2 of 8"), the text, a button row. Buddy beside it: `ThemeMascot`, so every theme's own mascot gives the tour |
| Target ring | same folder | An accent outline drawn over the element carrying `data-guide-anchor="<id>"`; follows resize |
| Tour | `components/guide/GuideTour.tsx`, stops in `guide-stops.ts` | Owns the index, opens screens through the app's existing open/close callbacks, restores what it opened on Skip/Done |
| Tips | `components/guide/GuideTip.tsx`, `tips.ts`, `useTipTrigger` | A component at a relevant moment calls the trigger; the tip shows once, never while the composer has focus or the assistant is answering |
| First-time warning | `components/FirstTimeWarning.tsx`, `first-time-warnings.ts` | One `Dialog` for the three kinds; the two dangerous kinds carry the checkbox |
| Projects explainer | `components/project-view/ProjectsEmptyCard.tsx` | Shown by `ProjectView` when the index has no projects, in place of the hero and tabs |
| First-time welcome | `App.tsx` welcome branch | "Start your first session", one sentence, the form open; Resume shown when there is something to resume or sync is on |
| Help & feedback | `components/HelpPopup.tsx` + a `SettingRow` in `SettingsPanel` above Development | Same shape as Development's popup |
| Wizard | `FirstRunView.tsx` | The sentence on the sign-in step; the final card's new copy |
| Empty screens | `ChatView` first-message line, `ConversationsTab`, `NoteEditor` placeholder | `EmptyState` where a list is empty; copy only elsewhere |

## 4. State (renderer, localStorage, like every other UI preference)

| Key | Set when | Read by |
|---|---|---|
| `youcoded-guide-pending` | the wizard hands off to the app (`handleFirstRunComplete`) — the only way to get it, so an existing install never sees the tour uninvited | the tour, which clears it on Skip or Done and writes `youcoded-guide-done` |
| `youcoded-tips-armed` | the same hand-off | tips: nothing fires without it; the Settings switch sets and clears it |
| `youcoded-tips-seen` | each tip's Got it | tips |
| `youcoded-warned-<kind>` | the warning's Continue / Got it | the three gates |

Show me around in Settings runs the tour regardless of the flags.

## 5. Triggers

Tips (proposed set, about eight, at most one per sitting):

| Tip | Moment |
|---|---|
| Tags | first time the session drawer opens |
| Notes | first time the close-session prompt shows |
| Projects | the fifth session started without a project |
| Resume | first launch with a resumable session and none open |
| Local models | first time the model picker opens with no local model |
| Buddy floater | third launch, desktop only |
| Themes | first time Settings opens after day one |
| Help | first error card with Report bug |

Warnings:

| Kind | Fires from |
|---|---|
| skip-permissions | the three Skip Permissions toggles (welcome form, session strip form, Resume browser) when turned on |
| full-auto | the Permissions page radio, and the status-bar chip cycling into Full auto |
| small-model | Create on any new-session form when the chosen model parses as 40 billion parameters or fewer from its name, or is a local model whose file is under 30 GB with no size in its name |

## 6. Out of scope, filed

- The assistant explaining the app itself ("how do I…", "how does YouCoded work") through an
  info-desk tool or a system-prompt line: roadmapped, native-harness → tools (Destin's note on
  Q-1).
- A tour on the phone and in the browser; the buddy there is flat art.
- The desktop floater as a tip surface.
