// Violation fixture for tooltip-title-is-not-data: wrapping a component
// whose `title` is content it renders, not a hover hint.
const Bad = () => (
  <Tooltip text="Explain this">
    <SessionPreviewPane title="Real heading" />
  </Tooltip>
);

// Same violation, but the offending child is wrapped in a ternary — the
// retired test's textual scan found the first tag regardless of a `{...}`
// wrapper around it, so this shape must fire too (review, 2026-09-16).
const BadTernary = () => (
  <Tooltip text="Explain this">
    {open ? <Dialog title="Real heading" /> : null}
  </Tooltip>
);

// Same violation, wrapped in `&&` instead of a ternary.
const BadAnd = () => (
  <Tooltip text="Explain this">
    {open && <Dialog title="Real heading" />}
  </Tooltip>
);

// Same violation, with the ternary's consequence ALSO wrapped in one extra
// layer of parens — the retired test's textual scan is indifferent to
// parens too (review round 2, 2026-09-16).
const BadTernaryParen = () => (
  <Tooltip text="Explain this">
    {open ? (
      <Dialog title="Real heading" />
    ) : null}
  </Tooltip>
);
