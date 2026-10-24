// Offline parser kept separate from the browser/build entry point.
import { isAbsolute } from 'node:path';
export function parseDomOptions(argv, budget = 8000) {
  const opt = { worktree: null, rows: 2000, only: null, budget, width: 1440, height: 900, theme: 'light', dump: false };
  const ranges = { rows: 20000, budget: 1000000, width: 16384, height: 16384 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--dump') { opt.dump = true; continue; }
    if (flag === '--growth') { opt.growth = true; continue; }
    if (flag === '--help' || flag === '-h') { opt.help = true; continue; }
    const key = flag.slice(2);
    if (!flag.startsWith('--') || !['worktree', 'rows', 'only', 'budget', 'width', 'height', 'theme', 'growth-screenshot'].includes(key)) throw Error(`unknown option ${flag}`);
    const value = argv[++i];
    if (value === undefined || value === '' || value.startsWith('--')) throw Error(`${flag} needs a value`);
    if (key in ranges) {
      if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > ranges[key]) throw Error(`${flag} must be a positive integer 1..${ranges[key]}`);
      opt[key] = Number(value);
    } else opt[key === 'growth-screenshot' ? 'growthScreenshot' : key] = value;
  }
  if (opt.growth && (opt.only !== 'projects/conversations' || opt.rows !== 2000 || opt.width < 640 || opt.budget !== 8000)) throw Error('--growth requires --only projects/conversations, exactly 2000 rows, desktop width >=640 and initial budget 8000');
  if (opt.growthScreenshot && (!opt.growth || !isAbsolute(opt.growthScreenshot) || !opt.growthScreenshot.endsWith('.png'))) throw Error('--growth-screenshot requires --growth and an absolute PNG destination');
  return opt;
}

export function stressQuery(screen, rows) {
  // WHY: never print a requested workload while fixture fallback/clamping or a
  // registered screen's params silently execute a different one (fixture cap 20k).
  if (!Number.isSafeInteger(rows) || rows < 1 || rows > 20000) throw Error('rows must be an integer 1..20000');
  return new URLSearchParams({ ...(screen.params ?? {}), mode: 'workbench', child: '1', latency: '0', scenario: 'stress', stressRows: String(rows) });
}
