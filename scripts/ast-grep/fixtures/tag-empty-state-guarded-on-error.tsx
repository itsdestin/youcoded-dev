// Violation fixture for tag-empty-state-guarded-on-error (UNGUARDED). Each
// export fires once, on its "No tags yet" attribute.
declare const EmptyState: (p: any) => any, ErrorState: (p: any) => any, useLog: (x: unknown) => void, liveTags: unknown[];
// No check at all (the pre-fix shape).
export const NoCheck = () => <div><EmptyState message="No tags yet" /></div>;
// The read comes AFTER the empty state.
export const CheckAfter = (registry: any) => <div>{liveTags.length === 0 ? <EmptyState message="No tags yet" /> : null}{registry.error && <p />}</div>;
// The "check" is only text in a string.
export const CheckInString = () => <div>{'registry.error' ? null : <EmptyState message="No tags yet" />}</div>;
// An earlier statement reads the error but does not guard the empty state.
export function UnrelatedRead(registry: any) { useLog(registry.error); return <EmptyState message="No tags yet" />; }
// (review of u10) An earlier attribute reads the error but guards nothing.
export const EarlierTitleRead = (registry: any) => <div title={registry.error}>{liveTags.length === 0 ? <EmptyState message="No tags yet" /> : null}</div>;
// (review of u10) The error check dropped from the condition; the message still names it.
export const CheckDropped = (registry: any) => <div>{registry.tags.length === 0 ? <ErrorState message={`Couldn't load your tags: ${registry.error}`} /> : liveTags.length === 0 ? <EmptyState message="No tags yet" /> : null}</div>;
// (review of u10) The condition replaced with `false` — the retired 600-character window passed this.
export const FalseCondition = (registry: any) => <div>{false ? <ErrorState message={`Couldn't load your tags: ${registry.error}`} /> : liveTags.length === 0 ? <EmptyState message="No tags yet" /> : null}</div>;
// (review of u10) A sibling shows the error, but the empty state still renders beside it —
// the "No tags yet" lie the invariant forbids, so this fires on purpose.
export const SiblingOnly = (registry: any) => <div>{registry.error && <ErrorState message="Couldn't load your tags" />}{liveTags.length === 0 && <EmptyState message="No tags yet" />}</div>;
