---
status: shipped
card: 166
shipped: https://github.com/itsdestin/youcoded/pull/640
approval: working website preview and merge/close/deploy explicitly authorized by Destin in chat
branch: session/166-website-demo-light
---

# Website demo refresh

## Decisions and scope

- Update the website’s interactive embed from the current app checkout (1.3.1-era master, including the latest approved renderer changes).
- Open on chat; Home and Finance remain pinned. Source: `website-demo-light.questions.json`, submitted Q-1 = `chat-first`.
- Use the new lavender **YouCoded Light** theme (`youcoded`), not the legacy grey `light` theme. Its authoritative palette, Outfit font, wallpaper and mascot ship under `desktop/src/renderer/themes/builtin/youcoded.json` and `builtin/assets/`.
- Rebase the surrounding website’s default palette, wallpaper and final intro beat on the same theme. Preserve the other mascot theme choices and the just-approved headline/tagline.
- Public Home and Finance pages use fictional data and in-memory interactions, with no live banking, smart-home or camera connections. Mark the website’s demo entry as sample data; do not add imitation chrome inside the app.
- Desktop and phone previews were shown; Destin approved the working website preview and explicitly authorized “lets merge/close/deploy this now” in chat. The formal review deck was prepared but not submitted; no signed contract or deck approval is claimed.

## References opened

1. The app’s YouCoded theme preview (`themes/builtin/previews/youcoded.png`).
2. Existing Home Assistant connected screen in YouCoded Light (`references/home-youcoded.png`).
3. Existing Money page in YouCoded Light (`references/money-youcoded.png`).

Reuse those actual page documents and the current renderer, not redrawn versions. The public site scenario should not expose the internal approval, error and practice-page collection used by screenshot tests.

## Delivery boundaries

- Website theme changes: `youcoded/docs/index.html`, generated wallpaper and mascot, plus source parity checks.
- Site-only fake pages: workbench fixture seeding and fake bridges. Default, empty and stress practice scenarios retain their current behavior.
- Regenerate `docs/site/` with the site build, then regenerate its desktop/phone poster images with `embed-posters.mjs`. Do not re-film unrelated feature clips or regenerate the gallery for this scoped embed update.
- Verify actual browser boot, pinned-page navigation, representative Home controls and Finance filters/edits, theme switching, and phone reachability. Check the public bundle for private host addresses/data and unwanted external connections.

## First review

A before/after website view, the refreshed chat with pinned pages, Home, Finance, and phone views were prepared. The operable website was shared for direct review. After feedback that this should have been straightforward, the user authorized merge/close/deploy without submitting the formal review deck. Chat-first and the lavender YouCoded default remain unchanged.

## Verification

- `bash scripts/verify.sh <checkout>`: all checks passed; 1,165 test files / 20,456 tests passed, 3 files / 47 tests skipped by suite policy. Types, knip, lint, design lint, executable invariants, named-screen checks and click-path journeys passed.
- Website-specific guards pin the canonical YouCoded palette/font/glass values, mascot accent and phone caption selector. The corrected existing build guard rejects the previous wrong output path.
- Browser assertions against the built website: fake light control updates UI and fake house state; Finance Spending changes selection and chart heading; phone menu → Pages → full-width Home → Pages → full-width Finance → chat passes.
- The staged public app patch passed a redacted Gitleaks scan (8.45 MB scanned). No native Android build, real bank/home connection, installed-app change, paid model call or application release was performed.
- App pull request: https://github.com/itsdestin/youcoded/pull/640 .
