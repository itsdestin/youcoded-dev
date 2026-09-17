// Violation fixture for download-route-before-static: the static handler runs
// before the download route, so an expired link gets index.html and a 200
// (fires once, on the static call; the proxy call after the route is fine).
import http from 'node:http';
export class Host {
  start(hasStaticBuild: boolean, staticDir: string, viteDevUrl: string) {
    return http.createServer((req, res) => {
      if (hasStaticBuild) {
        this.handleHttpRequest(req, res, staticDir);
        return;
      }
      if (this.downloads.handleHttpRequest(req, res)) return;
      this.proxyToVite(req, res, viteDevUrl);
    });
  }
}
