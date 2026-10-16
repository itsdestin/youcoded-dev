---
status: active
date: 2026-10-13
---

# Round 2: Destin's feedback on the restyled surface, applied

Feedback (verbatim, 2026-10-13): sort/filter/group the screens in more interesting and dynamic ways
("First-time Launch Only", "Popup Menus", "Text Entry Menus"); clearer nesting; trace and show click
paths; a popup for pictures instead of the side panel; tiles where the picture is big and the words
are small; Big picture split into development tracks, with Money and Home Assistant counted as
marketplace add-ons rather than core features.

Rebuild: `python3 make_shots.py` (only after a new screenshot run), then `python3 build.py`.
Screenshots: `proof/round2/`. No console errors in any of them (`ui-probe --fail-on-error`).

## What changed, point by point

### 1. Screens: group, filter, sort, nesting, click paths (`screens_tab.py`, new)
- **One control bar in the fixed header.** It uses the same pattern as Big picture (see 4):
  - The `SegmentedTabs` pills choose how you look at the screens. **Pictures / Tree / Trail**, and
    in Pictures, **Group by Place / Kind / Clicks in / Work**.
  - The filter pills choose what you see, and you can combine them. Pills in the same family widen
    the results (Popups OR Menus). Different families narrow them (Popups AND Phone). The families
    are separated by a thin line: **Kind** (Full screens, Popups, Menus, Slide-ins, Bars & tips),
    **What's on it** (Text box, First launch, Phone, Problems), **Work** (Changing now, Since
    release), and the old **Questions** (Talks to the AI, Changes its behaviour, Add-ons,
    Permissions).
  - Next come **Sort** (In click order, Fewest clicks first, Most clicks first, Recently worked
    on, Most situations) and **Find a screen** (search by name, place or description). A
    **Clear** button appears only while something is narrowing the list.
- **One line under the bar says what you are looking at.** For example: "13 of 161 screens match.
  Grouped by kind, in click order." It replaced a bare number.
- **Tree.** Each screen sits under the screen that opens it. Each row shows its picture, kind,
  number of situations and what it has, plus a **Trace** button. Some path words are not screens
  of their own, such as "first-time-warning", "menu" or "open". Those words now become foldable
  headings, so Chat › First time warning › Full auto / Skip permissions / Small model reads as
  real nesting. Before, those screens sat loose under Chat. When a filter is on, screens that
  don't match but lead to one that does are shown faded, so the path stays visible.
- **Trail** (the click-path picture). Pick any screen, from Trace in the tree, "Trace its path" in
  the popup, or any picture in Trail view. The screens that open before it are laid out left to
  right with arrows: The main window → Settings → Assistant → **Permissions**. The chosen screen
  is shown larger. Under it come **Opens from here** and **Also opens from <its parent>**. Clicking
  any picture in the trail traces that screen instead.
- **Each picture's click path** appears on its tile as a small breadcrumb line, and as clickable
  links in the popup.
- **Screens without a picture of their own now appear.** Examples are First run (9 setup steps)
  and the ChatGPT and OpenRouter sign-in states. These were only photographed in particular
  situations, and the old page dropped them, along with every picture whose name contained `#`.
  The count went from 158 to 161, and states now load. The real version: `%23` in the file path.

### 2. Pictures: a popup and better tiles
- **The side panel for screens is gone.** Screens now open in a popup built like the app's Dialog
  (`Dialog.tsx/.css`, at its `wide` size): a scrim behind it, a one-line 16px title, the drawn
  close button, the tapered line under the header, a body that fades at its edges, and buttons in
  the footer with no line above them. Esc, the scrim and ✕ all close it. The left and right arrow
  keys, or the ‹ › buttons, step through whatever is currently filtered.
- **The picture comes first.** It fills the left side. **Close up / In the window** switches
  between the cut-out popup and the whole app window behind it. A strip of the screen's
  **situations** (its states) sits under the picture; click one to swap the picture. The facts
  sit in a compact right column: click path, description, Opens from here (clickable), Kind /
  Place / Clicks in / anything else it has, and the work changing it. Footer buttons: Trace its
  path · See before and after · Ask about this · **Comment**.
- **Tiles: the picture fills the tile.** Each tile has a 176px picture area. Popups, menus and
  panels show at their real shape, never cropped. Full screens fill the area. Under the picture
  is one line for the name and one small line for the path. The situations count and the
  "changing" mark sit on the picture's corner.
- **New pictures (`make_shots.py`, `shots/`).** The old 520px whole-window thumbnails made a
  340px popup about 120px wide. The screenshot run records where each popup or panel sits in the
  window (`manifest.json` `panel`). Using that, each popup is cut out of the full-size original at
  its real size, and full screens are kept at 1000px wide. This adds 9.9 MB in `shots/`; the old
  `thumbs/` stay for the "In the window" view and Today.

### 3. Big picture: development tracks (`vision_tab.py`, `vision-skeleton.json`)
- **Five tracks were added to the skeleton** (`tracks`, `track_of`), based on the work streams
  Destin named on Oct 8:
  - **The app**
  - **Marketplace & add-ons**
  - **The assistant's engine** (what he called "harness engineering")
  - **Installs & devices**
  - **How it gets built** (what he called "workflow engineering")
- **How a track is assigned:** each area has a default track, and a capability or single feature
  can override it. The most specific setting wins. No titles were changed and no evidence was
  touched.
- **Moved to Marketplace & add-ons:**
  - the whole Marketplace area
  - Money, Home, the Money and Home pages, and the Analytics page
  - "Open-source tools replacing paid suites"
  - the theme builder
