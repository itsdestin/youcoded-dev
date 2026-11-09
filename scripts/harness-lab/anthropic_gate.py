"""Private standard-library Anthropic reverse proxy for bounded Haiku trials.

Provider credential is loaded only by this process. Containers receive opaque gate tokens.
CLI: python3 anthropic_gate.py --config /private/gate.json --key-file /private/anthropic.key
Config JSON: {"host":"172.17.0.1","port":18765,"ledgerPath":"/private/ledger.json",
"tokens":{"yc-gate-<random>":"stable-trial-id"},"limitUSD":10,
"initialUpperUSD":0.21916345,"maxRequestsPerTrial":20}.
"""
from __future__ import annotations

import argparse
import http.client
import json
import math
import os
import secrets
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MODEL = "claude-haiku-5-5"
MAX_BODY_BYTES = 2 * 1024 * 1024
MAX_RESPONSE_BODY_BYTES = 2 * 1024 * 1024
MAX_OUTPUT_TOKENS = 8192
REQUEST_TIMEOUT_SECONDS = 120
RESERVATION_USD = 1.2
DEFAULT_UPSTREAM = "https://api.anthropic.com"


class RequestRejected(ValueError):
    """Request violates the restricted provider protocol."""


class BudgetRejected(RuntimeError):
    """Request cannot be admitted under the remaining spend/request limits."""


def _json_object(raw: bytes) -> dict:
    try:
        obj = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RequestRejected("request body must be a JSON object") from exc
    if not isinstance(obj, dict):
        raise RequestRejected("request body must be a JSON object")
    return obj


def _route(path: str) -> tuple[str, str]:
    parsed = urllib.parse.urlsplit(path)
    if parsed.scheme or parsed.netloc or parsed.fragment or not parsed.path.startswith("/v1/"):
        raise RequestRejected("invalid request path")
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    if parsed.path == "/v1/messages" and (not parsed.query or query == [("beta", "true")]):
        return "messages", parsed.path + (("?" + parsed.query) if parsed.query else "")
    if parsed.path == "/v1/messages/count_tokens" and (not parsed.query or query == [("beta", "true")]):
        return "count_tokens", parsed.path + (("?" + parsed.query) if parsed.query else "")
    if parsed.path == "/v1/models" and all(k == "limit" and v.isdecimal() and 1 <= int(v) <= 100
                                             for k, v in query) and len(query) <= 1:
        return "models", parsed.path + (("?" + parsed.query) if parsed.query else "")
    if parsed.path == f"/v1/models/{MODEL}" and not parsed.query:
        return "models", parsed.path
    raise RequestRejected("route is not allowed")


def validate_request(path: str, body: bytes) -> tuple[bytes, dict]:
    """Validate/normalize messages and return provider bytes and content-free metadata."""
    if len(body) > MAX_BODY_BYTES:
        raise RequestRejected("request body exceeds 2 MiB")
    kind, _ = _route(path)
    if kind != "messages":
        raise RequestRejected("not a messages request")
    payload = _json_object(body)
    if payload.get("model") != MODEL:
        raise RequestRejected("only claude-haiku-5-5 is allowed")
    requested = payload.get("max_tokens")
    if isinstance(requested, bool) or not isinstance(requested, int) or requested <= 0:
        raise RequestRejected("max_tokens must be a positive integer")
    effective = min(requested, MAX_OUTPUT_TOKENS)
    payload["max_tokens"] = effective
    tools = payload.get("tools", [])
    if not isinstance(tools, list) or any(not isinstance(tool, dict) or
                                          ("type" in tool and tool["type"] != "custom")
                                          for tool in tools):
        raise RequestRejected("only custom tools are allowed")
    if payload.get("service_tier", "auto") not in ("auto", "standard"):
        raise RequestRejected("service_tier must be auto or standard")
    if payload.get("inference_geo", "global") != "global":
        raise RequestRejected("non-default inference_geo is not allowed")

    normalized_thinking = payload.get("thinking") != {"type": "disabled"}
    payload["thinking"] = {"type": "disabled"}
    # Claude Code sends a thinking-clear strategy even when its env knob disables thinking.
    # Keep tool-context strategies unchanged; only remove the now-incompatible thinking edit.
    context = payload.get('context_management')
    removed_clear_thinking = False
    if isinstance(context, dict) and isinstance(context.get('edits'), list):
        before = context['edits']
        context['edits'] = [edit for edit in before if not (isinstance(edit, dict) and edit.get('type') == 'clear_thinking_20251015')]
        removed_clear_thinking = len(before) != len(context['edits'])
        if not context['edits']:
            payload.pop('context_management')
    output = payload.get("output_config")
    if output is not None and not isinstance(output, dict):
        raise RequestRejected("output_config must be an object")
    removed_effort = isinstance(output, dict) and "effort" in output
    if removed_effort:
        output.pop("effort")
    metadata = {"model": MODEL, "requestedMaxTokens": requested,
                "effectiveMaxTokens": effective, "normalizedThinking": normalized_thinking,
                "removedEffort": removed_effort, "removedClearThinking": removed_clear_thinking}
    return json.dumps(payload, separators=(",", ":")).encode(), metadata


