import {test} from 'node:test';
import assert from 'node:assert/strict';
import {upstreamDiagnostic} from './upstream-diagnostic.mjs';
test('diagnostics redact bearer and named API credentials beyond known secrets',async()=>{
 const out=await upstreamDiagnostic(new Response(JSON.stringify({error:{message:'Authorization: Bearer other-secret-token; api_key=another-secret-value'}})),[]);
 assert.equal(JSON.stringify(out).includes('other-secret-token'),false);assert.equal(JSON.stringify(out).includes('another-secret-value'),false);
});
test('diagnostics omit oversized and non-JSON bodies',async()=>{
 assert.match((await upstreamDiagnostic(new Response('x'.repeat(33000)),[])).message,/exceeded/);
 assert.match((await upstreamDiagnostic(new Response('some arbitrary text'),[])).message,/omitted/);
});
