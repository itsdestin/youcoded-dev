// Violation fixture for runtime-default-key-single-owner: a second module touching
// the runtime-default key directly (fires 3 times — a string, a template piece and
// a regex). The key in this comment does not count: youcoded-runtime-default.
declare const store: { getItem(k: string): string | null };
export const direct = store.getItem('youcoded-runtime-default');
export const templated = (n: string) => `youcoded-runtime-default-${n}`;
export const matcher = /youcoded-runtime-default/;
