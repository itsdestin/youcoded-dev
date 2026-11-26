"""Switchable sound options: one place for every choice the owner makes by ear.

WHY this file (rebuild plan 2026-11-24, section b): several sound changes are the owner's to
judge by ear ([OWNER] in toolkit-plan.md) or are new enough to deserve a one-parameter A/B. Each
is a named switch with a default, so an A/B render is one setting, not a code edit.

Where a value comes from, first match wins:
  1. the piece's own `sound` dict (Piece.sound = {"pad_timbre": "triangle"});
  2. the environment, for a whole render run:  SONGBOOK_SOUND="air_db=11,piano_layers=switch";
  3. the piece's style profile (PROFILES below: v1 = the old sound, byte for byte);
  4. DEFAULTS below.
The mix reads the piece directly; the instruments (which play before the mix) read the piece
made current by `use(piece)`, which score.Band calls when it is created.

Every option is a SOUND choice. None of them exists to make a measurement pass.
"""
import os

DEFAULTS = dict(
    # ---- master (b4). WHY 0: the old 11 dB shelf at 9 kHz was ~10x a normal mastering move and
    # the likeliest technical cause of "harsh"; a piece may ask for up to air_max_db more.
    air_db=0.0,
    air_max_db=1.5,
    air_policy="cap",            # "cap": a piece's Piece.air is held to air_max_db | "as-written"
    glue="gentle",               # "gentle": 1.8:1, soft knee, at most 2 dB of gain reduction | "legacy"
    # ---- piano (b2)
    piano="upright-kw",          # [OWNER A/B] "upright-kw" (current) | "vcsl-upright" | "salamander"
    piano_layers="crossfade",    # soft/loud recordings lined up and crossfaded 0.55-0.80 | "switch" (old: at 0.7)
    piano_even="on",             # each recording matched to its neighbours in level and brightness | "off"
    piano_shine="off",           # added 6-15 kHz partials: "off" | "capped" (<= -30 dB re the note) | "as-written"
    piano_resonance="on",        # sympathetic-string ring while the pedal is down (~-33 dB) | "off"
    # [OWNER A/B] a soft felt thump when a damper lands (-38 dB re the note, below 150 Hz). WHY off
    # by default although the plan lists it: in a sparse tune it is a knock in the silence after a
    # note, i.e. an attack that is not a note, which the owner's identity rules out ("no clacks");
    # measured: on make-it-mine-r5 it adds two such attacks on the tune. "on" for his A/B.
    damper_thump="off",
    piano_bus_eq="on",           # HP 40, -2.5 dB at 250 Hz, LP 8 kHz 12 dB/oct on the piano buses | "off"
    piano_3k_cut=0.0,            # optional extra dip at 3 kHz on the piano buses, dB (plan: -1.5 allowed)
    piano_saturation=0.0,        # optional soft saturation on the piano buses, dB of drive (plan: 1-2)
    # ---- pad (b3). [OWNER] the sustain layer's timbre: pad vs held strings vs pedalled piano is a
    # composing choice; within the pad, the oscillator shape is this switch.
    pad_timbre="saw",            # "saw" (two detuned saws) | "triangle" (rounder, fewer upper partials)
    pad_sub=False,               # add a sine an octave down at -12 dB
    pad_cutoff=900.0,            # Hz, 24 dB/oct, key-tracked 50 %
    pad_attack=1.2,
    pad_release=2.2,
    # WHY (audit 2026-11-25): a held string note longer than its recording (7.5-15 s) used to stop
    # at the recording's end, leaving holes in the "held" sustain; "on" re-bows the steady middle
    # with crossfades (sounds._loop_sustain) | "off" (the old cut, kept byte for byte in v1)
    string_loop="on",
    # ---- mix (b4)
    bus_gain="fixed",            # "fixed": one calibrated gain per bus, written touch carries through |
                                 # "levelled": the old per-bus loudness levelling (TARGET while it plays)
    # WHY no "hall-ir" choice yet: the plan's optional OpenAIR hall IR could not be fetched
    # (its site failed certificate checks on 2026-11-24); the code-made hall stays, made darker.
    reverb_lp=7000.0,            # Hz, low-pass on the hall's return (plan: send LP 7 kHz; was 12 kHz)
    reverb_hp=220.0,             # Hz, high-pass on the hall's send (plan: 220; was 180)
    echo="on",                   # dotted-eighth echo send on pad / cycles (and lead if Piece asks) | "off"
    voice_cut="mid",             # under narration: static -2.5 dB at 3.2 kHz on the MID only | "stereo-dip" (old)
    pad_centre_under_voice=-3.0, # dB on the pad's centre (mid) channel under narration
    # ---- ONE PIECE, NOT SEPARATE INSTRUMENTS (2026-11-25, the unity rebuild; style "v4"). The
    # defaults here keep every older piece as it was; PROFILES["v4"] (the recipes) turns them on.
    # WHY (the mix analysis of his "busy" / "thrown in" / "own song at its own volume" answers):
    # the tune was a different-sounding instrument (own bus +3 dB, shine only on it, 15 ms early),
    # the strings owned 70-100 % of 2-6 kHz with no EQ, and each layer sat in its own room.
    tune_voice="lead",           # "lead": the tune on its own bus | "woven": the tune played by the
                                 #   bed's own piano (same bus, gain, tone, room), a touch firmer
    lead_early_ms=15.0,          # how far the tune is struck ahead of the band (woven: 0-5)
    shine_all=0.0,               # >0: the same shine on EVERY piano note (bus-by-bus SHINE table when 0)
    room="per-bus",              # "per-bus": each bus its own hall/room send | "shared": one send for all
    bowed_eq="off",              # "soft": HP 80 Hz, LP 4.5 kHz 12 dB/oct, -3 dB at 3 kHz on bowed buses
    piano_glue="off",            # "on": one gentle compressor reading ALL the piano buses together
    pan_max=1.0,                 # the widest any single note is panned (woven: 0.15)
)

