// Violation fixture for no-hand-rolled-callout-tint.
export const Bad = () => (
  <div className="rounded-lg p-3 border border-destructive/50 bg-destructive/10">hand-rolled</div>
);
// Split across the pieces of one className attribute (review of t6a): tint in one
// string, border in another.
declare const warn: boolean;
export const Split = () => (
  <div className={'rounded-lg p-3 border ' + (warn ? 'bg-amber-500/10' : '')}>split</div>
);
// Split across the arguments of one mergeClasses call, outside any attribute.
declare function mergeClasses(base: string, override: string): string;
export const SPLIT_CLASSES = mergeClasses('rounded-lg p-3 border', 'bg-accent/10');
// Tint in className, border in a SEPARATE style attribute on the same tag
// (fix round 2, 2026-09-16) — the shape the retired ±150-char window caught
// and the split-className/mergeClasses branches above do not.
export const StyleSplitOpen = () => (
  <div className="bg-accent/10 p-3" style={{ border: '1px solid var(--edge)' }}>open tag</div>
);
export const StyleSplitSelfClosing = () => (
  <img className="rounded-lg bg-destructive/10" style={{ border: '2px solid red' }} />
);
// A hand-rolled notice WITH its own buttons (fix batch 2, 2026-09-26): this used
// to be excused as "a K5 status strip". Since decisions.md P-2 it is simply a
// <Callout actions>, so the shape must still fire — Backup & Sync's old
// Warnings card was exactly this.
declare const onRetry: () => void;
export const NoticeWithButtons = () => (
  <div className="rounded-lg border px-3 py-2 border-amber-700/30 bg-amber-700/5">
    Google Drive backup failed
    <button onClick={onRetry}>Retry</button>
  </div>
);
