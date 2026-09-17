// Violation fixture for chrome-root-select-none-app (fires once, on the file):
// the no-session title lost select-none; the initializing line keeps it.
export const A = () => <p className="text-sm select-none">Initializing session...</p>;
export const B = () => <p className="text-xl text-fg-muted">No Active Session</p>;
