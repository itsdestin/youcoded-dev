// Pure/injected preflight only. Do not launch GPU/browser or read live sensors.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {classifyRenderingLane,diagnosticCapabilities} from '../capabilities.mjs';
const gpu={source:'SystemInfo',glRenderer:'zink AMD RADV',featureStatus:{gpu_compositing:'enabled',rasterization:'enabled'},devices:[{vendorId:4098,deviceId:123,active:true}]};
test('zink alone is neither proof of software nor proof of isolated hardware',()=>{
 assert.equal(classifyRenderingLane({selectedLane:'software',renderer:{glRenderer:'zink'}}).status,'incomplete');
 assert.equal(classifyRenderingLane({selectedLane:'isolated-virtual-hardware',renderer:gpu,isolatedVirtual:true}).status,'supported');
 assert.equal(classifyRenderingLane({selectedLane:'physical',renderer:gpu,physicalOptIn:false}).status,'unsupported');
 assert.equal(classifyRenderingLane({selectedLane:'physical'}).status,'unsupported');
 assert.equal(classifyRenderingLane({selectedLane:'physical',renderer:gpu,physicalOptIn:'true'}).status,'unsupported');
 assert.equal(classifyRenderingLane({selectedLane:'isolated-virtual-hardware',renderer:{...gpu,glRenderer:'zink lavapipe'},isolatedVirtual:true}).status,'failed');
 assert.equal(classifyRenderingLane({selectedLane:'software',renderer:{glRenderer:'llvmpipe'}}).status,'incomplete');
 const software={source:'SystemInfo',glRenderer:'llvmpipe',featureStatus:{gpu_compositing:'disabled_software',rasterization:'disabled_software'},devices:[{active:true,vendorId:65541,deviceId:0,deviceString:'llvmpipe software rasterizer'}]};
 assert.equal(classifyRenderingLane({selectedLane:'software',renderer:software}).status,'supported');
 assert.equal(classifyRenderingLane({selectedLane:'software',renderer:{...software,featureStatus:gpu.featureStatus}}).status,'incomplete');
 assert.equal(classifyRenderingLane({selectedLane:'software',renderer:{...software,devices:gpu.devices}}).status,'incomplete');
 assert.equal(classifyRenderingLane({selectedLane:'physical',renderer:gpu,physicalOptIn:true}).status,'supported');
});
test('capabilities keep missing sensors, unsupported platforms and engine adapters explicit',async()=>{
 let reads=0;
 const nonlinux=await diagnosticCapabilities({platform:'darwin',discover:()=>{reads++;}});assert.equal(nonlinux.energy.status,'unsupported');assert.equal(reads,0);
 const r=await diagnosticCapabilities({platform:'linux',discover:async()=>({status:'unsupported',sensors:[],errors:[]})});
 const denied=await diagnosticCapabilities({platform:'linux',discover:async()=>({status:'supported',sensors:[{id:'x'}]}),readSnapshot:async()=>({status:'incomplete',reason:'Permission unavailable'})});assert.equal(denied.energy.status,'incomplete');
 assert.equal(r.energy.status,'unsupported');assert.equal(r.standardAcceptance,false);assert.ok(r.gaps.includes('Intel/NVIDIA process GPU engine accounting not implemented here'));assert.equal(r.appWatts.status,'unsupported');
});
