// Violation fixture for session-menu-height-capped.
// Missing the second scroll-fade treatment (className="scroll-fade flex-1 py-1").
function SessionMenu() {
  const style = {
    height: undefined,
    maxHeight: `min(680px, ${belowTrigger})`,
  };
  const other = { maxHeight: 'var(--session-menu-available-height)' };
  const offset = 'calc(100vh - 8px - var(--vvp-offset, 0px))';
  return <div className="scroll-fade flex-1" />;
}
