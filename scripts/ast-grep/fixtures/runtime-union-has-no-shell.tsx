// Violation fixture for runtime-union-has-no-shell — the union gained a shell
// member; the right declaration is only in this comment:
// export type Runtime = 'claude' | 'native';
export type Runtime = 'claude' | 'native' | 'shell';
