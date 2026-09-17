// Violation fixture: a transcript key handler that never yields to a game.
export const onKey = (e: KeyboardEvent) => { if (e.key === 'ArrowUp') e.preventDefault(); };
