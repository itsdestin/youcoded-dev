// Violation fixture for chrome-control-no-glyph-nudge-hover.
declare const open: boolean;
// VIOLATION 1: the fallback in a plain className string.
export const A = () => <button className="px-2 py-1 transition-colors text-fg-dim hover:text-fg-2" />;
// VIOLATION 2: the same fallback as one branch of a conditional, in a template.
export const B = () => <button className={`px-2 ${open ? 'bg-accent text-on-accent' : 'text-fg-dim hover:text-fg-2'}`} />;
// NOT violations: the shared definition's own classes; a comment naming the fallback.
// text-fg-dim hover:text-fg-2
export const C = () => <button className="text-fg-dim on-inset-control" />;
