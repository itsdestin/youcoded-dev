// Violation fixture for tag-empty-state-guarded-on-error (UNGUARDED). Each
// export fires once, on its "No tags yet" attribute.
declare const EmptyState: (p: any) => any, useLog: (x: unknown) => void, liveTags: unknown[];
// No check at all.
export const NoCheck = () => <div><EmptyState message="No tags yet" /></div>;
// The read comes AFTER the empty state.
export const CheckAfter = (registry: any) => <div>{liveTags.length === 0 ? <EmptyState message="No tags yet" /> : null}{registry.error && <p />}</div>;
// The "check" is only text in a string.
export const CheckInString = () => <div>{'registry.error' ? null : <EmptyState message="No tags yet" />}</div>;
// An earlier statement reads the error but does not guard the empty state.
export function UnrelatedRead(registry: any) { useLog(registry.error); return <EmptyState message="No tags yet" />; }
