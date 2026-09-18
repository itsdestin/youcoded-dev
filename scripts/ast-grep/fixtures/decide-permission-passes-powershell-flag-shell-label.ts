// Violation fixture for decide-permission-passes-powershell-flag-shell-label:
// the label detectShell returns drifted away from the exact string
// decidePermission's wiring compares against.
export function detectShell(): ShellInfo {
  return { cmd: 'powershell.exe', args: ['-NoProfile', '-Command'], label: 'Windows PowerShell' };
}
