// Violation fixture for no-centred-status-paragraph — each line fires once.
export const A = () => <p className="text-xs text-center text-red-400">Connection failed</p>;
export const markup = '<p className="text-green-400 mt-2 text-center">Connected</p>';
