---
status: active
---

# Custom providers — round 2 changes (from custom-providers-review-1)

Kept as approved: R-4 (Other address), R-6 (bad key saved with notice), R-8 (search re-runs), R-9 (failed check names the source).

| # | Destin's note | Change |
|---|---|---|
| 1 (R-1) | "is the cancel button always present? that would be odd. what are the various states of this page?" | Add provider becomes its own first-level card. Empty state: Service only, no Cancel/Add buttons until a service is picked, ✕ at top right to close. The deck shows every state as one strip: empty → searching → picked → checking → added / refused. |
| 2 (R-2) | "this popup menu/background/rounding seems a bit odd… not consistent with other menus" | The search box's menu now uses the app's one dropdown look (Select.tsx): the same corner (`--radius-lg`), row size and highlighted selected row. |
| 3 (R-3) | "name should default to service + API Key" | Name pre-fills "Inception API Key" (and "Anthropic API Key", …); still editable. |
| 4 (R-3) | "why is it not styled like the openrouter/provider cards?" | The form and every provider row use the same first-level card as the OpenRouter / ChatGPT / Claude Code cards: name on the top line with buttons at the top right, grey status line under it. |
| 5 (R-3) | "the website (api.inceptionlabs.ai) should just be shown in parenthesis next to the service name, not below it" | Picked service reads "Inception (api.inceptionlabs.ai)" on one line; the grey hint line under the box goes. |
| 6 (R-3) | "the list of models should be its own section/dropdown with cards that appears after service is selected" | After a service is picked, a "Models" fold (FoldRow, closed by default) lists one card per model: name, then fact chips (context size, price in/out per 1M, Tools). Counts read "Models 4". |
| 7 (R-5) | "this card doesn't match first-level card styling" | Provider rows switch from the old hand-made row to the shared first-level card (#4), Edit/Test/Remove at the top right like the other cards. |
| 8 (R-7) | "no models match should be bigger/longer, and the button should be smaller and centered below it" | "No models match" becomes a full sentence at body size; "Check for new models" is a small outlined button centred under it. |
| 9 (R-7) | "'manage models' should change to 'manage models and providers'" | Footer reads "Manage models and providers…". |
| 10 (R-3) | "seems like our UI design guide is insufficient/weak, we shouldn't be missing basics like this" | Proposed guide addition (for Destin to accept on the deck, not edited silently): "A form that adds an item to a list of cards is drawn as one of those cards" and "A dropdown or search menu is the shared one (Select / TypeableSelect) — never its own corner or row size." |