- **Moved to The assistant's engine:** Harness engineering, YouCoded's own runtime, local models,
  and "a free model good enough for everyday use"
- **Moved to Installs & devices:** the Everywhere area and remote access from the phone
- **Moved to How it gets built:** the community/workflow area, except "report a bug from inside
  the app" and "the source ships with the app", which stay in The app
- **By area / By track** switches the whole tab. Area cards now show which tracks they mix, as
  small labels. Track cards say what the track means and which areas it touches.
- **Inside an opened area, each track is its own lane** with a heading. For example, Pages shows
  "The app" and then "Marketplace & add-ons" (Money, Home, Analytics). Inside an opened track,
  the lanes are areas.
- The mission card, the "most things are waiting on" box, the status filters and the evidence
  side panel are kept. The side panel now also shows the item's track.
- **Nine evidence items were hidden before** because they named a feature, not a capability, as
  their parent (Mac/Windows signing, Linux packages, Google Play, the iPhone app, in-app updates,
  conflict copies, …). They now appear under that feature's capability. As a result, the total
  went from 160 to 168.

### 4. Other structural changes across the tabs
- **One meaning per control, on both tabs.** `SegmentedTabs` change how you look (Pictures/Tree/
  Trail, Group by, By area/By track). Filter pills narrow what you see, and pressing a pressed
  pill turns it off. Before, Big picture mixed "By area" (a view) and "Not started" (a filter) in
  one switch.
- **Cross-links:**
  - Every screenshot on Today (the suggested next step, In progress, Bugs) opens the same picture
    popup.
  - Work rows on Today with screens have **See its screens**, which opens Screens filtered to
    exactly that work. The filter shows as a dark pill with ✕.
  - A Big picture item's side panel has **Where it shows up**, with up to six screen pictures
    that open the popup, plus "See all N on Screens". It also has **Work on those screens**.
  - The capability → screens mapping is `screens_of` in the skeleton (see the open questions
    below).
- **Less repetition.** The second status legend on the overview (under Areas) was removed; the
  mission card's legend covers it. Top-level tiles no longer all say "Opens from the main
  window", and tree rows no longer say "Opens nothing further".
- **Old code removed:** the Screens side-panel code, the question-chip code, and the old tile
  styles in `page.css`. Those styles were still forcing the 16:10 crop on top of the new tiles.

## How each Screens facet is derived (all by rule; the real version re-runs them)
| Facet | Rule | Source |
|---|---|---|
| Place | longest matching name prefix in `PLACES` (unchanged) | `build.py` |
| Kind | the workbench definition's own tag: `view`→Full screen, `dialog`→Popup, `menu`/`popover`→Menu, `drawer`/`pane`→Slide-in panel, `bar`/`tour`→Bar or tip, `dev`→Developer sheet; a state with no definition uses its screen's | `screen-defs.json` (dumped from `desktop/src/renderer/dev/workbench/screens/*.ts` on the UI-consistency branch) |
| Text box | any of: the run types into it (`open` step `do:'type'`); a path word names a typing job (rename, key, add, edit, create, search, find, filter, bug-report, new-session, document…); it is the conversation | name + definition. **Approximate**: the real version should read `<input>/<textarea>` in the component that registers the screen |
| First launch | a path word that only exists before first use: first-run, first-time-warning, welcome, handle-prompt, tour | name |
| Phone | definition viewport under 500px wide, `narrow` tag, or a `#phone` state | definition |
| Problems | definition tagged `error-state` | definition |
| Click path / parent / Clicks in | the workbench opens `a/b/c` by opening `a`, then `a/b`, then `a/b/c` (`index.ts`, "HOW A NAME OPENS"); the parent is the longest shorter name that is itself a screen | names |
| Changing now / Since release / Recently worked on | the existing work list and release list matched against screen names (unchanged); "recent" = days since the newest work touching it | `build.py` data |
| Close-up picture | the run's recorded `panel` rectangle when it covers less than 60% of the window | `manifest.json` |

## Considered and left out
- **Toasts as a kind.** No screen in the run is a toast, so there is no pill for one.
- **Real "last changed" dates per screen**, worked out from git history of each screen's
  component files. This needs a mapping from screen to files. "Recently worked on" uses the work
  list instead.
- **Drawn lines between screens in Tree view.** The indented tree with fold arrows reads clearly
  without them, and lines inside rows break the "no lines inside cards" decision.
- **A row of track colours.** The status colours already use green and grey, and decisions G-8
  forbid coloured stripes. Tracks are named in words: labels on cards, lane headings.
- **Moving the "Which parts are set in more than one place" table** to Big picture. It is about
  the vision's building blocks and arguably belongs there, but moving it was not asked for. It
  stays at the bottom of Screens.
- **The Today tab's layout**, beyond the cross-links. Destin has not asked for changes there.

## Open questions only Destin can answer
1. **Office editors.** Are the built-in document/sheet/slides editors part of **The app**, or
   **Marketplace & add-ons**? On Oct 7 he described curating "only office" as marketplace content,
   but today they ship built in. For now they are in The app.
2. **Sync.** Sync and Mesh are counted as The app. He said he does sync "in between" other work.
   Should sync be its own track?
3. **The Marketplace store itself** (browse, publish, reviews) is in the add-ons track along with
   the add-ons. Is that one line of work for him, or is the store part of the app?
4. **Popup title weight.** The real `Dialog` title is semibold; the Settings drawer and this brief
   say medium. The page uses medium. Which should it be?
5. **The `screens_of` links** (which screens each capability shows up on) were assigned by hand
   from the screen list. Is a hand-kept list acceptable until it can be derived from the files the
   evidence cites, or should the "Where it shows up" box wait until then?
