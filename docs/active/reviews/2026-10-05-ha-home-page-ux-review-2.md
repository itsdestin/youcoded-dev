# Home page + "Show theme background behind pages" — UX review, run 2

Tester notes: practice app, fresh eyes. The page itself sits inside a frame the tool cannot number, so I drove it with Tab, Shift+Tab, Enter, arrow keys and Escape, and looked at every picture. I could NOT test mouse hover, drag (rooms/devices in Edit), touch, or real sliders by dragging; the tool cannot do those inside the page. The 2000-row stress run was not done (the Home page has no list I could fill that way; not tested). Pictures are under scratch/explore/20261005-214952/ (first session), 20261005-215201/ (main session), 20261005-215747/ (width 720), 20261005-215809/ (width 390). Wallpaper theme = Meadow Mist; no-wallpaper = Crème. kuromi-dreamer was not available in the practice app.

- U1 — Expected Escape to close the device pop-up only / the pop-up (Garage camera) closed AND the whole Pages view dropped back to the chat — Home › Cameras › Garage camera — 20261005-215201/68-key.png (before: 67-key.png)
- U2 — Expected "Show theme background behind pages" in Appearance beside the layout choices / it is hidden inside "Additional Customizations" (subtitle says only "Message bubbles, corners, glass"), under Glass, after scrolling; nothing says Pages — Settings › Appearance › Additional Customizations — 20261005-215201/98-scroll.png. Proposal: subtitle "Bubbles, corners, glass, page background", or move the switch up next to Layout.
- U3 — Expected an off/greyed switch to read as "off" / in Auto/Framed layout and in Crème the switch is greyed but still shows ON, with grey helper text ("Works in the Floating bars and Minimalist layouts" / "No effect on this theme — it has no wallpaper"). A greyed ON switch looks like a choice already made; the hint is too faint to read first — Appearance — 20261005-215201/98-scroll.png, 111-scroll.png. Proposal: show it OFF when it cannot apply, and make the hint normal-strength text.
- U4 — Expected to see the effect when I flip the switch in Framed layout / Home page gets no wallpaper at all in the default layout; only after finding Floating bars does the wallpaper appear. A new person turns the switch on and nothing happens, with the explanation hidden in faint text — 20261005-215201/98-scroll.png then 105-key.png
- U5 — Expected a quiet card list over a wallpaper / with the wallpaper on, the left page list is see-through over trees and several names ("Link reader", "Focus timer") run into the tree edges and are harder to read — Pages sidebar, Meadow Mist, Floating bars — 20261005-215201/105-key.png
- U6 — Expected the page to fit a small window / at phone width (390) the Pages list takes about 250 px, leaving about 110 px; the "Home wants to connect" card is squeezed to one word per line and cut off on the right, with no way to hide the list — Home first-run prompt — 20261005-215809/00-look.png
- U7 — Expected the top tabs to stay tidy / at width 720 they wrap into four rows and the Edit and gear buttons float beside row 2, not at the top right — Home page header — 20261005-215747/03-look.png
- U8 — Expected counts to agree / Home tab says "Lights 3 of 3 on" for Destin's Room, the Lights tab says "3 of 3 on · 1 not responding" for the same room; Kitchen says "1 of 2 on" while its slider sits at zero — Home vs Lights — 20261005-214952/04-look.png, 20261005-215201/06-key.png
- U9 — Expected my change to be listed / I turned Destin's Room lights off, raised them again and changed the thermostat; none appear in Activity, and the list is out of time order (1:45, 1:44, then 1:54, 12:54) — Activity — 20261005-215201/55-key.png. Also "on the device or another app" repeats on most rows; propose "from a switch or another app" once, or drop it.
- U10 — Expected rooms to stay put / turning Destin's Room lights off made the Lights cards re-order (Living Room jumped to the top, Kitchen moved) while I was looking at them — Lights — 20261005-215201/17-key.png
- U11 — Expected "Cooling to 75°" to make sense / thermostat says "Cooling to 75°" while "Now 74°" (it is already cooler than the target); header says "Cool to 75°" — Climate — 20261005-215201/50-key.png. Proposal: "Holding at 75°" or "Idle, target 75°".
- U12 — Expected Climate to match the app's look / the weather card is a hard navy slab and the active "Cool" button is bright phone-blue, in a soft green theme — Climate — 20261005-215201/40-key.png
- U13 — Expected a way to fix cameras / Cameras tab shows four black tiles each saying "No picture: Google Nest needs you to sign in again." with no Sign in link (the Home tab does have one); Doorbell says "Not responding" yet shows the same sign-in text. Propose one banner at the top with a single "Sign in" button, and tiles saying just "Signed out" — Cameras — 20261005-215201/58-key.png
- U14 — Expected Edit mode to explain itself / the icons (star, eye, up/down arrows, box-arrow) have no words; only hint on screen is "Drag a device here to put it in a new room". Propose a one-line help under the header: "Star = favorite, eye = hide, arrows = move room" — Edit — 20261005-215201/90-key.png
- U15 — Expected plain words / Page settings uses "chip" ("Lights chip", "Problems chip", "chips across the top"), "Hue scenes" (a brand name) and "Favourites" (the rest of the app says "favorites"). The tab labelled "5 to fix" is called "Problems chip"; Activity has no switch. Propose "Lights tab", "Problems tab", "Light scenes", "Favorites" — Page settings — 20261005-215201/93-key.png
- U16 — Expected the chip "77° · 74° in" to be clear / reads as a puzzle; propose "77° out · 74° in" — top tabs, any screen — 20261005-215201/40-key.png
- U17 — Expected a remote that is obviously usable / on the TV remote the on-screen focus lands on the direction pad before the app tiles, so keyboard order is not left-to-right; the pad shows a dark wedge (focus) with no label for left/right. The app tiles' bottom edge sits tight under "Prime Video". Enter on the pad gave no visible reaction — TV remote — 20261005-214952/32-key.png
- U18 — Expected the dialog title once / Garage camera pop-up says "Garage camera" three times (title, small label, picture caption) — Device pop-up — 20261005-215201/67-key.png
- U19 — Expected the Pages list rows to open from the keyboard / after Tab to "Week planner" in the list, Enter did nothing visible — Pages sidebar — 20261005-215201/28-look.png (could be my Tab count; not confirmed)
- U20 — Expected full theme previews / in Appearance the first two theme thumbnails (Crème, Halftone Dimension) are cut off at the top when the dialog opens — Appearance — 20261005-214952 session image 95-click.png (path 20261005-215201/95-click.png)

