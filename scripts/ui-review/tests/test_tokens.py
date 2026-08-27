"""The deck inlines the built-in token values; this pins them to globals.css so a theme
tweak in the app cannot leave the deck wearing last month's Midnight."""
import json, os, re, sys, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from deck.spec import workspace_root
TOKENS = os.path.join(os.path.dirname(HERE), 'deck', 'tokens.json')
# Resolved through workspace_root(), never relative to this file: the worktree has no youcoded/.
GLOBALS = os.path.join(workspace_root(), 'youcoded', 'desktop', 'src', 'renderer', 'styles', 'globals.css')
KEYS = ['canvas', 'panel', 'inset', 'well', 'accent', 'on-accent', 'fg', 'fg-2', 'fg-dim', 'fg-muted', 'fg-faint', 'edge', 'link']

def css_block(css, theme):
    sel = f'[data-theme="{theme}"]'
    i = css.index(sel); j = css.index('}', i)
    return css[i:j]

class TokenTests(unittest.TestCase):
    def test_four_themes_with_all_keys(self):
        t = json.load(open(TOKENS))
        self.assertEqual(sorted(t), ['creme', 'dark', 'light', 'midnight'])
        for theme, tok in t.items():
            for k in KEYS: self.assertRegex(tok[k], r'^#[0-9A-Fa-f]{6}$', f'{theme}.{k}')
            self.assertIsInstance(tok['_dark'], bool)
    def test_values_match_globals_css(self):
        self.assertTrue(os.path.exists(GLOBALS), GLOBALS + ' missing — the pin must fail, not skip')
        css = open(GLOBALS).read(); t = json.load(open(TOKENS))
        for theme, tok in t.items():
            block = css_block(css, theme)
            for k in KEYS:
                m = re.search(r'--' + re.escape(k) + r':\s*(#[0-9A-Fa-f]{6})', block)
                self.assertIsNotNone(m, f'{theme}: --{k} not in globals.css block'); self.assertEqual(tok[k].upper(), m.group(1).upper(), f'{theme}.{k}')
            self.assertEqual(tok['_dark'], 'color-scheme: dark' in block, theme)

if __name__ == '__main__': unittest.main()
