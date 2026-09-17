// Violation fixture for shortcuts-dialog-keeps-scroll-body-session-name.
function SessionName({ name }: { name: string }) {
  return (
    <span className="block leading-snug text-sm-tight" style={{ WebkitLineClamp: 3 }}>
      {name}
    </span>
  );
}
