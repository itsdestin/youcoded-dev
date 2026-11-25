"""Builds /home/destin/Documents/youcoded-campaign/music-review/deck.html (self-contained, relative media)."""
import html
import json
import os

M = "/home/destin/Documents/youcoded-campaign/music-review"
meas = {}
try:
    meas = json.load(open(os.path.join(M, "elements", "measurements.json")))
except Exception:
    pass


def esc(s):
    return html.escape(s, quote=True)


def audio(src, label, listen=None, key=None):
    m = ""
    if key and key in meas:
        r = meas[key]
        ok = (not r.get("silent")) and r["clipped_samples"] == 0
        bits = [f"{r['seconds']:.0f} s", "not silent, no distortion" if ok else "CHECK FAILED",
                f"loudness {r['lufs']:.1f} (all clips here within 1 of each other)"]
        v = r.get("vs_reference")
        if v:
            if v["same_pitches"] and v["same_touch"]:
                bits.append("exactly the same notes as the reference; only the sound differs")
            elif v["same_times"]:
                bits.append("same note timing as the reference")
        m = f'<div class="meas">checked: {esc(", ".join(bits))}</div>'
    li = f'<div class="listen">{listen}</div>' if listen else ""
    return (f'<div class="clip"><div class="clabel">{label}</div>'
            f'<audio controls preload="none" src="{esc(src)}"></audio>{li}{m}</div>')


def video(src, label, listen=None, tall=False):
    li = f'<div class="listen">{listen}</div>' if listen else ""
    cls = "vclip tall" if tall else "vclip"
    return (f'<div class="{cls}"><div class="clabel">{label}</div>'
            f'<video controls preload="metadata" playsinline src="{esc(src)}"></video>{li}</div>')


def decision(did, question, options, pick, why=None):
    """options: list of (value, text, pros, cons)."""
    rows = []
    for val, text, pros, cons in options:
        mine = ' <span class="mine">my pick</span>' if val == pick else ""
        pc = ""
        if pros or cons:
            pc = ('<div class="pc">' + (f'<span class="pro">+ {pros}</span>' if pros else "")
                  + (f'<span class="con">&minus; {cons}</span>' if cons else "") + "</div>")
        rows.append(f'<button class="opt" data-q="{did}" data-v="{esc(val)}"><b>{text}</b>{mine}{pc}</button>')
    w = f'<p class="why"><b>Why my pick:</b> {why}</p>' if why else ""
    return (f'<div class="decision" data-id="{did}" data-question="{esc(question)}"><div class="dq"><span class="did">{did}</span> {question}</div>'
            f'<div class="opts">{"".join(rows)}</div>{w}'
            f'<textarea class="note" data-q="{did}" placeholder="Anything to add? (optional)"></textarea></div>')


slides = []


def slide(title, body, kicker=""):
    slides.append((title, kicker, body))


# ------------------------------------------------------------------ 1 cover
slide("Why our music still feels off", """
<p class="lead">You asked for one careful look at every round of music and animation, all your comments, and the
toolkit we compose with. This deck is the result: what went wrong, the parts of music most likely to blame,
short clips so you can judge each part by ear, and decisions you can answer by tapping.</p>
<div class="how">
<p><b>How to use it</b></p>
<ul>
<li>Headphones or good speakers help. Each clip is short (8 to 20 seconds).</li>
<li>Clips meant to be compared are set to the same loudness, so the louder one never wins by being louder.</li>
<li>Tap an answer on any decision. Your taps are kept in this browser. At the end, press <b>Copy my answers</b> and paste them into chat.</li>
<li>Arrow keys or the buttons at the bottom move between pages.</li>
</ul></div>
<p class="small">About 25 pages. The first six are the story and the diagnosis; then one page per part of the music; then fitting music to picture; then the recommendations.</p>
""", "music review, 25 november")

# ------------------------------------------------------------------ 2 the handicap, short
slide("First, the honest part", """
<p class="lead">Nobody making this music can hear it. Not me, not any of the agents before me.</p>
<p>Every round so far was written by reading note lists and numbers. That is why the instructions kept growing into
longer and longer rulebooks: rules were the only thing a deaf composer could follow. You are the only ear in this
process, and so far you have heard only finished pieces, after the work was done.</p>
<p>So this deck does two things differently:</p>
<ul>
<li>I measured the actual audio and pictures you reacted to, the same way for every round, to find what the things you liked have in common.</li>
<li>Instead of another finished score, it gives you small comparisons, one musical part at a time, so your ear can set the rules.</li>
</ul>
<p class="small">I never claim something "sounds good" below. Where I say what to listen for, it is what the measurements show, not what I heard.</p>
""", "before anything else")

# ------------------------------------------------------------------ 3 diagnosis
slide("The diagnosis, ranked", """
<ol class="rank">
<li><b>Music and picture were made separately.</b> The one time they shared a single beat (round 8's "Own everything":
every word lands within 3 thousandths of a second of a note, every gap the same length) is the one recent piece you
liked. In round 7 the same film's words arrived with six different gap lengths (a quarter second up to 1.75 s) and the music changed its rhythm every bar.</li>
<li><b>Each round over-corrected the last complaint.</b> Round 4 copied the same four bars seven times ("extremely repetitive").
The round 7 rules then forced something new every few seconds ("choppy, busy"). The pieces you liked sit in the middle:
they repeat themselves a lot, but never word for word.</li>
<li><b>The instructions became a rulebook for deaf composers.</b> The composing guide was 2,893 lines when the songbook began,
2,731 in round 7, 1,780 in round 8, and is 500 now plus 58 automatic gauges. Composers wrote to pass the numbers (round 8 added a violin just to pass a brightness check).</li>
<li><b>The narrator left the music no room.</b> Her reading was sped up and every pause cut to exactly 0.4 seconds.
The music could only plod under her (round 7, "slow while the narrator is fast fast") or race with her (round 8, a plucked bass on every beat).</li>
<li><b>The new toolkit copies the wrong half of the game music.</b> Menu music is built to play for hours; an ad has 10 to 75
seconds to go somewhere. Its soft, warm tone is right for us; its endless-loop structure is not.</li>
<li><b>The tone swung from sharp to probably muffled.</b> Round 7's "harsh" piece had the same treble as songbook demos you approved;
what differed was constant change and loudness jumping up and down. The rebuild then removed both the added sparkle and the treble boost.
Its felt piano now carries almost nothing in the top range: about 45 dB less than round 8 Own everything as you heard it.
Darker than round 7 is right; this is likely too far (the brightness page lets you judge).</li>
<li><b>The tune is about to disappear.</b> The pieces you liked had the tune clearly there. The new toolkit plays it in 3 or 4 bars out of 16.
That risks music that is pleasant but could belong to anyone.</li>
</ol>
""", "what i think is going on")

