"""Guarded OpenRouter adapter configuration. Offline-tested; live route preflight is separate.

No Anthropic-format translation or cross-vendor Claude Code compatibility is claimed.
"""
import json
import os
import asyncio
from pathlib import Path
import yaml
from harbor.agents.installed.pi import Pi
from harbor.agents.installed.opencode import OpenCode
from harbor.agents.installed.claude_code import ClaudeCode
from harbor.agents.installed.hermes import Hermes
from comparison_agents import gate_credentials, PreparedGateMixin
from harbor_adapter import YouCodedAgent
from client_timing import TimedEnvironment

PANEL={row['id'] for row in json.loads((Path(__file__).parent/'model-panel.json').read_text())['models']}


def panel_model(name, *, native=False):
    model=name if native else name.removeprefix('openrouter/') if isinstance(name,str) else None
    if not native and (not isinstance(name,str) or not name.startswith('openrouter/')):
        raise ValueError('Use openrouter/<panel model ID> for this client')
    if model not in PANEL: raise ValueError('Model is not in the declared budget panel')
    return model


def validate_context_window_tokens(value):
    if value is not None and (isinstance(value, bool) or not isinstance(value, int) or not 32768 <= value <= 1_000_000):
        raise ValueError('context_window_tokens must be an integer from 32768 to 1000000')
    return value


def validate_auto_compact_tokens(value):
    if value is not None and (isinstance(value, bool) or not isinstance(value, int) or not 100_000 <= value <= 1_000_000):
        raise ValueError('auto_compact_tokens must be an integer from 100000 to 1000000')
    return value


class RouterMixin(PreparedGateMixin):
    def __init__(self,*args,gate_url,gate_token_file,context_window_tokens=None,**kwargs):
        self.context_window_tokens=validate_context_window_tokens(context_window_tokens)
        panel_model(kwargs.get('model_name'))
        token=gate_credentials(gate_url,gate_token_file)
        env={**kwargs.pop('extra_env',{}),'OPENROUTER_API_KEY':token,'OPENROUTER_BASE_URL':gate_url.rstrip('/')+'/v1'}
        kwargs['version']=self.pinned_version
        # Skip the Haiku-only PreparedGateMixin constructor, retaining its install/exec instrumentation.
        super(PreparedGateMixin,self).__init__(*args,extra_env=env,**kwargs)


class RouterClaudeCode(PreparedGateMixin,ClaudeCode):
    pinned_version='2.1.302'
    def __init__(self,*args,gate_url,gate_token_file,auto_compact_tokens=None,**kwargs):
        self.auto_compact_tokens=validate_auto_compact_tokens(auto_compact_tokens)
        model=kwargs.get('model_name')
        if model!='openrouter/anthropic/claude-haiku-5.5':
            raise ValueError('Router Claude Code is restricted to openrouter/anthropic/claude-haiku-5.5')
        token=gate_credentials(gate_url,gate_token_file)
        # Claude Code receives first-party Anthropic Messages traffic only; never advertise
        # cross-vendor compatibility or allow its tier/subagent aliases to pick another model.
        env={**kwargs.pop('extra_env',{}),'ANTHROPIC_BASE_URL':gate_url,
            'ANTHROPIC_AUTH_TOKEN':token,'ANTHROPIC_API_KEY':'',
            'ANTHROPIC_MODEL':'claude-haiku-5.5',
            'ANTHROPIC_DEFAULT_HAIKU_MODEL':'claude-haiku-5.5',
            'ANTHROPIC_DEFAULT_SONNET_MODEL':'claude-haiku-5.5',
            'ANTHROPIC_DEFAULT_OPUS_MODEL':'claude-haiku-5.5',
            'CLAUDE_CODE_SUBAGENT_MODEL':'claude-haiku-5.5',
            'CLAUDE_CODE_MAX_OUTPUT_TOKENS':'8192',
            'CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING':'1'}
        kwargs['model_name']='anthropic/claude-haiku-5.5'
        kwargs['version']=self.pinned_version
        kwargs.setdefault('max_turns',20)
        kwargs.setdefault('max_thinking_tokens',0)
        kwargs.setdefault('disable_web_search',True)
        super(PreparedGateMixin,self).__init__(*args,extra_env=env,**kwargs)

    async def exec_as_agent(self,environment,command,env=None,**kwargs):
        if self.auto_compact_tokens is not None and 'claude --verbose --output-format=stream-json' in command:
            # WHY: Claude Code documents --autocompact as a per-invocation window size; append only to the actual run, including resume.
            command=command.replace('claude --verbose --output-format=stream-json',
                f'claude --verbose --output-format=stream-json --autocompact {self.auto_compact_tokens}',1)
        return await super().exec_as_agent(environment,command,env=env,**kwargs)


