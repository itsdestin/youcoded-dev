// Violation fixture for tooltip-wraps-forwarding-element: Tooltip wraps a
// component that does not forward its props/ref to a real DOM node.
const Bad = () => (
  <Tooltip text="Explain this">
    <SomeWeirdWidget />
  </Tooltip>
);

// Same violation, but the offending child is wrapped in a ternary — the
// retired test's textual scan found the first tag regardless of a `{...}`
// wrapper around it, so this shape must fire too (review, 2026-09-16).
const BadTernary = () => (
  <Tooltip text="Explain this">
    {show ? <SomeWeirdWidget /> : null}
  </Tooltip>
);

// Same violation, wrapped in `&&` instead of a ternary.
const BadAnd = () => (
  <Tooltip text="Explain this">
    {show && <SomeWeirdWidget />}
  </Tooltip>
);

// Same violation, with the `&&`-wrapped child ALSO wrapped in one extra
// layer of parens — the retired test's textual scan is indifferent to
// parens too (review round 2, 2026-09-16).
const BadAndParen = () => (
  <Tooltip text="Explain this">
    {show && (
      <SomeWeirdWidget />
    )}
  </Tooltip>
);
