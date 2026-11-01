// Marks a computer as a YouCoded TEAM DEVICE for the app's anonymous analytics.
//
// WHO GETS MARKED (Destin, 2026-10-31): only the OWNER's own computers, and test
// VMs started by scripts/vm/*. Anyone may install this workspace to improve the
// app — a contributor's everyday YouCoded is a real user and must keep counting,
// so having the workspace is NOT enough. The owner is recognised by the GitHub
// account the `gh` CLI is signed in as (OWNER below), checked only while the file
// is missing. The app looks for this file (youcoded/desktop/src/main/
// analytics-service.ts TEAM_DEVICE_FILE), marks its check-ins "team", and the
// owner dashboard leaves them out unless "My devices" is on.
// Run by workspace-start.mjs (every session) and setup.sh.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const OWNER = 'itsdestin';

// The GitHub login `gh` is signed in as, or '' when gh is missing or signed out.
export function githubLogin() {
  try {
    return execFileSync('gh', ['api', 'user', '--jq', '.login'], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
}

export function teamDeviceFile(home = os.homedir()) {
  return path.join(home, '.claude', 'youcoded-team-device');
}

// Returns "created", "present", "not-owner", or "failed: <reason>". Never throws.
// `login` is looked up only while the file is missing. `checkedFile` (optional)
// remembers a "not the owner" answer for a week, so a contributor's session start
// does not wait on a GitHub call every time.
export const RECHECK_MS = 7 * 24 * 60 * 60 * 1000;
export function markTeamDevice(home = os.homedir(), login = githubLogin, { checkedFile = null, now = Date.now() } = {}) {
  const file = teamDeviceFile(home);
  try {
    if (fs.existsSync(file)) return 'present';
    if (checkedFile) {
      try { if (now - fs.statSync(checkedFile).mtimeMs < RECHECK_MS) return 'not-owner'; } catch { /* never checked */ }
    }
    if ((typeof login === 'function' ? login() : login) !== OWNER) {
      if (checkedFile) { try { fs.writeFileSync(checkedFile, 'not the YouCoded owner\n'); } catch { /* re-check next time */ } }
      return 'not-owner';
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'The YouCoded owner\'s computer: its analytics check-ins are marked "team" and left out of the dashboard.\n');
    return 'created';
  } catch (e) {
    return `failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = markTeamDevice();
  if (result === 'created') console.log(`Marked this computer as a YouCoded team device (${teamDeviceFile()}).`);
  else if (result.startsWith('failed')) console.log(`Could not mark this computer as a team device — ${result}`);
}
