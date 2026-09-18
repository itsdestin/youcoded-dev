// Violation fixture for file-name-button-select-text (EXTRA): a third
// file-name button; the third fires.
declare const p: string;
export const Inline = () => <button className="select-text" data-file-path={p}>a</button>;
export const Pill = () => <button className="select-text" data-file-path={p}>b</button>;
export const Third = () => <button className="select-text" data-file-path={p}>c</button>;
