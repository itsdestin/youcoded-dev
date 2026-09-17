// Violation fixture for no-two-bare-bg-utilities — the exact string that shipped.
export const Bad = () => <div className="bg-inset bg-accent/[0.07]" />;

// Violation fixture (review of batch A, 2026-09-16): the same bug, but the
// second bare bg- token is split off by a template-string substitution —
// a string_fragment-only rule cannot see across the `${x}` boundary.
const x = 'accent';
export const BadTemplate = () => <div className={`bg-inset ${x} bg-accent/[0.07]`} />;