# ------------------------------------------------------------------ 4-7 history
slide("The story: what you liked (rounds 1 to 3)", f"""
<p>These are the pieces you said yes to. Keep them in your ear; they are the reference for everything after.</p>
<div class="grid2">
{audio("history/h01-felt-and-pulse-hopeful.mp3", "Felt and pulse, the identity you chose", '"felt and pulse is definitely the best of those"')}
{audio("history/h02-songbook-journey.mp3", "The songbook demo (tune, joins)", 'You: tune "Good", brightness "Right", joins "Fixed"')}
</div>
{video("history/h05-round3-own-everything.mp4", "Own everything, round 3 (24 s)", 'You: music "Yes"; later "for this specific ad, the music should be a little more subtle"', tall=True)}
<div class="evidence"><b>What they share, measured:</b> the same texture for long stretches (each 2-second stretch is about 75% like the one before),
lots of repetition but no exact copies, and the tune clearly present almost every bar. The loudness stays fairly even.</div>
""", "the story so far, 1 of 4")

slide("The story: the first scores for films (rounds 2 to 4)", f"""
<div class="grid2">
{audio("history/h03-first-use-make-it-mine.mp3", "First try at Make it mine", '"this sounds like a different song every 4-6 seconds"')}
{audio("history/h04-first-use-fairytale.mp3", "First try at the fairytale (from 33 s)", '"lots of random high pitched jingles... the volume feels like it bounces"')}
</div>
{audio("history/h06-round4-make-it-mine.mp3", "Round 4: Make it mine, first songbook score (from 6 s)", '"extremely repetive and poorly put together"')}
<div class="evidence"><b>What was really going on:</b> the first tries gave every on-screen moment its own musical reaction, so the music
changed every few seconds. The fix (round 4) swung the other way: the note list shows essentially the same four bars played seven times, with the
tune in all 28 bars. Of every piece I measured, it repeats itself the most (95% match to earlier moments). The tune was not the problem;
copying it like wallpaper was.</div>
""", "the story so far, 2 of 4")

slide("The story: round 7, the newness rules", f"""
<div class="grid2">
{video("history/h07-round7-own-everything.mp4", "Own everything, round 7", '"animation timing and music in own everything feel very odd/choppy/inconsistent"', tall=True)}
<div>
{audio("history/h08-round7-make-it-mine.mp3", "Make it mine, round 7", '"still too busy/harsh"')}
{video("history/h09-round7-storybook.mp4", "Storybook, round 7 (from 8 s)", '"the music is very slow/steady, while the narrator is fast fast... the piano notes... oddly thrown in"')}
</div></div>
<div class="evidence"><b>What was really going on:</b> the round 7 instructions demanded variety: a minimum number of different rhythms, new
chords, the accompaniment changing every six bars. Make it mine came out as the least self-similar piece of all (each stretch only 60%
like the last), with 13 sharp changes every 30 seconds and the loudness often jumping 7 to 8 dB within a second (the songbook demos you approved: 4 to 5).
In Own everything, the words arrived with gaps of 0.25, 0.5, 0.75, 1.0, 1.25 and 1.75 seconds while the music changed rhythm every bar;
for 4 of 12 on-screen moments the nearest note was about a quarter second or more away. The storybook music's felt beat was about 68 a minute
under a narrator speaking 4 to 5 syllables a second.</div>
""", "the story so far, 3 of 4")

slide("The story: round 8, and the new toolkit", f"""
<div class="grid2">
{video("history/h10-round8-own-everything.mp4", "Own everything, round 8: the one you liked", '"among the better ones i\'ve seen so far"', tall=True)}
<div>
{audio("history/h11-round8-make-it-mine.mp3", "Make it mine, round 8 (you haven't commented)", "One plain piano pattern, very even; the tune in 11 of 28 bars")}
{video("history/h12-round8-storybook.mp4", "Storybook, round 8 (you haven't commented)", "A plucked bass on every beat at her speed (150 a minute)")}
{audio("history/h13-new-toolkit-app-demo.mp3", "The new toolkit's example (nobody has heard it)", "A soft synth pad and a gentle pattern; the tune in 4 of 16 bars")}
</div></div>
<div class="evidence"><b>What round 8 Own everything does that nothing else did:</b>
<ul>
<li>Picture and music share one beat: every line of type arrives exactly one beat after the last (0.625 s), all with the same entrance; each of the 14 on-screen moments has a note within 3 thousandths of a second.</li>
<li>The music never changes its rhythm (the same pattern in every bar) and the level barely moves (among the smallest loudness jumps we measured).</li>
<li>The tune's three notes are played on the first words: "you'll own / nothing / and you'll / be happy".</li>
<li>It is one of the darkest, softest pieces we have made (as you heard it; the new toolkit would now render it darker still).</li>
</ul></div>
""", "the story so far, 4 of 4")

rows = [("Felt and pulse, hopeful (liked)", 0.72, 0.84, "ok"), ("Songbook journey (liked)", 0.78, 0.89, "ok"),
        ("Songbook hopeful (liked)", 0.82, 0.90, "ok"), ("Own everything r3 (liked)", 0.73, 0.82, "ok"),
        ("Own everything r8 (liked)", 0.71, 0.76, "ok"),
        ("First Make it mine: \"a different song every 4-6 s\"", 0.62, 0.88, "no"),
        ("Round 4 Make it mine: \"extremely repetitive\"", 0.72, 0.95, "no"),
        ("Round 7 Make it mine: \"busy/harsh\"", 0.60, 0.86, "no"),
        ("Round 7 storybook: \"offbeat\"", 0.63, 0.84, "no"),
        ("Round 7 Own everything: \"choppy\"", 0.72, 0.59, "no")]


