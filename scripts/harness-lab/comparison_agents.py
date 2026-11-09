"""Use Harbor's native clients unchanged, with pinned prepared installations and a shared gate.
Only transport, common resource settings and install caching differ from upstream adapters.
No actual provider credential enters a task container.
"""
import re
from pathlib import Path
from urllib.parse import urlparse
from harbor.agents.installed.pi import Pi
from harbor.agents.installed.claude_code import ClaudeCode
from harbor.agents.installed.opencode import OpenCode
from harbor.agents.installed.hermes import Hermes
from harbor_adapter import YouCodedAgent
from client_timing import CLIENT_MARKERS, timed_call, TimedEnvironment

MODEL = 'claude-haiku-5-5'


def gate_credentials(url, token_file):
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ('', '/'):
        raise ValueError('gate_url must be a plain origin')
    token = Path(token_file).read_text().strip()
    if not token.startswith('yc-gate-'):
        raise ValueError('Expected opaque yc-gate token, NOT a provider API key')
    return token


class PreparedGateMixin:
    pinned_version = None

    @classmethod
    def parse_options(cls, kwargs=None, env=None):
        # Harbor validates CLI kwargs before __init__ consumes our transport-only fields.
        native = dict(kwargs or {})
        url = native.pop('gate_url', None)
        token_file = native.pop('gate_token_file', None)
        if url is not None or token_file is not None:
            if not url or not token_file:
                raise ValueError('gate_url and gate_token_file must be supplied together')
            gate_credentials(url, token_file)
        return super().parse_options(native, env)

    def __init__(self, *args, gate_url, gate_token_file, **kwargs):
        token = gate_credentials(gate_url, gate_token_file)
        if kwargs.get('model_name') not in (MODEL, 'anthropic/' + MODEL):
            raise ValueError('Matched pilot requires Haiku 5.5')
        env = {**kwargs.pop('extra_env', {}), 'ANTHROPIC_BASE_URL': gate_url,
               'ANTHROPIC_API_KEY': token, 'CLAUDE_CODE_MAX_OUTPUT_TOKENS': '8192',
               'CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING': '1'}
        kwargs['version'] = self.pinned_version
        super().__init__(*args, extra_env=env, **kwargs)

    async def install(self, environment):
        # Installation happens once in competitors.Dockerfile, outside timed trials.
        result = await environment.exec(self.get_version_command(), timeout_sec=30)
        expected = self.pinned_version.lstrip('v')
        if result.return_code or not re.search(r'(?<![\d.])' + re.escape(expected) + r'(?![\d.])', result.stdout or ''):
            raise RuntimeError(f'Prepared {self.name()} version {self.pinned_version} unavailable: {result.stdout or result.stderr}')

    async def exec_as_agent(self, environment, command, env=None, **kwargs):
        # Hermes' upstream adapter forwards only selected key vars; explicitly retain the gate origin.
        execute = super().exec_as_agent
        action = lambda: execute(environment, command, env={**(env or {}), **self.extra_env}, **kwargs)
        if any(marker in command for marker in CLIENT_MARKERS):
            return await timed_call(self.logs_dir, action)
        return await action()


class GatePi(PreparedGateMixin, Pi):
    pinned_version = '1.3.0'
    def __init__(self, *args, **kwargs):
        kwargs.setdefault('model_api', 'anthropic-messages')
        kwargs.setdefault('thinking', 'off')
        kwargs.setdefault('max_turns', 20)
        super().__init__(*args, **kwargs)


class GateClaudeCode(PreparedGateMixin, ClaudeCode):
    pinned_version = '2.1.302'
    def __init__(self, *args, **kwargs):
        kwargs.setdefault('max_turns', 20)
        kwargs.setdefault('max_thinking_tokens', 0)
        super().__init__(*args, **kwargs)


class GateOpenCode(PreparedGateMixin, OpenCode):
    pinned_version = '1.19.3'
    def __init__(self, *args, **kwargs):
        # AI SDK takes a /v1 base; Anthropic's own SDK takes the origin.
        kwargs['opencode_config'] = {'small_model': 'anthropic/' + MODEL,
            'provider': {'anthropic': {'options': {
                'baseURL': kwargs['gate_url'].rstrip('/') + '/v1',
            }}}}
        super().__init__(*args, **kwargs)


class GateHermes(PreparedGateMixin, Hermes):
    pinned_version = 'v0.22.2'
    def get_version_command(self):
        return 'export PATH="$HOME/.local/bin:$PATH"; hermes --version'
    def __init__(self, *args, **kwargs):
        kwargs.setdefault('max_turns', 20)
        super().__init__(*args, **kwargs)


class GateYouCoded(YouCodedAgent):
    def __init__(self, *args, gate_url, gate_token_file, **kwargs):
        gate_credentials(gate_url, gate_token_file)
        if kwargs.get('model_name') != MODEL:
            raise ValueError('Matched pilot requires Haiku 5.5')
        super().__init__(*args, key_file=gate_token_file, provider='anthropic',
                         max_spend_usd=10, max_request_usd=1.2, max_requests=20,
                         timeout_sec=180, **kwargs)
        self.config['gatewayUrl'] = gate_url

    async def run(self, instruction, environment, context):
        return await super().run(instruction, TimedEnvironment(environment, self.logs_dir), context)
