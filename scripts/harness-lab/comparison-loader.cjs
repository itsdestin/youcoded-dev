// Dependency-free source loader for the benchmark snapshot, NOT the app.
// WHY: pure TS compatibility does not require Electron. This loader and Node vm
// provide NO security isolation: run untrusted code only inside DockerExecutor.
// Only explicitly trusted legacy fixtures may use it on the controller host.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
function load(file,stubs={},cache=new Map()){
 file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
 const m={exports:{}};cache.set(file,m);
 let text=fs.readFileSync(file,'utf8');
 if(/\.[mc]?ts$/.test(file)){
  // Node 26 removed transform mode. Lower the existing one-argument store
  // parameter property explicitly; all other code uses erasable TypeScript.
  text=text.replace(/constructor\(\s*private\s+readonly\s+(\w+)\s*:\s*([^)]*)\)\s*\{\s*\}/g,(_,name,type)=>`constructor(${name}: ${type}) { this.${name}=${name}; }`);
  text=stripTypeScriptTypes(text,{mode:'strip'});
  // WHY: pinned pure source imports may span lines or use namespace/default
  // bindings. This is a trusted-fixture compatibility loader, NOT a sandbox.
  text=text.replace(/^import\s+(?:(\w+)\s*,\s*)?(\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s*['"]([^'"]+)['"];?/gm,(_,defaultName,binding,name)=>{
   const req=`require(${JSON.stringify(name)})`;
   const prefix=defaultName?`const ${defaultName}=${req};\n`:'';
   if(binding.startsWith('{'))return prefix+`const ${binding.replace(/\bas\b/g,':')}=${req};`;
   if(binding.startsWith('*'))return prefix+`const ${binding.replace(/^\*\s+as\s+/,'')}=${req};`;
   return prefix+`const ${binding}=${req};`;
  });
  text=text.replace(/^import\s*['"]([^'"]+)['"];?/gm,(_,name)=>`require(${JSON.stringify(name)});`);
  const exported=[];text=text.replace(/export\s+(async\s+)?(function|class|const|let)\s+(\w+)/g,(_,a,b,c)=>{exported.push(c);return `${a||''}${b} ${c}`;});
  // WHY: equivalent local export lists must not fail merely because declarations are not inline-exported.
  const aliases=[];
  text=text.replace(/^export\s*\{([^}]*)\}\s*;?/gm,(_,list)=>{
   for(const item of list.split(',').map(s=>s.trim()).filter(Boolean)){
    const match=/^(\w+)(?:\s+as\s+(\w+))?$/.exec(item);
    if(!match)throw new Error('Unsupported local export binding');
    aliases.push(`exports.${match[2]??match[1]}=${match[1]};`);
   }
   return '';
  });
  text+='\n'+exported.map(n=>`exports.${n}=${n};`).concat(aliases).join('\n');
 }
 const req=name=>{
  if(Object.hasOwn(stubs,name))return stubs[name];
  if(!name.startsWith('.'))return require(name);
  let p=path.resolve(path.dirname(file),name);if(!fs.existsSync(p))p=p.endsWith('.mjs')?p.slice(0,-4)+'.mts':p+'.ts';
  return load(p,stubs,cache);
 };
 vm.runInThisContext('(function(require,module,exports,__filename,__dirname){'+text+'\n})',{filename:file})(req,m,m.exports,file,path.dirname(file));
 return m.exports;
}
module.exports={load};
