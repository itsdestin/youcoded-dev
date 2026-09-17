// Violation fixture: press clears the pressed pill's own peek.
declare function setHoveredId(v: string | null): void;
export const handlePointerDown = () => { setHoveredId(null); };
