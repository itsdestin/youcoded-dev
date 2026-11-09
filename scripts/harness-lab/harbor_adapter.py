"""Harbor custom agent. Execution stays in Harbor's container; no app IPC or live profile.

Use import path harbor_adapter:YouCodedAgent with this directory on PYTHONPATH.
Requires a built desktop checkout and an explicitly budget-limited provider key file.
"""
import json
import math
import shlex
import tempfile
from pathlib import Path

from harbor.agents.base import BaseAgent
from harbor.agents.capabilities import AgentCapabilities


def complete_total(requests, field):
    """Never turn absent adapter telemetry into a zero-valued measurement."""
    rows = [r for r in requests if r.get("role") != "judge"]
    values = [(r.get("usage") or {}).get(field) for r in rows]
    if any(v is not None and (not isinstance(v, (int, float)) or isinstance(v, bool)
                              or not math.isfinite(v) or v < 0) for v in values):
        raise ValueError(f"Invalid reported {field}")
    if not values or any(v is None for v in values):
        return None
    return sum(values)


def populate(context, record):
    requests = record.get("requests", [])
    context.n_input_tokens = complete_total(requests, "inputTokens")
    context.n_output_tokens = complete_total(requests, "outputTokens")
    context.n_cache_tokens = complete_total(requests, "cacheReadTokens")
    context.cost_usd = complete_total(requests, "costUsd")
    context.metadata = {"youcoded_lab": {
        "status": record.get("status"), "fidelity": record.get("fidelity"),
        "synthetic": record.get("synthetic", False),
        "wallClockMs": record.get("wallClockMs"), "requestCount": len(requests),
        "success": "Harbor verifier owns the outcome; agent stop is not success",
    }}


class YouCodedAgent(BaseAgent):
    # Native logs are retained; do not claim ATIF/resume until implemented and verified.
    capabilities = AgentCapabilities()

    def __init__(self, *args, desktop_dir=None, key_file=None, provider="openrouter",
                 max_spend_usd=None, max_request_usd=None, max_requests=30,
                 timeout_sec=300, task_id="harbor-task", repetition=0,
                 comparison_key="matched-model-v1", synthetic_smoke=False, **kwargs):
        super().__init__(*args, **kwargs)
        if not isinstance(synthetic_smoke, bool):
            raise ValueError("synthetic_smoke must be a boolean")
        self.synthetic_smoke = synthetic_smoke
        if not desktop_dir or not self.model_name or (not synthetic_smoke and not key_file):
            raise ValueError("desktop_dir and model are required; live runs also require key_file")
        self.desktop = Path(desktop_dir).resolve()
        self.key_file = Path(key_file).resolve() if key_file else None
        if not (self.desktop / "dist/main/create-runtime.js").is_file():
            raise ValueError("desktop_dir must contain a built production runtime")
        if not synthetic_smoke and not self.key_file.is_file():
            raise ValueError("key_file must exist; never pass credentials in kwargs/env")
        if provider not in ("openrouter", "anthropic", "openai"):
            raise ValueError("unsupported keyed provider")
        if not synthetic_smoke and (not max_spend_usd or not max_request_usd or not 0 < float(max_request_usd) <= float(max_spend_usd)):
            raise ValueError("explicit positive max_spend_usd and max_request_usd are required")
        self.config = dict(provider=provider, model=self.model_name, arm="youcoded",
                           taskId=task_id, repetition=int(repetition), comparisonKey=comparison_key,
                           maxSpendUsd=float(max_spend_usd) if max_spend_usd else None,
                           maxRequestUsd=float(max_request_usd) if max_request_usd else None,
                           maxRequests=int(max_requests), timeoutMs=int(timeout_sec * 1000))
        self.runtime_dir = "/opt/youcoded-lab"

    @staticmethod
    def name():
        return "youcoded-lab"

    def version(self):
        return "lab-v1"

    async def setup(self, environment):
        check = await environment.exec("node --version && npm --version", timeout_sec=30)
        if check.return_code:
            raise RuntimeError("Task image needs Node.js 22+ and npm; adapter will not alter its system packages")
        await environment.exec(f"mkdir -p {self.runtime_dir}/test-engine", timeout_sec=30)
        await environment.upload_dir(self.desktop / "dist", f"{self.runtime_dir}/dist")
        for name in ("package.json", "package-lock.json"):
            await environment.upload_file(self.desktop / name, f"{self.runtime_dir}/{name}")
        # WHY: package the launcher's sibling helpers without requiring newly added helpers
        # in historical frozen desktops. Test modules are never runtime dependencies.
        for source in sorted((self.desktop / "test-engine").glob("lab-*.mjs")):
            if not source.name.endswith(".test.mjs"):
                await environment.upload_file(source, f"{self.runtime_dir}/test-engine/{source.name}")
        result = await environment.exec(
            f"cd {self.runtime_dir} && npm ci --omit=dev --ignore-scripts --no-audit --no-fund",
            timeout_sec=300)
        if result.return_code:
            raise RuntimeError("Could not install isolated runtime dependencies")

    async def run(self, instruction, environment, context):
        logs = str(self.environment_logs_dir)
        cwd_result = await environment.exec("pwd", timeout_sec=10)
        if cwd_result.return_code or not (cwd_result.stdout or "").strip().startswith("/"):
            raise RuntimeError("Cannot establish task working directory")
        config = {**self.config, "cwd": cwd_result.stdout.strip(), "prompt": instruction}
        config_path = f"{self.runtime_dir}/run.json"
        secret_path = f"{self.runtime_dir}/run-key"
        result_path = f"{logs}/youcoded-run.json"
        with tempfile.TemporaryDirectory(prefix="yc-harbor-config-") as temporary:
            local = Path(temporary) / "config.json"
            local.write_text(json.dumps(config))
            await environment.upload_file(local, config_path)
        if self.synthetic_smoke:
            # WHY: exercise the exact adapter/setup/production-host path without credentials or model spend.
            command = (f"node {self.runtime_dir}/test-engine/lab-runner.mjs --smoke "
                       f"--cwd {shlex.quote(config['cwd'])} --out {shlex.quote(result_path)}")
        else:
            await environment.upload_file(self.key_file, secret_path)
            await environment.exec(f"chmod 600 {shlex.quote(secret_path)}", timeout_sec=10)
            command = (f"node {self.runtime_dir}/test-engine/lab-runner.mjs --allow-live "
                       f"--config {shlex.quote(config_path)} --key-file {shlex.quote(secret_path)} "
                       f"--consume-key-file --out {shlex.quote(result_path)}")
        try:
            result = await environment.exec(command, timeout_sec=self.config["timeoutMs"] // 1000 + 15)
        finally:
            await environment.exec(f"rm -f {shlex.quote(secret_path)}", timeout_sec=10)
            self.logs_dir.mkdir(parents=True, exist_ok=True)
            try:
                await environment.download_file(result_path, self.logs_dir / "youcoded-run.json")
                record = json.loads((self.logs_dir / "youcoded-run.json").read_text())
                populate(context, record)
            except (FileNotFoundError, json.JSONDecodeError):
                context.metadata = {"youcoded_lab": {"status": "missing-result", "usage": "unknown"}}
        if result.return_code:
            raise RuntimeError("YouCoded run failed; inspect youcoded-run.json, not a fabricated score")

    def populate_context_post_run(self, context):
        result = self.logs_dir / "youcoded-run.json"
        if result.is_file():
            populate(context, json.loads(result.read_text()))
