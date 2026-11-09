import unittest
import tempfile
import json
from pathlib import Path
from comparison_report import gate_totals, answer_from_trajectory, collect, communication_summary

class ComparisonReportTests(unittest.TestCase):
    def test_ratings_weight_tasks_equally_despite_missing_judge_repeat(self):
        grades=[{'agent':'a','task':'x','clarity':1,'concision':1}]+[
            {'agent':'a','task':'y','clarity':5,'concision':5} for _ in range(3)]
        summary=communication_summary({'grades':grades},['a'],['x','y'])[0]
        self.assertEqual(summary['clarity'],3)
        self.assertEqual(summary['concision'],3)
        self.assertEqual(summary['acceptedGrades'],4)

    def test_cache_is_included_once_and_unknown_usage_stays_unknown(self):
        rows=[{'usageComplete':True,'usage':{'inputTokens':10,'cacheCreationInputTokens':20,'cacheReadInputTokens':30,'outputTokens':5}}]
        self.assertEqual(gate_totals(rows)['totalTokens'],65)
        self.assertEqual(gate_totals(rows)['cachedInputTokens'],30)
        self.assertIsNone(gate_totals(rows+[{'usageComplete':False}])['totalTokens'])
        self.assertIsNone(gate_totals([])['totalTokens'])
    def test_out_of_window_requests_are_not_assumed_to_be_free_setup(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/'trials.json').write_text(json.dumps([{'id':'x','agent':'pi','task':'task','repetition':0}]))
            trial_dir=root/'jobs/x/run'; trial_dir.mkdir(parents=True)
            (trial_dir/'result.json').write_text(json.dumps({'agent_execution':{
                'started_at':'1970-01-01T00:01:40Z','finished_at':'1970-01-01T00:01:50Z'},
                'verifier_result':{'rewards':{'reward':1}}}))
            ledger={'requests':[{'trialId':'x','startedAt':90,'usageComplete':False},
                {'trialId':'x','startedAt':105,'usageComplete':True,'usage':{
                    'inputTokens':10,'cacheCreationInputTokens':20,'cacheReadInputTokens':30,'outputTokens':5}}]}
            (trial_dir/'agent').mkdir()
            (trial_dir/'agent/client-timing.json').write_text(json.dumps([{'seconds':2,'completed':True}]))
            row=collect(root,ledger)[0]
            self.assertEqual(row['clientSeconds'],2)
            self.assertEqual(row['reportingOverheadSeconds'],8)
            self.assertEqual(row['totalTokens'],65)
            self.assertEqual(row['allAttemptRequests'],2)
            self.assertEqual(row['outOfWindowRequests'],1)
            self.assertIsNone(row['outOfWindowUsage']['totalTokens'])
            self.assertEqual(row['outOfWindowUsage']['requests'],1)
            self.assertEqual(len(ledger['requests']),2)

    def test_extracts_final_agent_answer_not_tool_observation(self):
        trajectory={'steps':[{'source':'agent','message':'Checking','tool_calls':[{}]},
                             {'source':'user','message':'tool output'},
                             {'source':'agent','message':'Final answer'}]}
        self.assertEqual(answer_from_trajectory(trajectory),'Final answer')

if __name__=='__main__': unittest.main()
