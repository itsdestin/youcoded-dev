"""Make it mine, fifth score (round 8, fix pass): one light piano lilt from the first beat to the
name, the tune twice in long notes plus once at the lift, held strings coming and going, one
gentle lift at 46-48 s.

WHY written afresh again: the owner heard round 7 (make-it-mine-r3) as "still too busy/harsh".
The first round-8 score (r4) cured the stop-start but its critic counted MORE attacks than round 7
(197 against 158, a steady 3.5 a second of eighths for 56 s), a glassy, twice-as-hard tune popping
in and out over a muffled bed (the only bright sound in the piece), a pedalled figure stacking 3-4
notes inside a sixth (woolly) and the busiest bar of the piece on the name. This score keeps the
120 bpm grid and halves the motion.

TEMPO: 120 bpm, a bar = 2.0 s. WHY: the picture turns at 14, 30, 46 and 54 s and the name lands at
56 s; every one is a bar line or half-bar, and all 13 hard cuts sit on the 0.5 s beat grid.

THE FOUNDATION (two halves, one bed): a dry (unpedalled) felt-piano figure in quarter notes,
"b - 3 - 2 - 4 -": the bass on beat 1 held under the whole bar, then one chord tone on each of
beats 2, 3 and 4 (4 attacks a bar, 2 a second; r4 had 3.5). Each note rings until the next, so the
piano bed is never more than two notes. Under it, soft held strings from the first beat to the
name, the bed's sustain (alone, this soft piano fades within half a second and the bar swung
10-15 dB; with the strings 2-5 dB). The figure reads each chord, so the harmony moves while the
pattern stays. In C every second bar turns the figure over ("b - 4 - 3 - 2 -"). At the lift it
fills in with a few eighths (5-6 a bar) and its register opens (fig_floor B-flat 3 -> E-flat 4),
then thins to quarters before the hold. All 13 hard cuts land on its beats.

THE PICTURE and what changes (one thing per turn):
  0-14   A the look (bars 1-7): the figure and strings for three bars, then the tune's cell in long
         notes from 6 s (B-flat, G, F, then E-flat C B-flat, tied over), settling in.
  14-30  B the home (bars 8-15): the soft sub enters under the bass (the one change). The tune's
         second phrase, in half notes, at 20-28 s, rising to A-flat and hanging open on F.
  30-46  C the money (bars 16-23): no tune, the chords darker, the figure turning over every
         second bar (the one change): the valley.
  46-54  D the payoff (bars 24-27): THE LIFT, staged by a 3 s ramp and a shape: the figure fills in
         and opens upward, the tune climbs to C6 at 48.0 (the peak) in long notes and falls by step
         to A-flat, tied over into the hold.
  54-56  a two-beat held chord, then the short ending (no sigh): the logo's pick-ups, the name at 56.

Layers: figure + strings, or figure + strings + tune. The sub is weight from 14 s (not counted).
"""
from films import Film
from motif import write
from score import Piece, Section as S
import score as _score

NAME = "make-it-mine-r5"

# WHY one small, EVEN shine on every piano note of THIS piece instead of the default (tune 0.08,
# figure 0): r4's tune was the only bright sound, lifting the energy above 4 kHz from about -80 to
# -32 dB at each entry over a muffled bed (its critic: the likeliest "harsh"). Render 2 of r5 with
# no shine at all measured 8-16 kHz at -49.7 dB (the mix floor is -38: muffled). A little of the
# same shimmer on the bed and the tune keeps the top even, so nothing glassy switches in and out.
# Scoped by the piece's name, so every other piece renders exactly as before; the guard keeps a
# re-import from wrapping twice.
SHINE_MIM = {"lead": 0.03, "piano": 0.03}
if not getattr(_score.Band.piano, "_mim_shine", False):
    _orig_piano = _score.Band.piano

    def _piano(self, bus, *a, **k):
        # WHY the logo keeps the default shine: it is the brand's three notes, the same in every
        # film, and its landing is measured from the lead track's attack (without the shine's
        # crisp onset the name was heard 13 ms late, past the 10 ms limit)
        logo = (k.get("canon") or ("",))[0] == "logo"
        if getattr(self.piece, "name", "") != NAME or bus not in SHINE_MIM or logo:
            return _orig_piano(self, bus, *a, **k)
        had, saved = bus in _score.SHINE, _score.SHINE.get(bus)
        _score.SHINE[bus] = SHINE_MIM[bus]
        try:
            return _orig_piano(self, bus, *a, **k)
        finally:
            if had:
                _score.SHINE[bus] = saved
            else:
                del _score.SHINE[bus]
    _piano._mim_shine = True
    _score.Band.piano = _piano