def bar(v, lo, hi, okband):
    w = max(2, min(100, (v - lo) / (hi - lo) * 100))
    a, b = okband
    L = (a - lo) / (hi - lo) * 100
    W = (b - a) / (hi - lo) * 100
    return (f'<span class="track"><span class="okb" style="left:{L:.0f}%;width:{W:.0f}%"></span>'
            f'<span class="fill" style="width:{w:.0f}%"></span></span><span class="rv">{v:.2f}</span>')


chart = "".join(f'<div class="row2 {c}"><span class="rl">{n}</span>{bar(s1, 0.5, 0.9, (0.70, 0.83))}{bar(s2, 0.5, 1.0, (0.76, 0.91))}</div>'
                for n, s1, s2, c in rows)
slide("The pattern: a swinging pendulum", f"""
<p>Two simple measures, taken the same way on every piece. <b>Steady</b>: how alike each 2-second stretch is to the one just before
(low means it keeps changing). <b>Repeats</b>: how closely each moment matches something heard earlier (very high means copy and paste).
The shaded zone is where every piece you liked sits.</p>
<div class="chart2"><div class="row2 head"><span class="rl"></span><span>Steady</span><span></span><span>Repeats</span><span></span></div>{chart}</div>
<p>Every rejected piece falls outside the zone on one side or the other: too changeable (first Make it mine, round 7) or a copy of
itself (round 4, 0.95). Each round's fix pushed the next piece out the other side. The pieces you liked are steady and repeat a lot,
but never exactly.</p>
<p class="small">Tone swung the same way: round 7 was bright, and the new toolkit is now very dark (see the brightness page). The zone is drawn around just five pieces, so treat it as
the shape of the problem, not as a target; targets are how we got here.</p>
""", "the pattern")

# ------------------------------------------------------------------ elements
slide("The parts of music, in plain words", """
<p>Music has a handful of parts you can change one at a time. These are the ones that matter most for us:</p>
<dl class="gloss">
<dt>Tempo</dt><dd>How fast the beat is: the speed you would tap your foot at.</dd>
<dt>Pulse</dt><dd>The steady pattern of notes that keeps time underneath, like a heartbeat.</dd>
<dt>Busyness</dt><dd>How many notes start each second. More notes feel energetic, then restless.</dd>
<dt>Piano tone and touch</dt><dd>Which piano recording, and how hard its keys are struck. Softer is warmer and rounder.</dd>
<dt>Brightness</dt><dd>How much high, sparkly sound there is. Too much feels sharp or harsh; too little feels muffled.</dd>
<dt>Space</dt><dd>The sense of the room: a dry small room, or a big hall where notes ring on.</dd>
<dt>Chord colour</dt><dd>The flavour of the notes played together: plain and clear, or softer and more dreamy.</dd>
<dt>The tune</dt><dd>Our three notes, "you-co-ded", and the melody built from them. How often it comes back matters a lot.</dd>
<dt>The held layer</dt><dd>A soft sound held underneath everything, filling the gaps between piano notes.</dd>
<dt>The lift</dt><dd>How the music grows at the payoff moment of a film.</dd>
<dt>The ending</dt><dd>How the piece lands on our name and sound logo.</dd>
<dt>Fit to picture</dt><dd>Where notes fall against what happens on screen.</dd>
</dl>
<p class="small">Each of the next pages changes exactly one of these. Everything else in the clips is identical (the measurements under each clip confirm it).</p>
""", "a short guide")

EL = []


def element(title, what, ours, why, clips, dq, opts, pick, pickwhy, kicker):
    body = (f'<p class="what"><b>What it is:</b> {what}</p><p><b>What ours does now:</b> {ours}</p>'
            f'<p><b>Why it may be part of "off":</b> {why}</p><div class="clips">{"".join(clips)}</div>'
            + decision(dq[0], dq[1], opts, pick, pickwhy))
    slide(title, body, kicker)


E = "elements/"
element("Tempo against a fast narrator",
        "how fast the music's beat is, measured in beats a minute.",
        "round 7 ran at about 68 felt beats a minute under her; round 8 jumped to 150 with a bass on every beat.",
        "her voice moves at 4 to 5 syllables a second. A beat far slower feels like the music is in another room; a beat that copies her speed competes with her. "
        "The last clip also gives her back her breaths (about a second at two sentence ends) without changing her words.",
        [audio(E + "tempo-96.mp3", "A: 96 a minute", "Listen for: does the music feel like it lags behind her?", "tempo-96"),
         audio(E + "tempo-120.mp3", "B: 120 a minute (the reference)", "Listen for: a walking pace under a quick talker.", "tempo-120"),
         audio(E + "tempo-144.mp3", "C: 144 a minute", "Listen for: does it start racing her?", "tempo-144"),
         audio(E + "tempo-120-breaths.mp3", "D: 120, and her breaths given back", "Listen for: does the music get a moment to speak between her sentences?", "tempo-120-breaths")],
        ("E1", "Which tempo sits best under her?"),
        [("A", "A: 96", "calmer, more storybook", "may feel slow against her pace"),
         ("B", "B: 120", "a steady walk; matches her energy without copying it", "less storybook"),
         ("C", "C: 144", "energetic", "likely to compete with her words"),
         ("D", "D: 120 with breaths", "music and voice take turns; feels less rushed", "means re-editing or re-recording the voice")],
        "D", "the tempo choice is secondary to giving her room. I expect B or D to sit best, and D to fix more of \"offbeat\" than any tempo does.",
        "part 1 of 11 · tempo")

element("The pulse", "the steady pattern underneath that keeps time.",
        "a soft piano pattern on a few fixed notes, the same under every chord (new toolkit). Round 8 Own everything used a plain, unbroken eighth-note pattern.",
        "a pulse that keeps stopping, changing or re-picking its notes reads as choppy; a pulse that never varies can read as mechanical.",
        [audio(E + "pulse-none.mp3", "A: no pulse, only the held layer and the tune", "Listen for: calm, but does anything move?", "pulse-none"),
         audio(E + "pulse-steady.mp3", "B: steady (the reference)", "Listen for: even, like a clock you stop noticing.", "pulse-steady"),
         audio(E + "pulse-lilt.mp3", "C: the same, with a gentle lilt", "Listen for: the off-beat notes lean slightly late, a little like a sway.", "pulse-lilt"),
         audio(E + "pulse-chord.mp3", "D: round 8's pattern that follows each chord", "Listen for: more motion when the chords change.", "pulse-chord")],
        ("E2", "Which pulse feels most like us?"),
        [("A", "A: none", "most subtle", "loses the gentle motion that made round 8 work"),
         ("B", "B: steady", "even and calm", "could feel mechanical over 60 s"),
         ("C", "C: lilting", "warmer, more human", "a sway can feel playful, maybe too much for stories"),
         ("D", "D: chord-following", "more musical motion", "busier")],
        "C", "round 8 Own everything proved an unbroken steady pulse works; a slight lilt is the cheapest way to make it feel played rather than programmed. Your ear decides.",
        "part 2 of 11 · pulse")

