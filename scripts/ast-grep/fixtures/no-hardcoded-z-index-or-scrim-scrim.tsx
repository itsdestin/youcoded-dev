// Violation fixture for no-hardcoded-z-index-or-scrim-scrim.
export const Bad = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" />
);
