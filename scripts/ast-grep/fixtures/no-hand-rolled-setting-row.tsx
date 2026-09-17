// Violation fixture for no-hand-rolled-setting-row — one retired recipe per node kind.
declare const x: string;
// A className string (DevelopmentPopup's old Row).
export const InString = () => <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50">row</div>;
// A template piece beside a substitution (Preferences' old ToggleRow).
export const IN_TEMPLATE = `flex items-start justify-between gap-3 p-2 rounded hover:bg-inset ${x}`;
// JSX text (the Sound preset recipe).
export const InText = () => <pre>flex items-center gap-3 px-3 py-2 rounded-lg bg-inset/50 hover:bg-inset cursor-pointer</pre>;
// A regex body (PerformancePopup's old power-saving row).
export const IN_REGEX = /w-full text-left flex items-start gap-3 p-3 rounded-lg hover:bg-inset/;
// NOT violations: a comment naming a recipe, and a string split by a substitution.
// flex items-start gap-3 p-2 rounded hover:bg-inset cursor-pointer
export const SPLIT = `flex items-start gap-3 p-2 ${x} rounded hover:bg-inset cursor-pointer`;
