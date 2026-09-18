// Violation fixture for no-hand-rolled-setting-row-toggle.
declare const Toggle: (p: { checked?: boolean; children?: unknown }) => null;
declare const UiToggle: (p: { children?: unknown }) => null;
declare const SettingRow: (p: { title?: string; icon?: unknown; control?: unknown }) => null;
declare const Other: () => null;
declare const cond: boolean;
declare const a: number;
// A hand-rolled toggle row: a self-closing Toggle outside any control slot.
export const Bare = () => <div><span>Label</span><Toggle checked /></div>;
// The open/close form outside any control slot.
export const Open = () => <label><UiToggle>on</UiToggle></label>;
// In a control slot, but after a tag closed inside it (a sibling of the Toggle).
export const AfterSibling = () => <SettingRow title="t" control={cond ? <Other /> : <Toggle />} />;
// In a control slot, but after a tag closed inside it (a sibling of an ancestor).
export const AfterCousin = () => <SettingRow title="t" control={<div><Other /><b><Toggle /></b></div>} />;
// Markup written as a string.
export const MARKUP = '<Toggle checked />';
// Type arguments naming it.
export const LIST: Array<Toggle> = [];
// A comparison touching the name.
export const CMP = a <Toggle;
// NOT violations: a Toggle in a control slot (bare, in parentheses, after a
// closed tag in an EARLIER attribute), and a comment.
export const Slot = () => <SettingRow title="t" control={<Toggle />} />;
export const Parens = () => <SettingRow title="t" control={(<Toggle checked />)} />;
export const AfterIcon = () => <SettingRow icon={<Other />} title="t" control={<Toggle />} />;
// <Toggle checked />
