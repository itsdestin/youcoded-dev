// Violation fixture for unpair-button-disabled-on-remote: the Unpair button lost
// disabled={hostOnly} (another control still carries it, and a comment quotes
// the old shape) — fires once, on the whole file.
declare const Button: (p: any) => any;
declare const Toggle: (p: any) => any;
export function Rows({ rows, hostOnly }: { rows: any[]; hostOnly: boolean }) {
  // <Button disabled={hostOnly} aria-label={`Unpair ${row.name}`}>
  return rows.map((row) => (
    <div key={row.id} title={hostOnly ? `${row.online ? 'Online' : 'Offline'} · unpair on the computer itself` : ''}>
      <Toggle disabled={hostOnly} />
      <Button variant="ghost" aria-label={`Unpair ${row.name}`}>Unpair</Button>
    </div>
  ));
}
