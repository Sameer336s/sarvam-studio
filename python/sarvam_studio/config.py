"""Configuration and on-disk paths.

Everything lives under ~/.config/sarvam-studio (or $SARVAM_STUDIO_HOME):
    config.json   non-secret settings
    keys.enc      encrypted API keys
    secret.key    the key used to encrypt keys.enc (chmod 600)
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


APP_NAME = "sarvam-studio"


def home() -> Path:
    override = os.environ.get("SARVAM_STUDIO_HOME")
    base = Path(override) if override else Path.home() / ".config" / APP_NAME
    base.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(base, 0o700)
    except OSError:
        pass
    return base


@dataclass
class Params:
    """Sampling knobs. None means "use the model's own limit"."""

    temperature: float = 0.7
    top_p: float = 0.95
    top_k: int | None = None
    max_tokens: int | None = None
    presence_penalty: float = 0.0
    frequency_penalty: float = 0.0
    seed: int | None = None
    stop: list[str] = field(default_factory=list)
    reasoning_effort: str = "auto"  # auto | low | medium | high
    json_mode: bool = False

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Config:
    theme: str = "dark"  # dark | light
    palette: str = "warm"  # warm (mocha & gold) | neutral
    accent: str = "#C8792C"
    accent2: str = "#F4D9A0"
    default_model: str = "auto"
    system_prompt: str = (
        "You are a helpful, accurate assistant. Reply in the user's language. "
        "Use Markdown, and keep answers clear and practical."
    )
    context_messages: int = 30
    auto_max_tokens: str = "max"  # max | balanced
    speak_replies: bool = False
    voice_rate: float = 1.0
    stt_language: str = "unknown"
    params: Params = field(default_factory=Params)
    # id -> {name, endpoint, models_endpoint, auth_header, auth_prefix, models: [ids]}
    custom_providers: dict = field(default_factory=dict)
    mcp_servers: list = field(default_factory=list)

    # ---------------------------------------------------------------- io
    @classmethod
    def load(cls) -> "Config":
        path = home() / "config.json"
        if not path.exists():
            return cls()
        try:
            raw = json.loads(path.read_text("utf-8"))
        except (OSError, json.JSONDecodeError):
            return cls()
        params_raw = raw.pop("params", {}) or {}
        known = {f for f in cls.__dataclass_fields__ if f != "params"}
        cfg = cls(**{k: v for k, v in raw.items() if k in known})
        fields = Params.__dataclass_fields__
        cfg.params = Params(**{k: v for k, v in params_raw.items() if k in fields})
        return cfg

    def save(self) -> None:
        data = asdict(self)
        (home() / "config.json").write_text(json.dumps(data, indent=2), "utf-8")

    def merge(self, patch: dict[str, Any]) -> "Config":
        for key, value in patch.items():
            if key == "params" and isinstance(value, dict):
                for pk, pv in value.items():
                    if pk in Params.__dataclass_fields__:
                        setattr(self.params, pk, pv)
            elif key in self.__dataclass_fields__:
                setattr(self, key, value)
        return self