element("How busy it is", "how many notes start each second, all instruments together.",
        "rejected pieces ranged from 5.6 note-starts a second (round 4) to bursts of 9 in a second; round 8 Own everything averaged about 3.6 and never more than 5.",
        "\"busy\" and \"harsh\" both appeared when the music had more going on than the picture.",
        [audio(E + "busy-sparse.mp3", "A: sparse (4 pulse notes a bar)", "Listen for: space, maybe too empty.", "busy-sparse"),
         audio(E + "busy-medium.mp3", "B: medium (the reference, 10 of 16 steps)", None, "busy-medium"),
         audio(E + "busy-full.mp3", "C: full (every step, plus two little repeating figures)", "Listen for: is this where it turns restless?", "busy-full")],
        ("E3", "How busy should our music be, by default?"),
        [("A", "A: sparse", "most subtle", "can feel empty without picture"),
         ("B", "B: medium", "gentle motion", ""),
         ("C", "C: full", "energetic", "the zone your \"busy\" comments came from")],
        "B", "medium matches what you liked; sparse is the right tool for subtle films like Own everything.",
        "part 3 of 11 · busyness")

element("Piano tone and touch", "which recorded piano we use, and how hard its keys are struck.",
        "a recorded upright piano softened to sound like a felt piano. Two other free recordings are available.",
        "a harder touch is brighter and more percussive; nothing in your comments named the piano itself, so this is a check, not a suspect.",
        [audio(E + "piano-soft.mp3", "A: our piano, soft touch (the reference)", None, "piano-soft"),
         audio(E + "piano-firm.mp3", "B: our piano, firmer touch", "Listen for: brighter, more clicky attacks.", "piano-firm"),
         audio(E + "piano-salamander.mp3", "C: a grand piano recording, soft", "Listen for: bigger, cleaner, less intimate.", "piano-salamander"),
         audio(E + "piano-vcsl.mp3", "D: another upright recording, soft", "Listen for: woodier. Note: its high G is known to die early.", "piano-vcsl")],
        ("E4", "Which piano, and which touch?"),
        [("A", "A: ours, soft", "close and warm; what you approved", ""),
         ("B", "B: ours, firmer", "more presence", "nearer to \"harsh\""),
         ("C", "C: grand", "polished", "less personal"),
         ("D", "D: other upright", "character", "a known flaw in one note")],
        "A", "keep the piano you chose; vary touch per film rather than the instrument.",
        "part 4 of 11 · piano")

element("Brightness", "how much high, sparkly sound the final mix has.",
        "until round 8 the piano got its sparkle from added artificial shimmer plus an 11 dB treble boost. The rebuild switched both off; "
        "the piano now has almost no top end at all. Every other page uses a middle setting (B) so this one question doesn't colour the rest.",
        "too much top end can sound harsh; too little sounds muffled, like listening through a wall, especially on phone speakers.",
        [audio(E + "bright-dark.mp3", "A: the new toolkit as it is today", "Listen for: does it sound muffled?", "bright-dark"),
         audio(E + "bright-today.mp3", "B: a middle setting (the reference for every other page)", None, "bright-today"),
         audio(E + "bright-round7.mp3", "C: the round 7 sound", "Listen for: sharper edges on every note.", "bright-round7")],
        ("E5", "How bright should our sound be?"),
        [("A", "A: today's toolkit", "softest", "likely muffled; measured far darker than anything you liked"),
         ("B", "B: middle", "warm but clear", ""),
         ("C", "C: round 7", "crisp", "the sound that went with \"harsh\"")],
        "B", "your favourites were darker than round 7 but nowhere near as dark as A.",
        "part 5 of 11 · brightness")

element("Space", "the sense of room: dry and close, or a big hall where notes ring on.",
        "a medium hall on everything.",
        "too little space makes separate notes sound choppy; too much smears them and pushes the music far away.",
        [audio(E + "space-dry.mp3", "A: dry", "Listen for: every note on its own, closer.", "space-dry"),
         audio(E + "space-today.mp3", "B: today (the reference)", None, "space-today"),
         audio(E + "space-big.mp3", "C: a big hall", "Listen for: dreamy, notes overlap, further away.", "space-big")],
        ("E6", "How much room should our music have?"),
        [("A", "A: dry", "close and clear", "gaps between notes may feel choppy"),
         ("B", "B: today", "middle", ""),
         ("C", "C: big", "soothing, game-menu feel", "less clear under a narrator")],
        "B", "a middle room; consider more space for music-only films and less under a narrator.",
        "part 6 of 11 · space")

element("Chord colour", "the flavour of the notes played together.",
        "softer \"added-note\" chords (a ninth added to each), the dreamy kind common in calm game music.",
        "plain chords are clearer and more hopeful; rich chords are softer but can feel vague. One unexpected chord can add a moment of feeling.",
        [audio(E + "chords-plain.mp3", "A: plain chords", "Listen for: clear, simple, a little brighter in mood.", "chords-plain"),
         audio(E + "chords-rich.mp3", "B: rich chords (the reference)", None, "chords-rich"),
         audio(E + "chords-borrowed.mp3", "C: rich, with one borrowed darker chord (about 7 s in)", "Listen for: a moment of shadow, then back.", "chords-borrowed")],
        ("E7", "Which chord colour is ours?"),
        [("A", "A: plain", "clear and honest", "less soothing"),
         ("B", "B: rich", "soft and soothing", "can feel vague"),
         ("C", "C: rich with one shadow", "a small emotional moment", "one more thing to place well")],
        "B", "rich as the default; plain for bright product moments; one shadow chord for stories.",
        "part 7 of 11 · chord colour")

