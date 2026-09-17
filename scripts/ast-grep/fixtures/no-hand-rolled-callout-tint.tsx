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
