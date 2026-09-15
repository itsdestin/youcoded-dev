# Model picker: selectable models first

**Status:** proposed

## Goal

Show models the user can select before unavailable models. For example, searching for a model offered through both ChatGPT and OpenRouter should show the selectable ChatGPT result before unavailable OpenRouter results when only ChatGPT is connected.

## Scope

This changes ordering only in the shared `ModelPicker` renderer component. It does not change provider setup, availability wording, filtering, favourite storage, model selection, or catalogue contents. No new settings, readiness states, or provider-specific preferences are introduced.

## Design

**After applying existing filters and selected-model pinning, place selectable rows before unavailable rows, preserving relative order within each group. Use the same availability flag that disables the row. Do not hide entries or change the selection.**

1. Build entries and apply the existing search, source, local-only, and favourites rules unchanged.
2. Apply existing `pinSelectedToTop` behavior, including inserting a selected non-favourite when it passes the filters. Pinning remains inactive during search.
3. As the final ordering step for every result view, stably sort the resulting rows using `Boolean(e.unavailable)`: false before true. Do not add a stored readiness rank or independently check provider readiness.

Applying the stable sort last keeps the selected model first within its availability group without separate group-aware pinning logic. An unavailable selected model never precedes selectable rows. Within each group, all other rows retain their existing relative order.

The row's availability flag is the authority because a connected provider does not necessarily make every model available. Ordering and row selectability must agree.

## Loading and errors

No new error path or availability check is introduced. Loading and unknown states retain their existing availability behavior; in particular, an unknown Claude Code sign-in status is not grounds to disable or demote its rows. When existing availability data changes, ordering is derived again from the updated row flags.

## Testing

Add focused picker regression coverage for:

- **Search:** matching entries from selectable ChatGPT and unavailable OpenRouter providers appear in that order, with both results still visible and their selection behavior unchanged.
- **Stable ordering:** multiple rows in each group retain their relative order; an entirely selectable or entirely unavailable list is unchanged by the final sort.
- **Favourites and filters:** selectable-first ordering applies to favourites, source-filtered, and local-only results without adding rows excluded by those rules (apart from existing selected-model insertion).
- **Selected-model pinning:** a selectable selected model leads its group; an unavailable selected model leads only the unavailable group. Cover both an existing favourite and insertion of a selected non-favourite. Search remains unpinned.
- **Availability authority:** a model marked unavailable despite a ready provider stays in the unavailable group. Loading/unknown Claude Code status retains existing selectability and group placement; a subsequent definite unavailable status updates the ordering without changing the selection.
