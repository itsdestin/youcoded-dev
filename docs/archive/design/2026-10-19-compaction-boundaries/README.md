# Compaction boundary review

Status: shipped in app PR #661, merge `2cbea256388667b304b8704b8bf47fe09b5ae48c`; approved in chat, 2026-10-20. Destin reviewed the lay explanation of every visible behavior and said, “okay this seems good. lets wrap it up!” He subsequently authorized “lets merge/close out”. This records chat approval; no deck answer file was manufactured.

The existing compact/clear/model divider and expandable summary are the visual references. The repaired layout is shared by main chat, buddy chat and conversation previews. Screenshots were captured from the real renderer in isolated fake-backend workbenches; production was not attached to or modified.

`compaction-review.json` is the two-point before/after review: source-positioned compaction and phone-width summary wrapping. Its `runs/` files are the source pictures and `images/` files are the referenced focused comparisons. Raw preview sheets and server metadata are disposable and not part of the published record.

Behavioral regression evidence is in the app tests: timeline-presentation, chat-reducer, fill-native-markers, transcript-event-actions, session-live-facts, native-compact, use-compaction-watchdog, chat-message-find and SystemMarker. The corresponding implementation plan records verification results and limitations.
