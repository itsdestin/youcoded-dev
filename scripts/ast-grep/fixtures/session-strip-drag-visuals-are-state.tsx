// Violation fixture: render reads the ref.
declare const isDragging: { current: boolean };
export const isBeingDragged = isDragging.current;
