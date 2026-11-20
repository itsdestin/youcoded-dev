"""Fixes for the second code review of the review-deck rethink (F1-F12). Each test names the finding it pins."""
import hashlib, json, os, subprocess, sys, tempfile, threading, time, unittest, urllib.error, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, HERE)
from fixture import make_fixture
from deck import serve as S
from deck.build import _built, save_as_built
from deck.gate import check_gate
from deck.grows import problems, spec_at_commit, spec_bytes_at_commit
from deck.spec import load_spec, row_states, validate
import test_gate as TG
import test_grows as TGR


def git(cwd, *a):
    return subprocess.run(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', *a], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def sha_of(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


class AsHeSawIt(unittest.TestCase):
    """F1 / F2: the gate reads the spec whose fingerprint matches what he was shown."""
    def setUp(self):
        self.tmp = tempfile.mkdtemp(); git(self.tmp, 'init', '-q')
        self.b = os.path.join(self.tmp, 'x.walkthrough.json'); self.a = os.path.join(self.tmp, 'x.walkthrough.after.json')
        TG.w(self.b, TG.BEFORE); git(self.tmp, 'add', 'x.walkthrough.json'); git(self.tmp, 'commit', '-qm', 'c')
        self.commit = git(self.tmp, 'rev-parse', 'HEAD')
        TG.w(self.a, TG.AFTER)
        # the working file gains a request row AFTER the commit, and he is shown (and answers) that version
        edited = json.loads(json.dumps(TG.BEFORE)); edited['steps'][0]['calls'].append({'id': 'new', 'call': 'Added later.', 'why': 'x', 'decided': 'i asked for this too'})
        TG.w(self.b, edited); self.sha = sha_of(self.b)
        TG.w(os.path.join(self.tmp, 'x.walkthrough.answers.json'), {**TG.SUB, 'built': {'at': 'x', 'commit': self.commit, 'spec_sha256': self.sha, 'spec_dirty': True}})
        TG.w(os.path.join(self.tmp, 'x.walkthrough.after.answers.json'), {**TG.TICKED, 'built': {'at': 'y', 'spec_sha256': sha_of(self.a)}})

    def test_f1_an_uncommitted_row_he_saw_is_not_silently_dropped(self):
        problems_, notes = check_gate(self.b)
        self.assertTrue(any('request W-1/new' in p for p in problems_), problems_)   # the old code read the committed file and never saw this row
        self.assertTrue(any('fingerprint matches' in n for n in notes), notes)

    def test_f1_changed_since_and_no_copy_fails_plainly(self):
        edited = json.load(open(self.b)); edited['title'] = 'changed again'; TG.w(self.b, edited)
        problems_, _ = check_gate(self.b)
        self.assertEqual(len(problems_), 1); self.assertIn('cannot tell what he saw', problems_[0])

    def test_f1_the_as_built_copy_is_used_when_the_file_moved_on(self):
        saved = os.path.join(self.tmp, f'x.walkthrough.as-built.{self.sha[:12]}.json'); open(saved, 'wb').write(open(self.b, 'rb').read())
        edited = json.load(open(self.b)); edited['title'] = 'changed again'; TG.w(self.b, edited)
        problems_, notes = check_gate(self.b)
        self.assertTrue(any('request W-1/new' in p for p in problems_), problems_)
        self.assertTrue(any('as-built' in n for n in notes), notes)

    def test_f1_build_records_full_commit_fingerprint_and_keeps_a_copy_when_dirty(self):
        spec = {'_base': self.tmp, '_stem': 'x.walkthrough', 'steps': []}
        built = _built(spec)['built']
        self.assertEqual(built['commit'], self.commit); self.assertEqual(built['spec_sha256'], self.sha); self.assertTrue(built['spec_dirty'])
        dest = save_as_built(spec)
        self.assertEqual(sha_of(dest), self.sha)
        git(self.tmp, 'add', 'x.walkthrough.json'); git(self.tmp, 'commit', '-qm', 'now committed')
        self.assertFalse(_built(spec)['built']['spec_dirty'])

    def test_f2_the_after_spec_edited_after_his_submit_fails(self):
        self.assertFalse(any('changed after he submitted' in p for p in check_gate(self.b)[0]))
        after = json.load(open(self.a)); after['steps'][1]['calls'][0]['result'] = 'fail'; TG.w(self.a, after)
        self.assertTrue(any('changed after he submitted' in p for p in check_gate(self.b)[0]))


class NotesNeverLost(unittest.TestCase):
    """F3: a page comment, a general note or a note on an unanswered step must be acknowledged before the next build."""
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def spec(self, **over):
        return TGR.base_spec(**over)

    def seed(self, **extra):
        with open(os.path.join(self.tmp, 'grow.answers.3.json'), 'w') as f:
            json.dump({'deck': 'grow', 'submitted': '2026-11-03T10:00:00Z', 'built': {'at': '2026-11-03T09:00:00Z'}, 'answers': {}, **extra}, f)

    def probs(self, spec):
        return problems(load_spec(TGR.put(self.tmp, spec)))

    def test_each_kind_is_refused_until_acknowledged(self):
        self.seed(pageNotes={'P-1': 'the intro is confusing'}, notes='overall: too long', answers={'Q-1': {'note': 'unsure about this'}})
        errs = self.probs(self.spec())
        for key in ('P-1', 'general', 'Q-1'):
            self.assertTrue(any(e.startswith(key + ':') for e in errs), errs)
        ok = self.spec(notes_handled={'P-1': 'Reworded the intro.', 'general': 'Read; not acted on', 'Q-1': {'round': 'Round 1', 'done': 'Added an example.'}})
        self.assertEqual([e for e in self.probs(ok) if 'acknowledged' in e], [])

    def test_a_line_from_an_earlier_round_cannot_stand_in_for_a_new_comment(self):
        self.seed(pageNotes={'P-1': 'first'})
        with open(os.path.join(self.tmp, 'grow.answers.4.json'), 'w') as f:
            json.dump({'deck': 'grow', 'submitted': '2026-11-04T10:00:00Z', 'built': {'at': '2026-11-04T09:00:00Z'}, 'answers': {}, 'pageNotes': {'P-1': 'second'}}, f)
        errs = self.probs(self.spec(notes_handled={'P-1': 'Fixed the first.'}))
        self.assertTrue(any('P-1' in e and 'acknowledged' in e for e in errs), errs)
        errs = self.probs(self.spec(notes_handled={'P-1': {'round': 'Round 2', 'done': 'Fixed the second.'}}))
        self.assertEqual([e for e in errs if 'acknowledged' in e], [])

    def test_the_page_shows_his_words_and_what_was_done(self):
        from deck.build import deck_data
        self.seed(pageNotes={'P-1': 'the intro is confusing'})
        data = deck_data(load_spec(TGR.put(self.tmp, self.spec(notes_handled={'P-1': 'Reworded the intro.'}))), {})
        page = [p for p in data['pages'] if p['id'] == 'P-1'][0]
        self.assertEqual([(h['said'], h['done'], h['round']) for h in page['handled']], [('the intro is confusing', 'Reworded the intro.', 'Round 1')])

    def test_the_field_is_checked(self):
        spec = self.spec(notes_handled={'P-1': ''})
        self.assertTrue(any('notes_handled' in e for e in validate(load_spec(TGR.put(self.tmp, spec)))[0]))


class LegacyReading(unittest.TestCase):
    def test_f4_a_bare_area_is_not_an_old_style_approval(self):
        step = {'id': 'L', 'words': True, 'calls': [{'id': 'a', 'call': 'A', 'why': 'x'}, {'id': 'b', 'call': 'B', 'why': 'x'}]}
        self.assertEqual(set(row_states(step, {'v': 'other', 'marks': [{'pic': 'overview', 'x': 1, 'y': 1, 'w': 5, 'h': 5}]}).values()), {'unlooked'})
        self.assertEqual(set(row_states(step, {'v': 'other', 'changes': {'a': 'x'}}).values()), {'changed', 'ok'})   # the real old shape still reads as before
        self.assertEqual(set(row_states(step, {'v': 'other'}).values()), {'unlooked'})


class FileSetAside(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(); self.ap = os.path.join(self.tmp, 'd.answers.json')
        self.new = {'deck': 'd', 'built': {'at': 'NEW'}}

    def test_f6_any_of_his_state_is_kept_and_said_out_loud(self):
        for key, val in (('reopened', {'Q-1': True}), ('pageAttach', {'P-1': [{'path': '/x'}]}), ('notesAttach', [{'path': '/x'}])):
            S.write_atomic(self.ap, {'deck': 'd', 'built': {'at': 'OLD'}, key: val}); logs = []
            self.assertEqual(S.save_state(self.ap, dict(self.new), served_build='NEW', log=logs.append)[0], 200)
            self.assertTrue(any('unsent' in l for l in logs), logs)
        self.assertEqual(len([n for n in os.listdir(self.tmp) if '.unsent.' in n]), 3)

    def test_f7_a_submitted_file_of_another_build_becomes_a_round_and_is_never_folded_in(self):
        S.write_atomic(self.ap, {'deck': 'd', 'built': {'at': 'OLD'}, 'submitted': '2026-11-10T10:00:00Z', 'answers': {'Q-1': {'v': 'yes'}}})
        self.assertEqual(S.save_state(self.ap, {**self.new, 'answers': {'Q-2': {'v': 'no'}}}, served_build='NEW')[0], 200)
        now = json.load(open(self.ap)); self.assertNotIn('submitted', now); self.assertEqual(list(now['answers']), ['Q-2'])
        rounds = [n for n in os.listdir(self.tmp) if n.startswith('d.answers.') and n != 'd.answers.json']
        self.assertEqual(len(rounds), 1); self.assertEqual(json.load(open(os.path.join(self.tmp, rounds[0])))['submitted'], '2026-11-10T10:00:00Z')


class Server(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(); self.spec = load_spec(make_fixture(self.tmp))
        open(os.path.join(self.spec['_base'], 'fixture.html'), 'w').write('<p>deck</p>')
        self.srv, url = S.make_server(self.spec, 0, lambda s: None)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start(); self.base = url.rsplit('/', 1)[0]

    def tearDown(self):
        self.srv.shutdown(); self.srv.server_close()

    def test_f9_a_huge_json_body_is_refused_before_it_is_read(self):
        req = urllib.request.Request(self.base + '/answers', data=b'{"deck":"fixture","pad":"' + b'x' * (S.JSON_MAX + 10) + b'"}', headers={'content-type': 'application/json'}, method='POST')
        with self.assertRaises((urllib.error.HTTPError, urllib.error.URLError, ConnectionError)) as cm:
            urllib.request.urlopen(req, timeout=5)
        if isinstance(cm.exception, urllib.error.HTTPError):
            self.assertEqual(cm.exception.code, 413)
        self.assertFalse(os.path.exists(S.answers_path(self.spec)))

    def test_f9_head_gets_the_same_origin_check_as_get(self):
        import http.client
        port = self.srv.server_address[1]
        c = http.client.HTTPConnection('127.0.0.1', port, timeout=5); c.request('HEAD', '/fixture.html', headers={'Host': 'evil.example'}); self.assertEqual(c.getresponse().status, 403)
        c = http.client.HTTPConnection('127.0.0.1', port, timeout=5); c.request('HEAD', '/fixture.html'); self.assertEqual(c.getresponse().status, 200)


class Voice(unittest.TestCase):
    def test_f8_close_lets_the_helper_stop_its_recorder_before_it_is_ended(self):
        marker = os.path.join(tempfile.mkdtemp(), 'stopped')
        code = ("import sys\nfor line in sys.stdin:\n    pass\nopen(%r, 'w').write('recorder stopped')\n" % marker)   # a helper that cleans up when its input closes
        v = S.VoiceBridge(); v.proc = subprocess.Popen([sys.executable, '-c', code], stdin=subprocess.PIPE, text=True)
        v.close()
        self.assertTrue(os.path.exists(marker), 'the helper was ended before it could stop its recorder')

    def test_f8_a_helper_that_ignores_its_input_is_still_ended(self):
        v = S.VoiceBridge(); v.VOICE_EXIT_WAIT_S = 0.3
        v.proc = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'], stdin=subprocess.PIPE, text=True)
        p = v.proc; t0 = time.monotonic(); v.close()
        self.assertIsNotNone(p.poll()); self.assertLess(time.monotonic() - t0, 5)


class VoiceHelperRecorder(unittest.TestCase):
    def test_f8_the_recorder_does_not_outlive_a_helper_that_is_signalled(self):
        """A fake `parec` stands in for the microphone. WHY: before the fix a SIGTERM to the helper left the recorder (and so the microphone) running."""
        import shutil, signal
        node = shutil.which('node')
        if not node:
            self.skipTest('no node')
        tmp = tempfile.mkdtemp(); pidfile = os.path.join(tmp, 'parec.pid')
        with open(os.path.join(tmp, 'parec'), 'w') as f:
            f.write(f'#!/bin/sh\necho $$ > "{pidfile}"\nexec sleep 300\n')
        os.chmod(os.path.join(tmp, 'parec'), 0o755)
        helper = os.path.join(os.path.dirname(HERE), 'deck', 'voice-helper.mjs')
        h = subprocess.Popen([node, helper], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, env={**os.environ, 'PATH': tmp + os.pathsep + os.environ['PATH']})
        try:
            self.assertIn('ready', h.stdout.readline())
            h.stdin.write('start\n'); h.stdin.flush()
            for _ in range(50):
                if os.path.exists(pidfile) and open(pidfile).read().strip():
                    break
                time.sleep(0.1)
            pid = int(open(pidfile).read())
            h.send_signal(signal.SIGTERM); h.wait(timeout=5); time.sleep(0.3)
            with self.assertRaises(ProcessLookupError):
                os.kill(pid, 0)
        finally:
            if h.poll() is None:
                h.kill()
            h.stdout.close(); h.stdin.close()


class Commits(unittest.TestCase):
    def test_f10_only_a_plain_hash_reaches_git(self):
        tmp = tempfile.mkdtemp(); git(tmp, 'init', '-q'); p = os.path.join(tmp, 's.json'); open(p, 'w').write('{}')
        git(tmp, 'add', 's.json'); git(tmp, 'commit', '-qm', 'c'); good = git(tmp, 'rev-parse', 'HEAD')
        self.assertEqual(spec_at_commit(p, good), {})
        out = os.path.join(tmp, 'pwned')
        for bad in (f'--output={out}', 'HEAD', 'abc', 'g' * 10, None, 7):
            self.assertIsNone(spec_bytes_at_commit(p, bad))
        self.assertFalse(os.path.exists(out))


class CitesNeedRealIds(unittest.TestCase):
    def test_f11_product_names_pass_but_real_ids_and_rounds_do_not(self):
        tmp = tempfile.mkdtemp()
        for ok in ('GPT-4 is the model', 'Saved as UTF-8', 'Works on a Pi-4'):
            st = TGR.base_spec(); st['steps'][1]['headline'] = ok
            self.assertEqual([e for e in validate(load_spec(TGR.put(tmp, st)))[0] if 'plain words' in e], [], ok)
        st = TGR.base_spec(); st['steps'][1]['headline'] = 'The Q-3 idea again?'
        self.assertTrue(any('plain words' in e for e in validate(load_spec(TGR.put(tmp, st)))[0]))
        st = TGR.base_spec(); st['steps'][1]['headline'] = 'As in round 4'
        self.assertTrue(any('plain words' in e for e in validate(load_spec(TGR.put(tmp, st)))[0]))


if __name__ == '__main__':
    unittest.main()
