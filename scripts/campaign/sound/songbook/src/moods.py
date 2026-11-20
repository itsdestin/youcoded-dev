"""MOODS: presets of the songbook's blocks. A section names a mood and gets all of this; it can
then add or drop single layers, or override any field.

Fields
  form      which form of the chords: "bright" (E-flat major) or "dark" (C minor, same notes)
  tempo     (slowest, usual, quickest) beats a minute this mood is comfortable at
  accomp    the steady accompaniment pattern (blocks.ACCOMPANIMENTS)
  voice     who plays the tune: "piano", "violin" (solo violin, cellos an octave below) or
            "both" (the violin sings it, the piano plays it in octaves)
  layers    which layers are on (blocks.LAYERS)
  dyn       how hard everyone plays (1.0 = the playful pieces he liked)
  tone      piano brightness (-1 dark .. +1 bright)
  pedal     whether the tune piano rings on (sustain pedal)
  held      level of the held strings; air: level of the high held violins
  swing     how late the off-beat eighths lean, in seconds (a lilt)
  lead      (optional) how hard the tune is played relative to the rest (default 1.0)
"""

MOODS = {
    # Deadpan, sparse, darker: for a problem, a flat statement, an awkward silence.
    "stark": dict(form="dark", tempo=(66, 80, 100), accomp="sparse", voice="piano",
                  layers={"held", "sub"}, dyn=0.78, tone=-0.1, pedal=False, held=0.25, air=0.0,
                  swing=0.0, lead=0.86),
    # A quiet bridge between moods: the piano alone, nearly still, held strings far away.
    "hush": dict(form="bright", tempo=(66, 80, 100), accomp="still", voice="piano",
                 layers={"held"}, dyn=0.74, tone=0.1, pedal=True, held=0.2, air=0.0, swing=0.0,
                 lead=0.85),
    # Slow to medium, warm, builds: under a narrator, for a hopeful turn.
    "hopeful": dict(form="bright", tempo=(72, 84, 96), accomp="rolling", voice="piano",
                    layers={"held", "sub", "air"}, dyn=0.88, tone=0.35, pedal=True, held=0.15, air=0.05,
                    swing=0.0),
    # Quick, light, bouncing: product moments, things working.
    "playful": dict(form="bright", tempo=(108, 120, 128), accomp="bounce", voice="piano",
                    layers={"sub", "answer", "air"}, dyn=0.96, tone=0.45, pedal=True, held=0.13, air=0.05,
                    swing=0.010),
    # The biggest: a final line, the payoff. Same tune, everyone in.
    "triumphant": dict(form="bright", tempo=(96, 112, 126), accomp="rocking", voice="both",
                       layers={"held", "sub", "pizz", "synth", "air", "low"}, dyn=1.06, tone=0.6,
                       pedal=True, held=0.26, air=0.05, swing=0.006),
}
