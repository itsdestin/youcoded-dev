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