# WHY quarters and not even eighths: r4's eighths were steady but "busy" in count (3.5 attacks a
# second for 56 s); quarters are 2 a second and still a pulse that never stops. WHY not the 3+3+2
# lilt tried first (1.5 a second): its 0.75 s gaps let this fast-fading piano drop 6-7 dB within a
# second after every downbeat (level-rate failed at 12, 44 and 52 s); even quarters keep the level
# within 2-5 dB a bar. WHY C turns the figure over every second bar: not a literal loop, and it is
# the one change at the money. (The names LILT/LILT_PLAIN are kept from the first try.)
LILT = ["b - 3 - 2 - 4 -", "b - 4 - 3 - 2 -"]
LILT_PLAIN = ["b - 3 - 2 - 4 -"]
# WHY the held strings under EVERY section (render 1 of r5): this soft piano speaks and fades
# within half a second, so the sparse lilt alone swung 10-15 dB inside each bar (14.8 dB at 3 s,
# 14.4 at 36 s: a pulse of bumps and holes); with the strings under it the same bars swung 2-5 dB.
# The strings are the bed's sustain, the lilt its motion: one foundation, two halves.
# WHY unpedalled: pedalled to the bar line, r4 stacked 3-4 notes in a sixth (150-600 Hz 1.9 dB
# heavier than round 7); dry, each note rings to the next one and no further
COMMON = dict(bpm=120, accomp="figure", pedal=False, fig_floor="Bb3", fig_touch=0.30, answer=False)

# A: the cell in long notes from bar 4 (6.0 s), four bars, then the turn
A_TUNE = write("r/4 | r/4 | r/4 | "
               "Bb4/2 G5/2 | "                    # bar 4 (6.0 s): you-co-
               "F5/4 | "                          # bar 5: -ded, held
               "Eb5/2 C5/1 Bb4/1 | "              # bar 6: falling home
               "~/4")                             # bar 7: B-flat tied on, resting
# WHY B-flat arrives on beat 4 and is tied over, not struck on bar 7's downbeat: struck there with
# the bass, it made the biggest one-second swing of the piece (6.7-7.1 dB at 12.0 s) as it faded
# B: one rising phrase in half notes at 20-28 s, hanging open on F
B_TUNE = write("r/4 | r/4 | r/4 | "
               "Eb5/2 F5/2 | "                    # bar 11 (20.0 s, the home page)
               "G5/3 Eb5/1 | "                    # bar 12
               "Ab5/2 G5/2 | "                    # bar 13: up to A-flat, the highest yet
               "F5/4 | "                          # bar 14: hangs open on F
               "r/4")
# D: climbs to the saved top note at the peak (48.0 s) in long notes, falls to F
D_TUNE = write("Eb5/2 G5/2 | "                    # bar 24 (46.0): the climb, under the lift
               "C6/4 | "                          # bar 25 (48.0, THE PEAK): C6, saved for here
               "Bb5/2 Ab5/2 | "                   # bar 26: falling by step over A-flat/B-flat
               "~/4")                             # bar 27: A-flat tied on, into the held chord
# WHY A-flat tied over the bar line, not a new whole F: a whole F already closes A and B
# (tune-bar-repeats); A-flat is common to the B-flat 11, F minor, the hold and the ending's B-flat
# sus, so it hangs open; and tied, bar 27's downbeat has no fresh tune attack, so the last bar
# before the hold is lighter (r5 render 4: a struck A-flat there made an 8 dB swing within a second)