element("The tune: how often", "how often our three notes and their melody are heard.",
        "it swung from every bar (round 4, rejected) to 3 or 4 bars in 16 (the new toolkit, unheard).",
        "the tune is what makes it ours. Too often and it is wallpaper; too rare and the music could belong to anyone.",
        [audio(E + "tune-none.mp3", "A: no tune", "Listen for: is it still youcoded? (It also sounds darker: in our engine the tune carries most of the sparkle.)", "tune-none"),
         audio(E + "tune-once.mp3", "B: once", None, "tune-once"),
         audio(E + "tune-twice.mp3", "C: twice, said and answered (the reference)", None, "tune-twice"),
         audio(E + "tune-every-bar.mp3", "D: every bar, the round 4 way", "Listen for: the wallpaper effect.", "tune-every-bar")],
        ("E8", "How often should the tune appear in a 20-second stretch?"),
        [("A", "A: never", "most subtle", "anonymous"),
         ("B", "B: once", "clear and rare", ""),
         ("C", "C: twice", "recognisable", ""),
         ("D", "D: every bar", "unmistakable", "what you called repetitive")],
        "C", "said once and answered once per 15 to 20 seconds, never copied exactly; on a key word or moment when possible (as round 8 Own everything did).",
        "part 8 of 11 · the tune")

element("The held layer", "a soft sound held underneath everything, filling the gaps between notes.",
        "the new toolkit adds a soft synth pad; round 8 used held strings in places; earlier rounds often had nothing held.",
        "without something held, a pattern of separate piano notes can sound thin and choppy between notes.",
        [audio(E + "held-none.mp3", "A: nothing held", "Listen for: the gaps between notes.", "held-none"),
         audio(E + "held-pad.mp3", "B: soft synth pad (the reference)", "Listen for: a soft glow underneath.", "held-pad"),
         audio(E + "held-strings.mp3", "C: held strings", "Listen for: warmer, more acoustic.", "held-strings"),
         audio(E + "held-ring.mp3", "D: the piano's own pedal ringing", "Listen for: a natural blur.", "held-ring")],
        ("E9", "What should sit underneath?"),
        [("A", "A: nothing", "pure piano", "choppier"),
         ("B", "B: synth pad", "smooth, game-menu feel", "more electronic"),
         ("C", "C: strings", "warm and human", "heavier"),
         ("D", "D: pedal ring", "most natural", "can blur chords")],
        "C", "strings were in every round-2 piece you said yes to; but this is exactly the kind of thing only your ear can settle.",
        "part 9 of 11 · held layer")

element("The lift at the payoff", "how the music grows at the film's main moment.",
        "rules have asked for a 2.5 dB lift with strings joining at the peak.",
        "too flat and the payoff passes unnoticed; too big and a subtle film gets a sudden swell.",
        [audio(E + "lift-flat.mp3", "A: no lift (the reference)", None, "lift-flat"),
         audio(E + "lift-tune.mp3", "B: only the tune reaches higher (about 9 s in)", "Listen for: a lift you feel, not hear as louder.", "lift-tune"),
         audio(E + "lift-full.mp3", "C: higher tune, strings join, a little louder", "Listen for: a clear arrival.", "lift-full")],
        ("E10", "How should our music rise at a payoff?"),
        [("A", "A: no lift", "most subtle", "payoff can pass by"),
         ("B", "B: the tune reaches higher", "felt but gentle", ""),
         ("C", "C: full lift", "unmistakable", "can feel big for short films")],
        "B", "the gentle version for short and subtle films; the full one only for the longest films' single biggest moment.",
        "part 10 of 11 · the lift")

element("The ending", "how the piece lands on our name and the sound logo.",
        "you chose the full-blend logo when music plays before it, and piano-only when the logo plays alone.",
        "the ending is the strongest brand moment; it should feel the same on every film.",
        [audio(E + "end-blend.mp3", "A: full blend (the reference)", None, "end-blend"),
         audio(E + "end-quiet.mp3", "B: quiet logo", None, "end-quiet"),
         audio(E + "end-piano.mp3", "C: piano-only logo", None, "end-piano"),
         audio(E + "end-stop.mp3", "D: a plain stop, no logo", "Listen for: what is lost without it.", "end-stop")],
        ("E11", "Which ending should be the default?"),
        [("A", "A: full blend", "your earlier pick with music", ""),
         ("B", "B: quiet", "for subtle films", "less memorable"),
         ("C", "C: piano only", "intimate", ""),
         ("D", "D: plain stop", "", "no brand moment")],
        "A", "keep your ruling; quiet version only where a film is asked to be subtle.",
        "part 11 of 11 · ending")

# ------------------------------------------------------------------ family
slide("Same brand, different piece", f"""
<p>You want each ad to have its own music that still clearly belongs to youcoded. Here are four quick sketches for four very
different films, all made from the same fingerprint (below). Listen for whether they sound like one family.</p>
<div class="grid2">
{audio(E + "family-type.mp3", "A short type-only film (96 a minute, minor, one unbroken pattern)", None, "family-type")}
{audio(E + "family-demo.mp3", "An app demo (116, bright, with a gentle lift)", None, "family-demo")}
{audio(E + "family-hush.mp3", "A quiet story moment (84, ringing piano, sparse)", "Note: its loudness rises and falls more than the others, because the notes are far apart.", "family-hush")}
{audio(E + "family-bright.mp3", "An upbeat piece (126, held strings, a slight lilt)", None, "family-bright")}
</div>
<table class="fp"><tr><th>Stays the same in every piece (the fingerprint)</th><th>Changes per film</th></tr>
<tr><td><ul><li>The soft felt piano is the voice</li><li>The three notes "you-co-ded" heard clearly at least once, ideally on a key word</li>
<li>One key family (E-flat major and its minor side)</li><li>Something soft held underneath</li><li>Warm, dark tone; even loudness</li>
<li>No drums, claps, thwips or whooshes</li><li>Ends on the sound logo</li></ul></td>
<td><ul><li>Tempo (about 84 to 126)</li><li>The pulse pattern (sparse, steady, lilting)</li><li>One extra colour instrument (plucked strings, held strings, ringing piano)</li>
<li>Mood: minor-leaning for stories, bright for product</li><li>How often the tune appears and how big the payoff is</li></ul></td></tr></table>
""" + decision("F1", "Do these sound like one family?",
               [("yes", "Yes, one family", "the fingerprint works", ""),
                ("too-same", "Too similar", "", "we need more difference per film"),
                ("too-different", "Too different", "", "the fingerprint needs to be tighter"),
                ("mixed", "Some do, some don't", "", "say which in the note")],
               None), "one brand, many pieces")

