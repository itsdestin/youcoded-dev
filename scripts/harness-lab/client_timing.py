"""A common host-side clock around actual client commands, excluding later trace export."""
import json
from pathlib import Path
import time

CLIENT_MARKERS = ('pi --print --mode json', 'claude --verbose --output-format=stream-json',
                  'hermes --yolo chat', 'opencode run', 'opencode --model=', '/test-engine/lab-runner.mjs --allow-live')


async def timed_call(logs_dir, action):
    started = time.time()
    clock = time.perf_counter()
    completed = False
    try:
        result = await action()
        completed = True
        return result
    finally:
        elapsed = time.perf_counter() - clock
        path = Path(logs_dir)/'client-timing.json'
        path.parent.mkdir(parents=True, exist_ok=True)
        rows = json.loads(path.read_text()) if path.exists() else []
        rows.append({'startedAt':started, 'endedAt':time.time(), 'seconds':elapsed,
                     'completed':completed, 'scope':'client-command-excluding-post-run-export'})
        path.write_text(json.dumps(rows,indent=2)+'\n')
        path.chmod(0o600)


class TimedEnvironment:
    def __init__(self, environment, logs_dir):
        self.environment = environment
        self.logs_dir = logs_dir

    def __getattr__(self, name):
        return getattr(self.environment, name)

    async def exec(self, command, **kwargs):
        action = lambda: self.environment.exec(command, **kwargs)
        if any(marker in command for marker in CLIENT_MARKERS):
            return await timed_call(self.logs_dir, action)
        return await action()
