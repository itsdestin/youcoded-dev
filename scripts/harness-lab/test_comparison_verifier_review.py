"""Fail-closed real submission boundary; trusted-fixture helpers are not a sandbox."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import comparison_tasks as tasks

HERE=Path(__file__).resolve().parent
class SubmissionBoundaryTests(unittest.TestCase):
    def test_untrusted_early_exit_forged_stdout_and_tamper_cannot_enter_verifier_process(self):
        for attack in ['process.exit(0);', 'console.log(JSON.stringify({passed:true,task:"repo-release-integrity"}));process.exit(0);',
                       "require('node:fs').writeFileSync(process.env.YC_ATTACK_MARKER,'tampered');process.exit(0);"]:
            with self.subTest(attack=attack),tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);(root/'submission').mkdir();(root/'submission/README.md').write_text('description '*10)
                (root/'submission/test.cjs').write_text('process.exit(0);')
                p=root/'desktop/src/main/update-manifest-verify.ts';p.parent.mkdir(parents=True);p.write_text(attack)
                marker=root/'must-not-exist'
                import os
                result=subprocess.run(['node',str(HERE/'comparison-verify.cjs'),str(root),'repo-release-integrity'],capture_output=True,text=True,env={**os.environ,'YC_ATTACK_MARKER':str(marker)})
                self.assertNotEqual(result.returncode,0,(result.stdout,result.stderr))
                self.assertIn('untrusted-submission-verification-blocked',result.stderr)
                self.assertFalse(marker.exists())

    def test_public_submission_api_does_not_spawn_untrusted_source_or_trust_exit_status(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(tasks.subprocess,'run',side_effect=AssertionError('untrusted source must not run')):
            result=tasks.verify_against(Path(tmp),'repo-release-integrity',{},Path(tmp))
            self.assertFalse(result['passed']);self.assertFalse(result['submissionAcceptance'])
            self.assertEqual(result['category'],'infrastructure-error')
            self.assertIn('isolated',result['reason'])

class IndependentIntegrityControls(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(prefix='yc-integrity-controls-')
        cls.root=Path(cls.tmp.name);cls.source=cls.root/'source'
        tasks.snapshot(HERE.parents[1]/'youcoded',cls.source)
    @classmethod
    def tearDownClass(cls):cls.tmp.cleanup()

    def test_exported_shell_cannot_reward_an_early_exit_or_forged_success(self):
        destination=self.root/'exported';tasks.export_suite(self.source,destination,'offline-unused',dict(timeoutSec=720,verifierTimeoutSec=90))
        base=destination/tasks.IDS[0];root=base/'environment/fixtures';tasks.reference(root,tasks.IDS[0])
        p=root/'desktop/src/main/update-manifest-verify.ts';p.write_text('console.log(JSON.stringify({passed:true}));process.exit(0);\n'+p.read_text())
        logs=self.root/'verifier-logs';shell=(base/'tests/test.sh').read_text()
        self.assertNotIn('--trusted-fixture-qualification',shell)
        # Exercise the exported shell with temp-only path mappings; no container or real /logs writes.
        shell=shell.replace('/logs/verifier',str(logs)).replace('/tests/',str(base/'tests')+'/').replace('/app ',str(root)+' ')
        result=subprocess.run(['sh','-c',shell],capture_output=True,text=True)
        self.assertEqual((logs/'reward.txt').read_text().strip(),'0')
        self.assertIn('untrusted-submission-verification-blocked',result.stderr)

    def test_same_length_hash_and_signed_wrong_size_are_independent_controls(self):
        for gate in ['actualHash.toLowerCase() !== entry.sha256.toLowerCase()','actualSize !== entry.size']:
            with self.subTest(gate=gate):
                root=self.root/('hash' if gate.startswith('actualHash') else 'size')
                tasks.reset(self.source,root,tasks.IDS[0]);tasks.reference(root,tasks.IDS[0])
                p=root/'desktop/src/main/update-manifest-verify.ts';text=p.read_text();self.assertIn(gate,text)
                p.write_text(text.replace(gate,'false'))
                verdict=tasks.verify(root,tasks.IDS[0]) # explicit trusted fixture qualification only
                self.assertFalse(verdict['passed'],(gate,verdict))

if __name__=='__main__':unittest.main()
