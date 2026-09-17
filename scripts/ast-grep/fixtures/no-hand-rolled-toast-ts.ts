// Violation fixture for no-hand-rolled-toast-ts: the toast recipe in a .ts string (1).
export const TOAST_HTML = '<div className="fixed bottom-16 inset-x-0">Saved</div>';
// Review of u3: a parameter default (1), a destructure default (1), a class field (1).
export function param(className="fixed bottom-16 z-50") { return className; }
export const destructure = (props: any) => { const { className="fixed bottom-16" } = props; return className; };
export class Field { className="fixed bottom-16 px-3"; }
