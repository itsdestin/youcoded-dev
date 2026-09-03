import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAPTIONS, BANNED } from './captions.ts';
const spec = readFileSync(new URL('../../../docs/active/specs/2026-09-03-promo-video-design.md', import.meta.url), 'utf8');
test('every caption is a string from the spec storyboard table', () => {
  for (const [k, text] of Object.entries(CAPTIONS)) assert.ok(spec.includes(text), `${k}: "${text}" is not in the spec`);
});
test('no caption uses a banned landing-page phrase', () => {
  for (const text of Object.values(CAPTIONS)) for (const w of BANNED) assert.ok(!text.toLowerCase().includes(w), `"${text}" contains "${w}"`);
});
