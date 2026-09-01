// Fixture for roadmap-check tests. The claim anchor in the fixture report points here.
export async function checkGh() {
  return execFile('gh', ['auth', 'status']);
}
