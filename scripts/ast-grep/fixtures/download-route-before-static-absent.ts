// Violation fixture for download-route-before-static: no
// http.createServer((req, res) => { … }) call at all, so the ordering rule
// would guard nothing (fires once, on the whole file).
import http from 'node:http';
export const server = http.createServer();
