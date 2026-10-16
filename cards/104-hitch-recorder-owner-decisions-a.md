---
id: 104
title: Slowdown recorder: settings and privacy choices
stage: explore
priority: P3
tags: perf, performance, feature
report: docs/archive/investigations/2026-10-04-performance-gap-review.md
branch: 104-hitch-recorder-owner-decisions-a
roadmap: perf: Hitch recorder, owner decisions: (a) the recorder is always
created: 2026-10-15
summary: Decide whether people can turn the built-in slowdown recorder off, and whether its summary may go with bug reports.
area: Settings
side: both
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #107: Both note the hitch recorder does not exist on phones and remote browsers and was checked on Linux only.

Chats

From the old roadmap (perf, status decision, seen on n/a, last checked 2026-10-08)
Hitch recorder, owner decisions: (a) the recorder is always on (`YOUCODED_HITCH_LOG=0` is the only off switch) - decide whether people get a Settings on/off; (b) whether a redacted summary may be attached to bug reports (owner's privacy decision); (c) the same recorder for Android and remote browsers does not exist; (d) it now needs to say whether a build is installed or a developer build (`packaged` on the startup line) so dev-window data is not read as installed-app data. The recorder shipped 2026-10-08 (youcoded#616) and is on in every build; the first real data is whatever Destin's installed app writes from now on. Reader: `scripts/perf-lab/hitch-report.mjs`; file `<userData>/perf/hitches.jsonl`
