// Violation fixture for no-unstepped-infinite-animation.
// Branch A: inline animation style, infinite, no steps().
export const Bad = () => <div style={{ animation: 'glow 2s ease infinite' }} />;
// Branch B: Tailwind arbitrary value, infinite, no steps(), not an exempt keyframe name.
export const AlsoBad = () => <div className="animate-[version-glow_2s_ease_infinite]" />;
