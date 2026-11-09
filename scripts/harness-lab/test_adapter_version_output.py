import unittest
from pathlib import Path
from evaluation_qualification import LocalProbe

class VersionOutputTests(unittest.TestCase):
    def test_hermes_product_header_not_dependency_versions(self):
        probe=LocalProbe(Path('/unused'));probe.image_id='sha256:fixture'
        probe.isolated=lambda *args:'Hermes Agent v0.22.2 (2026.9.24) · stable · local d923a5eb487a\nInstall directory: /root/.hermes/hermes-agent\nPython: 3.14.7\nOpenAI SDK: 2.24.0'
        self.assertTrue(probe.arm({'adapter':'hermes','version':'v0.22.2'},None)['qualified'])

    def test_wrong_or_ambiguous_product_header_refused(self):
        for output in ['Hermes Agent v0.22.1\nPython: 0.22.2','Python: 0.22.2','Hermes Agent v0.22.2-dev','Hermes Agent v0.22.2\nHermes Agent v0.22.3']:
            with self.subTest(output=output):
                probe=LocalProbe(Path('/unused'));probe.image_id='sha256:fixture';probe.isolated=lambda *args:output
                with self.assertRaises(ValueError):probe.arm({'adapter':'hermes','version':'v0.22.2'},None)

if __name__=='__main__':unittest.main()
