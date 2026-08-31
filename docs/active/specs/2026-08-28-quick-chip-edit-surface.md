---
status: shipped
date: 2026-08-28
repo: youcoded
branch: feat/chip-edit-prompt
review: docs/active/design/2026-08-28-chip-edit/review.json
---

# Editing a quick chip's prompt

## Why

Quick chips (the pill row above the composer) could be added, deleted and
reordered, but never changed. Retuning a prompt meant deleting the chip and
rebuilding it, which also lost its position. Destin asked for an edit surface
specifically so prompts can be tuned over time.

## Decision

**Tap a row in the chip editor and it expands in place** into a label field and a
three-line prompt field, with Save and Cancel — the same two fields the "+ Add
Chip" form already uses.

Two alternatives were put up and rejected:

- **A separate edit form replacing the list.** Simpler to build and no drag
  conflict, but it hides the other chips while you rewrite one. Tuning is a
  compare-and-adjust activity, so keeping the list visible is the point.
- **Always-editable rows.** No modes, but text inputs swallow the pointer
  events the drag-to-reorder depends on, and ten chips become a wall of form
  fields.

Approved as step C-1 of the review deck, in Midnight and Halftone Dimension.

## What it touches

| File | Change |
|---|---|
| `desktop/src/renderer/components/QuickChips.tsx` | expand-in-place editor; removed the private default-chip list |
| `desktop/src/renderer/dev/workbench/mock-shim.ts` | `skills.getChips`/`setChips` as a stateful mock |
| `desktop/tests/quick-chips-edit.test.tsx` | new — 9 tests, mutation-checked |
| `app/.../skills/SkillConfigStore.kt` | fixed the uninstall cascade (see below) |
| `app/.../skills/SkillConfigStoreChipsTest.kt` | new — pins that cascade |

Android inherits the surface for free: its WebView runs the same React bundle.

## Invariants, and why

**Save spreads the existing chip (`{ ...c, label, prompt }`).** `skillId` is what
the uninstall cascade matches on, so a tuned skill-backed chip must stay bound to
its skill. *Guard:* `quick-chips-edit.test.tsx` → "preserves its skillId".

**Anything that shifts positions closes an open row.** `ChipConfig` has no id, so
the editor identifies a chip by array index; a remove or reorder mid-edit could
otherwise write the edit onto a different chip. *Guard:* → "removing a chip
closes an open edit row".

**Opening a row reuses the drag threshold's `suppressClick`.** Rows are also drag
handles; without the guard every reorder ends in an accidental edit form.
*Guard:* → "a drag does not open the row it dropped".

**QuickChips must not carry a fallback chip list.** It held a third copy of the
defaults (alongside `skill-config-store.ts` and `SkillConfigStore.kt`) and
substituted it whenever the store answered empty. `chips` starts `[]` and loads
async, so "not loaded yet" and "the user deleted every chip" were the same value:
the row painted seven built-ins that the editor — which reads the real store
list — could not see or edit, and deleting every chip brought them back.
*Guard:* → the two "row shows the store, not a hardcoded fallback" tests.

A `chipsLoaded` context flag was added for this and then removed: once the
fallback is gone an empty array renders empty either way, and the flag would
have hidden chips if a write landed before the initial load. The mutation run is
what caught it — the flag's tests passed with the flag deleted.

## Android bug found on the way

`SkillConfigStore.removePackage()` read chips with `JSONArray.optString(i)`,
copied from the favorites loop above it where elements really are bare strings.
Chips are `{label, prompt, skillId?}` objects, so `optString` returned each
object's `toString()`. Two failures compounded: the id never matched, so nothing
was cascaded, and the JSON-blob **string** was written back in place of the
object — which `migrateLegacyStringChips()` then promoted on the next load into
`{label: "<blob>", prompt: ""}`.

**Uninstalling any plugin silently wiped every quick-chip prompt on Android** —
the exact data this feature exists to edit. Desktop was always correct
(`c.skillId !== id`).

Fixed and pinned. **Not verified locally at the time** — believed to be because this
machine had no Android SDK, so `./gradlew test` was not run and CI was the first
execution of `SkillConfigStoreChipsTest`. **That belief was wrong (corrected
2026-08-31):** the SDK is at `/home/destin/.android-sdk`; only `ANDROID_HOME` and
`local.properties` are absent. `JAVA_HOME=/usr/lib/jvm/java-21-openjdk
ANDROID_HOME=/home/destin/.android-sdk ./gradlew test -x bundleWebUi` runs the suite
locally in ~2 min, so this test can and should be run here rather than waiting on CI.
