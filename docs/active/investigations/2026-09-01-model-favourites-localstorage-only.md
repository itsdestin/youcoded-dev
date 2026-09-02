---
date: 2026-09-01
status: active
type: investigation
topic: Model favourites live only in this device's localStorage, yet they are the picker's default view
---

# Model favourites are per-device, but the picker opens on them

**Symptom.** On a second device the model picker opens empty (until you type) with no hint why — the favourites you starred on the first device aren't there.

**Mechanism.** `ModelPicker` opens showing favourites and nothing else (Destin's chosen design, youcoded#279). Favourites are read and written under the `localStorage` key `youcoded-model-favorites` in `youcoded/desktop/src/renderer/components/model/ModelPicker.tsx`. Nothing syncs that key: the Conversation Store syncs per-*conversation* state, and there is no lane yet for per-*user* state, which is what favourites are.

<!-- claim: {"path": "youcoded/desktop/src/renderer/components/model/ModelPicker.tsx", "contains": "FAV_KEY = 'youcoded-model-favorites'"} -->

**Fix shape.** Needs a real synced per-user channel (a small Personal-space file or a new store lane); until then, at minimum the empty default view should say why it is empty on this device.

**History.** Added 2026-07-31 (from youcoded#279). Re-checked 2026-09-01: still localStorage-only; no commit touched the key since.
