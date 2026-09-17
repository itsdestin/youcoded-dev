// Violation fixture for no-background-throttling-off. This file is NOT compiled
// into the app — check.sh scans it to prove the rule still fires on every
// spelling of the flag, and stays silent on the shapes that are fine.
declare class BrowserWindow { constructor(opts: Record<string, unknown>); }

export function badBare(): BrowserWindow {
  // VIOLATION: a hidden window that keeps painting and ticking at full rate.
  return new BrowserWindow({ webPreferences: { backgroundThrottling: false, contextIsolation: true } });
}

export function badNoSpace(): Record<string, unknown> {
  // VIOLATION: the same flag without the space after the colon.
  return { backgroundThrottling:false };
}

export function badQuotedKey(): Record<string, unknown> {
  // VIOLATION: the quoted-key spelling.
  return { 'backgroundThrottling': false };
}

export function goodDefault(): BrowserWindow {
  // OK — explicitly true is Electron's default; must NOT fire. check.sh
  // compares the fixture finding count exactly, so a false positive here fails
  // the run loudly.
  return new BrowserWindow({ webPreferences: { backgroundThrottling: true } });
}

export function goodOtherFalse(): Record<string, unknown> {
  // OK — a different key set to false is none of this rule's business.
  return { backgroundColorThrottling: false, throttling: false };
}
