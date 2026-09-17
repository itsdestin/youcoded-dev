// Violation fixture for no-folders-json-outside-service: a hand-copied folder
// handler that reads the picker's store itself (fires once, on the string).
import path from 'node:path';
import os from 'node:os';
export const foldersFile = path.join(os.homedir(), '.claude', 'youcoded-folders.json');
