// Violation fixture: a hover handler attached only to some pills.
declare const pack: { expanded: Set<string> };
declare const s: { id: string };
export const P = () => <div onMouseEnter={pack.expanded.has(s.id) ? undefined : () => {}} />;
