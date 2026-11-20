# Open air: sources

**No recordings or samples were downloaded or used.** Every sound in `out/` (drums, bells,
pads, bass, lead, risers, interface sounds, reverb) is synthesised from scratch by the code in
this folder (`dsp.py`, `inst.py`, `score.py`). Nothing was sent to any outside service.

Software used to run the code (tools, not content; none of their output carries a licence
condition):

| Package | Version | Licence | Where from |
|---|---|---|---|
| numpy | 2.5.5 | BSD-3-Clause | https://pypi.org/project/numpy/ |
| scipy | 1.18.1 | BSD-3-Clause | https://pypi.org/project/scipy/ |
| soundfile | 0.14.0 | BSD-3-Clause | https://pypi.org/project/soundfile/ |
| pyloudnorm | 0.2.0 | MIT | https://pypi.org/project/pyloudnorm/ |
| numba / llvmlite | 0.68.1 / 0.50.0 | BSD-2-Clause | https://pypi.org/project/numba/ |

Techniques are standard published ones (PolyBLEP oscillators, Simper's zero-delay state-variable
filter, RBJ cookbook EQ, six-square-wave analogue hi-hat recipe, synthetic convolution reverb);
no third-party code was copied.
