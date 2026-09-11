// Violation fixture for no-workbench-gate-in-shipped-ui.
//
// A component that renders one screen in the workbench and another in the app.
// Both halves look correct in review; the suite passes on whichever one the
// tests happen to mount; and a real user gets the other one. On 2026-09-10 this
// shape cost thirteen signed contract rows.
export function GatedScreen(props: { open: boolean }) {
  const design = new URLSearchParams(window.location.search).get('mode') === 'workbench';
  return design ? <NewScreen {...props} /> : <OldScreen {...props} />;
}
