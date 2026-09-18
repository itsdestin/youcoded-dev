// Violation fixture: a peek that opens in passing.
declare function setHoveredId(id: string): void;
export const handleEnter = (id: string) => { setHoveredId(id); };
