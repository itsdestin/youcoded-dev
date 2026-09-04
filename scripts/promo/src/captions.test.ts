import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAPTIONS, BANNED } from './captions.ts';
const spec = readFileSync(new URL('../../../docs/active/specs/2026-09-03-promo-video-design.md', import.meta.url), 'utf8');
const strings = Object.values(CAPTIONS).flatMap((c) => (typeof c === 'string' ? [c] : Object.values(c)));
test('every caption is a string from the spec storyboard table', () => {
  for (const text of strings) assert.ok(spec.includes(text), `"${text}" is not in the spec`);
});
test('no caption uses a banned landing-page phrase', () => {
  for (const text of strings) for (const w of BANNED) assert.ok(!text.toLowerCase().includes(w), `"${text}" contains "${w}"`);
});
