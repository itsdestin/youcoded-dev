// Marks this computer as a YouCoded TEAM DEVICE for the app's anonymous analytics.
//
// WHY (Destin, 2026-10-31, analytics deck D-2): any machine with this development
// workspace belongs to someone building YouCoded — its real, built app is still
// worth having on the dashboard, but not mixed in with users. The app checks for
// this file (youcoded/desktop/src/main/analytics-service.ts TEAM_DEVICE_FILE) and
// marks its check-ins "team"; the owner dashboard leaves them out unless
// "My devices" is on. Creating it is idempotent and touches nothing else.
// Run by workspace-start.mjs (every session) and setup.sh. VMs: scripts/vm/vm.sh
// writes it in the guest; anywhere else, see docs/local-dev.md → "Analytics".
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function teamDeviceFile(home = os.homedir()) {
  return path.join(home, '.claude', 'youcoded-team-device');
}

// Returns "created", "present", or "failed: <reason>". Never throws.
export function markTeamDevice(home = os.homedir()) {
  const file = teamDeviceFile(home);
  try {
    if (fs.existsSync(file)) return 'present';
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'This computer develops YouCoded; its analytics check-ins are marked "team" and left out of the dashboard.\n');
    return 'created';
  } catch (e) {
    return `failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = markTeamDevice();
  if (result === 'created') console.log(`Marked this computer as a YouCoded team device (${teamDeviceFile()}).`);
  else if (result !== 'present') console.log(`Could not mark this computer as a team device — ${result}`);
}
