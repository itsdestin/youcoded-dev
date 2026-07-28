// VIOLATION FIXTURE — not real code, never imported, never built.
// The spinner-re-anchored rule must fire on this file.

// VIOLATION: the leading `^` anchor has been dropped, so markdown bullets and
// echoed prompts anywhere in a line would false-match as an active spinner.
const SPINNER_RE = /([✻✽✢✳✶*⏺◉·])\s+[A-Za-z][A-Za-z +\-]*…/;

export function fixtureClassify(line: string) {
  return line.match(SPINNER_RE);
}
