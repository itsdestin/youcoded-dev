// Violation fixture for chrome-root-select-none-status-bar (fires once, on the
// file): the status bar's root lost select-none; the class is only quoted.
export const StatusBar = () => <div className="status-bar flex items-center">x</div>;
export const quoted = 'className="status-bar flex select-none"';
