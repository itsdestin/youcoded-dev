// The release photo copy: only the photo-only start-up block of index.tsx comes from today.
// Run: node --test scripts/shoot/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spliceDevBlock } from '../what-changed/photo-copy.mjs';

test("the release's own start-up is kept; only the dev/photo block is today's", () => {
  const release = "import App from './App';\nconst isAndroid = location.protocol === 'file:';\nif ((import.meta.env.DEV || import.meta.env.VITE_WORKBENCH === '1') && x) {\n  old();\n}\n";
  const today = "import App from './App';\nimport { isAndroidAppPage } from './android-page';\nconst isAndroid = isAndroidAppPage();\nif ((import.meta.env.DEV || import.meta.env.VITE_WORKBENCH === '1') && x) {\n  shootNew();\n}\n";
  const out = spliceDevBlock(release, today);
  assert.match(out, /location\.protocol === 'file:'/);
  assert.doesNotMatch(out, /android-page/);
  assert.match(out, /shootNew/);
  assert.doesNotMatch(out, /old\(\)/);
});
