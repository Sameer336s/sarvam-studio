"""Offline tests: no network, no real keys. Run with `pytest -q`."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sarvam_studio import keystore  # noqa: E402
from sarvam_studio.client import (  # noqa: E402
    Attachment,
    Client,
    Message,
    build_messages,
    friendly_error,
    resolve_max_tokens,
)
from sarvam_studio.providers import MODELS, Model  # noqa: E402


@pytest.fixture(autouse=True)
def isolated_home(tmp_path, monkeypatch):
    monkeypatch.setenv("SARVAM_STUDIO_HOME", str(tmp_path))
    yield tmp_path


def model(mid: str = "sarvam-105b") -> Model:
    return next(m for m in MODELS if m.id == mid)


# ------------------------------------------------------------------ tokens


def test_resolve_max_tokens_auto_uses_model_limit():
    m = model()
    assert resolve_max_tokens(None, m) == m.max_tokens


def test_resolve_max_tokens_manual_is_not_clamped_to_model():
    m = model()
    assert resolve_max_tokens(2_000_000, m) == 2_000_000
    assert resolve_max_tokens(0, m) == 1
    assert resolve_max_tokens(10**9, m) == 2_000_000


# -------------------------------------------------------------- attachments


def test_openai_image_parts():
    msg = Message(role="user", content="what is this?", attachments=[
        Attachment(kind="image", name="a.png", mime="image/png",
                   data_url="data:image/png;base64,AAAA"),
    ])
    out = build_messages([msg], "openai")[0]
    assert isinstance(out["content"], list)
    assert out["content"][0] == {"type": "text", "text": "what is this?"}
    assert out["content"][1]["image_url"]["url"].startswith("data:image/png;base64,")


def test_anthropic_image_block():
    msg = Message(role="user", content="hi", attachments=[
        Attachment(kind="image", name="a.jpg", mime="image/jpeg",
                   data_url="data:image/jpeg;base64,BBBB"),
    ])
    out = build_messages([msg], "anthropic")[0]
    assert out["content"][0]["type"] == "image"
    assert out["content"][0]["source"]["media_type"] == "image/jpeg"
    assert out["content"][0]["source"]["data"] == "BBBB"


def test_text_attachment_is_inlined():
    msg = Message(role="user", content="summarise", attachments=[
        Attachment(kind="text", name="notes.md", text="hello world"),
    ])
    out = build_messages([msg], "openai")[0]
    assert "notes.md" in out["content"] and "hello world" in out["content"]


# ------------------------------------------------------------------ streams


def _sse(chunks: list[str]) -> bytes:
    return "".join(f"data: {c}\n\n" for c in chunks).encode()


def test_openai_stream_parses_text_reasoning_and_finish(monkeypatch):
    keystore.save_key("p:sarvam", "sk-test")

    def handler(request: httpx.Request) -> httpx.Response:
        body = _sse([
            json.dumps({"choices": [{"delta": {"reasoning_content": "thinking"}}]}),
            json.dumps({"choices": [{"delta": {"content": "Hello "}}]}),
            json.dumps({"choices": [{"delta": {"content": "world"}, "finish_reason": "stop"}]}),
            "[DONE]",
        ])
        return httpx.Response(200, content=body, headers={"content-type": "text/event-stream"})

    client = Client(transport=httpx.MockTransport(handler))
    events = []

    async def run():
        async for ev in client.stream(model(), [Message(role="user", content="hi")]):
            events.append(ev)

    import asyncio

    asyncio.run(run())
    text = "".join(e.text or "" for e in events)
    reasoning = "".join(e.reasoning or "" for e in events)
    assert text == "Hello world"
    assert reasoning == "thinking"
    assert any(e.finish == "stop" for e in events)


def test_anthropic_stream_parses_deltas(monkeypatch):
    keystore.save_key("p:anthropic", "sk-ant")

    def handler(request: httpx.Request) -> httpx.Response:
        body = _sse([
            json.dumps({"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Nam"}}),
            json.dumps({"type": "content_block_delta", "delta": {"type": "text_delta", "text": "aste"}}),
            json.dumps({"type": "message_delta", "delta": {"stop_reason": "end_turn"},
                        "usage": {"output_tokens": 12}}),
        ])
        return httpx.Response(200, content=body, headers={"content-type": "text/event-stream"})

    client = Client(transport=httpx.MockTransport(handler))
    events = []

    async def run():
        async for ev in client.stream(model("claude-sonnet-5-5"),
                                      [Message(role="user", content="hi")]):
            events.append(ev)

    import asyncio

    asyncio.run(run())
    assert "".join(e.text or "" for e in events) == "Namaste"
    assert any(e.finish == "end_turn" for e in events)
    assert any(e.usage and e.usage.get("completion") == 12 for e in events)


def test_error_mapping():
    assert "Invalid or unauthorised" in friendly_error(401, "{}")
    assert "Rate limited" in friendly_error(429, "{}")
    assert "retired" in friendly_error(404, "{}")
    assert "rejected" in friendly_error(400, '{"error": {"message": "bad top_k"}}')
    assert "bad top_k" in friendly_error(400, '{"error": {"message": "bad top_k"}}')


# ------------------------------------------------------------------- keys


def test_keys_round_trip_and_masking():
    keystore.save_key("p:sarvam", "sk-abcdef123456")
    assert keystore.get_key("p:sarvam") == "sk-abcdef123456"
    masked = keystore.masked()
    assert masked["p:sarvam"]["saved"] is True
    assert "abcdef" not in json.dumps(masked)
    keystore.delete_key("p:sarvam")
    assert keystore.get_key("p:sarvam") == ""


def test_key_file_is_not_plaintext():
    keystore.save_key("p:openai", "sk-super-secret-value")
    blob = (Path(os.environ["SARVAM_STUDIO_HOME"]) / "keys.enc").read_bytes()
    assert b"sk-super-secret-value" not in blob


# ------------------------------------------------------------------- auto


def test_auto_prefers_configured_provider_flagship():
    keystore.save_key("p:sarvam", "sk-test")
    client = Client()
    pick = client.auto_model()
    assert pick is not None
    assert pick.provider == "sarvam"


def test_auto_requires_vision_when_images_are_attached():
    keystore.save_key("p:sarvam", "sk-test")
    client = Client()
    pick = client.auto_model(vision=True)
    assert pick is not None and pick.supports("vision")


# ----------------------------------------------------------------- server


def test_server_state_and_keys():
    from fastapi.testclient import TestClient

    from sarvam_studio.server import app

    with TestClient(app) as http:
        health = http.get("/api/health").json()
        assert health["ok"] is True

        state = http.get("/api/state").json()
        assert any(m["id"] == "sarvam-105b" for m in state["models"])
        assert "presets" in state and len(state["presets"]) > 5

        saved = http.post("/api/keys", json={"slot": "p:sarvam", "key": "sk-test"}).json()
        assert saved["keys"]["p:sarvam"]["saved"] is True

        page = http.get("/")
        assert page.status_code == 200 and "Sarvam Studio" in page.text


def test_server_chat_streams_with_mock_transport(monkeypatch):
    from fastapi.testclient import TestClient

    from sarvam_studio import server as server_module

    keystore.save_key("p:sarvam", "sk-test")

    def handler(request: httpx.Request) -> httpx.Response:
        body = _sse([
            json.dumps({"choices": [{"delta": {"content": "Hello "}}]}),
            json.dumps({"choices": [{"delta": {"content": "there"}, "finish_reason": "stop"}]}),
            "[DONE]",
        ])
        return httpx.Response(200, content=body, headers={"content-type": "text/event-stream"})

    server_module.client._transport = httpx.MockTransport(handler)
    try:
        with TestClient(server_module.app) as http:
            with http.stream("POST", "/api/chat", json={
                "model": "sarvam-105b",
                "messages": [{"role": "user", "content": "hi"}],
            }) as resp:
                assert resp.status_code == 200
                payload = "".join(resp.iter_text())
        assert "Hello " in payload and "there" in payload
        assert '"type": "done"' in payload
    finally:
        server_module.client._transport = None
