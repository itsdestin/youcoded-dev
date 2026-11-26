"""Make it mine, first-shot score (recipe B): one person customising their app across three short
conversations; a soft bed throughout, the tune rare, one gentle lift at the payoff (46 s)."""
import recipes as R
from cycles import Cycle
from films import Film

# THE PICTURE IS CUT (round4/make-it-mine.mp4, 60 s, 30 fps): its frames are the input.
# WHY the cards at 50.0 and 52.7 s, not the brief's "closing lines 54 s": read off the picture's
# own frames (the two closing cards appear at about 50 and 52.7 s; the name at 56).
# WHY "subtle": the brief asks for light, friendly and soothing with ONE gentle lift.
BRIEF = R.Brief("app-demo", 60.0, ("light", "friendly", "soothing"), "subtle",
                moments=[(14.0, "second conversation"), (30.0, "third conversation"), (46.0, "peak")],
                logo_at=56.0,
                picture=[(0.0, "first conversation: the look"), (14.0, "second conversation: the home"),
                         (30.0, "third conversation: the money"), (46.0, "the payoff"),
                         (50.0, "closing line 1"), (52.7, "closing line 2"), (56.0, "the name")],
                cards=[(50.0, "stop waiting for updates."),
                       (52.7, "make anything you can imagine, just by asking.")])
LAND = BRIEF.logo_at
# Copied from render.sh --brief, fit 1: bpm=104.27, odd=1, odd_at=21, rit=0.85 (the peak +33.9 ms,
# on; the name exact). Bars on this grid: 14 s = bar 7, 30 s = bar 14, 46 s = bar 21 (the 1-beat
# odd bar, 46.03 s), bar 22 at 46.61 s, closing cards in bars 23-24, the name after 23 bars.
BPM, ODD, ODD_AT, RIT = 104.27, 1, 21, 0.85

PIECE = R.app_demo(
    "shot-b", 60.0, land=LAND, bpm=BPM, odd=ODD, odd_at=ODD_AT, rit=RIT, seed=31, brief=BRIEF,
    # WHY these chords: the bright vocabulary, one per 2 bars, every change keeping a note; each
    # conversation starts its own pass (bars 1, 7, 14). The first two passes are home (Eb Cm Ab);
    # bar 13's single Bb9sus is the cadence into the third conversation; the third pass goes a
    # step further out (Cm Ab Fm9 Bb9sus) so the payoff (bar 22) arrives home on Ebmaj9.
    # WHY no name for bar 21: the chord string counts the 4-beat bars only (23 names); the 1-beat
    # odd bar keeps bar 20's chord. Bars 22-24 (the payoff and both closing cards) rest on
    # Ebmaj9, home, until the logo's own cadence.
    chords="Ebmaj9 Ebmaj9 Cm9 Cm9 Abmaj9 Abmaj9 "
           "Ebmaj9 Ebmaj9 Cm9 Cm9 Abmaj9 Abmaj9 Bb9sus "
           "Cm9 Cm9 Abmaj9 Abmaj9 Fm9 Fm9 Bb9sus "
           "Ebmaj9 Ebmaj9 Ebmaj9",
    # WHY: the cell in the first conversation, the cell again in the second (said twice, so it is a
    # theme, not thrown in), no tune in the third (bed and cycles only), and the peak phrase on the
    # payoff. Bar 22, not 21: the odd bar carries no tune, so the phrase starts 0.6 s after the cut.
    tune=[(4, "cell"), (10, "cell"), (22, "from-top")],
    # the recipe's two cycles on co-prime periods (23, 29 half-beats), above C5.
    # WHY cycle2 offset 4 (not the example's 22): it comes in at the payoff, and its only round
    # after 46 s must fall in bars 23-24 with no tune. The tune guard blocks whole 2-beat
    # half-bars up to 3 beats past the peak phrase's last note (to beat 88), so offsets 22, 26
    # and 28 were all left out; 4 puts the round on bar 24's downbeat (51.2 s), under the second card.
    cycles=[Cycle("Bb5/0.5 G5/1", period=23, offset=13, name="cycle1"),
            Cycle("F5/1 D5/1", period=29, offset=4, name="cycle2", touch=0.26)],
    # one change per conversation turn (bar 7 = 14 s, bar 14 = 30 s) and the payoff (bar 21 = 46 s):
    # the first cycle, the sub, then the strings + the second cycle at the peak (16 s apart each)
    changes=[(7, "in", "cycle1"), (14, "in", "sub"), (21, "in", "held"), (21, "in", "cycle2"), (21, "peak")],
    # WHY each line (the dashboard rule: explain an out-of-range gauge, never bend the music)
    explain={"chord-variety": "three short passes, one per conversation (Eb Cm Ab twice, then Cm Ab Fm Bb out to the "
                              "payoff's Eb): each pass is only 3-4 chords, so most 3-chord runs cross a pass boundary "
                              "and read as new; the vocabulary is 5 chords and the first pass returns once",
             "change-plan": "the picture's three turns are 16.0 s apart (14, 30, 46 s); the plan follows them exactly, "
                            "and the bar grid at 104.27 bpm makes it 16.1 s",
             "picture-sync": "the two weight-1 turns (14 and 30 s) fall between beats at the tempo that lands the "
                             "weight-3 payoff and the name; at 30 s the chord change and the sub's 2-bar fade start "
                             "75 ms before the cut",
             "even": "bar 21 is fit_tempo's 1-beat odd bar at the payoff: 1 attack in 1 beat against 5 in a 4-beat "
                     "bar is the bar's length, not a stop in the texture (the pulse keeps its rate through it)",
             "level-rate": "8.2 dB at 21.9 s: the second cell's long landing F5 (21.84 s) rising out of a dip "
                           "between pulse notes that the pad at the plan's -8 dB does not fill (gap-fill 4.6); "
                           "sketch B at pad_level -4 reads 7.0: the owner's A/B"},
    notes="first-shot B: make it mine, recipe B; a conversation per chord pass, the tune twice then once "
          "at the payoff, one gentle lift into 46 s, the quiet logo",
    # WHY v3: made before the unity rebuild (2026-11-25); it renders as it was heard
    style="v3")
FILM = Film("shot-b", PIECE, picture=BRIEF.picture, copy_to=None)
