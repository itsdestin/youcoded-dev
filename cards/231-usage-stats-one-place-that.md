---
id: 231
title: Usage stats: one place that adds up what you used, by day, provider and model
stage: planning
tags: native-harness, cost, settings, user-interface, feature
branch: 231-usage-stats-one-place-that
finish: A usage view inside Cloud providers, also opened from the status-bar chips, showing by day, provider and model what was used, as amounts and percent of plan or cost, kept 90 days.
created: 2026-11-10
why: Designed and approved 2026-09-29 (decks, a written definition of done and the look are on master under docs/active/design/2026-09-29-usage-stats/). Never built. Destin 2026-11-10 on the work-inventory designs deck: card it. Desktop only ('dont bother with android').
---
Progress
Done: Design approved 2026-09-29: decks + answers + definition of done (usage-stats.contract.json rows R1-R10) in docs/active/design/2026-09-29-usage-stats/. UI mockup on app branch session/usage-visibility-20260929 (commits 311e26de0, e32b062dc, f4408b75f), ~2000 commits behind master. Desktop only.
Next: Data layer first: record per-day/provider/model usage in the native engine, keep 90 days, with tests. Then UI: opens from the status-bar usage/cost chips, also at the bottom of Settings > Assistant settings > Cloud providers; one account per tab; timeline of limit fullness + tokens/day; model share; 24h uses the 5-hour limit, 2w/3m the 7-day; ChatGPT per-model limit/extra credits only when reported; OpenRouter credit left, $/day, per-model cost, no limit line. Reuse mockup components by cherry-pick/reading. Before/After deck.
Blocked: Nothing; Destin parked it 2026-11-19 to pick up later

Chats
