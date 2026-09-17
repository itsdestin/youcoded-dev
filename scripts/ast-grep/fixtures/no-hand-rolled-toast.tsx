// Violation fixture for no-hand-rolled-toast: a hand-placed toast strip as a
// JSX attribute (1), and the same class string written into markup text (1).
export const Strip = () => <div className="fixed bottom-16 left-1/2 z-50 rounded-md">Saved</div>;
export const markup = `<div className="px-3 fixed bottom-16">${'Saved'}</div>`;
// className="fixed bottom-16" in a comment does not count
// Review of u3: the recipe as a parameter default (1), a destructure default (1),
// a class field (1), and JSX text split by an expression child (1).
export function Param(className="fixed bottom-16 z-50") { return className; }
export const Destructure = (props: any) => { const { className="fixed bottom-16" } = props; return className; };
export class Field { className="fixed bottom-16 px-3"; }
export const Split = ({ x }: any) => <p>className="{x} fixed bottom-16"</p>;