class RouterHermes(PreparedGateMixin,Hermes):
    pinned_version='v0.22.2'
    _dispatch_lock=asyncio.Lock()
    def get_version_command(self):
        return 'export PATH="$HOME/.local/bin:$PATH"; hermes --version'
    def __init__(self,*args,gate_url,gate_token_file,context_window_tokens=None,**kwargs):
        self.context_window_tokens=validate_context_window_tokens(context_window_tokens)
        model=kwargs.get('model_name')
        if model!='openrouter/anthropic/claude-haiku-5.5':
            raise ValueError('Router Hermes is restricted to openrouter/anthropic/claude-haiku-5.5')
        token=gate_credentials(gate_url,gate_token_file)
        # Hermes' OpenAI-native adapter inferred Responses for this non-OpenAI model;
        # use its documented custom provider to pin the gateway's chat-completions API.
        env={**kwargs.pop('extra_env',{}),'OPENAI_API_KEY':token,
            'OPENAI_BASE_URL':gate_url.rstrip('/')+'/v1',
            'OPENROUTER_API_KEY':token}
        self._router_base_url=gate_url.rstrip('/')+'/v1'
        kwargs['model_name']='anthropic/claude-haiku-5.5'
        kwargs['version']=self.pinned_version
        kwargs.setdefault('max_turns',20)
        super(PreparedGateMixin,self).__init__(*args,extra_env=env,**kwargs)

    async def run(self,instruction,environment,context):
        # WHY: Harbor consults controller env before exec applies the opaque token.
        # Select its generic path with a noncredential marker; the generated custom
        # config selects chat completions. Serialize and restore this scoped override.
        values={'OPENROUTER_API_KEY':'yc-gate-controller-sentinel','ANTHROPIC_API_KEY':'','ANTHROPIC_TOKEN':''}
        async with self._dispatch_lock:
            previous={key:os.environ.get(key) for key in values}
            os.environ.update(values)
            try:
                return await super().run(instruction,environment,context)
            finally:
                for key,value in previous.items():
                    if value is None: os.environ.pop(key,None)
                    else: os.environ[key]=value

    def _build_config_yaml(self,model,max_turns=None):
        # WHY provider=custom plus explicit api_mode avoids Hermes routing this model to
        # /v1/responses; key_env keeps the opaque gate token out of the generated config.
        model_config={'default':'anthropic/claude-haiku-5.5','provider':'custom',
                'base_url':self._router_base_url,'key_env':'OPENAI_API_KEY',
                'api_mode':'chat_completions'}
        if self.context_window_tokens is not None:
            # WHY: Hermes exposes context_length on its model configuration; leave it absent by default.
            model_config['context_length']=self.context_window_tokens
        config={'model':model_config,
            'toolsets':['hermes-cli'],
            **({'agent':{'max_turns':max_turns}} if max_turns is not None else {}),
            'memory':{'memory_enabled':False,'user_profile_enabled':False},
            'terminal':{'backend':'local','timeout':180},
            'delegation':{'max_iterations':50},'checkpoints':{'enabled':False}}
        return yaml.dump(config,default_flow_style=False)


class RouterPi(RouterMixin,Pi):
    pinned_version='1.3.0'
    def __init__(self,*args,**kwargs):
        kwargs.setdefault('model_api','openai-completions')
        kwargs.setdefault('max_turns',20)
        super().__init__(*args,**kwargs)

    def _build_custom_models_json(self,access,model_id):
        config=super()._build_custom_models_json(access,model_id)
        if config is not None and self.context_window_tokens is not None:
            # WHY: Pi's custom-model schema records contextWindow on the exact model entry.
            config['providers']['harbor-endpoint']['models'][0]['contextWindow']=self.context_window_tokens
        return config


class RouterOpenCode(RouterMixin,OpenCode):
    pinned_version='1.19.3'
    def __init__(self,*args,**kwargs):
        panel_model(kwargs.get('model_name'))
        model=kwargs['model_name'].removeprefix('openrouter/')
        provider={'options':{'baseURL':kwargs['gate_url'].rstrip('/')+'/v1'}}
        context_window_tokens=validate_context_window_tokens(kwargs.get('context_window_tokens'))
        if context_window_tokens is not None:
            # WHY: the installed CLI requires both context and output when overriding limit.
            # Explicit 8192 output also records the reserve policy instead of guessing it.
            provider['models']={model:{'limit':{'context':context_window_tokens,'output':8192}}}
        kwargs['opencode_config']={'small_model':kwargs['model_name'],'provider':{'openrouter':provider}}
        super().__init__(*args,**kwargs)


class RouterYouCoded(YouCodedAgent):
    def __init__(self,*args,gate_url,gate_token_file,**kwargs):
        panel_model(kwargs.get('model_name'),native=True)
        gate_credentials(gate_url,gate_token_file)
        super().__init__(*args,key_file=gate_token_file,provider='openrouter',
            max_spend_usd=10,max_request_usd=1,max_requests=20,timeout_sec=180,**kwargs)
        self.config['gatewayUrl']=gate_url

    async def run(self,instruction,environment,context):
        return await super().run(instruction,TimedEnvironment(environment,self.logs_dir),context)
