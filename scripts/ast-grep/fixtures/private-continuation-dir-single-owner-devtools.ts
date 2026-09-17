// Violation fixture for the dev-tools ban on naming the app's data directory.
// Two findings: a string literal and a destructured name (not a string).
export const BAD = 'userData';
declare const paths: Record<string, string>;
export const { userData } = paths;
