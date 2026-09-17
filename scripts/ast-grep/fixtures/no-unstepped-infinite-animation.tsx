// Violation fixture for no-unstepped-infinite-animation.
// Branch A: inline animation style, infinite, no steps().
export const Bad = () => <div style={{ animation: 'glow 2s ease infinite' }} />;
// Branch B: Tailwind arbitrary value, infinite, no steps(), not an exempt keyframe name.
export const AlsoBad = () => <div className="animate-[version-glow_2s_ease_infinite]" />;
// Branch B, judged per bracket: the exempt bracket beside it must not hide the unstepped one.
export const Mixed = () => <div className="animate-[rig-breathe_2s_ease_infinite] animate-[glow_1s_ease_infinite]" />;
// Branch B across `${}`: the bracket is split by a substitution.
declare const name: string;
export const Split = () => <div className={`animate-[${name}_2s_ease_infinite]`} />;
