// Violation fixture for perf-mark-index-order: root-render as a BARE
// top-level statement (no if/else wrapper) fires before modules-evaluated.
// This is the shape the first-draft rule MISSED (review, 2026-09-16) — that
// draft only checked order when root-render sat inside an if_statement, so a
// bare top-level mark in the wrong order never tripped it. The rule now
// finds whichever top-level statement contains each mark, regardless of
// kind, so this shape and the if-wrapped shape both go through the same
// `follows` check.
performance.mark('yc:root-render');
performance.mark('yc:modules-evaluated');
