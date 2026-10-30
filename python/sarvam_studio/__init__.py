"""Sarvam Studio (Python) — one package, four ways to use it.

    from sarvam_studio import Client, Message

    client = Client()
    print(client.auto_model())                    # what Auto would pick right now

Or from the shell:

    python app.py            # web UI on http://127.0.0.1:8000
    python app.py --cli      # terminal chat
    python app.py --desktop  # native window (pywebview)
"""

from .client import (
    Attachment,
    Client,
    Event,
    Message,
    ProviderError,
    estimate_tokens,
    resolve_max_tokens,
)
from .config import Config, Params, home
from .keystore import delete_key, get_key, masked, save_key
from .mcp import McpClient, McpTool, bridge_command, connect
from .providers import MODELS, PRESETS, PROVIDERS, Model, Preset

__version__ = "3.5.0"

__all__ = [
    "Attachment",
    "Client",
    "Config",
    "Event",
    "McpClient",
    "McpTool",
    "Message",
    "Model",
    "MODELS",
    "PRESETS",
    "PROVIDERS",
    "Params",
    "Preset",
    "ProviderError",
    "__version__",
    "bridge_command",
    "connect",
    "delete_key",
    "estimate_tokens",
    "get_key",
    "home",
    "masked",
    "resolve_max_tokens",
    "save_key",
]
