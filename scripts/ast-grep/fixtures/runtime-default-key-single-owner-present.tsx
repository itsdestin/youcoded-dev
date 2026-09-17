// Violation fixture for runtime-default-key-single-owner-present: an owner module
// that names youcoded-runtime-default only in this comment (fires once, on the file).
const KEY = 'somewhere-else';
export const defaultRuntime = () => (localStorage.getItem(KEY) === 'native' ? 'native' : 'claude');
