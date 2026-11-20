# Sources and licences: "Many hands"

Every recorded sound used is **CC0 1.0 (public domain dedication)**: free for commercial use, no
attribution required, no share-alike. Credits below are given as courtesy. Nothing with an unclear,
non-commercial or share-alike licence was used. Everything else (the clapping crowd, the hummed and
"ooh" voices, the bass, the 808-style kick, the marker-pen stroke, all reverbs and delays) is
synthesised from scratch in `src/` and owned outright.

`src/fetch.py` holds the exact file list and downloads it into `samples/` (not committed, 48 MB).

## Versilian Studios: VSCO 2 Community Edition

- Repository: https://github.com/sgossner/VSCO-2-CE (files fetched from `raw.githubusercontent.com/sgossner/VSCO-2-CE/master/...`)
- Licence: CC0 1.0 Universal, stated in the repository's `LICENSE` file (checked 2026-11-20)
- Credit (courtesy): Versilian Studios / Sam Gossner, "VSCO 2 Community Edition"

| Used as | Files |
|---|---|
| Plucked strings (the main "hand" playing the tune) | `Strings/Harp/KSHarp_{A2,A4,A6,B1,B3,B5,C3,C5,D2,D4,D6,E3,E5,F2,F4,F6,G3,G5}_mf.wav`, `KSHarp_G1_mp.wav` |
| Marimba (the second player) | `Percussion/Marimba/Marimba_hit_Outrigger_{B2,B4,C2,C4,C6,F3,F5,G2,G4}_loud_01.wav` |
| Hand drum | `VSCO 1 Percussion/drums/other/ethnic/giant/hand/EthnicLargeHand_hit_{f_1,f_2,mp_1,mp_2,mp_3,p_1,pp_1,pp_2}.wav` |
| Conga (muted) | `VSCO 1 Percussion/drums/other/ethnic/congo/muted/ethnic{High,Low}_hit_{f_1,mp_1}.wav` |
| Bongos | `VSCO 1 Percussion/drums/other/Bongos/{High,Low}Bongo{1,2}.wav` |
| Foot stomp (felt-muted bass drum) | `VSCO 1 Percussion/drums/bass/bdrum_muted_{ff_1,fff_1,mf_1,mp_1,mp_2,pp_1}.wav` |
| Shaker | `VSCO 1 Percussion/varWood/Camo's Shaker/shake{1..8}.wav` |

## Sonic Pi bundled samples

- Repository: https://github.com/sonic-pi-net/sonic-pi/tree/main/etc/samples (files fetched from `raw.githubusercontent.com/sonic-pi-net/sonic-pi/main/etc/samples/...`)
- Licence: CC0 1.0, stated in that folder's `README.md`: "All other samples in this directory are
  from http://freesound.org and have also been placed in the public domain via the Creative Commons
  0 License" (checked 2026-11-20)

| Used as | File | Original recording |
|---|---|---|
| Finger snap | `perc_snap.flac` | freesound.org/people/SoundCollectah/sounds/109400 |
| Finger snap (second person) | `perc_snap2.flac` | freesound.org/people/Peram/sounds/158615 |

## Software (not shipped in the audio)

numpy, scipy, soundfile, pyloudnorm (BSD/MIT licences), used only to render.
