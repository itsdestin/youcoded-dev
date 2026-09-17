// Violation fixture for tooltip-key-on-wrapper-not-child: the key belongs on
// <Tooltip>, since it's now the element in the mapped array — left on the
// child it names nothing, and React re-renders the wrong rows.
const Bad = () => (
  <>
    {items.map((item) => (
      <Tooltip text="Explain this">
        <div key={item.id}>{item.label}</div>
      </Tooltip>
    ))}
  </>
);

// Same violation, but the keyed child is wrapped in a ternary — the retired
// test's textual scan found the key attribute regardless of a `{...}`
// wrapper around it, so this shape must fire too (review, 2026-09-16).
const BadTernary = () => (
  <>
    {items.map((item) => (
      <Tooltip text="Explain this">
        {item.visible ? <div key={item.id}>{item.label}</div> : null}
      </Tooltip>
    ))}
  </>
);

// Same violation, wrapped in `&&` instead of a ternary.
const BadAnd = () => (
  <>
    {items.map((item) => (
      <Tooltip text="Explain this">
        {item.visible && <div key={item.id}>{item.label}</div>}
      </Tooltip>
    ))}
  </>
);

// Same violation, with the `&&`-wrapped keyed child ALSO wrapped in one
// extra layer of parens — the retired test's textual scan is indifferent to
// parens too (review round 2, 2026-09-16).
const BadAndParen = () => (
  <>
    {items.map((item) => (
      <Tooltip text="Explain this">
        {item.visible && (<div key={item.id}>{item.label}</div>)}
      </Tooltip>
    ))}
  </>
);
