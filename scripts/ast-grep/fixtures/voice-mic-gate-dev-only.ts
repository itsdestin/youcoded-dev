// Violation fixture for voice-mic-gate-uses-workbench-document, branch 2. The
// shipped predicate is named here, so branch 1 stays quiet; the four hits are
// the dev-only predicate in code. Comments naming isWorkbenchMode must NOT fire
// (the retired case deleted both comment kinds before matching).
/* isWorkbenchMode in a block comment — must not fire either. */
declare function isWorkbenchDocument(): boolean;
declare const wb: any;
export const shipped = isWorkbenchDocument;
export const gate = () => !wb.isWorkbenchMode(); // fires once (property_identifier)
export const label = 'isWorkbenchMode'; // fires once (string_fragment)
export class PrivateGate { #isWorkbenchMode = false; // fires once (private_property_identifier, declared)
  open() { return !this.#isWorkbenchMode; } } // fires once (private_property_identifier, read)
