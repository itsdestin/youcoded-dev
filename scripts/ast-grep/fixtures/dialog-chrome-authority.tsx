// Violation fixture for no-hand-rolled-dialog-header — a view painting its
// own dialog header bar instead of passing title/onBack/headerActions to <Dialog>.
export const Bad = () => (
  <div className="flex items-center justify-between px-4 py-3 border-b border-edge shrink-0">Hand-rolled</div>
);
