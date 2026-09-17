// Violation fixture for tag-empty-state-guarded-on-error (MISSING) — the tag
// filter's "No tags yet" empty state is gone; the file fires once.
declare const EmptyState: (p: any) => any, ErrorState: (p: any) => any;
export const Filter = (registry: any) => (registry.error ? <ErrorState message="Couldn't load your tags" /> : <EmptyState message="No tags" />);
