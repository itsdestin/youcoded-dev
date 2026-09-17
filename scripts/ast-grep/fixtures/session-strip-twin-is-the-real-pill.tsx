// Violation fixture: a dimmed ghost copy instead of a twin.
declare const pillBody: unknown;
export const Ghost = ({ ghostTarget }: { ghostTarget: string }) => (
  <div className="opacity-30 scale-95" data-ghost={ghostTarget}>{pillBody}</div>
);