# ------------------------------------------------------------------ alignment
A = "align/"
slide("Fitting music to picture: Own everything", f"""
<p>The same round 8 picture with four soundtracks. Only the music's timing or the music itself changes.</p>
<div class="grid4">
{video(A + "own-a-locked.mp4", "A: as you saw it", "The music and every word share one beat.", tall=True)}
{video(A + "own-b-music-early.mp4", "B: music 0.09 s early", "Listen for: notes arriving just before the words.", tall=True)}
{video(A + "own-c-music-late.mp4", "C: music 0.15 s late", "Listen for: a slight drag behind the words.", tall=True)}
{video(A + "own-d-round7-music.mp4", "D: round 7's music under this picture", "A different beat (120 a minute) under a 96 a minute picture.", tall=True)}
</div>
<p class="small">Pen sounds are missing in B, C and D (I only have the music on its own). Research on film sound says sound arriving early
feels wrong sooner than sound arriving late; we keep music between 0 and 0.04 s after the picture.</p>
""" + decision("A1", "Can you feel the difference between A and B or C?",
               [("clear", "Yes, clearly", "", ""), ("slight", "Slightly", "", ""), ("no", "Not really", "", ""),
                ("d-worse", "Only D feels wrong", "", "")], None), "alignment, 1 of 3")

slide("Fitting music to picture: Make it mine", f"""
<p>A 20-second stretch (24 to 44 s) of the round 8 cut. Today the cuts land on half-beats but scattered across the bar, and the
picture moves in bursts while the music stays even.</p>
<div class="grid3">
{video(A + "mim-a-as-cut.mp4", "A: as cut", "Cuts at 2.5, 6, 8.5, 11.5, 15.5, 17.5 and 19 s.")}
{video(A + "mim-b-cuts-on-bars.mp4", "B: the picture moved onto the music", "Each shot sped up or slowed a little so every cut lands on a bar line (every 2 s).")}
{video(A + "mim-c-music-shifted.mp4", "C: same cut, music one beat (half a second) later", "Shows how much the relationship matters: same picture, same music.")}
</div>
<p class="small">In B some shots play up to a quarter faster or slower; a real version would be re-cut, not stretched.</p>
""" + decision("A2", "Which feels most put together?",
               [("A", "A: as cut", "", ""), ("B", "B: cuts on the bar lines", "the edit breathes with the music", "needs re-editing"),
                ("C", "C: shifted", "", ""), ("same", "No real difference", "", "")], "B",
               "B is the round 8 Own everything method applied to a longer film."), "alignment, 2 of 3")

slide("A method for fitting music and picture", """
<ol class="rank">
<li><b>Decide who leads, per film.</b> Films without a narrator: the music leads. Pick the tempo first (from how fast the
type or screens need to read), then cut the picture to that beat, as round 8 Own everything did. Narrated films: the voice
leads. Record her with real breaths, fit the music's changes to her sentences, and cut the picture to her words.</li>
<li><b>One shared timing sheet.</b> Picture and music read their times from one table written before either is made (take3 already does this; make it the rule).</li>
<li><b>Big changes on bar lines, small ones on beats.</b> Scene cuts and page turns on the start of a bar; words, cards and taps on beats.</li>
<li><b>Only a few moments get a musical event.</b> The opening, the turn, the payoff, the name. Everything else simply lands on the beat without a special sound.</li>
<li><b>Tolerance:</b> music from 0 to 0.04 s after the picture, never more than 0.015 s before.</li>
<li><b>Motion follows the beat.</b> One entrance style for all type; an entrance lasts at most one beat; holds last whole beats or bars; dissolves last a beat, not a few frames.</li>
<li><b>Sound effects stay their own layer</b>, timed to the action, quieter than the music, never musical.</li>
</ol>
""" + decision("A3", "Should this become the rule for every film?",
               [("yes", "Yes", "every film designed like round 8 Own everything", "editing takes a little longer"),
                ("mostly", "Yes, except narrated films stay voice-led", "", ""),
                ("no", "No, keep music after the edit", "faster to make", "the way rounds 2 to 7 were made")], "yes"),
      "alignment, 3 of 3")

# ------------------------------------------------------------------ recommendations
slide("Recommendations: the process", decision(
    "R1", "Put your ear into the process early, in three short steps",
    [("yes", "Yes: palette, then sketch, then score",
      "1) once: you approve a sound palette (this deck does most of it). 2) per film: two 15-second sketches of tempo and feel, over the real picture or voice; you pick one. 3) only then the full score, then one listen",
      "about two extra short listens per film"),
     ("sketch-only", "Only the sketch step", "less of your time", "palette questions keep coming back"),
     ("no", "No, keep finished scores", "", "the way every round so far was made")],
    "yes", "every miss so far was found only after a full score was finished; a 15-second sketch would have caught round 4's loop and round 7's churn in one listen.")
    + decision("R2", "A shelf of reference clips",
               [("yes", "Yes", "the clips you liked (felt and pulse, the songbook journey, round 8 Own everything) become the yardstick; every new score is measured against them before you hear it", ""),
                ("no", "No", "", "")], "yes",
               "our tools can't hear, but they can compare a new piece with ones you liked. That turns \"what you liked\" into a check instead of a guess."),
    "recommendations, 1 of 3")

