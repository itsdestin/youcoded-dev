// Violation fixture for no-button-styled-as-field.
declare const x: string;
// A button wearing the field surface — open tag.
export const Open = () => <button className="w-full bg-inset border border-edge-dim px-2">~/project</button>;
// The same on a self-closing tag.
export const SelfClosing = () => <button className="bg-inset border border-edge-dim" />;
// Markup written as a string.
export const MARKUP = '<button type="button" className="bg-inset border border-edge-dim">';
// Markup in a template, the class text split by a substitution.
export const TEMPLATE = `<button className="bg-inset border border-edge-dim ${x}">`;
// NOT violations: the field surface on a real field, a button with the class in
// braces (the retired scan read double-quoted classNames only), and a comment.
export const Field = () => <input className="bg-inset border border-edge-dim" />;
export const Braced = () => <button className={"bg-inset border border-edge-dim"}>b</button>;
// <button className="bg-inset border border-edge-dim">
