// Which themes `shoot --themes all` means: every theme the practice app can show.
//
// WHY (close-session friction, proposal 12; first asked in the Marketplace round): "all" was a
// hard-coded six (midnight, light, halftone-dimension, meadow-mist, creme, dark), so Crème's
// siblings, the two YouCoded themes and every other community theme in the workbench had to be
// listed by hand. The list now comes from the app itself: the built-in themes shipped with this
// checkout plus the community themes its practice backend serves.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** The built-in theme slugs of a checkout (`desktop/src/renderer/themes/builtin/<slug>.json`). */
export function builtinThemeSlugs(checkout) {
  const dir = join(checkout, 'desktop', 'src', 'renderer', 'themes', 'builtin');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort() : [];
}

/** Built-in first (in name order), then the practice app's community themes, no repeats. */
export function allThemes(builtin, community) {
  const seen = new Set();
  return [...builtin, ...[...(community ?? [])].sort()].filter((s) => typeof s === 'string' && s && !seen.has(s) && seen.add(s));
}

/** The expression a practice-app tab answers with its community theme slugs. */
export const COMMUNITY_THEMES = "(async () => { try { return window.claude && window.claude.theme && window.claude.theme.list ? await window.claude.theme.list() : []; } catch { return []; } })()";
