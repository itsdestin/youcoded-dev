# r1 — Destin's critique, and what it means for the guide

Live pages: `gt-r1-<concept>.live.json` (answers beside them when submitted). Chat notes logged here as they arrive.

## Chat notes

1. **Purchases — "these bare native browser dropdowns"** (screenshot: the category picker's open list is the browser's own white menu with a blue highlight).
   - Cause: Pages get only the page kit's `.yc-select`, which styles the closed box; the open list is the browser's native menu, which no theme reaches. The purchases page used it 9 times. The PC-build builder hand-built its own menu instead, unprompted — and existing sample Pages (Home, Money) also use native `<select>`.
   - Guide: nothing says "never a native dropdown". The app-side rule (`Select` / `TypeableSelect`) doesn't reach Pages.
   - Fix candidates: (a) the page kit gets a themed dropdown that matches the app's `Select` open list, and the guide's "Building a Page" says to use it, never a bare `<select>`; (b) at minimum a guide rule + the kit flagging `.yc-select` as closed-box-only.

## Picture page `gt-r1` (submitted 2026-10-15 04:14; answers file beside the spec)
Purchases skipped (A-1, A-2 — reviewed live instead; see chat note 1). Good first try: B-1, B-2 (Automations list/activity, details/forms), C-2 (Notifications empty/failed/phone), D-2 (PC build first time/failed/phone).

2. **B-3 Automations failed load** — "we need better full-screen error states for when nothing on the page loads at all." (A whole screen that failed shows only the small red box.)
3. **C-1 Notifications** — "new" rows each in their own box while "earlier" rows share one: unclear why they differ; should be the same. And: **popups over chat open only from Settings or status-bar chips; top-bar items open side panels or full-screen pages.**
4. **D-1 PC build** — (a) the New/Used toggle sits mid-row: **controls are flush left, flush right, or full width**; (b) no bare number to the right of a right-aligned control; (c) a divider between a dropdown's options and its "Add another option…" action; (d) no bold text directly beside light text ("Graphics card · GeForce…") — the light label goes above/below or after the dark text; (e) dead space under the part labels — **always cut dead space**.
5. **E-1 Import** — "Stop import" is the main action while running: theme-filled, or destructive styling — not outlined.
6. **E-2 Import partial** — Try again goes **below the Details line**; and Done / Show my conversations: **two outlined buttons with no filled one is bad**.
7. **E-3 Import wrong file** — buttons below the Details fold, not above.
