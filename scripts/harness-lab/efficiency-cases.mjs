// Follow-up fixtures derived from Destin's 2026-10-18 audit handoff.
// Reuse the existing exporter, clients and request ledger; no new benchmark framework.
const untouched = 'User-owned notes: preserve this file byte-for-byte.\n';
const release = '{"version":"v2.0.0","commit":"abc123def456","tests":"passed previously"}\n';
const documents = ['overview.md', 'implementation.md', 'verification.md', 'handoff.md', 'release-notes.md'];
const original = name => `# ${name}\nStatus: planned\nVersion: pending\nCommit: pending\nTests: pending\nNotes: keep this document-specific note for ${name}.\n`;
const completed = name => `# ${name}\nStatus: complete\nVersion: v2.0.0\nCommit: abc123def456\nTests: passed previously (release.json)\nNotes: keep this document-specific note for ${name}.\n`;

export const efficiencyCases = [
  {
    id: 'coherent-record-update', category: 'multi-file-efficiency',
    instruction: 'Update the five Markdown completion records using the verified facts in release.json. Set Status to complete, Version and Commit to the supplied values, and Tests to "passed previously (release.json)". Preserve every other line and all other files exactly. The release facts are already verified: do not investigate Git history or claim you ran tests. Finish the updates, check the results, and give a concise outcome.',
    files: { 'release.json': release, 'unrelated.txt': untouched,
      ...Object.fromEntries(documents.map(name => [name, original(name)])) },
    oracle: Object.fromEntries(documents.map(name => [name, completed(name)])),
    check: `expected = json.loads(${JSON.stringify(JSON.stringify(Object.fromEntries(documents.map(name => [name, completed(name)]))))})\nfor name, body in expected.items():\n    assert (root/name).read_text() == body, name\nassert (root/'release.json').read_text() == ${JSON.stringify(release)}\nassert (root/'unrelated.txt').read_text() == ${JSON.stringify(untouched)}`,
  },
  {
    id: 'coherent-interface-patch', category: 'multi-file-efficiency',
    instruction: 'Rename the public user field and greeting keyword parameter from label to name across core.py, service.py, contract.json and README.md. Keep display_name and greeting as the function names. greeting(name="Ada") must return "Hello Ada"; the old label-only dictionary must no longer be accepted by display_name. Preserve unrelated.txt exactly. Apply the coherent change, verify it and explain the outcome briefly.',
    files: {
      'core.py': 'def display_name(user):\n    return user["label"]\n',
      'service.py': 'from core import display_name\n\ndef greeting(label):\n    return "Hello " + display_name({"label": label})\n',
      'contract.json': '{"type":"object","required":["label"]}\n',
      'README.md': '# Greeting API\nUser field: label\nExample: greeting(label="Ada")\n',
      'unrelated.txt': untouched,
    },
    oracle: {
      'core.py': 'def display_name(user):\n    return user["name"]\n',
      'service.py': 'from core import display_name\n\ndef greeting(name):\n    return "Hello " + display_name({"name": name})\n',
      'contract.json': '{"type":"object","required":["name"]}\n',
      'README.md': '# Greeting API\nUser field: name\nExample: greeting(name="Ada")\n',
    },
    check: `import sys\nsys.path.insert(0, str(root))\nfrom core import display_name\nfrom service import greeting\nassert greeting(name='Ada') == 'Hello Ada'\nassert display_name({'name':'Lin'}) == 'Lin'\ntry:\n    display_name({'label':'old'})\nexcept KeyError:\n    pass\nelse:\n    raise AssertionError('old label-only input still accepted')\nassert json.loads((root/'contract.json').read_text()) == {'type':'object','required':['name']}\nreadme = (root/'README.md').read_text()\nassert 'User field: name' in readme and 'greeting(name="Ada")' in readme\nassert 'label' not in readme\nassert (root/'unrelated.txt').read_text() == ${JSON.stringify(untouched)}`,
  },
];
