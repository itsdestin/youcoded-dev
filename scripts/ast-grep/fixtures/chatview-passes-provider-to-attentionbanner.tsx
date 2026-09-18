// Violation fixture for chatview-passes-provider-to-attentionbanner.
// Two findings: the self-closing form and the open/close form, both without the prop.
declare const AttentionBanner: (p: any) => any;
export const Bad = () => <AttentionBanner state="stuck" />;
export const AlsoBad = () => <AttentionBanner state="stuck">details</AttentionBanner>;
