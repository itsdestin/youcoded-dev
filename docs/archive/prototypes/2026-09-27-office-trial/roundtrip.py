# Round-trip each sample through a native x2t: file -> Editor.bin -> same format,
# writing results where compare.py expects saved copies. Usage: roundtrip.py <x2t> <libdir> <outdir>
import subprocess, os, sys, time, shutil
S = '/tmp/claude-1000/-home-destin-youcoded-dev/c25d3b88-5ae3-48b8-9f2e-1e15f2993963/scratchpad'
X, LIB, OUT = sys.argv[1:4]
F = '/home/destin/.local/share/onlyoffice/desktopeditors/data/fonts'
os.makedirs(OUT, exist_ok=True)
env = dict(os.environ, LD_LIBRARY_PATH=LIB)
FMT = {'docx': (8193, 65), 'xlsx': (8194, 257), 'pptx': (8195, 129)}
def run(src, dst, fmt, tag):
    tmp = f'{OUT}/tmp-{tag}'; shutil.rmtree(tmp, ignore_errors=True); os.makedirs(tmp)
    xml = f'<?xml version="1.0" encoding="utf-8"?><TaskQueueDataConvert><m_sFileFrom>{src}</m_sFileFrom><m_sFileTo>{dst}</m_sFileTo><m_nFormatTo>{fmt}</m_nFormatTo><m_sAllFontsPath>{F}/AllFonts.js</m_sAllFontsPath><m_sFontDir>{F}</m_sFontDir><m_sTempDir>{tmp}</m_sTempDir><m_bIsNoBase64>true</m_bIsNoBase64></TaskQueueDataConvert>'
    p = f'{OUT}/{tag}.xml'; open(p, 'w').write(xml)
    t = time.time(); r = subprocess.run([X, p], capture_output=True, text=True, env=env); return time.time() - t, r.returncode
for name in sorted(os.listdir(f'{S}/samples')):
    ext = name.rsplit('.', 1)[1]; to_bin, back = FMT[ext]
    d = f'{OUT}/bin-{name}'; shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    t1, c1 = run(f'{S}/samples/{name}', f'{d}/Editor.bin', to_bin, 'a-' + name)
    t2, c2 = run(f'{d}/Editor.bin', f'{OUT}/saved-{name}', back, 'b-' + name)
    print(f'{name}: open {t1:.2f}s exit {c1} | save {t2:.2f}s exit {c2} | {os.path.getsize(f"{OUT}/saved-{name}") if os.path.exists(f"{OUT}/saved-{name}") else "NO FILE"} bytes')
