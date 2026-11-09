import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as calibration from './calibration-packet.mjs';
test('blind packet preserves answer text, separates identities and invents no human ratings',()=>{
 const samples=[{id:'trial-private-1',client:'Client One',model:'Model One',answer:'Updated and checked.',artifactVerified:true},{id:'trial-private-2',client:'Client Two',model:'Model Two',answer:'The requested changes are complete.',artifactVerified:true}];
 const {packet,key}=calibration.buildCalibrationPacket({task:'Change two fields and preserve the rest.',samples,seed:'test'});
 const encoded=JSON.stringify(packet);for(const secret of ['trial-private','Client One','Client Two','Model One','Model Two'])assert.equal(encoded.includes(secret),false);
 assert.deepEqual(new Set(packet.candidates.map(c=>c.answer)),new Set(samples.map(s=>s.answer)));
 assert.equal(packet.humanResponse,null);assert.equal(key.identities.length,2);
 assert.deepEqual(calibration.buildCalibrationPacket({task:'Change two fields and preserve the rest.',samples,seed:'test'}).packet,packet);
 assert.throws(()=>calibration.buildCalibrationPacket({task:'x',samples:[{...samples[0],artifactVerified:false},samples[1]],seed:'test'}),/verified/i);
});
