// Violation fixture for no-literal-black-white-wash: a literal black hover wash
// in a className (1), and a white one inside a template beside a substitution (1).
export const A = () => <button className="rounded hover:bg-black/20">x</button>;
export const b = (on: boolean) => `px-2 ${on ? 'text-fg' : ''} hover:bg-white/10`;
/* hover:bg-black/20 in a comment does not count */
