import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import anthropic_gate as gate


class GateUnitTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.tokens = {"opaque-a": "trial-a", "opaque-b": "trial-b"}
        self.budget = gate.Budget(
            self.root / "ledger.json", tokens=self.tokens, limit_usd=10,
            initial_upper_usd=0.21916345, max_requests_per_trial=20,
        )

    def test_clamps_common_output_ceiling_and_normalizes_thinking_and_effort(self):
        body = json.dumps({
            "model": "claude-haiku-5-5", "max_tokens": 100000,
            "thinking": {"type": "enabled", "budget_tokens": 4096},
            "output_config": {"effort": "high", "format": {"type": "json_schema"}},
            "tools": [{"name": "read", "input_schema": {"type": "object"}}],
        }).encode()
        normalized, meta = gate.validate_request("/v1/messages?beta=true", body)
        decoded = json.loads(normalized)
        self.assertEqual(decoded["max_tokens"], 8192)
        self.assertEqual(decoded["thinking"], {"type": "disabled"})
        self.assertEqual(decoded["output_config"], {"format": {"type": "json_schema"}})
        self.assertEqual(meta["requestedMaxTokens"], 100000)
        self.assertEqual(meta["effectiveMaxTokens"], 8192)
        self.assertTrue(meta["normalizedThinking"])
        self.assertTrue(meta["removedEffort"])

    def test_disabled_thinking_removes_incompatible_clear_thinking_strategy(self):
        body = json.dumps({'model':gate.MODEL,'max_tokens':8192,
            'context_management':{'edits':[{'type':'clear_thinking_20251015'},
                                           {'type':'clear_tool_uses_20250919'}]}}).encode()
        raw, meta = gate.validate_request('/v1/messages', body)
        self.assertEqual(json.loads(raw)['context_management']['edits'], [{'type':'clear_tool_uses_20250919'}])
        self.assertTrue(meta['removedClearThinking'])

    def test_rejects_non_haiku_model_and_invalid_max_tokens(self):
        for model, limit in (("claude-sonnet-4-5", 100), ("claude-haiku-5-5", 0),
                             ("claude-haiku-5-5", -1), ("claude-haiku-5-5", True)):
            with self.subTest(model=model, limit=limit), self.assertRaises(gate.RequestRejected):
                gate.validate_request("/v1/messages", json.dumps({
                    "model": model, "max_tokens": limit,
                }).encode())

    def test_safe_auxiliary_query_params_are_allowed_only(self):
        self.assertEqual(gate._route("/v1/models?limit=100"),
                         ("models", "/v1/models?limit=100"))
        self.assertEqual(gate._route("/v1/messages/count_tokens?beta=true"),
                         ("count_tokens", "/v1/messages/count_tokens?beta=true"))
        for path in ("/v1/models?limit=1000", "/v1/models?foo=bar",
                     "/v1/messages/count_tokens?beta=false"):
            with self.subTest(path=path), self.assertRaises(gate.RequestRejected):
                gate._route(path)

    def test_rejects_provider_tools_priority_and_nondefault_geo(self):
        base = {"model": "claude-haiku-5-5", "max_tokens": 10}
        invalid = [
            {"tools": [{"type": "web_search_20250305", "name": "search"}]},
            {"service_tier": "priority"}, {"inference_geo": "us"},
        ]
        for extra in invalid:
            with self.subTest(extra=extra), self.assertRaises(gate.RequestRejected):
                gate.validate_request("/v1/messages", json.dumps(base | extra).encode())
        for tier in ("auto", "standard"):
            gate.validate_request("/v1/messages", json.dumps(base | {"service_tier": tier}).encode())

    def test_nonstream_json_usage_is_parsed_but_errors_and_incomplete_json_are_unknown(self):
        response = json.dumps({"id": "msg_test", "type": "message", "model": "claude-haiku-5-5",
                               "usage": {"input_tokens": 31, "cache_creation_input_tokens": 4,
                                         "cache_read_input_tokens": 6, "output_tokens": 7}}).encode()
        self.assertEqual(gate.UsageTracker.parse_json_response(response), {
            "inputTokens": 31, "cacheCreationInputTokens": 4,
            "cacheReadInputTokens": 6, "outputTokens": 7,
        })
        self.assertIsNone(gate.UsageTracker.parse_json_response(response[:-1]))
        self.assertIsNone(gate.UsageTracker.parse_json_response(b'{"type":"error"}'))
        self.assertIsNone(gate.UsageTracker.parse_json_response(b"x" * (gate.MAX_RESPONSE_BODY_BYTES + 1)))

    def test_usage_parser_uses_start_cache_components_and_cumulative_output_once(self):
        tracker = gate.UsageTracker()
        tracker.feed(b'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":10,"cache_creation_input_tokens":3,"cache_read_input_tokens":7}}}\n\n')
        tracker.feed(b'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":4}}\n\n')
        tracker.feed(b'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":9}}\n\n')
        tracker.feed(b'event: message_stop\ndata: {"type":"message_stop"}\n\n')
        self.assertEqual(tracker.usage(), {
            "inputTokens": 10, "cacheCreationInputTokens": 3,
            "cacheReadInputTokens": 7, "outputTokens": 9,
        })
        self.assertAlmostEqual(gate.conservative_upper_usd(tracker.usage()), 0.00004675)
        split = gate.UsageTracker()
        split.feed(b'event: message_start\r')
        split.feed(b'\ndata: {"type":"message_start","message":{"usage":{"input_tokens":1}}}\r\n\r\nevent: message_delta\r\ndata: {"type":"message_delta","usage":{"output_tokens":2}}\r\n\r\nevent: message_stop\r\ndata: {"type":"message_stop"}\r\n\r\n')
        self.assertEqual(split.usage(), {"inputTokens": 1, "cacheCreationInputTokens": 0,
                                         "cacheReadInputTokens": 0, "outputTokens": 2})

    def test_usage_exceeding_reservation_stops_all_future_admissions(self):
        rid = self.budget.admit('opaque-a', {'model':gate.MODEL})
        self.budget.finish(rid, status=200, usage={
            'inputTokens':2000000, 'cacheCreationInputTokens':0,
            'cacheReadInputTokens':0, 'outputTokens':8192,
        }, model=gate.MODEL, started=0)
        with self.assertRaises(gate.BudgetRejected):
            self.budget.admit('opaque-b', {'model':gate.MODEL})

    def test_unknown_or_incomplete_usage_keeps_reservation(self):
        tracker = gate.UsageTracker()
        tracker.feed(b'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":12}}}\n\n')
        self.assertIsNone(tracker.usage())
        rid = self.budget.admit("opaque-a", {"model": "claude-haiku-5-5", "max_tokens": 1})
        self.budget.finish(rid, status=502, usage=None, model="claude-haiku-5-5", started=0)
        state = json.loads((self.root / "ledger.json").read_text())
        self.assertEqual(state["reservedUpperUsd"], 0.0)
        self.assertAlmostEqual(state["spentUpperUsd"], 1.41916345)

    def test_reservations_are_atomic_across_trials_and_request_caps(self):
        ids = [self.budget.admit("opaque-a", {"model": "claude-haiku-5-5", "max_tokens": 1})
               for _ in range(8)]
        with self.assertRaises(gate.BudgetRejected):
            self.budget.admit("opaque-b", {"model": "claude-haiku-5-5", "max_tokens": 1})
        self.assertEqual(len(ids), 8)
        for rid in ids:
            self.budget.finish(rid, status=200, usage={
                "inputTokens": 100, "cacheCreationInputTokens": 0,
                "cacheReadInputTokens": 0, "outputTokens": 5,
            }, model="claude-haiku-5-5", started=0)
        state = json.loads((self.root / "ledger.json").read_text())
        self.assertAlmostEqual(state["spentUpperUsd"], 0.21916345 + 8 * 0.00012375)
        self.assertEqual(state["reservedUpperUsd"], 0)
        self.assertEqual(os.stat(self.root / "ledger.json").st_mode & 0o777, 0o600)
        with self.assertRaises(gate.BudgetRejected):
            for _ in range(20):
                self.budget.admit("opaque-b", {"model": "claude-haiku-5-5", "max_tokens": 1})


