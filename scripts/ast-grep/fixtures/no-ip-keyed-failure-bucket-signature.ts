// Violation fixture for no-ip-keyed-failure-bucket, whole-file backstop: the
// spelling sits in a node kind the innermost branch does not list (an
// interface method signature), and the raw text still holds it (fires once).
export interface Limiter {
  isRateLimited(ip): boolean;
}
