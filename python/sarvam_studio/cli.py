"""Terminal chat. `python app.py --cli`.

Uses rich when it is installed for live markdown rendering, and degrades to plain text
otherwise. Slash commands: /model, /key, /models, /auto, /clear, /help, /quit.
"""

from __future__ import annotations

import asyncio
import sys

from . import keystore
from .client import Client, Message, ProviderError
from .config import Config
from .providers import MODELS, PROVIDERS

try:  # pragma: no cover - optional
    from rich.console import Console
    from rich.live import Live
    from rich.markdown import Markdown
    from rich.panel import Panel

    HAVE_RICH = True
except Exception:  # pragma: no cover
    HAVE_RICH = False

HELP = """
Commands
  /model [id]   show or set the model ("auto" lets it choose)
  /models       list models that have a key
  /key <provider> <key>   save an API key (sarvam, openai, anthropic, google)
  /auto         show what Auto would pick right now
  /clear        start a new conversation
  /help         this text
  /quit         exit
"""


class Chat:
    def __init__(self, client: Client | None = None):
        self.client = client or Client()
        self.config: Config = self.client.config
        self.model_id = self.config.default_model or "auto"
        self.history: list[Message] = []
        self.console = Console() if HAVE_RICH else None

    # ------------------------------------------------------------------ io
    def say(self, text: str, style: str | None = None) -> None:
        if self.console:
            self.console.print(text, style=style)
        else:
            print(text)

    def show_markdown(self, text: str) -> None:
        if self.console and HAVE_RICH:
            self.console.print(Markdown(text))
        else:
            print(text)

    # --------------------------------------------------------------- model
    def pick_model(self):
        try:
            return self.client.model(self.model_id)
        except ProviderError as exc:
            self.say(str(exc), "red")
            return None

    # -------------------------------------------------------------- one turn
    async def turn(self, text: str) -> None:
        model = self.pick_model()
        if model is None:
            return

        messages = [Message(role="system", content=self.config.system_prompt)]
        messages += self.history[-self.config.context_messages :]
        messages.append(Message(role="user", content=text))

        buffer: list[str] = []
        finish = None

        if self.console and HAVE_RICH:
            live = Live("", console=self.console, refresh_per_second=12, vertical_overflow="visible")
            live.start()
        else:
            live = None

        try:
            async for event in self.client.stream(model, messages, self.config.params):
                if event.error:
                    self.say(f"\n{event.error}", "red")
                    return
                if event.text:
                    buffer.append(event.text)
                    if live:
                        live.update(Markdown("".join(buffer)))
                if event.finish:
                    finish = event.finish
        finally:
            if live:
                live.stop()

        answer = "".join(buffer).strip()
        if not answer:
            self.say("(empty response)", "yellow")
            return
        if not live:
            self.show_markdown(answer)
        if finish in ("length", "max_tokens"):
            self.say("  [reply hit the output limit — raise max tokens or say 'continue']", "yellow")

        self.history.append(Message(role="user", content=text))
        self.history.append(Message(role="assistant", content=answer))

    # ------------------------------------------------------------- commands
    def handle(self, line: str) -> bool:
        """Returns False when the loop should exit."""
        parts = line.split()
        cmd = parts[0].lower()

        if cmd in ("/quit", "/exit", "/q"):
            return False
        if cmd == "/help":
            self.say(HELP)
        elif cmd == "/clear":
            self.history.clear()
            self.say("New conversation.")
        elif cmd == "/models":
            ready = [m for m in MODELS if self.client.key_for(m)]
            if not ready:
                self.say("No keys yet — /key sarvam <your-key>", "yellow")
            for m in ready:
                self.say(f"  {m.id:32} {m.name:34} {m.context_window // 1000}K ctx")
        elif cmd == "/auto":
            pick = self.client.auto_model()
            self.say(f"Auto would pick: {pick.name} ({pick.id})" if pick else "Auto has nothing to pick — add a key.")
        elif cmd == "/model":
            if len(parts) == 1:
                self.say(f"model: {self.model_id}")
            else:
                self.model_id = parts[1]
                self.config.default_model = self.model_id
                self.config.save()
                self.say(f"model set to {self.model_id}")
        elif cmd == "/key":
            if len(parts) < 3:
                self.say("usage: /key <sarvam|openai|anthropic|google> <key>", "yellow")
            else:
                provider, key = parts[1], parts[2]
                if provider not in PROVIDERS:
                    self.say(f"unknown provider: {provider}", "red")
                else:
                    keystore.save_key(f"p:{provider}", key)
                    self.say(f"{PROVIDERS[provider].name} key saved (encrypted).")
        else:
            self.say("Unknown command. /help", "yellow")
        return True

    async def run(self) -> None:
        pick = self.client.auto_model()
        header = "Sarvam Studio — terminal"
        detail = f"model: {self.model_id}"
        if pick and self.model_id == "auto":
            detail += f" (Auto -> {pick.name})"
        if self.console and HAVE_RICH:
            self.console.print(Panel.fit(f"{header}\n{detail}\n/help for commands", border_style="yellow"))
        else:
            print(f"{header}\n{detail}\n/help for commands\n")

        while True:
            try:
                line = input("you › ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                return
            if not line:
                continue
            if line.startswith("/"):
                if not self.handle(line):
                    return
                continue
            await self.turn(line)
            print()


def main() -> None:
    try:
        asyncio.run(Chat().run())
    except KeyboardInterrupt:
        sys.exit(0)
