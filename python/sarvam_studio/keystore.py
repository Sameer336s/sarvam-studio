"""API key storage.

Keys are encrypted at rest with Fernet (AES-128-CBC + HMAC). The encryption key lives in
its own 0600 file next to the store, which protects against a copied keys file or a backup
but not against someone who already has read access to your home directory — a local app
cannot do better without an OS keyring. Set SARVAM_STUDIO_USE_KEYRING=1 to keep keys in the
system keyring instead when `keyring` is installed.
"""

from __future__ import annotations

import json
import os
from typing import Any

from .config import home

try:  # pragma: no cover - optional dependency
    from cryptography.fernet import Fernet, InvalidToken

    HAVE_CRYPTO = True
except Exception:  # pragma: no cover
    HAVE_CRYPTO = False
    InvalidToken = Exception  # type: ignore

try:  # pragma: no cover - optional dependency
    import keyring

    HAVE_KEYRING = True
except Exception:  # pragma: no cover
    HAVE_KEYRING = False


ENV_KEYS = {
    "sarvam": ("SARVAM_API_KEY", "SARVAM_KEY"),
    "openai": ("OPENAI_API_KEY",),
    "anthropic": ("ANTHROPIC_API_KEY",),
    "google": ("GEMINI_API_KEY", "GOOGLE_API_KEY"),
}


def _secret_path():
    return home() / "secret.key"


def _store_path():
    return home() / "keys.enc"


def _load_fernet():
    path = _secret_path()
    if not path.exists():
        path.write_bytes(Fernet.generate_key())
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
    return Fernet(path.read_bytes())


def _read_all() -> dict[str, str]:
    if HAVE_KEYRING and os.environ.get("SARVAM_STUDIO_USE_KEYRING") == "1":
        raw = keyring.get_password("sarvam-studio", "__all__")
        return json.loads(raw) if raw else {}
    path = _store_path()
    if not path.exists():
        return {}
    try:
        if HAVE_CRYPTO:
            plain = _load_fernet().decrypt(path.read_bytes())
        else:  # pragma: no cover
            import base64

            plain = base64.b64decode(path.read_bytes())
        return json.loads(plain.decode("utf-8"))
    except (InvalidToken, ValueError, OSError):
        return {}


def _write_all(data: dict[str, str]) -> None:
    blob = json.dumps(data).encode("utf-8")
    if HAVE_KEYRING and os.environ.get("SARVAM_STUDIO_USE_KEYRING") == "1":
        keyring.set_password("sarvam-studio", "__all__", blob.decode("utf-8"))
        return
    path = _store_path()
    if HAVE_CRYPTO:
        path.write_bytes(_load_fernet().encrypt(blob))
    else:  # pragma: no cover
        import base64

        path.write_bytes(base64.b64encode(blob))
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def save_key(slot: str, value: str) -> None:
    """slot is "p:<provider>" or "c:<custom-provider-id>"."""
    data = _read_all()
    value = value.strip()
    if value:
        data[slot] = value
    else:
        data.pop(slot, None)
    _write_all(data)


def delete_key(slot: str) -> None:
    save_key(slot, "")


def get_key(slot: str) -> str:
    value = _read_all().get(slot, "")
    if value:
        return value
    provider = slot.split(":", 1)[-1]
    for env in ENV_KEYS.get(provider, ()):
        if os.environ.get(env):
            return os.environ[env]
    return ""


def all_keys() -> dict[str, str]:
    return _read_all()


def masked() -> dict[str, Any]:
    """What the UI is allowed to see: presence and a masked hint, never the key."""
    out: dict[str, Any] = {}
    for slot, value in _read_all().items():
        out[slot] = {"saved": True, "hint": f"{value[:4]}…{value[-4:]}" if len(value) > 10 else "saved"}
    for provider, envs in ENV_KEYS.items():
        slot = f"p:{provider}"
        if slot not in out:
            for env in envs:
                if os.environ.get(env):
                    out[slot] = {"saved": True, "hint": f"from ${env}"}
                    break
    return out