def _count(value, field):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"invalid {field}")
    return value


class UsageTracker:
    """Read Anthropic SSE usage, retaining cumulative output_tokens without summing."""
    def __init__(self):
        self._buffer = b""
        self._started = False
        self._stopped = False
        self._input = self._cache_creation = self._cache_read = self._output = None

    def feed(self, chunk: bytes):
        self._buffer += chunk
        # WHY: a trailing CR could be half of CRLF split across transport reads; delay it.
        pending_cr = b"\r" if self._buffer.endswith(b"\r") else b""
        source = self._buffer[:-1] if pending_cr else self._buffer
        normalized = source.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
        frames = normalized.split(b"\n\n")
        self._buffer = frames.pop() + pending_cr
        for frame in frames:
            data = b"\n".join(line[5:].lstrip() for line in frame.splitlines() if line.startswith(b"data:"))
            if not data or data == b"[DONE]":
                continue
            try:
                event = json.loads(data)
            except (UnicodeDecodeError, json.JSONDecodeError):
                continue
            if not isinstance(event, dict):
                continue
            if event.get("type") == "message_start":
                msg = event.get("message")
                usage = msg.get("usage") if isinstance(msg, dict) else None
                try:
                    self._input = _count(usage.get("input_tokens"), "input_tokens")
                    self._cache_creation = _count(usage.get("cache_creation_input_tokens", 0), "cache_creation_input_tokens")
                    self._cache_read = _count(usage.get("cache_read_input_tokens", 0), "cache_read_input_tokens")
                    self._started = isinstance(usage, dict)
                except (AttributeError, ValueError):
                    self._started = False
            elif event.get("type") == "message_delta":
                usage = event.get("usage")
                if isinstance(usage, dict) and "output_tokens" in usage:
                    try:
                        self._output = _count(usage["output_tokens"], "output_tokens")
                    except ValueError:
                        self._output = None
            elif event.get("type") == "message_stop":
                self._stopped = True

    def usage(self):
        if hasattr(self, "_json_usage"):
            return self._json_usage
        if not (self._started and self._stopped and self._output is not None):
            return None
        return {"inputTokens": self._input, "cacheCreationInputTokens": self._cache_creation,
                "cacheReadInputTokens": self._cache_read, "outputTokens": self._output}

    @classmethod
    def from_json(cls, raw: bytes):
        tracker = cls()
        tracker._json_usage = cls.parse_json_response(raw)
        return tracker

    @staticmethod
    def parse_json_response(raw: bytes):
        """Parse one bounded, complete non-streaming Messages response; malformed stays unknown."""
        if len(raw) > MAX_RESPONSE_BODY_BYTES:
            return None
        try:
            message = json.loads(raw)
            if not isinstance(message, dict) or message.get("type") != "message":
                return None
            usage = message.get("usage")
            if not isinstance(usage, dict):
                return None
            input_tokens = _count(usage.get("input_tokens"), "input_tokens")
            cache_creation = _count(usage.get("cache_creation_input_tokens", 0), "cache_creation_input_tokens")
            cache_read = _count(usage.get("cache_read_input_tokens", 0), "cache_read_input_tokens")
            output_tokens = _count(usage.get("output_tokens"), "output_tokens")
            if not isinstance(message.get("id"), str) or not isinstance(message.get("model"), str):
                return None
            return {"inputTokens": input_tokens, "cacheCreationInputTokens": cache_creation,
                    "cacheReadInputTokens": cache_read, "outputTokens": output_tokens}
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            return None


