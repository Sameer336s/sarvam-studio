"""Native window around the local server, via pywebview.

`python app.py --desktop` — needs `pip install pywebview`. If pywebview is missing we fall
back to opening the browser, which is honest rather than pretending a window exists.
"""

from __future__ import annotations

import threading
import time
import webbrowser


def main(host: str = "127.0.0.1", port: int = 8000) -> None:
    try:
        import webview  # type: ignore
    except Exception:
        print("pywebview is not installed — opening the browser instead.")
        print("Install it with: pip install pywebview")
        threading.Timer(1.2, lambda: webbrowser.open(f"http://{host}:{port}")).start()
        from .server import run as run_server

        run_server(host=host, port=port, open_browser=False)
        return

    import uvicorn

    from .server import app

    config = uvicorn.Config(app, host=host, port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    for _ in range(50):  # wait for the port to accept connections
        if server.started:
            break
        time.sleep(0.1)

    webview.create_window("Sarvam Studio", f"http://{host}:{port}", width=1180, height=820)
    webview.start()
