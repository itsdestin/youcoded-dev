// Violation fixture for the single-owner ban on the private sidecar directory name.
// Two findings: a string literal naming it, and a comment naming it (the retired
// test's raw `.includes()` caught both).
export const BAD_PATH = 'private-continuation';
// reads <userData>/private-continuation/ directly
export const x = 1;
