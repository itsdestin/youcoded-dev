import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const {load}=createRequire(import.meta.url)('./comparison-loader.cjs');
for(const declaration of [
 "import {\n sep as separator,\n delimiter\n} from 'node:path';\nexport const answer=separator+delimiter;",
 "import * as paths from 'node:path';\nexport const answer=paths.sep+paths.delimiter;",
 "import paths, {\n sep as separator, delimiter\n} from 'node:path';\nexport const answer=paths.sep+delimiter;",
 "import {sep,delimiter} from 'node:path';\nconst answer=sep+delimiter;\nexport { answer };",
 "import {sep,delimiter} from 'node:path';\nconst combined=sep+delimiter;\nexport {\n combined as answer,\n};"
])test('trusted fixture loader supports pinned multiline/namespace/default import syntax: '+declaration.split('\n')[0],t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'yc-import-syntax-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:5}));
 const p=path.join(root,'fixture.ts');fs.writeFileSync(p,declaration);
 assert.equal(load(p).answer,path.sep+path.delimiter);
});
