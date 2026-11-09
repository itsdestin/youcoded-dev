import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from client_timing import timed_call, TimedEnvironment

class ClientTimingTests(unittest.TestCase):
    def test_records_only_client_execution_not_export(self):
        class Environment:
            async def exec(self, command, **kwargs): return command
        async def exercise(root):
            env=TimedEnvironment(Environment(),root)
            await env.exec('echo setup')
            self.assertFalse((root/'client-timing.json').exists())
            result=await env.exec('node /opt/youcoded-lab/test-engine/lab-runner.mjs --allow-live')
            self.assertIn('lab-runner',result)
            await env.exec('cat saved-output.json')
            await env.exec('opencode --model=anthropic/claude-haiku-5-5 run --format=json -- task')
            rows=json.loads((root/'client-timing.json').read_text())
            self.assertEqual(len(rows),2)
            self.assertTrue(rows[0]['completed'])
            self.assertGreaterEqual(rows[0]['seconds'],0)
        with tempfile.TemporaryDirectory() as d: asyncio.run(exercise(Path(d)))
    def test_failure_still_records_time_without_claiming_completion(self):
        async def exercise(root):
            async def fail(): raise RuntimeError('failed')
            with self.assertRaises(RuntimeError): await timed_call(root,fail)
            self.assertFalse(json.loads((root/'client-timing.json').read_text())[0]['completed'])
        with tempfile.TemporaryDirectory() as d: asyncio.run(exercise(Path(d)))

if __name__=='__main__': unittest.main()
