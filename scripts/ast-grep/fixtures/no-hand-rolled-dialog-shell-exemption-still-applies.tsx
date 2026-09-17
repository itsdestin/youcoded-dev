// Violation fixture for no-hand-rolled-dialog-shell-exemption-still-applies:
// an "exempted" file that no longer renders OverlayPanel at all (the text in
// this comment does not count). Expected findings: 1.
export const Migrated = () => <div className="layer-surface">body</div>;
