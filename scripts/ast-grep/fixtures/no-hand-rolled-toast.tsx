// Violation fixture for no-hand-rolled-toast: a hand-placed toast strip as a
// JSX attribute (1), and the same class string written into markup text (1).
export const Strip = () => <div className="fixed bottom-16 left-1/2 z-50 rounded-md">Saved</div>;
export const markup = `<div className="px-3 fixed bottom-16">${'Saved'}</div>`;
// className="fixed bottom-16" in a comment does not count
