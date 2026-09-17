// Violation fixture for preload-no-drag-model-decision (fires 6 times): a preload
// that still reports the facts but also names a model (a string and, "html-drag",
// this comment), imports and names the decision, and starts a drag from main.
import { chooseTearOffModel } from './session-drag-model';
declare const webContents: { startDrag(item: unknown): void };
export const bridge = {
  platformFacts: {
    platform: 'linux',
    wayland: true,
  },
  model: 'html-drag',
  dragHandoff: () => webContents,
};
void chooseTearOffModel;
