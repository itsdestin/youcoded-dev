// Violation fixture for file-name-button-select-text (NOT OPTED IN): two
// file-name buttons; the second fires, its select-text is on another attribute.
declare const p: string;
export const Inline = () => <button className="inline select-text" data-file-path={p}>a</button>;
export const Pill = () => <button className="pill" data-select="select-text" data-file-path={p}>b</button>;
