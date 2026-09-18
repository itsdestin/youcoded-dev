// Violation fixture for settings-explainer-no-chrome-props: the explainer handed
// chrome that belongs to <Dialog> — self-closing with title, and an open tag
// with onBack. Expected findings: 2.
const SettingsExplainer = (p: any) => p.children ?? null;

export const BadSelfClosing = () => <SettingsExplainer title="About" intro="i" sections={[]} />;

export const BadOpen = () => (
  <SettingsExplainer intro="i" sections={[]} onBack={() => {}}>
    x
  </SettingsExplainer>
);