def conservative_upper_usd(usage: dict) -> float:
    inputs = sum(_count(usage.get(k), k) for k in
                 ("inputTokens", "cacheCreationInputTokens", "cacheReadInputTokens"))
    output = _count(usage.get("outputTokens"), "outputTokens")
    return ((inputs * 1.0 + output * 2.5) / 1_000_000) * 1.1


def observed_rate_card_usd(usage: dict) -> float:
    """Rate-card estimate only, not an asserted/billed provider charge."""
    base, write, read, output = (_count(usage[k], k) for k in
                                 ("inputTokens", "cacheCreationInputTokens", "cacheReadInputTokens", "outputTokens"))
    high_rate = base + write + read > 100_000
    base_rate, write_rate, read_rate, output_rate = ((.5, 1, .05, 2.5) if high_rate
                                                       else (.1, .2, .01, .5))
    return (base * base_rate + write * write_rate + read * read_rate + output * output_rate) / 1_000_000


def _empty_state(limit, initial):
    return {"schemaVersion": 1, "limitUsd": limit, "initialUpperUsd": initial,
            "spentUpperUsd": initial, "reservedUpperUsd": 0.0,
            "observedRateCardUsd": 0.0, "requests": [], "rejections": []}


def _load_state(path, limit, initial):
    if not path.exists():
        return _empty_state(limit, initial)
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
        if (not isinstance(state, dict) or state.get("schemaVersion") != 1 or
                float(state.get("limitUsd")) != limit or float(state.get("initialUpperUsd")) != initial or
                not isinstance(state.get("requests"), list) or not isinstance(state.get("rejections"), list)):
            raise ValueError
        for field in ("spentUpperUsd", "reservedUpperUsd", "observedRateCardUsd"):
            value = state.get(field)
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                raise ValueError
        if state["spentUpperUsd"] + state["reservedUpperUsd"] > limit + 1e-9:
            raise ValueError
        # Crash-left admissions are uncertain. Treat every prior reservation as spent, not free.
        for row in state["requests"]:
            if row.get("status") == "admitted":
                reservation = float(row.get("reservationUsd", RESERVATION_USD))
                state["reservedUpperUsd"] = max(0, state["reservedUpperUsd"] - reservation)
                state["spentUpperUsd"] += reservation
                row["status"] = "incomplete-after-restart"
                row["usageComplete"] = False
        if state["spentUpperUsd"] + state["reservedUpperUsd"] > limit + 1e-9:
            raise ValueError
        return state
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError("existing budget ledger is invalid or belongs to different limits") from exc