# WHY profiles by Piece.style: pieces the owner has already heard pin style="v1" and promise to
# stay "byte for byte" what he heard (films.py, demos.py), so they keep the whole old sound. The
# round 7-8 pieces (style "v2") get the new sound, but keep the old bus levelling, because their
# per-piece trims (Piece.mix) were written against it. New pieces ("v3", the recipes) get every
# default. A piece's own Piece.sound, or the environment, still overrides a profile (for A/Bs).
PROFILES = {
    "v1": dict(air_db=11.0, air_policy="as-written", glue="legacy", piano_layers="switch", piano_even="off",
               piano_shine="as-written", piano_resonance="off", damper_thump="off", piano_bus_eq="off",
               bus_gain="levelled", reverb_lp=12000.0, reverb_hp=180.0, hall_predelay=0.022, echo="off",
               voice_cut="stereo-dip", string_loop="off"),
    "v2": dict(bus_gain="levelled"),
    # WHY v4 (2026-11-25): the brief's unity principle as the sound's defaults. The brightness is
    # matched by measurement to the owner's "B: middle" clip (the deck's bright-today: 5-16 kHz
    # -55 dB re the whole; the rebuild's shine-off default, his "dark", read -79) by giving EVERY
    # piano note the same capped shine instead of the tune alone. Measured on the worked example
    # (film_woven.py, 2026-11-25): shine off 5-16 kHz -61 dB, shine capped -52.5 dB. The pad stays
    # at 900 Hz: opened to 1500-1800 Hz it owned 72-81 % of 2-6 kHz (the strings' fault again).
    "v4": dict(tune_voice="woven", lead_early_ms=3.0, shine_all=0.08, piano_shine="capped", room="shared",
               bowed_eq="soft", piano_glue="on", pan_max=0.15),
}
DEFAULTS["hall_predelay"] = "tempo"   # "tempo": 25 ms, opening toward 120 ms at or below 80 BPM | seconds

_current = {}
_piece = None


def _parse(text):
    out = {}
    for part in (text or "").split(","):
        if "=" not in part:
            continue
        k, v = (s.strip() for s in part.split("=", 1))
        if k not in DEFAULTS:
            raise KeyError(f"SONGBOOK_SOUND: unknown option {k!r}; known: {', '.join(DEFAULTS)}")
        d = DEFAULTS[k]
        if isinstance(d, bool):
            v = v.lower() in ("1", "true", "yes", "on")
        elif isinstance(d, float):
            v = float(v)
        out[k] = v
    return out


def _check(sd, where):
    bad = [k for k in sd if k not in DEFAULTS]
    if bad:
        raise KeyError(f"{where}: unknown option(s) {bad}; known: {', '.join(DEFAULTS)}")


def use(piece=None):
    """Make `piece` current for the instruments (its Piece.sound and its style's profile). Call
    once per piece before its notes are played (score.Band.__init__ does). use(None) resets."""
    global _current, _piece
    sd = dict(getattr(piece, "sound", None) or {}) if piece is not None else {}
    _check(sd, "Piece.sound")
    _current, _piece = sd, piece


def get(name, piece=None):
    """The option's value. Order: the piece's own Piece.sound, then the environment
    (SONGBOOK_SOUND), then the piece's style profile (PROFILES), then DEFAULTS. Without `piece`,
    the piece made current by use()."""
    p = piece if piece is not None else _piece
    sd = (getattr(p, "sound", None) or {}) if p is not None else _current
    if name in sd:
        return sd[name]
    env = _parse(os.environ.get("SONGBOOK_SOUND", ""))
    if name in env:
        return env[name]
    prof = PROFILES.get(getattr(p, "style", None), {}) if p is not None else {}
    if name in prof:
        return prof[name]
    return DEFAULTS[name]


def summary(piece=None):
    """Every option and its value for this piece (for reports)."""
    return {k: get(k, piece) for k in DEFAULTS}
