---
date: 2026-09-01
status: active
type: investigation
topic: The shared field surface is the same colour as the cards it sits in
---

# The `bg-inset` field surface is invisible on `bg-inset` hosts

**Symptom (Destin, from youcoded #279, 2026-07-31):** the model picker's trigger reads as a
label, not something you can type in. Found twice more on the same branch (close-prompt
editor, resume tag sheet).

## Cause

The shared field primitive paints its control on `bg-inset` — and so is every card/sheet a
field gets nested in, so the control ends up exactly the colour of its own background.
<!-- claim: {"path": "youcoded/desktop/src/renderer/components/ui/field.ts", "contains": "export const FIELD_SURFACE = 'bg-inset"} -->

`field.ts` predicted this in its own header ("inputs on `bg-inset/50` cards now sit closer to
their background than before… the alternative (bg-well inside inset cards) was offered during
review and not taken"). Each occurrence was patched at the call site with a `bg-well`
override; on 2026-09-01 there are 128 `bg-well` uses across 46 renderer files, so the
"override where it bites" pattern has become the norm.

## The fix is a decision about the primitive

Three occurrences in one branch says the default is wrong for nested hosts, not that N call
sites each need an override. Options: (a) `FIELD_SURFACE` becomes `bg-well` (fields always
one step darker/lighter than their host); (b) the primitive takes a `host` hint and picks the
surface; (c) keep `bg-inset` and give fields a stronger resting border. Any of these is a
visible change on every input in the app — a review deck, not a fourth patch.

## History
Filed 2026-07-31. Cause re-verified in current code 2026-09-01.
