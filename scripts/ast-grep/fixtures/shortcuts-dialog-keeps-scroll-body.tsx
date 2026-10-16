// Violation fixture for shortcuts-dialog-keeps-scroll-body.
function ShortcutsPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  return createPortal(
    <Dialog open onClose={onClose} size="panel" title="Keyboard Shortcuts" scrollBody={false}>
      {SHORTCUT_GROUPS.map((g) => g.rows.map(({ keys, description }) => (
        <span key={keys}>{description}</span>
      )))}
    </Dialog>,
    document.body
  );
}
