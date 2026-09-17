// Violation fixture for explainer-hosts-pass-onback-showinfo: a host that renders
// the explainer but whose only onBack never consults showInfo (a mention inside
// a comment does not count). Expected findings: 1.
import { useState } from 'react';
const Dialog = (p: any) => p.children ?? null;
const SettingsExplainer = (_p: any) => null;

export function Host({ onSub }: { onSub?: () => void }) {
  const [showInfo] = useState(false);
  return (
    <Dialog title="Context" onBack={/* showInfo */ onSub}>
      {showInfo ? <SettingsExplainer intro="i" sections={[]} /> : null}
    </Dialog>
  );
}
