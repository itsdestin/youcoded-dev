// Violation fixture for main-web-security-never-disabled. Each line below
// fires once.
declare const BrowserWindow: new (o: unknown) => unknown;
export const win = new BrowserWindow({ webPreferences: { webSecurity:false } });
export type Prefs = { webSecurity: false };
export const flag = '--prefs=webSecurity: false';
export const probe = /webSecurity: false/;
// (review of u10) A quoted key and a computed key are the same option.
export const quoted = { webPreferences: { 'webSecurity': false } };
export const computed = { webPreferences: { ["webSecurity"]: false } };
