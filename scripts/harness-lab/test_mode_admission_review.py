"""No model call may precede qualification of the complete selected matrix."""
import unittest
from unittest.mock import patch
import evaluation_workflow as workflow


class ModeAdmissionReview(unittest.TestCase):
    def test_unqualified_matrix_cannot_reach_gateway_or_key_handling(self):
        manifest = {'evaluation': {'blockers': [], 'mode': 'compare'}}
        with patch.object(workflow, 'check', return_value=manifest), patch.object(workflow.legacy, 'run') as paid:
            with self.assertRaisesRegex(ValueError, 'qualification'):
                workflow.run('/fixture/prepared.json', True, '/fixture/receipt.json', '/private/key')
            paid.assert_not_called()


if __name__ == '__main__':
    unittest.main()