class Budget:
    """Thread-safe in-process ledger. Gate tokens only ever enter admission/auth checks."""
    def __init__(self, ledger_path, *, tokens, limit_usd=10, initial_upper_usd=.21916345,
                 max_requests_per_trial=20):
        if not isinstance(tokens, dict) or not tokens or any(not isinstance(k, str) or not k or
                                                              not isinstance(v, str) or not v for k, v in tokens.items()):
            raise ValueError("tokens must map opaque nonempty tokens to trial IDs")
        if not math.isfinite(float(limit_usd)) or not 0 < float(limit_usd) <= 10:
            raise ValueError("limit_usd must be positive and may not exceed the approved $10 cap")
        if not math.isfinite(float(initial_upper_usd)) or float(initial_upper_usd) < .21916345:
            raise ValueError("initial_upper_usd may not be lower than the verified prior upper estimate")
        if float(initial_upper_usd) > float(limit_usd):
            raise ValueError("initial_upper_usd cannot exceed limit_usd")
        if (isinstance(max_requests_per_trial, bool) or not isinstance(max_requests_per_trial, int)
                or not 1 <= max_requests_per_trial <= 20):
            raise ValueError("max_requests_per_trial must be between 1 and the approved cap of 20")
        self.path = Path(ledger_path)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if self.path.parent.stat().st_mode & 0o077:
            raise ValueError("ledger directory must be private (mode 700 or stricter)")
        if self.path.is_symlink() or (self.path.exists() and self.path.stat().st_mode & 0o077):
            raise ValueError("ledger file must be regular and private (mode 600 or stricter)")
        self.tokens = dict(tokens)
        self.limit = float(limit_usd)
        self.initial = float(initial_upper_usd)
        self.max_requests = max_requests_per_trial
        self.lock = threading.RLock()
        self._finished = threading.Condition(self.lock)
        self.state = _load_state(self.path, self.limit, self.initial)
        self.state.pop("tokens", None)
        self._persist()

    def _persist(self):
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if self.path.parent.stat().st_mode & 0o077:
            raise ValueError("ledger directory must be private (mode 700 or stricter)")
        fd, temp = tempfile.mkstemp(prefix=".anthropic-gate-", dir=self.path.parent)
        try:
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(self.state, f, separators=(",", ":"))
                f.flush()
                os.fsync(f.fileno())
            os.replace(temp, self.path)
            os.chmod(self.path, 0o600)
        finally:
            try:
                os.unlink(temp)
            except FileNotFoundError:
                pass

    def reject(self, reason, trial_id=None):
        safe = reason if reason in {"invalid credential", "trial request cap reached",
                                    "global spend ceiling reached"} else "request rejected by gate policy"
        with self.lock:
            self.state["rejections"].append({"time": time.time(), "trialId": trial_id, "reason": safe})
            self._persist()

    def admit(self, token, metadata):
        with self.lock:
            trial = self.tokens.get(token)
            if trial is None:
                raise BudgetRejected("invalid gate credential")
            if sum(r["trialId"] == trial for r in self.state["requests"]) >= self.max_requests:
                raise BudgetRejected("trial request cap reached")
            if self.state["spentUpperUsd"] + self.state["reservedUpperUsd"] + RESERVATION_USD > self.limit + 1e-12:
                raise BudgetRejected("global spend ceiling reached")
            request_id = uuid.uuid4().hex
            row = {"requestId": request_id, "trialId": trial, **metadata, "startedAt": time.time(),
                   "status": "admitted", "reservationUsd": RESERVATION_USD, "upperUsd": RESERVATION_USD,
                   "usage": None, "observedRateCardUsd": None}
            self.state["requests"].append(row)
            self.state["reservedUpperUsd"] += RESERVATION_USD
            self._persist()
            return request_id

    def finish(self, request_id, *, status, usage, model, started):
        with self._finished:
            row = next((r for r in self.state["requests"] if r["requestId"] == request_id), None)
            if row is None or row["status"] != "admitted":
                return
            row["status"] = int(status)
            row["elapsedMs"] = max(0, int((time.monotonic() - started) * 1000))
            row["model"] = model
            self.state["reservedUpperUsd"] = max(0.0, self.state["reservedUpperUsd"] - row["reservationUsd"])
            if usage is None:
                # WHY: errors, disconnects, and missing usage may still have incurred full cost.
                self.state["spentUpperUsd"] += row["reservationUsd"]
                row["usageComplete"] = False
            else:
                upper, observed = conservative_upper_usd(usage), observed_rate_card_usd(usage)
                row.update(usage=usage, usageComplete=True, upperUsd=upper, observedRateCardUsd=observed)
                if upper > row["reservationUsd"]:
                    # A breached pricing/token assumption invalidates ALL further admission, not just this bill.
                    self.state["spentUpperUsd"] = self.limit
                    self.state["reservedUpperUsd"] = 0
                    row["usageComplete"] = False
                    row["accountingAnomaly"] = "usage exceeded reservation; gate stopped"
                else:
                    # WHY: valid complete token usage replaces—not adds to—the up-front hold.
                    self.state["spentUpperUsd"] += upper
                    row["usageComplete"] = True
                row["observedRateCardUsd"] = observed
                self.state["observedRateCardUsd"] += observed
            if self.state["spentUpperUsd"] + self.state["reservedUpperUsd"] > self.limit + 1e-9:
                # This should be impossible under the stated request ceiling; fail closed if corrupted.
                self.state["spentUpperUsd"] = self.limit
                self.state["reservedUpperUsd"] = 0
            self._persist()
            self._finished.notify_all()

    def wait_finished(self, request_id):
        with self._finished:
            self._finished.wait_for(lambda: next((r for r in self.state["requests"]
                                                  if r["requestId"] == request_id), {}).get("status") != "admitted",
                                   timeout=REQUEST_TIMEOUT_SECONDS)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class GateHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "AnthropicGate/1"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(REQUEST_TIMEOUT_SECONDS)

    def log_message(self, fmt, *args):
        # Never log request target, credentials, body, or provider error text.
        return

    def _send_error(self, status, message):
        data = json.dumps({"error": {"type": "gate_error", "message": message}}).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass
        self.close_connection = True

    def _auth(self):
        authorization = self.headers.get("Authorization", "")
        bearer = authorization[7:] if authorization.startswith("Bearer ") else ""
        token = bearer or self.headers.get("x-api-key", "")
        matched = None
        for candidate, trial in self.server.budget.tokens.items():
            if secrets.compare_digest(token, candidate):
                matched = trial
        return token, matched

    def _read_body(self):
        length = self.headers.get("Content-Length", "")
        if not length.isdecimal():
            raise RequestRejected("Content-Length is required")
        if int(length) > MAX_BODY_BYTES:
            raise RequestRejected("request body exceeds 2 MiB")
        body = self.rfile.read(int(length))
        if len(body) != int(length):
            raise RequestRejected("incomplete request body")
        return body

    def do_POST(self):
        try:
            kind, path = _route(self.path)
            token, trial = self._auth()
            if trial is None:
                self.server.budget.reject("invalid credential")
                self._send_error(401, "invalid gate credential")
                return
            raw = self._read_body()
            if kind == "messages":
                raw, metadata = validate_request(self.path, raw)
                request_id = self.server.budget.admit(token, metadata)
                self._relay_message(path, raw, request_id)
            elif kind == "count_tokens":
                if _json_object(raw).get("model") != MODEL:
                    raise RequestRejected("only claude-haiku-5-5 is allowed")
                self._relay(self.command, path, raw)
            else:
                raise RequestRejected("route is not allowed")
        except RequestRejected as exc:
            self.server.budget.reject(str(exc), self._auth()[1])
            self._send_error(400, str(exc))
        except BudgetRejected as exc:
            self.server.budget.reject(str(exc), self._auth()[1])
            self._send_error(429, str(exc))
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
        except Exception:
            self._send_error(502, "upstream request failed")

    def do_GET(self):
        try:
            kind, path = _route(self.path)
            if kind != "models":
                raise RequestRejected("route is not allowed")
            if self._auth()[1] is None:
                self.server.budget.reject("invalid credential")
                self._send_error(401, "invalid gate credential")
                return
            self._relay(self.command, path, b"")
        except RequestRejected as exc:
            self.server.budget.reject(str(exc), self._auth()[1])
            self._send_error(400, str(exc))
        except Exception:
            self._send_error(502, "upstream request failed")

    def _read_upstream_chunk(self, response, deadline):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("upstream request deadline exceeded")
        # WHY: urllib's timeout is per socket operation; refresh it to enforce a total request deadline.
        try:
            response.fp.raw._sock.settimeout(remaining)
        except AttributeError:
            pass
        return response.read1(65536) if hasattr(response, "read1") else response.read(65536)

    def _relay_message(self, path, body, request_id):
        started = time.monotonic()
        deadline = started + REQUEST_TIMEOUT_SECONDS
        usage = UsageTracker()
        json_body = bytearray()
        json_complete = True
        is_event_stream = False
        status = 502
        try:
            status, headers, response = self.server.open_upstream("POST", path, body, self.headers.get('anthropic-beta'))
            model = headers.get("anthropic-model", MODEL)
            is_event_stream = "text/event-stream" in headers.get("content-type", "").lower()
            self._response_headers(status, headers)
            while True:
                chunk = self._read_upstream_chunk(response, deadline)
                if not chunk:
                    break
                if is_event_stream:
                    usage.feed(chunk)
                elif json_complete:
                    if len(json_body) + len(chunk) <= MAX_RESPONSE_BODY_BYTES:
                        json_body.extend(chunk)
                    else:
                        json_complete = False
                        json_body.clear()
                self.wfile.write(chunk)
                self.wfile.flush()
            response.close()
            if 200 <= status < 300 and not is_event_stream and json_complete:
                usage = UsageTracker.from_json(bytes(json_body))
        except (BrokenPipeError, ConnectionResetError, http.client.RemoteDisconnected):
            self.close_connection = True
        except Exception:
            self.close_connection = True
        finally:
            self.server.budget.finish(request_id, status=status, usage=usage.usage(),
                                      model=locals().get("model", MODEL), started=started)

    def _relay(self, method, path, body):
        try:
            deadline = time.monotonic() + REQUEST_TIMEOUT_SECONDS
            status, headers, response = self.server.open_upstream(method, path, body, self.headers.get('anthropic-beta'))
            self._response_headers(status, headers)
            while True:
                chunk = self._read_upstream_chunk(response, deadline)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
            response.close()
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
        except Exception:
            self.close_connection = True

    def _response_headers(self, status, headers):
        self.send_response(status)
        for name, value in headers.items():
            if name.lower() in {"content-length", "content-type", "request-id", "anthropic-version",
                                "anthropic-beta", "retry-after", "cache-control"}:
                self.send_header(name, value)
        self.send_header("Connection", "close")
        self.close_connection = True
        self.end_headers()


