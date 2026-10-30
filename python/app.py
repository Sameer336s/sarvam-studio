#!/usr/bin/env python3
"""Sarvam Studio — Python entry point.

    python app.py              web UI (default)
    python app.py --cli        terminal chat
    python app.py --desktop    native window (pywebview)
    python app.py --host 0.0.0.0 --port 8080 --no-browser
"""

from __future__ import annotations

import argparse
import sys


def main() -> None:
    parser = argparse.ArgumentParser(prog="sarvam-studio", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cli", action="store_true", help="terminal chat instead of the web UI")
    parser.add_argument("--desktop", action="store_true", help="native window (needs pywebview)")
    parser.add_argument("--host", default="127.0.0.1", help="bind address (default 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="port (default 8000)")
    parser.add_argument("--no-browser", action="store_true", help="do not open a browser")
    parser.add_argument("--version", action="store_true", help="print version and exit")
    args = parser.parse_args()

    if args.version:
        from sarvam_studio import __version__

        print(__version__)
        return

    if args.cli:
        from sarvam_studio.cli import main as cli_main

        cli_main()
        return

    if args.desktop:
        from sarvam_studio.desktop import main as desktop_main

        desktop_main(args.host, args.port)
        return

    from sarvam_studio.server import run as run_server

    run_server(args.host, args.port, open_browser=not args.no_browser)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
