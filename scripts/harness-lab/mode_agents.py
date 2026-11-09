"""New mode-only native adapter; historical RouterYouCoded remains unchanged."""
from router_agents import panel_model, gate_credentials, TimedEnvironment
from harbor_adapter import YouCodedAgent
import hashlib

class ModeYouCoded(YouCodedAgent):
    def __init__(self,*args,gate_url,gate_token_file,max_requests,timeout_sec,**kwargs):
        # Harbor may pass --ak scalar values as strings. Validate without guessing.
        requests=int(max_requests);seconds=int(timeout_sec)
        if str(requests)!=str(max_requests) or str(seconds)!=str(timeout_sec) or not 20<=requests<=120 or not 180<=seconds<=1200:
            raise ValueError('Explicit validated mode limits required')
        panel_model(kwargs.get('model_name'),native=True)
        gate_credentials(gate_url,gate_token_file)
        # WHY: bypass only the legacy adapter's hardcoded canary allowance, never
        # the scoped budget gateway or production lab runtime's spending guards.
        super().__init__(*args,key_file=gate_token_file,provider='openrouter',max_spend_usd=10,
            max_request_usd=1,max_requests=requests,timeout_sec=seconds,**kwargs)
        self.config['gatewayUrl']=gate_url

    async def setup(self,environment):
        # WHY: a pinned image must supply the exact lockfile's dependencies.
        # Never run the legacy npm-ci setup or install into linked workspace deps.
        digest=hashlib.sha256((self.desktop/'package-lock.json').read_bytes()).hexdigest()
        deps='/opt/youcoded-deps/'+digest+'/node_modules'
        result=await environment.exec("node -e \"const [a,b]=process.versions.node.split('.').map(Number);if(typeof require('node:module').stripTypeScriptTypes!=='function'||!(a>=24||a===22&&b>=18))process.exit(1)\" && test -d "+deps+" && mkdir -p "+self.runtime_dir+"/test-engine && ln -s "+deps+" "+self.runtime_dir+"/node_modules",timeout_sec=30)
        if result.return_code:
            raise RuntimeError('Pinned image lacks Node TypeScript support or exact lockfile dependencies; no install attempted')
        await environment.upload_dir(self.desktop/'dist',self.runtime_dir+'/dist')
        for name in ('package.json','package-lock.json'):
            await environment.upload_file(self.desktop/name,self.runtime_dir+'/'+name)
        for source in sorted((self.desktop/'test-engine').glob('lab-*.mjs')):
            if not source.name.endswith('.test.mjs'):
                await environment.upload_file(source,self.runtime_dir+'/test-engine/'+source.name)

    async def run(self,instruction,environment,context):
        return await super().run(instruction,TimedEnvironment(environment,self.logs_dir),context)
