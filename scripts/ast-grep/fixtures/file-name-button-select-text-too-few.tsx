// Violation fixture for file-name-button-select-text (TOO FEW): one file-name
// button; the second lost its data-file-path. The file fires.
declare const p: string;
export const Inline = () => <button className="select-text" data-file-path={p}>a</button>;
export const Pill = () => <button className="select-text" data-path={p}>b</button>;
