// Violation fixture for tooltip-wraps-forwarding-element: Tooltip wraps a
// component that does not forward its props/ref to a real DOM node.
const Bad = () => (
  <Tooltip text="Explain this">
    <SomeWeirdWidget />
  </Tooltip>
);
