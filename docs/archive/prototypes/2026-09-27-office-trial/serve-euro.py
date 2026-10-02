# Serve dist-euro like the preview server: /editor -> editor.html, wasm type, brotli header.
import http.server, functools, sys
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm', '.js': 'text/javascript'}
    def translate(self):
        p = self.path.split('?')[0]
        if p in ('/editor', '/editor/'): self.path = '/editor.html' + self.path[len(p):]
    def do_GET(self): self.translate(); return super().do_GET()
    def do_HEAD(self): self.translate(); return super().do_HEAD()
    def end_headers(self):
        if self.path.split('?')[0].endswith('.br'): self.send_header('Content-Encoding', 'br')
        # Workbench only: the fake file reader fetches fixture bytes from here.
        if self.path.startswith('/samples/'): self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', 4717), functools.partial(H, directory=sys.argv[1])).serve_forever()
