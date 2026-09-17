// Violation fixture for buddy-window-move-only-in-place.
class BadManager {
  private notPlace(win: { setPosition: (x: number, y: number) => void }): void {
    win.setPosition(1, 2);
  }
}
