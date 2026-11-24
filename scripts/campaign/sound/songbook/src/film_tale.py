"""The fairytale, narrated stretch, first score: resigned and small under her words, one turn to
wonder on "wonderful", the tune's cell rising into its top note only once she has stopped.

THE STRETCH (settled here; the brief's "And we all" -> "happened" + 3 s is only ~17 s):
  film 5.55 s -> 36.55 s of round6/fairytale-book.mp4 (voice-take1-lily.wav starts at film 0).
  Piece time = film time - 5.55. She speaks from "They decided..." (piece 0.38) through
  "...something truly wonderful happened." (piece 19.86); "wonderful" lands at piece 18.79.
  In the muxed test the voice is faded out before "Blinded..." (film 25.81), so the music's
  statement and the logo play in the space after her last word.

HER PAUSES (piece s; a melody note in F3-E5 may only START inside one):
  5.51-5.91 | 15.43-15.83 | after 19.86 (8.29-8.57 is under 0.3 s, so the speech map joins it). Everything else she is speaking.
  So under her words the tune lives at F5 and above (a small, high music-box voice), the
  counter-line lives at E3 and below (cello), and the in-range notes are placed in her breaths.

THE ARC (6 bars at 76.6 bpm = 3.13 s a bar, then the turn, then the logo):
  bar  time   words                          chords          tune (how the cell is treated)
  1    0.0    They decided what...           Cm              rests (the piano's chord alone; bass C held)
  2    3.1    ...cost, ...personal data.     Cm7/Bb          Bb4 in her breath (5.68): a pick-up...
  3    6.3    And we all... accepted it.     Abmaj7          ...G5, then F5 held, left hanging: the cell,
                                                             slowed and broken by her breath
  4    9.4    ...subscribe ... own nothing   Eb/G            a sigh high above her: Ab5 -> G5 (soft)
  5    12.5   ...cost of convenience.        Fm7             the sigh a step lower: G5 -> F5 (softer)
  6    15.7   However, recently...           Ab/Bb           Eb5 in her breath (15.66), held: THE DROP
                                                             (bass alone + one tune note + a cello pedal)
  7    18.8   wonderful happened.            Db | Eb/G       Db blooms ON "wonderful" (the one borrowed
                                                             chord, "sun through clouds"); after "happened."
                                                             the cell rises: Bb4 G5 F5
  8    21.9   (she has stopped)              Cm7 | Eb/Bb     PEAK: the cell a fourth higher (tune bar 2,
                                                             Eb5 C6 Bb5 G5): C6, the top, heard here first
  end  25.1                                  Ab | Bbsus      the sigh C6 Bb5, the logo; name at 28.45 s
  Register: under her the tune never goes above Ab5; C6 is kept for bar 8.
  Loudness: inward and -6 dB under her (the level plan), the drop in bar 6, then the level plan
  ramps back up across "wonderful" (3 s), plus the lift and a "grow" shape: the peak arrives.
  Harmony: a bass falling one step a bar (C Bb Ab G F | Bb) under her resignation, then
  Db -> G -> C -> Bb -> Ab -> Bb -> Eb climbing out. The tune rests in bar 1 and nearly all of
  bar 6; the bass leaves the root by suspension in bar 2 (C held under Cm7/Bb).
"""
import os

from films import Film, speech_from_words
from motif import motif, write, rest
from score import Piece, Section as S

HERE = os.path.dirname(os.path.abspath(__file__))
WORDS = os.path.normpath(os.path.join(HERE, "..", "..", "..", "film", "src", "round2", "take1-words-lily.json"))
T0 = 5.55          # film second where this stretch starts (just after "...technology.")
T_END_VOICE = 25.5  # film second after "happened." where the voice is faded out for the test
BPM = 76.6         # WHY 76.6: six bars from 0 to "wonderful" (piece 18.79) exactly, a hopeful-mood speed

# ---- the tune, bar by bar (see the arc above)
# WHY the opening bar's pitches (Bb G F Eb) spread over her breaths instead of played as written:
# the brand is heard, but small and interrupted, the way a thought is when someone is talking.
# WHY F5 is left hanging (no Eb5 after it): her breath after "accepted it." is 0.28 s, which the
# speech map joins into one span, so a note in her range there would start "while she speaks";
# the unresolved F5 also suits "we all just accepted it" (a question left open).
OPENING = rest(1) + write("r/3.25 Bb4/0.75@0.8 | G5/1@0.7 F5/3@0.65")
# WHY sighs a step lower each time, all at F5 or above: resignation is a line that gives up
# a step at a time; above E5 they never start inside her voice's range while she talks.
# (second sigh softer than the first: the first render's loudest moment under her was the bar-5 G5)
SIGHS = write("r/2 Ab5/1@0.75 G5/1@0.6 | r/2 G5/1@0.6 F5/1@0.5 | Eb5/4@0.65")
# WHY the cell's two forms in sequence (Bb4 G5 F5, then Eb5 C6 Bb5 G5 = the tune's own bar 2):
# the turn is the cell rising a fourth into the top note, the first time C6 is heard.
TURN = write("r/1.5 Bb4/0.5@0.8 G5/1 F5/1@0.9") + motif("bar2").touch(1.0, 1.12, 0.95, 0.9)   # WHY Bb4 softer: a pick-up leaning into G5; C6 touched harder: the top note is the peak, not the Bb5 after it

