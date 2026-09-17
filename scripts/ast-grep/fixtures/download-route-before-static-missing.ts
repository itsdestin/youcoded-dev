// Violation fixture for download-route-before-static: the download route was
// dropped from the server callback (fires three times: on the server call, and
// on each fallback call, which nothing now precedes).
import http from 'node:http';
export class Host {
  start(hasStaticBuild: boolean, staticDir: string, viteDevUrl: string) {
    return http.createServer((req, res) => {
      if (hasStaticBuild) this.handleHttpRequest(req, res, staticDir);
      else this.proxyToVite(req, res, viteDevUrl);
    });
  }
}