class GateServer(ThreadingHTTPServer):
    """Construct with GateServer((host, port), budget=Budget(...), provider_key=...)."""
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, server_address, *, budget: Budget, provider_key: str,
                 upstream_url=DEFAULT_UPSTREAM):
        if not provider_key or "\r" in provider_key or "\n" in provider_key:
            raise ValueError("provider key is required")
        parsed = urllib.parse.urlsplit(upstream_url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("upstream must be an absolute HTTP(S) base URL without credentials")
        super().__init__(server_address, GateHandler)
        self.budget = budget
        self._provider_key = provider_key
        self._upstream = upstream_url.rstrip("/")
        self._opener = urllib.request.build_opener(_NoRedirect())

    def open_upstream(self, method, path, body, beta=None):
        # Caller supplies only a route from _route; no client-controlled upstream URL is accepted.
        req = urllib.request.Request(self._upstream + path, data=body if method == "POST" else None,
                                     method=method, headers={"x-api-key": self._provider_key,
                                     "anthropic-version": "2023-06-01", "content-type": "application/json",
                                     "accept": "text/event-stream, application/json",
                                     **({'anthropic-beta': beta} if beta else {})})
        try:
            response = self._opener.open(req, timeout=REQUEST_TIMEOUT_SECONDS)
        except urllib.error.HTTPError as exc:
            response = exc
        return response.status, response.headers, response


def _read_private_json(path, label):
    json_path = Path(path)
    info = json_path.lstat()
    if not json_path.is_file() or json_path.is_symlink() or info.st_mode & 0o077:
        raise ValueError(f"{label} must be a regular private file (mode 600 or stricter)")
    return json.loads(json_path.read_text(encoding="utf-8"))


def _read_provider_key(path):
    key_path = Path(path)
    info = key_path.lstat()
    if not key_path.is_file() or key_path.is_symlink() or info.st_mode & 0o077:
        raise ValueError("provider key file must be a regular private file (mode 600 or stricter)")
    return key_path.read_text(encoding="utf-8").strip()


def load_config(path):
    config = _read_private_json(path, "gate config")
    if not isinstance(config, dict) or not {"host", "port", "ledgerPath", "tokens"}.issubset(config):
        raise ValueError("config requires host, port, ledgerPath, and tokens")
    return config


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True, help="private JSON gate configuration path")
    parser.add_argument("--key-file", required=True, help="private Anthropic provider key file path")
    args = parser.parse_args(argv)
    config = load_config(args.config)
    budget = Budget(config["ledgerPath"], tokens=config["tokens"],
                    limit_usd=config.get("limitUSD", 10),
                    initial_upper_usd=config.get("initialUpperUSD", .21916345),
                    max_requests_per_trial=config.get("maxRequestsPerTrial", 20))
    server = GateServer((config["host"], int(config["port"])), budget=budget,
                        provider_key=_read_provider_key(args.key_file))
    print(f"Anthropic gate listening on {server.server_address[0]}:{server.server_address[1]}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
