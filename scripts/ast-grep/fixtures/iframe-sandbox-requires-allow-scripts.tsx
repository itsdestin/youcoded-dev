// Violation fixture for iframe-sandbox-requires-allow-scripts: no sandbox
// attribute at all (the case iframe-sandbox-no-allow-same-origin cannot see).
export const Bad = () => <iframe src="about:blank" />;
