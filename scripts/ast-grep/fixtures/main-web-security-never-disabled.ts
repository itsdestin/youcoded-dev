// Violation fixture for main-web-security-never-disabled. Each line below
// fires once.
declare const BrowserWindow: new (o: unknown) => unknown;
export const win = new BrowserWindow({ webPreferences: { webSecurity:false } });
export type Prefs = { webSecurity: false };
export const flag = '--prefs=webSecurity: false';
export const probe = /webSecurity: false/;
