"""
Zara — local development server.

Serves the static PWA from this folder with correct MIME types, no-cache
headers (so edits show immediately) and the Service-Worker-Allowed header.
Falls back to Python's built-in http.server if Flask isn't installed.

    python app.py            # http://127.0.0.1:5000
    python app.py --port 8080
    python app.py --no-browser
"""
import argparse
import mimetypes
import os
import sys
import threading
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
mimetypes.add_type("application/manifest+json", ".json")
mimetypes.add_type("application/javascript", ".js")


def parse_args():
    p = argparse.ArgumentParser(description="Run the Zara PWA locally")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=int(os.environ.get("PORT", 5000)))
    p.add_argument("--no-browser", action="store_true", help="don't open a browser tab")
    return p.parse_args()


def open_browser(url):
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()


def run_flask(args):
    from flask import Flask, send_from_directory  # noqa: WPS433

    app = Flask(__name__, static_folder=None)

    @app.after_request
    def headers(resp):
        resp.headers["Cache-Control"] = "no-store"
        resp.headers["Service-Worker-Allowed"] = "/"
        resp.headers["X-Content-Type-Options"] = "nosniff"
        return resp

    @app.route("/")
    def index():
        return send_from_directory(ROOT, "index.html")

    @app.route("/health")
    def health():
        return {"ok": True, "app": "zara"}

    @app.route("/<path:path>")
    def static_file(path):
        full = os.path.normpath(os.path.join(ROOT, path))
        if not full.startswith(ROOT) or not os.path.isfile(full):
            return send_from_directory(ROOT, "index.html")  # SPA fallback
        return send_from_directory(ROOT, path)

    url = f"http://{args.host}:{args.port}"
    print(f"\n  ✦ Zara is running at {url}\n  Press Ctrl+C to stop.\n")
    if not args.no_browser:
        open_browser(url)
    app.run(host=args.host, port=args.port, debug=False, threaded=True)


def run_builtin(args):
    from functools import partial
    from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

    class Handler(SimpleHTTPRequestHandler):
        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            self.send_header("Service-Worker-Allowed", "/")
            super().end_headers()

        def log_message(self, fmt, *a):  # quieter log
            sys.stdout.write("  %s\n" % (fmt % a))

    handler = partial(Handler, directory=ROOT)
    httpd = ThreadingHTTPServer((args.host, args.port), handler)
    url = f"http://{args.host}:{args.port}"
    print(f"\n  ✦ Zara is running at {url} (built-in server; pip install flask for the full dev server)\n  Press Ctrl+C to stop.\n")
    if not args.no_browser:
        open_browser(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    a = parse_args()
    try:
        import flask  # noqa: F401
        run_flask(a)
    except ImportError:
        run_builtin(a)
