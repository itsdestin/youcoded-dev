"""Download CC0 sounds from Freesound's public preview files (no account needed).

WHY: Freesound only serves original files to logged-in users, but its high-quality preview
(an MP3 of the same recording) is public. We fetch the sound's page, REFUSE anything whose page
does not state the CC0 deed, and log author/title/URL to samples/freesound/manifest.tsv so
SOURCES.md can be checked against what was actually used.
"""
import re, sys, html, urllib.request, pathlib
HERE = pathlib.Path(__file__).resolve().parent.parent
OUT = HERE / "samples" / "freesound"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/130.0"}

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()

def fetch(user, sid):
    OUT.mkdir(parents=True, exist_ok=True)
    dst = OUT / f"{sid}.mp3"
    page_url = f"https://freesound.org/people/{user}/sounds/{sid}/"
    if dst.exists():
        return dst
    page = get(page_url).decode("utf-8", "replace")
    lic = set(re.findall(r"creativecommons\.org/[a-z/.0-9]+", page))
    if lic != {"creativecommons.org/publicdomain/zero/1.0/"}:
        print("SKIP (not plain CC0)", sid, lic); return None
    title = html.unescape(re.search(r"<title>Freesound - ([^<]*)", page).group(1))
    prev = re.search(r"https://cdn\.freesound\.org/previews/[^\"]+-hq\.mp3", page).group(0)
    dst.write_bytes(get(prev))
    with open(OUT / "manifest.tsv", "a") as f:
        f.write(f"{sid}\t{user}\t{title}\t{page_url}\tCC0 1.0\t{prev}\n")
    print("ok", sid, title)
    return dst

if __name__ == "__main__":
    for arg in sys.argv[1:]:
        user, sid = arg.split("/")
        fetch(user, sid)
