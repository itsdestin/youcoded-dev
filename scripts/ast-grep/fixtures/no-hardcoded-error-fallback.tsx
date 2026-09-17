// Violation fixture for no-hardcoded-error-fallback — each line fires once.
declare const result: { error?: string };
declare const setupError: string | null;
export const a = setupError || 'Setup failed'; // code: a variable ending in Error
export const b = `shown as ${result.error} or result.error || "Install failed" in a template piece`;
export const C = () => <p>{setupError} was saveError || 'Could not save'</p>;
