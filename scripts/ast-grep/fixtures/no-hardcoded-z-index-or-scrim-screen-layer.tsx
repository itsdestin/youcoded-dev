// Violation fixture for no-hardcoded-z-index-or-scrim-screen-layer.
// Missing "fixed inset-0 z-40" entirely.
export const Bad = () => <div className="absolute inset-0 z-30" />;