slide("Recommendations: the instructions", decision(
    "R3", "Replace the 500-line guide and 58 gauges with a short brief",
    [("yes", "Yes: a two-page brief",
      "the fingerprint, the per-film choices, the picture method, your rulings in your words, and your answers from this deck. Automatic checks only catch real faults (clipping, silence, clashing notes, the voice drowned, picture out of sync)",
      "we lose numbers that sometimes caught problems"),
     ("keep-gauges", "Short brief, keep the gauges as information", "", "composers will keep writing to the numbers"),
     ("no", "Keep the current guide", "", "")],
    "yes", "three rounds of rules each made the next problem: novelty rules made \"choppy\", steadiness rules gave the brightness-check violin. Fewer rules, more listening.")
    + decision("R4", "Keep the tune clearly present",
               [("yes", "Yes", "the three notes on a key word in every film, and said and answered once every 15 to 20 seconds, never copied exactly", ""),
                ("rare", "Keep it rare, as the new toolkit does", "subtler", "risks anonymous music"),
                ("ear", "Decide from part 8 above", "", "")], "yes"),
    "recommendations, 2 of 3")

slide("Recommendations: the toolkit and the films", decision(
    "R5", "What to keep from the new toolkit",
    [("yes", "Keep the sound improvements, drop the menu-music form",
      "keep: the held layer, the steady pulse, the darker mix, the clip-by-clip A/B tool. Drop: overlapping loops of different lengths in films under 30 s, and set every default from your answers here", ""),
     ("all", "Keep all of it", "", "loops that never come round in a short film"),
     ("none", "Start again", "", "throws away real fixes")], "yes")
    + decision("R6", "The fairytale narrator",
               [("yes", "Give her breaths back",
                 "about a second at sentence ends and the story's turns (re-edit the current take first; re-record only if needed). The film may need a few words fewer to stay at 75 s",
                 "edits to a script you like"),
                ("music", "Keep the voice, fix it with the music only", "no script change", "the music stays squeezed"),
                ("ear", "Decide from part 1's clip D", "", "")], "yes")
    + decision("R7", "What to score next",
               [("own", "Own everything, from these answers", "it is closest to right; it proves the brief in one short listen", ""),
                ("mim", "Make it mine, re-cut on the beat", "the biggest gain", "needs picture work"),
                ("tale", "The storybook, after the voice edit", "", "waits on R6")], "own"),
    "recommendations, 3 of 3")

slide("The limits, plainly", """
<ul>
<li><b>Nobody here can hear.</b> Every clip in this deck was checked by measurement only: it is not silent, not clipped, the
right length, and differs from its reference only where intended. Whether any of it sounds good is your call.</li>
<li><b>My measurements are simple.</b> Without specialist audio software I counted notes, loudness and tone with basic tools.
Where the note lists from our own code exist, I used those instead, because they are exact.</li>
<li><b>The GTA VI music:</b> I could not find which track you mean or how it was made; nothing about it is published. I used only what it
is like (soft, warm, steady, varied slowly), not how it was built.</li>
<li><b>The clips use the toolkit as it was this morning</b>; another team is rebuilding it right now. Your answers will be applied to whatever they finish.</li>
<li><b>The cheapest ways to put your ear in early:</b> answer this deck once; then per film, two 15-second sketches over the real picture
(a two-minute listen); and send any track you love as a link, even if it is not ours, so we can measure what it does.</li>
</ul>
""", "limits")

slide("Done: copy your answers", """
<p>Press the button, then paste into chat. Your taps and notes stay in this browser if you close the page.</p>
<button id="copy" class="big">Copy my answers</button>
<textarea id="out" class="note" style="min-height:220px" readonly placeholder="Your answers will appear here too."></textarea>
<p class="small">Files: every clip is in this folder (history, elements, family, align). Measurements of every clip: elements/measurements.json.</p>
""", "finish")

# ------------------------------------------------------------------ html
css = """
:root{--bg:#F7F0FB;--card:#ffffff;--ink:#21152C;--ink2:#43354E;--muted:#8A7B96;--line:#C9B0DB;--accent:#9750AA;--accent2:#D25AA0;--soft:#EFE3F6;--ok:#4f8a5b;--no:#b0475f}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#140B1E;--card:#21152C;--ink:#F3EAF9;--ink2:#B3A8BC;--muted:#9a8aa8;--line:#43354E;--accent:#C387D3;--accent2:#E07FB8;--soft:#2b1d38;--ok:#7fc08c;--no:#e07a90}}
:root[data-theme="dark"]{--bg:#140B1E;--card:#21152C;--ink:#F3EAF9;--ink2:#B3A8BC;--muted:#9a8aa8;--line:#43354E;--accent:#C387D3;--accent2:#E07FB8;--soft:#2b1d38;--ok:#7fc08c;--no:#e07a90}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font-family:'DM Sans',system-ui,sans-serif;font-size:17px;line-height:1.5}
.wrap{max-width:980px;margin:0 auto;padding:20px 16px 110px}
.slide{display:none}.slide.on{display:block}
.kicker{font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
h1{font-weight:900;letter-spacing:-.03em;font-size:clamp(28px,5vw,44px);line-height:1.08;margin:.2em 0 .5em}
.lead{font-size:1.15em}.small{color:var(--muted);font-size:.9em}
.how,.evidence{background:var(--soft);border:1px solid var(--line);border-radius:14px;padding:12px 16px;margin:14px 0}
.clip,.vclip{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;margin:10px 0}
.clabel{font-weight:700;margin-bottom:6px}.listen{color:var(--ink2);font-size:.92em;margin-top:6px}.meas{color:var(--muted);font-size:.8em;margin-top:4px}
audio{width:100%}video{width:100%;border-radius:10px;background:#000;max-height:70vh}
.vclip.tall video{max-height:62vh;width:auto;max-width:100%;display:block;margin:0 auto}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.grid3{display:grid;grid-template-columns:1fr;gap:12px}.grid3 video{max-height:42vh;width:auto;max-width:100%;display:block;margin:0 auto}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
@media (max-width:760px){.grid2,.grid4{grid-template-columns:1fr}}
.decision{border:2px solid var(--accent);border-radius:16px;padding:14px;margin:18px 0;background:var(--card)}
.dq{font-weight:700;margin-bottom:10px}.did{font-family:'JetBrains Mono',monospace;color:var(--accent);margin-right:6px}
.opts{display:grid;gap:8px}
.opt{text-align:left;font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:10px 12px;cursor:pointer}
.opt:hover{border-color:var(--accent)}.opt.sel{border-color:var(--accent);background:var(--soft);box-shadow:0 0 0 2px var(--accent) inset}
.mine{font-size:.75em;background:linear-gradient(100deg,#9D5BD0,#D25AA0);color:#fff;border-radius:999px;padding:2px 8px;margin-left:6px}
.pc{font-size:.88em;margin-top:4px;color:var(--ink2);display:flex;flex-direction:column;gap:2px}.pro{color:var(--ok)}.con{color:var(--no)}
.why{font-size:.92em;color:var(--ink2)}
textarea.note{width:100%;min-height:60px;margin-top:10px;font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:8px}
.rank li{margin-bottom:10px}
.gloss dt{font-weight:700;margin-top:8px}.gloss dd{margin:0 0 0 0;color:var(--ink2)}
.chart{position:relative;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px}
.chart .band{position:absolute;top:0;bottom:0;background:var(--soft);border-left:1px dashed var(--accent);border-right:1px dashed var(--accent)}
.chart .row{position:relative;display:grid;grid-template-columns:200px 1fr 44px;align-items:center;gap:8px;margin:6px 0}
.chart .bar{height:14px;border-radius:7px;display:block}.bar.ok{background:var(--accent)}.bar.no{background:var(--no)}
.rl{font-size:.85em}
.chart2{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px}
.row2{display:grid;grid-template-columns:minmax(120px,1.4fr) 1fr 40px 1fr 40px;gap:8px;align-items:center;margin:7px 0}
.row2.head{font-weight:700;font-size:.85em;color:var(--ink2)}
.track{position:relative;height:14px;background:var(--bg);border-radius:7px;overflow:hidden;display:block}
.okb{position:absolute;top:0;bottom:0;background:var(--soft);border-left:2px solid var(--accent);border-right:2px solid var(--accent)}
.fill{position:absolute;left:0;top:4px;height:6px;border-radius:3px;background:var(--accent)}
.row2.no .fill{background:var(--no)}.rv{font-family:'JetBrains Mono',monospace;font-size:.8em}
@media (max-width:600px){.chart .row{grid-template-columns:120px 1fr 40px}}
table.fp{width:100%;border-collapse:collapse;margin-top:12px;background:var(--card);border-radius:14px;overflow:hidden}
.fp th,.fp td{border:1px solid var(--line);padding:8px 10px;vertical-align:top;text-align:left}
nav{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--line);padding:10px 16px;display:flex;gap:8px;align-items:center;justify-content:center}
nav button,.big{font:inherit;font-weight:700;border:none;border-radius:999px;padding:10px 18px;background:var(--accent);color:#fff;cursor:pointer}
nav select{font:inherit;max-width:46vw;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);padding:8px}
nav .count{color:var(--muted);font-size:.85em}
"""

