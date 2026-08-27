"""A synthetic screenshot run for the deck tests: flat 1440x900 'shots' with a known
rectangle that changes, and a manifest with known measurements. Lets every deck test run
without Chrome or the workbench."""
import json, os, subprocess

GEO = '400x200+500+250'

def make_fixture(tmp, themes=('midnight', 'light')):
    for run in ('before', 'after'):
        for theme in themes:
            d = os.path.join(tmp, 'runs', run, 'shots-main', theme); os.makedirs(d, exist_ok=True)
            cmd = ['magick', '-size', '1440x900', 'xc:#202020' if theme == 'midnight' else 'xc:#EEEEEE']
            if run == 'after':
                cmd += ['-fill', 'red', '-draw', 'rectangle 560,260 679,299', '-fill', 'blue', '-draw', 'rectangle 20,20 29,29']
            subprocess.run(cmd + [os.path.join(d, 'home.png')], check=True)
        mf = [{'name': 'home', 'theme': t, 'verified': True, 'run': '1', 'file': f'{t}/home.png',
               'measures': {'#send': {'x': 600, 'y': 300, 'w': 80, 'h': 30}, 'text:Send': {'x': 600, 'y': 300, 'w': 80, 'h': 30}}} for t in themes]
        json.dump(mf, open(os.path.join(tmp, 'runs', run, 'shots-main', 'manifest-main-x.json'), 'w'))
    deck = os.path.join(tmp, 'deck'); os.makedirs(deck, exist_ok=True)
    spec = {'title': 'Fixture review', 'key': 'fixture', 'out': 'fixture.html', 'images': 'images',
            'runs': {'before': os.path.join(tmp, 'runs', 'before'), 'after': os.path.join(tmp, 'runs', 'after')},
            'themes': list(themes), 'crops': {'c': ['main', 'home', GEO]},
            'steps': [
                {'id': 'S-1', 'surface': 'Home', 'path': 'Chat', 'crop': 'c', 'headline': 'A red block appeared.',
                 'changed': 'A red block was painted.', 'measured': '120 px wide', 'notice': 'You see red.', 'risk': 'None really.'},
                {'id': 'S-2', 'surface': 'Home', 'path': 'Chat', 'crop': 'c', 'highlight': {'selector': '#send'},
                 'headline': 'The send button moved.', 'changed': 'Moved 4 px.', 'notice': 'Nothing much.'},
                {'id': 'S-3', 'surface': 'Home', 'path': 'Chat', 'crop': 'c', 'highlight': {'text': 'Send'},
                 'headline': 'Same, by text.', 'changed': 'Moved 4 px.', 'notice': 'Nothing much.'}]}
    p = os.path.join(deck, 'deck.json'); json.dump(spec, open(p, 'w'), indent=1); return p
