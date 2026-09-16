---
status: shipped
---

# Site analytics — fresh UX review 2

Historical review; see the [rollout closure record](../design/2026-09-14-site-marketing-analytics/README.md) for final authorization and verification limits.

Tested the supplied isolated, fake-data dashboard (4792) and website (4793), collection OFF, at 390 × 844. No source, plans, or specs read; no live-app access. Findings below are from browser-visible copy and screenshots.

- U1 — I expected plain-language consequences for turning analytics off / “Turning this off stops pending sends, but cannot retract requests already in flight or data already sent” uses networking jargon; shorten to “Turning this off stops future tracking. Data already sent cannot be taken back.” — Website → Analytics privacy — [screenshot](../../../scratch/ux2-privacy-real/midnight/privacy-dialog.png).
- U2 — I expected familiar descriptions of what is counted / “instruction opens” and “installer-link clicks” read like internal event names; use “opening setup instructions” and “clicking download links.” — Website → Analytics privacy — [screenshot](../../../scratch/ux2-privacy-real/midnight/privacy-dialog.png).
- U3 — I expected the empty state to explain missing results without specialist vocabulary / “Blockers and opt-outs can also leave gaps” could say “Ad blockers and visitors who turn off analytics may leave some visits uncounted.” — Dashboard → empty — [screenshot](../../../scratch/ux2-empty.png).
- U4 — I expected an immediately understandable date boundary / “UTC days” assumes knowledge of a time-zone abbreviation; use “Dates use Coordinated Universal Time (UTC)” in help text. — Dashboard → error — [screenshot](../../../scratch/ux2-error.png).

## Triage

- U1 — obsolete under privacy amendment A-1: the removed website analytics dialog has no copy to revise.
- U2 — obsolete under privacy amendment A-1: the removed website analytics dialog has no copy to revise.
- U3 — accepted: explained ad blockers and visitors turning analytics off.
- U4 — rejected for this iteration: UTC is the existing dashboard date convention; expanding it in this small view is not necessary to implement the approved website measurement. No time-zone behavior changed.

## Coverage and actual results

- Campaign comparison: inspected the browser's campaign table text: September launch/reddit 8.5%, beta news/newsletter 13.5%, walkthrough/YouTube 11.2% visits with clicks. Mobile document width check returned `{"width":390,"scrollWidth":390}`. A comparison screenshot was captured at `scratch/ux2-campaign-table.png`, but the image-delivery budget prevented visual review of that capture; no visual conclusion is made about the table. Initial shot verification rejected an unchanged screenshot, so it is not evidence.
- Link builder: typed `newsletter` and `fall-update`, clicked Copy link, saw a generated URL and “Link copied. Ready to share.” Clipboard contents were not independently read. Screenshot: [copy confirmation](../../../scratch/ux2-flows/midnight/link-copy.png).
- App tab opened and was visually reviewed: [App mobile](../../../scratch/ux2-shots/midnight/app-mobile.png). Error, empty, and disabled/light screenshots were visually reviewed; error offers Retry, and disabled explains that existing history remains available. Did not assert recovery from the deliberately failing fixture.
- Website privacy: successfully opened and visually reviewed the dialog after allowing scrolling to settle. Checkbox, Close, focus return, and reopening were additionally checked with DOM actions in the existing probe. Returned `{"off":true,"close":true,"focus":true,"persisted":true}`. Persistence here means close/reopen, not a page reload. Collection remained disabled.
- Keyboard Escape/Tab: **unverified**. The first scripted sequence failed to open reliably; the deterministic-opening retry did not return output within the test budget. Those tool failures are not product findings. No claim of successful keyboard trapping or Escape focus return.
- Touch and high-density display behavior were not tested. No additional theme sweep. The privacy screen contains a preview-only collection-disabled notice; it is not a finding.

## Commands and output

`node scripts/ui-review/shot.mjs scratch/ux2-dump.json scratch/ux2-shots`

```text
ok   midnight/dashboard-mobile (0 contrast fails)
ok   midnight/app-mobile (0 contrast fails)
2/2 shots verified.
```

`node scripts/ui-review/shot.mjs scratch/ux2-flows.json scratch/ux2-flows`

```text
MISS midnight/compare-campaigns — identical to baseline (rmse 0)
ok   midnight/campaign-filter (0 contrast fails)
ok   midnight/link-copy (0 contrast fails)
2/3 shots verified.
```

`node scripts/ui-review/shot.mjs scratch/ux2-privacy-real.json scratch/ux2-privacy-real`

```text
ok   midnight/privacy-dialog (1 contrast fails)
1/1 shots verified.
```

The automated contrast warning concerns the background site's logo, not the dialog; not included as a scoped finding.

`node scripts/ui-review/shot.mjs scratch/ux2-keys.json scratch/ux2-keys-final`

```text
Still running after 20s — handed off to the background (shell id sh-85e9).
```

The final probe used `node scripts/ui-probe.mjs 'http://127.0.0.1:4793/' --size 390x844 --eval` with DOM focus/click actions to open, toggle, close, and reopen the dialog, and `--shot scratch/ux2-toggle-verified.png`. Actual result:

```text
{"off":true,"close":true,"focus":true,"persisted":true}
```

Screenshots are actual browser captures in this worktree's ignored scratch directory, not committed assets. Earlier unreliable scrolling capture `scratch/ux2-privacy/midnight/privacy-open.png` did not show the dialog and is explicitly excluded from evidence.