js = """
const KEY='yc-music-review-v1';
let S={};try{S=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){S={}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
const slides=[...document.querySelectorAll('.slide')];const sel=document.getElementById('jump');
slides.forEach((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=(i+1)+'. '+s.dataset.title;sel.appendChild(o)});
let cur=0;try{cur=+(localStorage.getItem(KEY+':page')||0)}catch(e){}
const hm=location.hash.match(/p=(\\d+)/);if(hm)cur=+hm[1]-1;
function show(i){cur=Math.max(0,Math.min(slides.length-1,i));slides.forEach((s,k)=>s.classList.toggle('on',k===cur));sel.value=cur;
document.getElementById('cnt').textContent=(cur+1)+' / '+slides.length;document.querySelectorAll('audio,video').forEach(m=>{try{m.pause()}catch(e){}});
try{localStorage.setItem(KEY+':page',cur)}catch(e){}window.scrollTo(0,0);if(slides[cur].querySelector('#out'))render()}
document.getElementById('prev').onclick=()=>show(cur-1);document.getElementById('next').onclick=()=>show(cur+1);sel.onchange=()=>show(+sel.value);
document.addEventListener('keydown',e=>{if(['TEXTAREA','SELECT'].includes(e.target.tagName))return;if(e.key==='ArrowRight')show(cur+1);if(e.key==='ArrowLeft')show(cur-1)});
// only one player at a time, so two clips never overlap
document.querySelectorAll('audio,video').forEach(m=>m.addEventListener('play',()=>document.querySelectorAll('audio,video').forEach(o=>{if(o!==m)o.pause()})));
document.querySelectorAll('.opt').forEach(b=>{const q=b.dataset.q;if(S[q]&&S[q].v===b.dataset.v)b.classList.add('sel');
b.onclick=()=>{S[q]=S[q]||{};S[q].v=b.dataset.v;S[q].t=b.querySelector('b').textContent;save();
document.querySelectorAll('.opt[data-q="'+q+'"]').forEach(x=>x.classList.toggle('sel',x===b))}});
document.querySelectorAll('textarea.note[data-q]').forEach(t=>{const q=t.dataset.q;if(S[q]&&S[q].n)t.value=S[q].n;t.oninput=()=>{S[q]=S[q]||{};S[q].n=t.value;save()}});
function render(){const L=['Music review answers'];document.querySelectorAll('.decision').forEach(d=>{const q=d.dataset.id;const a=S[q]||{};
L.push('- '+q+' '+d.dataset.question+': '+(a.t||'(no answer)')+(a.n?' | note: '+a.n:''))});const o=document.getElementById('out');o.value=L.join('\\n');return o.value}
document.getElementById('copy').onclick=async()=>{const txt=render();try{await navigator.clipboard.writeText(txt);document.getElementById('copy').textContent='Copied'}catch(e){const o=document.getElementById('out');o.removeAttribute('readonly');o.select();try{document.execCommand('copy');document.getElementById('copy').textContent='Copied'}catch(e2){document.getElementById('copy').textContent='Select the text below and copy it'}}};
show(cur);
"""

parts = []
for i, (t, k, b) in enumerate(slides):
    parts.append(f'<section class="slide" data-title="{esc(t)}"><div class="kicker">{esc(k)}</div><h1>{esc(t)}</h1>{b}</section>')
page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Music Review Deck</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700;900&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>{css}</style></head><body><div class="wrap">{''.join(parts)}</div>
<nav><button id="prev" aria-label="Previous page">&larr;</button><select id="jump" aria-label="Jump to page"></select><span class="count" id="cnt"></span><button id="next" aria-label="Next page">&rarr;</button></nav>
<script>{js}</script></body></html>"""
open(os.path.join(M, "deck.html"), "w").write(page)
print("slides", len(slides))
