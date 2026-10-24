// WHY this helper (2026-10-24, workspace CI): several lab tests reuse the app's own dependencies (jszip, exceljs,
// jsdom, ...) from youcoded/desktop/node_modules instead of installing their own. The workspace CI checks the app out
// WITHOUT installing them, so a top-level require crashed the whole file there ("Cannot find module 'jszip'") while
// every test passed on a machine with the app's dependencies. Those tests now report themselves skipped, with the
// reason, when a dependency is missing; where the dependencies are installed they run exactly as before.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const appRequire = createRequire(fileURLToPath(new URL('../../../youcoded/desktop/package.json', import.meta.url)));

/** false when every named package resolves from the app checkout; otherwise the skip reason naming what is missing. */
export function missingAppDeps(names) {
  const missing = names.filter((name) => { try { appRequire.resolve(name); return false; } catch { return true; } });
  return missing.length ? `app dependencies not installed in youcoded/desktop/node_modules: ${missing.join(', ')}` : false;
}
