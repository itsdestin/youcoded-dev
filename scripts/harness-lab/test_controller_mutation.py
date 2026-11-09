import tempfile
import unittest
from pathlib import Path
import controller_mutation as mutation
from unittest.mock import patch

class ControllerMutationTests(unittest.TestCase):
    def test_exact_change_receipt_and_stale_refusal(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);target=root/'note.txt';target.write_text('before')
            spec={'file':'note.txt','expectedBefore':'before','replacement':'user revision'}
            receipt=mutation.apply_change(root,spec)
            self.assertEqual(target.read_text(),'user revision')
            self.assertEqual(receipt['kind'],'external-change-between-turns')
            self.assertTrue(receipt['applied']);self.assertEqual(receipt['applications'],1)
            self.assertNotEqual(receipt['beforeHash'],receipt['afterHash'])
            with self.assertRaisesRegex(ValueError,'changed'):
                mutation.apply_change(root,spec)
            self.assertEqual(target.read_text(),'user revision')

    def test_partial_write_rollback_and_failure_receipt(self):
        for fail_rollback in (False,True):
            with tempfile.TemporaryDirectory() as folder:
                root=Path(folder);target=root/'note.txt';target.write_text('original')
                original_write=mutation.os.write;calls=0
                def injected(fd,data):
                    nonlocal calls
                    calls+=1
                    if calls==1: return original_write(fd,data[:1])
                    if calls==2 or fail_rollback: raise OSError('simulated disk failure')
                    return original_write(fd,data)
                with patch.object(mutation.os,'write',injected):
                    with self.assertRaises(Exception) as raised:
                        mutation.apply_change(root,{'file':'note.txt','expectedBefore':'original','replacement':'replacement'})
                self.assertFalse(raised.exception.receipt['applied'])
                self.assertTrue(raised.exception.receipt['rollbackAttempted'])
                self.assertEqual(raised.exception.receipt['restorationVerified'],not fail_rollback)
                if not fail_rollback: self.assertEqual(target.read_text(),'original')

    def test_rollback_does_not_overwrite_unexpected_intervening_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);target=root/'note.txt';target.write_text('original')
            original_write=mutation.os.write;calls=0
            def injected(fd,data):
                nonlocal calls
                calls+=1
                if calls==1: return original_write(fd,data[:1])
                mutation.os.lseek(fd,0,mutation.os.SEEK_SET)
                original_write(fd,b'other user edit');mutation.os.ftruncate(fd,len(b'other user edit'))
                raise OSError('simulated failure after external change')
            with patch.object(mutation.os,'write',injected):
                with self.assertRaises(mutation.MutationWriteError) as raised:
                    mutation.apply_change(root,{'file':'note.txt','expectedBefore':'original','replacement':'replacement'})
            self.assertFalse(raised.exception.receipt['rollbackAttempted'])
            self.assertFalse(raised.exception.receipt['restorationVerified'])
            self.assertEqual(target.read_text(),'other user edit')

    def test_path_and_link_refusals(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);outside=root/'outside';outside.write_text('before');task=root/'task';task.mkdir()
            (task/'note.txt').symlink_to(outside)
            for file in ['../outside','/outside','sub/file','note.txt']:
                with self.assertRaises((ValueError,OSError)):
                    mutation.apply_change(task,{'file':file,'expectedBefore':'before','replacement':'bad'})
            self.assertEqual(outside.read_text(),'before')

if __name__=='__main__': unittest.main()
