"""Make it mine, 15 s social cut-down (round 10, key "own15"): two feel sketches, A and B.

THE PICTURE (cut here from round4/make-it-mine.mp4 with ffmpeg, one 128 bpm grid, a bar = 1.875 s,
every cut on a bar line; 450 frames at 30 fps; the cut command is CUT below):
   0.000  bar 1  "can i change how this whole thing looks?" typed and sent (source 0-5 s at 1.34x)
   3.733  bar 3  THE TURN: the app turns to rainy anime Tokyo (source 5.0 s); "actuallyyy gimme
                 desert. i'm an ASU boy" typed and sent (source 5-10.5 s at 0.98x)
   9.367  bar 6  THE PAYOFF: the desert theme (source 10.5 s; held to 14.0 s at 0.94x)
  13.100  bar 8  the name (source 56.0 s: a blank frame, the logo from 13.133 s), held to 15.0 s
The cuts are at the frame at or just before each bar line (3.75, 9.375 and 13.125 s are not whole
frames at 30 fps); with the music 0.08 s after the picture they are heard 88-117 ms after the cut.

WHY 128 bpm: a quick, bright feed cut of the film he said needed "the busier/higher-energy nature
of this specific video" (A2); 120 was the full film's tempo, so this is a step faster, and at 128
the two theme changes, which are 5.5 s apart in the source, are three bars apart (5.625 s) with
the middle stretch played at 0.98x, i.e. nearly as filmed. WHY one 2-beat bar before the ending
(odd=2 at bar 7): the short ending's two pick-up beats then land the name on bar 8's line, the
same grid the picture is cut on, with 1.875 s of ring after it.

THE HARMONY (written, the tune fitted to it, every held tune note a chord tone):
   bars 1-2  Ebmaj9           the question: home key, the figure and pad alone
   bars 3-4  Cm11 | Cm9       rainy Tokyo: the relative minor (the turn), the tune's first phrase
   bar 5     Bb9sus           "actually...": the pivot that wants to go home
   bar 6     Ebmaj9           the desert: arrival, the tune's climb to its top note B-flat 5
   bar 7     (2 beats, keeps Ebmaj9)  then the short ending and the quiet logo (B-flat, G, F)
Every change keeps notes of the last chord (Ebmaj9/Cm11 share Eb G Bb; Cm9/Bb9sus share Bb Eb C;
Bb9sus/Ebmaj9 share Bb Eb F).

A and B are the same notes; B is gently swung (the owner liked both pulses, E2 C and D, and has
not said which suits a quick film).
"""
import recipes as R
from films import Film
from motif import write

KEY = "own15"
SRC = "/home/destin/Documents/youcoded-campaign/round4/make-it-mine.mp4"
# The picture as cut (kept here so the cut can be rebuilt; frames: 112 + 169 + 112 + 57 = 450).
# WHY setpts by frame counts: each segment ends on the frame at or before its bar line
CUT = ("ffmpeg -i " + SRC + " -filter_complex \""
       "[0:v]trim=start=0:end=5,setpts=(PTS-STARTPTS)*112/150,fps=30,trim=end_frame=112,setpts=PTS-STARTPTS[a];"
       "[0:v]trim=start=5:end=10.5,setpts=(PTS-STARTPTS)*169/165,fps=30,trim=end_frame=169,setpts=PTS-STARTPTS[b];"
       "[0:v]trim=start=10.5:end=14,setpts=(PTS-STARTPTS)*112/105,fps=30,trim=end_frame=112,setpts=PTS-STARTPTS[c];"
       "[0:v]trim=start=56:end=58,setpts=PTS-STARTPTS,fps=30,trim=end_frame=57,setpts=PTS-STARTPTS[d];"
       "[a][b][c][d]concat=n=4:v=1:a=0[v]\" -map [v] -an -c:v libx264 -crf 16 -pix_fmt yuv420p own15-picture.mp4")

BPM, ODD, ODD_AT = 128.0, 2, 7
BAR = 4 * 60.0 / BPM                              # 1.875 s
LAND = R.land_after(6, BPM, "short", odd=ODD)     # 6 bars + 2 beats + the 2 pick-up beats = 13.125 s

BRIEF = R.Brief("type-only", 15.0, ("quick", "bright", "playful", "warm"), "subtle",
                moments=[(2 * BAR, "turn: Tokyo"), (5 * BAR, "peak")], logo_at=LAND,
                picture=[(0.0, "can i change how this whole thing looks?"), (1.13, "sent"),
                         (3.733, "rainy anime Tokyo"), (8.57, "actuallyyy gimme desert. i'm an ASU boy"),
                         (9.367, "the desert"), (13.1, "youcoded (name)"), (15.0, "end")])

# THE TUNE, two 2-bar phrases on the two theme changes (about two-thirds of the body), written
# first and the chords above chosen to hold every held note.
# Phrase 1 (bar 3, the Tokyo cut): the cell itself, B-flat G F, F held over Cm11 (its 11th), then
# a falling answer that settles on E-flat held over Cm9 (its third): the rainy, minor turn.
# Phrase 2 (bar 5, "actually..."): climbs F G to A-flat held over Bb9sus (its 7th), then B-flat 5
# held over the desert's Ebmaj9 (its 5th), the top note of the piece on the payoff; the quiet logo
# (B-flat, G, F) answers it after the 2-beat breath.
# WHY no tune in bars 1-2: the question is asked over the bed alone, so the tune arrives WITH the
# first change of look rather than being laid over the typing.
TUNE = [(3, write("Bb4/1 G5/1 F5/2 | Eb5/1 D5/1 Eb5/2", label="tokyo")),
        (5, write("F5/1 G5/1 Ab5/2 | Bb5/3 G5/1", label="desert"))]
CHORDS = "Ebmaj9 Ebmaj9 Cm11 Cm9 Bb9sus Ebmaj9"


def piece(name, swing):
    # WHY everything else default (v4): the chord-following figure at touch 0.28, the soft pad at
    # pad_level -4, the woven tune on the bed's own piano, one room, the quiet logo
    return R.type_short(
        name, 15.0, land=LAND, bpm=BPM, odd=ODD, odd_at=ODD_AT, rit=1.0, seed=12, brief=BRIEF,
        chords=CHORDS, tune=TUNE, logo="piano", owner_over={"swing": swing},
        notes=f"own15 (Make it mine, 15 s feed cut), feel {'B: gently swung' if swing == 'gentle' else 'A: straight'}")


FILMS = [Film("own15-a", piece("own15-a", "straight"), picture=BRIEF.picture, copy_to=None),
         Film("own15-b", piece("own15-b", "gentle"), picture=BRIEF.picture, copy_to=None)]