What worked: first-run prompts (address, then key, then "Allow and open") were clear; Home reopens without asking again and keeps my changes; Lights toggle, brightness arrows, scenes, thermostat +, Media tab, TV remote opening, Edit/Done, Page settings and the Appearance switch (enabling in Floating bars, Crème note) all responded. No page errors were logged in any session.

Could I complete the task? Yes for Home, Lights, Media, Climate, Cameras, Activity, a device pop-up, Edit, page settings and the Appearance switch. Not tested: mouse-only things (hover tips, dragging sliders and rooms), the remote's app buttons and play/pause by mouse (I only reached the pad and volume by keyboard; play/pause visible but not pressed), kuromi-dreamer. Most confusing moment: turning on "Show theme background behind pages" and seeing nothing change, because the layout was Framed (U2-U4).

## Triage (implementing session, 2026-10-05)

- U1 accepted — Escape handled inside a page must not also close the Pages view — fixed 666df8ee0 (app branch)
- U2 accepted — Appearance subtitle/placement mentions pages — fixed 666df8ee0 (app branch)
- U3 accepted — a switch that cannot apply reads OFF (disabled), not greyed ON; clearer note — fixed 666df8ee0 (app branch)
- U4 accepted — note says plainly what to change (layout) — Framed see-through itself stays a roadmap decision — fixed 666df8ee0 (app branch)
- U5 accepted — the page list pane gets the same glass as the page pane while see-through is on — fixed 666df8ee0 (app branch)
- U6 already handled — roadmap other-features "Pages on a phone" (decision, its own round)
- U7 accepted — header tabs at medium widths: Edit/gear stay top-right
- U8 accepted — Home tab room status matches Lights tab; check Kitchen slider at 0 while on
- U9 accepted — Activity order and your own changes
- U10 accepted — Lights cards keep their order while you act
- U11 accepted — thermostat words follow hvac_action (idle → holding)
- U12 rejected — the Climate dial and its colours are the design Destin picked (home-check-r2 C-thermo yes)
- U13 accepted — one sign-in banner on the Cameras tab, short tile text
- U14 accepted — Edit icons get labels and a one-line hint
- U15 accepted — plain words: tab not chip, Light scenes, Favorites
- U16 accepted — "77° out · 74° in"
- U17 accepted — remote keyboard order follows the layout; pad buttons labelled
- U18 accepted — pop-up names the device once
- U19 accepted — check Enter opens a page from the list; fix if real — fixed 666df8ee0 (app branch)
- U20 rejected — pre-existing in Appearance (not this branch); filed on the roadmap (themes)
