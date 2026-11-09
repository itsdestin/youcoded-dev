import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from harbor.models.agent.context import AgentContext
from harbor_adapter import YouCodedAgent, complete_total, populate


class FakeEnvironment:
    def __init__(self, result):
        self.result = result
        self.commands = []
        self.uploads = []

    async def exec(self, command, **kwargs):
        self.commands.append(command)
        return SimpleNamespace(return_code=0, stdout='/app\n' if command == 'pwd' else '')

    async def upload_file(self, source, destination):
        self.uploads.append((str(source), destination))

    async def upload_dir(self, source, destination):
        self.uploads.append((str(source), destination))

    async def download_file(self, source, destination):
        Path(destination).write_text(json.dumps(self.result))


class AdapterTests(unittest.TestCase):
    def test_unknown_usage_is_not_zero(self):
        context = AgentContext()
        populate(context, {'requests': [{'role':'main', 'usage': {'inputTokens':5}}, {'role':'specialist', 'usage':None}]})
        self.assertIsNone(context.n_input_tokens)
        self.assertIsNone(context.cost_usd)
        self.assertIsNone(complete_total([], 'inputTokens'))

    def test_negative_usage_is_rejected(self):
        with self.assertRaises(ValueError):
            complete_total([{'role':'main', 'usage':{'inputTokens':-1}}], 'inputTokens')

    def test_synthetic_smoke_needs_no_credential_and_cannot_launch_live(self):
        async def exercise(root):
            desktop = root/'desktop'
            (desktop/'dist/main').mkdir(parents=True)
            (desktop/'dist/main/create-runtime.js').write_text('// fixture')
            agent = YouCodedAgent(logs_dir=root/'logs', model_name='lab-scripted',
                                  desktop_dir=desktop, synthetic_smoke=True)
            environment = FakeEnvironment({'status':'completed', 'synthetic':True, 'requests':[]})
            context = AgentContext()
            await agent.run('This must not be sent to a provider', environment, context)
            commands = '\n'.join(environment.commands)
            self.assertIn('--smoke', commands)
            self.assertNotIn('--allow-live', commands)
            self.assertNotIn('--key-file', commands)
            self.assertTrue(context.metadata['youcoded_lab']['synthetic'])
        with tempfile.TemporaryDirectory() as directory:
            asyncio.run(exercise(Path(directory)))

    def test_setup_packages_available_lab_helpers_without_requiring_new_helpers_in_old_snapshots(self):
        async def exercise(root):
            desktop = root/'desktop'
            (desktop/'dist/main').mkdir(parents=True)
            (desktop/'dist/main/create-runtime.js').write_text('// fixture')
            engine = desktop/'test-engine'
            engine.mkdir()
            (engine/'lab-worker.mjs').write_text('// historical worker')
            (engine/'lab-worker.test.mjs').write_text('// never upload tests')
            agent = YouCodedAgent(logs_dir=root/'logs', model_name='lab-scripted',
                                  desktop_dir=desktop, synthetic_smoke=True)
            old = FakeEnvironment({})
            await agent.setup(old)
            self.assertTrue(any(dst.endswith('/lab-worker.mjs') for _, dst in old.uploads))
            self.assertFalse(any(dst.endswith('/lab-continuation.mjs') for _, dst in old.uploads))
            (engine/'lab-continuation.mjs').write_text('// new optional helper')
            current = FakeEnvironment({})
            await agent.setup(current)
            self.assertTrue(any(dst.endswith('/lab-continuation.mjs') for _, dst in current.uploads))
            self.assertFalse(any(dst.endswith('.test.mjs') for _, dst in current.uploads))
        with tempfile.TemporaryDirectory() as directory:
            asyncio.run(exercise(Path(directory)))

    def test_run_uses_container_exec_and_consumes_only_uploaded_key(self):
        async def exercise(root):
            desktop = root/'desktop'
            (desktop/'dist/main').mkdir(parents=True)
            (desktop/'dist/main/create-runtime.js').write_text('// compiled fixture')
            key = root/'key'; key.write_text('test-secret')
            agent = YouCodedAgent(logs_dir=root/'logs', model_name='fixture-model', desktop_dir=desktop,
                                  key_file=key, max_spend_usd=1, max_request_usd=0.1)
            record = {'status':'completed', 'requests':[{'role':'main', 'usage':{
                'inputTokens':100, 'outputTokens':20, 'cacheReadTokens':60, 'costUsd':0.01}}]}
            environment = FakeEnvironment(record)
            context = AgentContext()
            await agent.run('Do the task', environment, context)
            self.assertEqual(context.n_input_tokens, 100)
            self.assertEqual(context.n_cache_tokens, 60)
            self.assertEqual(key.read_text(), 'test-secret')
            self.assertIn('--consume-key-file', '\n'.join(environment.commands))
            self.assertNotIn('test-secret', '\n'.join(environment.commands))
            self.assertFalse(agent.capabilities.atif)
            self.assertFalse(agent.capabilities.resume)
        with tempfile.TemporaryDirectory() as directory:
            asyncio.run(exercise(Path(directory)))


if __name__ == '__main__':
    unittest.main()
