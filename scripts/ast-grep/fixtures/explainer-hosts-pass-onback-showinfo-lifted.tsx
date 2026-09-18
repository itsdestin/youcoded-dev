// Violation fixture for explainer-hosts-pass-onback-showinfo-lifted: the lifted
// host renders the explainer but no longer takes a showInfo prop (this comment's
// mention does not count). Expected findings: 1.
const SettingsExplainer = (_p: any) => null;

export default function Screen({ info }: { info: boolean }) {
  if (info) return <SettingsExplainer intro="i" sections={[]} />;
  return null;
}
