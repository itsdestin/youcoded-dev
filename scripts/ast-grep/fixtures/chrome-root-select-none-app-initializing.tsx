// Violation fixture for chrome-root-select-none-app (fires once, on the file):
// the initializing line has another attribute after its className.
export const A = () => <p className="text-xl select-none">No Active Session</p>;
export const B = () => <p className="text-sm select-none" role="status">Initializing session...</p>;
