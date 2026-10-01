#!/usr/bin/env python3
"""Local dev server: serves the site on http://localhost:8000 with caching turned off,
so the browser always picks up the latest CSS/JS/data. Usage: scripts/serve.py [port]"""
import http.server, os, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
print(f"Serving on http://localhost:{port} (no caching)")
http.server.ThreadingHTTPServer(("", port), NoCache).serve_forever()
