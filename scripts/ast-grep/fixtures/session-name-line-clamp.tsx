// Violation fixture for session-name-line-clamp.
function SessionName({ name }: { name: string }) {
  return (
    <span className="block leading-snug text-sm-tight" style={{ WebkitLineClamp: 3 }}>
      {name}
    </span>
  );
}
