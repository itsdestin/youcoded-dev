// Violation fixture for unpair-button-disabled-on-remote, description branch: a
// remote row no longer says where to unpair (fires once, on the whole file).
declare const Button: (p: any) => any;
export function Rows({ rows, hostOnly }: { rows: any[]; hostOnly: boolean }) {
  return rows.map((row) => (
    <div key={row.id} title={hostOnly ? `${row.online ? 'Online' : 'Offline'}` : ''}>
      <Button variant="ghost" size="sm" disabled={hostOnly} aria-label={`Unpair ${row.name}`}>Unpair</Button>
    </div>
  ));
}