# ---- the low line: the bass falls a step a bar; the cello sings a slow inner line below her
OPENING_BASS = write("C2/4 | C2/2 Bb1/2 | Ab1/4")     # WHY C held into Cm7/Bb: a suspension, the bass leaves the root
# Below F3, so never in her range. WHY a slow stepwise descent Eb D C Bb Ab: a second, inner
# line of resignation under the sighs, moving on beats 1 and 4 while the sighs speak on 3 and 4,
# on notes the still piano chords do not double (the first version doubled the piano's Bb2/Ab2).
# It ends on Ab2, the fifth of the D-flat that arrives on "wonderful", so the turn grows out of a
# note already sounding; 3.5 beats, not 4 (a 4-beat bowed note re-attacked inside itself at 18.55 s).
CELLO = write("Eb3/3@0.8 D3/1@0.7 | C3/3@0.8 Bb2/1@0.7 | Ab2/3.5@0.7 r/0.5")

SPEECH = speech_from_words(WORDS, T0, T_END_VOICE, start_at=0.0)

PIECE = Piece(
    "fairytale-score-r1", 31.0, land=28.45, peak=21.92, seed=61, loudness=-16.0, speech=SPEECH,
    notes="Fairytale narrated stretch (film 5.55-36.55 s): resigned and small under her words, the "
          "cell spread over her breaths, falling sighs above her, the drop on 'However, recently', D-flat "
          "on 'wonderful', the cell rising into C6 once she stops, the logo at 28.45 s.",
    sections=[
        S("hush", 3, bpm=BPM, tune=[OPENING], chords=[["Cm"], ["Cm7/Bb"], ["Abmaj7"]], bass=OPENING_BASS,
          narration=True, answer=False, lead=0.8, shape="inward",
          label="what they decided (small)"),
        # WHY still "hush" (the still piano), not the rolling piano at low density: thinned to 40 % the
        # rolling pattern became one note ticked on every beat (C3 C3 C3, Bb2 Bb2 Bb2), and it crept the
        # level up under her. The rolling piano, the sub and the air are all saved for "wonderful", so
        # the turn changes texture, harmony, register and loudness at once.
        S("hush", 3, bpm=BPM, tune=[SIGHS], chords=[["Eb/G"], ["Fm7"], ["Ab/Bb"]],
          counter=CELLO, counter_voice="cello", vary={3: "bass"}, narration=True,
          answer=False, lead=0.8, into="flow",
          # WHY a sudden step down at bar 6 ("However, recently..."): the drop before the lift must
          # be heard as quieter, not only thinner (the first render had bar 6 0.4 dB LOUDER than bar 5)
          shape=[(0, 0.85), (8, 0.85), (8, 0.62), (12, 0.66)],
          label="we accepted (sighs, then the drop)"),
        S("hopeful", 2, bpm=BPM, start=18.79, tune=[TURN], chords=[["Db", "Eb/G"], ["Cm7", "Eb/Bb"]],
          # WHY held low for the first beat and a half: she is still saying "wonderful happened";
          # the bloom belongs to the moment she stops (beat 1.4), then grows into the peak bar
          # WHY level_db=-6 (the same as under her): the level plan ramps over 3 s CENTRED on a
          # section change, so a louder level here started rising 1.5 s early, under "something
          # truly", and filled in the drop. The swell now comes from the playing alone.
          level_db=-6.0,
          lift=True, shape=[(0, 0.8), (1.5, 0.84), (4, 1.0), (8, 1.15)], answer=False,
          label="wonderful (the turn and the peak)"),
    ])

FILM = Film("fairytale-score-r1", PIECE,
            picture=[(0.0, "They decided... (corporation, laptop)"), (5.9, "And we all... (i agree stairs)"),
                     (8.6, "We accepted... (subscriptions pile up)"), (15.4, "page turns: the inkwell"),
                     (18.79, "wonderful (the ink turns purple, light warms)"), (20.4, "corporations and the inkwell"),
                     (28.45, "youcoded (name)"), (31.0, "end")],
            copy_to=None)
