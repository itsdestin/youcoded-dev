// Violation fixture for danger-zone-has-danger-callout — the zone's callout is
// not a danger one, and the danger tag appears only in a string:
declare const Callout: (p: { tone: string; children?: unknown }) => null;
export const note = '<Callout tone="danger">';
export const Zone = () => <Callout tone="warn">This deletes everything.</Callout>;
