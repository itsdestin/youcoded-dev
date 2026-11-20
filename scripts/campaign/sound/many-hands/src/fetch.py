"""Download the public-domain (CC0) samples "Many hands" is built from.

WHY a manifest instead of committed audio: the sources are large and already
hosted publicly under CC0; anyone can re-fetch the exact same files, and
SOURCES.md lists every one with its licence.
"""
import os
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLES = os.path.join(HERE, "..", "samples")

VSCO = "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/"
SPI = "https://raw.githubusercontent.com/sonic-pi-net/sonic-pi/main/etc/samples/"

HARP = ["A2_mf", "A4_mf", "A6_mf", "B1_mf", "B3_mf", "B5_mf", "C3_mf", "C5_mf",
        "D2_mf", "D4_mf", "D6_mf", "E3_mf", "E5_mf", "F2_mf", "F4_mf", "F6_mf",
        "G1_mp", "G3_mf", "G5_mf"]
MARIMBA = ["B2", "B4", "C2", "C4", "C6", "F3", "F5", "G2", "G4"]

MANIFEST = []  # (local name, url)
for h in HARP:
    MANIFEST.append((f"harp/{h}.wav", VSCO + f"Strings/Harp/KSHarp_{h}.wav"))
for m in MARIMBA:
    MANIFEST.append((f"marimba/{m}.wav",
                     VSCO + f"Percussion/Marimba/Marimba_hit_Outrigger_{m}_loud_01.wav"))
P1 = "VSCO 1 Percussion/"
for f in ["HighBongo1", "HighBongo2", "LowBongo1", "LowBongo2"]:
    MANIFEST.append((f"bongo/{f}.wav", VSCO + P1 + f"drums/other/Bongos/{f}.wav"))
for f in ["EthnicLargeHand_hit_f_1", "EthnicLargeHand_hit_f_2", "EthnicLargeHand_hit_mp_1",
          "EthnicLargeHand_hit_mp_2", "EthnicLargeHand_hit_mp_3", "EthnicLargeHand_hit_p_1",
          "EthnicLargeHand_hit_pp_1", "EthnicLargeHand_hit_pp_2"]:
    MANIFEST.append((f"handdrum/{f}.wav", VSCO + P1 + f"drums/other/ethnic/giant/hand/{f}.wav"))
for f in ["ethnicHigh_hit_f_1", "ethnicHigh_hit_mp_1", "ethnicLow_hit_f_1", "ethnicLow_hit_mp_1"]:
    MANIFEST.append((f"conga/{f}.wav", VSCO + P1 + f"drums/other/ethnic/congo/muted/{f}.wav"))
for f in ["bdrum_muted_ff_1", "bdrum_muted_fff_1", "bdrum_muted_mf_1", "bdrum_muted_mp_1",
          "bdrum_muted_mp_2", "bdrum_muted_pp_1"]:
    MANIFEST.append((f"stomp/{f}.wav", VSCO + P1 + f"drums/bass/{f}.wav"))
for i in range(1, 9):
    MANIFEST.append((f"shaker/shake{i}.wav", VSCO + P1 + f"varWood/Camo's Shaker/shake{i}.wav"))
for f in ["perc_snap", "perc_snap2"]:
    MANIFEST.append((f"spi/{f}.flac", SPI + f + ".flac"))


def main():
    got = 0
    for local, url in MANIFEST:
        dest = os.path.join(SAMPLES, local)
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            continue
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        q = urllib.parse.quote(url, safe=":/")
        req = urllib.request.Request(q, headers={"User-Agent": "sample-fetch/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(dest + ".part", "wb") as f:
            f.write(r.read())
        os.replace(dest + ".part", dest)
        got += 1
    print(f"samples ready ({got} downloaded, {len(MANIFEST)} total)", file=sys.stderr)


if __name__ == "__main__":
    main()
