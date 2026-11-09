// Diagnostic preflight only. No installation, permission escalation, compositor,
// device opening, CDP attachment or app launch. Importing does no IO.
import {discoverEnergySensors,readEnergySnapshot} from './energy.mjs';
const lanes=['software','isolated-virtual-hardware','physical'];
export function classifyRenderingLane({selectedLane='software',renderer,isolatedVirtual=false,physicalOptIn=false}={}){
 if(!lanes.includes(selectedLane))throw Error('Unknown rendering lane; silent fallback forbidden');
 const output={selectedLane,actualLane:null,status:'incomplete',reason:'Rendering evidence unavailable',physicalScanoutVerified:false};
 if(selectedLane==='physical'&&physicalOptIn!==true)return {...output,status:'unsupported',reason:'Physical-display lane requires explicit opt-in; no fallback'};
 const gl=renderer?.glRenderer;
 if(typeof gl!=='string'||!gl.trim()||gl.length>1024)return output;
 // WHY: zink translates GL to Vulkan and can target real hardware. virgl denotes
 // virtualization, not proof of a physical GPU. Never inherit gpu.mjs's broad
 // substring heuristic as hardware certification for this diagnostic lane.
 const software=/llvmpipe|softpipe|swiftshader|lavapipe|mesa offscreen/i.test(gl);
 const status=renderer?.featureStatus;
 const hardware=renderer?.source==='SystemInfo'&&!software&&!/virgl/i.test(gl)
  && typeof status?.gpu_compositing==='string'&&/^enabled(?:_on)?$/.test(status.gpu_compositing)&&typeof status?.rasterization==='string'&&/^enabled(?:_on)?$/.test(status.rasterization)
  && Array.isArray(renderer.devices)&&renderer.devices.length<=16&&renderer.devices.some(d=>d?.active===true&&Number.isInteger(d.vendorId)&&d.vendorId>0&&Number.isInteger(d.deviceId)&&d.deviceId>0);
 const active=Array.isArray(renderer?.devices)&&renderer.devices.length<=16?renderer.devices.filter(d=>d?.active===true):[];
 const softwareEvidence=software&&renderer.source==='SystemInfo'&&status?.gpu_compositing==='disabled_software'&&status?.rasterization==='disabled_software'
  &&active.length>0&&active.every(d=>typeof d.deviceString==='string'&&/llvmpipe|softpipe|swiftshader|lavapipe|software rasterizer/i.test(d.deviceString));
 if(selectedLane==='software')return {...output,actualLane:softwareEvidence?'software':null,status:softwareEvidence?'supported':hardware?'failed':'incomplete',reason:softwareEvidence?'Browser composition/raster and active software device agree':'Missing/mixed composition, raster or active-device software evidence; WebGL string alone insufficient'};
 if(software)return {...output,actualLane:'software',status:'failed',reason:'Software fallback observed; selected hardware lane refused'};
 if(!hardware)return {...output,reason:'Need browser SystemInfo features plus active hardware device; zink/virgl strings alone insufficient'};
 if(selectedLane==='isolated-virtual-hardware'&&isolatedVirtual!==true)return {...output,status:'incomplete',reason:'Caller has not proved isolated virtual compositor ownership'};
 return {...output,status:'supported',actualLane:selectedLane,reason:selectedLane==='physical'?'Explicit physical lane with hardware features; physical scanout not measured':'Caller-asserted isolated virtual lane (ownership not proved here) with hardware features; not physical scanout'};
}
export async function diagnosticCapabilities({platform=process.platform,discover=discoverEnergySensors,readSnapshot=readEnergySnapshot,rendering}={}){
 const energy=platform==='linux'?await discover({platform}):{status:'unsupported',reason:`Energy adapter not implemented for ${platform}`,sensors:[],errors:[]};
 if(!Array.isArray(energy.sensors)||energy.sensors.length>64)throw Error('Preflight sensor record cap/type invalid');
 const snapshots=[];for(const sensor of energy.sensors)snapshots.push(await readSnapshot(sensor));
 const checkedEnergy={...energy,snapshots,status:energy.status==='supported'&&snapshots.some(r=>r.status!=='supported')?'incomplete':energy.status};
 return {revision:2,lane:'diagnostic-only',standardAcceptance:false,platform,energy:checkedEnergy,rendering:classifyRenderingLane(rendering),
  appWatts:{status:'unsupported',reason:'Domain/battery sensors and CPU/engine counters cannot attribute watts to an application'},
  gpuEngine:{status:'unsupported',reason:'Separate existing AMDGPU fdinfo adapter: gpu-cost.mjs + gpu-cost-parse.mjs; not sampled or certified by this module'},
  gaps:['Intel/NVIDIA process GPU engine accounting not implemented here','Charge/current-only batteries without energy_now/power_now are not converted to energy','Polling misses unobserved sensor resets/charging changes; interval energy requires independent source epoch and continuity policy','Windows/macOS/Android energy adapters unimplemented','No physical scanout certification','No application-attributable watts or battery-life estimates','Missing/permission-denied sensors stay unsupported/incomplete; no proxy-to-watts conversion']};
}