class GateHttpTests(unittest.TestCase):
    def test_local_upstream_stub_auth_streaming_and_safe_ledger(self):
        class Stub(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def do_POST(self):
                length = int(self.headers["Content-Length"])
                body = json.loads(self.rfile.read(length))
                self.server.seen.append((self.headers.get("x-api-key"), body, self.headers.get('anthropic-beta')))
                payload = (
                    b'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":20,"cache_creation_input_tokens":2,"cache_read_input_tokens":1}}}\n\n'
                    b'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":5}}\n\n'
                    b'event: message_stop\ndata: {"type":"message_stop"}\n\n'
                )
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                self.wfile.flush()

            def log_message(self, fmt, *args):
                pass

        stub = ThreadingHTTPServer(("127.0.0.1", 0), Stub)
        stub.seen = []
        thread = threading.Thread(target=stub.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(stub.shutdown)
        self.addCleanup(stub.server_close)

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ledger.json"
            budget = gate.Budget(path, tokens={"token": "trial-1"}, limit_usd=10,
                                 initial_upper_usd=0.21916345, max_requests_per_trial=20)
            server = gate.GateServer(("127.0.0.1", 0), budget=budget, provider_key="provider-secret",
                                     upstream_url=f"http://127.0.0.1:{stub.server_port}")
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            self.addCleanup(server.shutdown)
            self.addCleanup(server.server_close)
            import http.client
            conn = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=5)
            request = {"model": "claude-haiku-5-5", "max_tokens": 9000, "messages": []}
            conn.request("POST", "/v1/messages?beta=true", body=json.dumps(request), headers={
                "Authorization": "Bearer token", "Content-Type": "application/json",
                "Accept": "text/event-stream", "anthropic-beta": "test-beta-flag",
            })
            response = conn.getresponse()
            self.assertEqual(response.status, 200)
            data = response.read()
            self.assertIn(b"event: message_start", data)
            conn.close()
            self.assertEqual(stub.seen[0][0], "provider-secret")
            self.assertEqual(stub.seen[0][2], 'test-beta-flag')
            self.assertEqual(stub.seen[0][1]["max_tokens"], 8192)
            first_state = json.loads(path.read_text())
            budget.wait_finished(first_state["requests"][0]["requestId"])
            ledger = path.read_text()
            self.assertNotIn("provider-secret", ledger)
            self.assertNotIn('"messages"', ledger)
            state = json.loads(ledger)
            self.assertAlmostEqual(state["spentUpperUsd"], 0.21916345 + 0.00003905, msg=ledger)
            self.assertEqual(state["requests"][0]["requestedMaxTokens"], 9000)
            self.assertEqual(state["requests"][0]["effectiveMaxTokens"], 8192)

    def test_invalid_auth_never_reaches_upstream(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger = Path(directory) / "ledger.json"
            budget = gate.Budget(ledger, tokens={"expected": "trial"})
            server = gate.GateServer(("127.0.0.1", 0), budget=budget, provider_key="never-log-me",
                                     upstream_url="http://127.0.0.1:1")
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            self.addCleanup(server.shutdown)
            self.addCleanup(server.server_close)
            import http.client
            conn = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=5)
            conn.request("POST", "/v1/messages", body=b"{}", headers={"x-api-key": "unknown"})
            response = conn.getresponse()
            self.assertEqual(response.status, 401)
            response.read()
            state = json.loads(ledger.read_text())
            self.assertEqual(state["requests"], [])


if __name__ == "__main__":
    unittest.main()
