---
status: active
date: 2026-09-08
type: design
tags: [native-runtime, settings, safety]
---

# Native step-guard setting

## Summary

Regular desktop native sessions currently stop at a hidden model-tier step budget and ask the user whether to continue. This design makes that guard an explicit, optional Assistant Settings preference: **None** by default, or a user-selected positive step count. It applies equally to local and cloud native models.

## User experience

In **Assistant Settings → General**, add a **Step guard** typeable dropdown using the established app dropdown/menu treatment.

- The saved default is **None**.
- Selecting **None** disables the regular native-session step guard.
- The menu offers **None** and step counts from **10** through **100** in increments of ten.
- The user can type any positive whole number, including a value above 100.
- A selected or valid typed number enables the guard at that number of completed tool-loop steps.
- Invalid, blank, zero, or negative input resolves to **None**, rather than storing an unusable limit.

When a guard is enabled, the existing **Continue?** permission card appears after that many tool-loop steps. Allowing it resets the counter and grants another interval of the same length. The copy, response flow, and transcript-event surface stay unchanged.

## Runtime behavior

The setting is a desktop-native preference stored in `~/.youcoded/config.json`, managed through `NativeHome`'s locked JSON mutation path. Missing settings from existing installs read as `None`, so the default is off without a migration.

For regular native sessions:

1. The host reads the validated saved preference when it creates a session.
2. A configured positive value becomes that session's ordinary `maxSteps` limit.
3. With no configured value, the host passes no ordinary step limit and the loop does not raise a `max_steps` ask.

This removes the present model-family fallback (25 steps normally, 50 for selected frontier models) from ordinary native sessions. Local and cloud models share the exact same setting and behavior.

## Explicit-cap exceptions

This setting does not weaken deliberate, definition-owned safety caps:

- A specialist's `stepCap` remains its own explicit child-session limit.
- Harness evaluation overrides remain their own explicit limit.

Explicit limits take precedence over the ordinary user setting. A specialist or evaluation run must never inherit the unset ordinary-session behavior accidentally.

## Boundaries

- This touches the desktop-native runtime and its desktop Settings surface only.
- Android does not implement the native runtime, provider registry, or native-session settings; no Android protocol/UI work is required.
- No new transcript event or permission IPC shape is introduced: `max_steps` continues through the existing synthetic permission-card flow.
- The setting is read when a new native session is created. Changing it affects subsequently created sessions; in-flight session limits remain stable.

## Testing

Automated coverage must prove:

1. Missing/invalid persisted values result in no ordinary step guard.
2. A valid saved value is persisted and delivered to a regular native session.
3. A configured limit raises the existing `max_steps` continuation flow at the selected count, while no setting does not.
4. Specialist `stepCap` and evaluation overrides still take precedence.
5. The General settings control renders None, preset menu values, and validates typed values correctly.

Run the affected desktop tests and the repository desktop verification suite before considering the implementation complete.
