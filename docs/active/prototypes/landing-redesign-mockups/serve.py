#!/usr/bin/env python3
"""Static server for the mockups that REFUSES to be cached.

`python3 -m http.server` sends no Cache-Control, so browsers apply heuristic
caching -- and the compare page loads each mockup in an iframe, which a soft
reload does not always revalidate. The result is a rebuilt mockup that looks
unchanged in the browser while the file on disk is correct (2026-08-30).
"""
import http.server, functools, sys, os

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8901
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mockups')
handler = functools.partial(NoCache, directory=root)
print(f'serving {root} on http://localhost:{port}/compare.html  (no-store)')
http.server.ThreadingHTTPServer(('', port), handler).serve_forever()
