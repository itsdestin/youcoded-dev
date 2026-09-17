// Violation fixture for no-hand-rolled-dialog-shell: a centered modal drawn
// straight onto OverlayPanel instead of through <Dialog> — once as an open tag,
// once self-closing. Expected findings: 2.
const OverlayPanel = (p: any) => p.children ?? null;

export const BadOpen = () => (
  <OverlayPanel className="fixed" style={{ top: '50%', left: '50%' }}>
    body
  </OverlayPanel>
);

export const BadSelfClosing = () => <OverlayPanel className="fixed" />;
