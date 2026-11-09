import unittest
from communication_judge import validate_scores

class JudgeTests(unittest.TestCase):
    def test_accepts_only_complete_unique_quote_grounded_grades(self):
        answers={'A':'Wrote the file.'}
        grade={'id':'A','clarity':5,'concision':4,'quote':'Wrote the file.','rationale':'Direct.'}
        self.assertEqual(validate_scores([grade],answers),[grade])
        for invalid in [[{**grade,'quote':'invented'}], [grade,grade], [], [{**grade,'clarity':6}], [{**grade,'id':'B'}]]:
            with self.assertRaises(ValueError): validate_scores(invalid,answers)

if __name__=='__main__': unittest.main()