PIECE = Piece(
    NAME, 60.0, land=56.0, peak=48.0, seed=41, logo="quiet", loudness=-16.0,
    # WHY ending="short": r4's sigh replayed the peak C6 on the logo bar (20 notes, the
    # busiest bar, on the name); the short ending is the held B-flat sus under the logo's pick-ups
    # only. WHY rit 0.97 (a 3 % ease over the last two beats): at 1.0 the G pick-up's damper fell
    # 8 ms before the name and the landing measured 13 ms late (limit 10); at 0.97, 2 ms.
    # WHY tone +3 and air 18: with the tune's glassy shine gone the mix measured 8-16 kHz at -49.7
    # dB (the floor is -38, muffled); now -37.1, and above 4 kHz moves only -36..-28 per 2 s
    touch=0.85, rit=0.97, tone=3.0, air=18.0, ending="short",
    # WHY the tune 4 dB down: in a bed it is one voice of two, not a soloist. WHY the strings +5 dB:
    # they carry the bed's sustain between the piano's quarters. WHY the sub -5.5: weight without a
    # thump on each downbeat (40-80 Hz sits at -12.0, the floor)
    mix={"lead": -4.0, "sub": -5.5, "bowed": 5.0},
    notes="Make it mine, fifth score: a dry piano figure in quarter notes over soft held strings from the "
          "first beat to the name, the tune's cell in long notes at 6 s, a half-note phrase at the home, "
          "the sub in at the home, one staged lift at 46-48 s to C6, a short quiet ending.",
    sections=[
        S("hopeful", 7, **COMMON, figure=LILT_PLAIN, chords=[["Eb"], ["Abmaj7"], ["Cm7"], ["Eb/G"], ["Bbsus"], ["Abmaj7"], ["Gm7"]],
          tune=[A_TUNE], lead=0.7, drop=("air", "sub"), level_db=-2.0, into="flow",
          label="A the look"),
        S("hopeful", 8, **COMMON, start=14.0, figure=LILT_PLAIN,
          chords=[["Eb"], ["Eb/G"], ["Abmaj7"], ["Fm7"], ["Cm7"], ["Abmaj7"], ["Bbsus"], ["Bb"]],
          tune=[B_TUNE], lead=0.7, drop=("air",), level_db=-1.0, into="flow", label="B the home"),
        S("hopeful", 8, **COMMON, start=30.0, figure=LILT,
          chords=[["Cm7"], ["Cm7/Bb"], ["Abmaj7"], ["Abmaj7"], ["Fm7"], ["Fm/Ab"], ["Gm7"], ["Bbsus"]],
          drop=("air",), level_db=-2.0, into="flow", label="C the money"),
        # WHY the lift is several things on one bar line, staged by a 3 s ramp and a shape: the one
        # place the guide allows it; register, a few eighths, the tune and level grow together
        S("hopeful", 4, **{**COMMON, "fig_floor": ("Bb3", "Eb4")}, start=46.0,
          # WHY the last bar back to plain quarters: the lift's figure settles before the hold and
          # the logo, so the name lands into space (r4's busiest bar was on the name)
          figure=["b - 3 - 2 4 3 -", "b - 3 2 4 - 3 -", "b - 3 2 4 3 2 -", "b - 3 - 2 - 4 -"],
          chords=[["Eb"], ["Abmaj7"], ["Ab/Bb"], ["Fm7"]], tune=[D_TUNE], lead=0.75, drop=("air",),
          level_db=0.0, ramp=3.0, ramp_at="after", shape=[(0, 0.95), (4, 1.08), (10, 1.05), (16, 1.08)],
          into="hold", hold=2.0, label="D the payoff"),
    ])

FILM = Film(NAME, PIECE,
            picture=[(0.0, "the look"), (5.0, "anime Tokyo"), (10.5, "Devil's Garden"), (14.0, "the home"),
                     (20.0, "home page"), (30.0, "the money"), (43.0, "the email"), (46.0, "plain app alone"),
                     (47.0, "plain and finished app"), (50.0, "stop waiting for updates."),
                     (52.7, "make anything you can imagine, just by asking."), (56.0, "youcoded (name)"),
                     (60.0, "end")],
            copy_to=None)
