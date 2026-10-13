#!/usr/bin/env python3
# Fires ONE mouse-wheel click through the X server's XTEST extension (a real input event, the same path a
# physical wheel takes into the browser), at an exact wall-clock moment.
# usage: xwheel.py <display> <screen_x> <screen_y> <button 4=up|5=down> <fire_at_epoch_ms> [ctrl 0|1]
# WHY exists: Chrome's DevTools input injection turned out to be held back until the page's main thread
# was free in every mode (even with a passive listener), so it cannot tell a deferred scroll from an
# immediate one. Real X input does not have that coupling. See scroll-deferral.mjs.
import ctypes, sys, time
disp, x, y, btn, at = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), float(sys.argv[5])
ctrl = len(sys.argv) > 6 and sys.argv[6] == '1'
X = ctypes.CDLL('libX11.so.6'); T = ctypes.CDLL('libXtst.so.6')
X.XOpenDisplay.restype = ctypes.c_void_p
d = X.XOpenDisplay(disp.encode())
if not d: sys.exit('cannot open display')
X.XKeysymToKeycode.restype = ctypes.c_uint
T.XTestFakeMotionEvent(ctypes.c_void_p(d), 0, x, y, 0); X.XFlush(ctypes.c_void_p(d))
kc = X.XKeysymToKeycode(ctypes.c_void_p(d), 0xffe3)  # Control_L
wait = at / 1000.0 - time.time()
if wait > 0: time.sleep(wait)
if ctrl: T.XTestFakeKeyEvent(ctypes.c_void_p(d), kc, 1, 0)
T.XTestFakeButtonEvent(ctypes.c_void_p(d), btn, 1, 0); T.XTestFakeButtonEvent(ctypes.c_void_p(d), btn, 0, 0)
if ctrl: T.XTestFakeKeyEvent(ctypes.c_void_p(d), kc, 0, 0)
X.XFlush(ctypes.c_void_p(d)); X.XCloseDisplay(ctypes.c_void_p(d))
print('fired', time.time() * 1000)
