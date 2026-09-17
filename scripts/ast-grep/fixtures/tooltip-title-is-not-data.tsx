// Violation fixture for tooltip-title-is-not-data: wrapping a component
// whose `title` is content it renders, not a hover hint.
const Bad = () => (
  <Tooltip text="Explain this">
    <SessionPreviewPane title="Real heading" />
  </Tooltip>
);
