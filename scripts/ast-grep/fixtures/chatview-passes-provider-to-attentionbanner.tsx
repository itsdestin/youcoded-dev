// Violation fixture for chatview-passes-provider-to-attentionbanner.
declare const AttentionBanner: (p: any) => any;
export const Bad = () => <AttentionBanner state="stuck" />;
