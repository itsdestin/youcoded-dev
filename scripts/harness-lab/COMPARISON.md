# Guarded matched-model pilot

This is a **measurement pass, not an optimization pass**. No tool-schema reduction, edit-guard relaxation or production prompt change is part of it.

## Protocol

`comparison_protocol.json` declares five clients, three public fixture tasks, two repetitions, and a deterministic rotated order. All clients run against the same Anthropic Haiku 5.5 endpoint through a shared guard. The guard enforces a common 8,192 output-token ceiling, disabled thinking, only custom/client-side tools, a 20-request limit per trial, and a cumulative USD 10 token-cost envelope including the earlier pilot's pessimistic USD 0.21916345 estimate. Cache reuse is permitted, not reset; this is NOT a cold-cache study.

The output cap and thinking setting are explicitly normalized at the shared transport because client configuration surfaces differ. The guard rejects other model IDs rather than substituting a different model. Requested/effective output settings are logged. It records usage for every model request, including auxiliary calls, independent of whether a client's own adapter reports them.

The actual provider key stays in a dedicated gateway container. Agent containers receive only per-trial opaque gate tokens. No Docker socket or host-network mode is exposed to agents. `gate-network.yaml` attaches the agent container to a dedicated external Docker network; the gateway has no published host port. This avoids opening host firewall rules. The gateway's private config, token mapping, ledger and API key live outside the repository.

Each admitted model request reserves USD 1.20 before forwarding. Complete usage replaces that hold with a pessimistic upper estimate; interrupted/error responses without complete usage retain the full hold. A pricing/usage anomaly stops further admission. Rates are deliberately conservative and are NOT an invoice or precise per-client cost ranking (the initial estimator assumes one-hour cache writes even where a client uses five-minute writes).

## Reuse, not new agent implementations

`comparison_agents.py` subclasses Harbor's installed clients only to use prepared pinned binaries and route requests to the guard. Native inference uses the original YouCoded provider/profile/tool loop; a dev-only fetch wrapper redirects Anthropic transport. Production tools and instructions are unchanged.

Pinned clients and dependencies are installed once in `competitors.Dockerfile`, outside trial execution timing. Every task image inherits the same prepared image, then copies the same fixture inputs. No task solutions, credentials or previous conversation histories are baked into it. Hermes's optional desktop-control binary is unavailable in the image because its X11 dependency is absent; these pilot tasks do not require desktop control.

Adapter corrections discovered during setup are recorded separately from task outcomes:
- Hermes v0.22.2 uses `hermes --version`, not Harbor's old `hermes version` probe.
- Harbor validates custom CLI kwargs before construction; gateway-only arguments must be removed before native option validation.
- Claude Code's custom-endpoint path expects a bare Anthropic model ID, not a provider-prefixed ID.
- OpenCode's AI SDK base URL includes `/v1`; its auxiliary `small_model` is pinned to the same Haiku model.

## Commands and evidence

Prepare (no provider calls):

```bash
python scripts/harness-lab/run_comparison.py prepare --root /path/to/new-study --private-dir /private/new-study-tokens
```

Run the gate separately with private config/key files, then run:

```bash
python scripts/harness-lab/run_comparison.py run --root /path/to/study --desktop /path/to/youcoded/desktop --harbor /path/to/harbor --gate-url http://yc-harness-gateway:18765
```

The runner preserves each trial and stops on infrastructure errors rather than silently retrying. After diagnosis, `--retry-infra` archives the failed attempt before retrying; completed verifier failures are never retried automatically. `--only` takes explicit trial IDs for a bounded check. The gateway budget persists across retries/restarts.

Offline reporting:

```bash
python scripts/harness-lab/comparison_report.py --root /path/to/study --ledger /private/comparison-ledger.json
```

Outputs: `comparison.json` (all scheduled cells), `comparison.md` (summary and per-task evidence), `blinded-answers.md` (unscored review packet). Missing/partial telemetry is not zero. Token totals include cached input exactly once. Final-answer word counts are not clarity scores. Task acceptance comes from independent file/state verifiers, not the agent saying it finished.

## Interpretation limits

Two repetitions of three easy public tasks are a plumbing/comparability pilot, not a representative leaderboard. Report every failed/missing cell, adapter correction, cache condition and configuration limitation. Do not infer a harness's overall superiority, or prioritize an optimization, from this pilot alone. Human clarity/concision calibration and a larger held-out task set remain necessary for public claims.
