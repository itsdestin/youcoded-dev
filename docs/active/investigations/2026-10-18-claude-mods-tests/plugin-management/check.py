#!/usr/bin/env python3
"""No-network official plugin lifecycle probe. Never uses the user's Claude profile."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import sys

EXTENDED = '--extended' in sys.argv
# WHY: preserve the original lifecycle evidence when adding upgrade/scope cases.
OUT = Path(__file__).resolve().parent / ('extended-results.json' if EXTENDED else 'results.json')
CLAUDE = shutil.which('claude')
BWRAP = shutil.which('bwrap')
if not CLAUDE or not BWRAP:
    raise SystemExit('Required installed claude and bwrap not found; nothing run')


def write_json(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, indent=2) + '\n')


def parse_json_output(text):
    # WHY: some commands prepend progress text before their documented final JSON.
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        for line in reversed(text.splitlines()):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                pass
    return None


report = {'scope': 'offline user-scope local marketplace lifecycle only',
          'network': 'bubblewrap --unshare-net',
          'credentials': 'fresh HOME/config, allowlisted environment, none copied',
          'commands': [], 'checks': []}
with tempfile.TemporaryDirectory(prefix='yc-plugin-lifecycle-') as temp:
    root = Path(temp)
    home = root / 'home'
    config = home / '.claude'
    project = root / 'project'
    tmp = root / 'tmp'
    for directory in (home, config, project, tmp):
        directory.mkdir(parents=True, exist_ok=True)
    market = root / 'marketplace'
    plugin = market / 'plugins' / 'probe-skill'
    write_json(market / '.claude-plugin' / 'marketplace.json', {
        'name': 'yc-reliability-probe', 'owner': {'name': 'YouCoded isolated test'},
        'plugins': [{'name': 'probe-skill', 'source': './plugins/probe-skill',
                     'description': 'Inert skill for offline registration testing'}]})
    write_json(plugin / '.claude-plugin' / 'plugin.json', {
        'name': 'probe-skill', 'version': '1.0.0',
        'description': 'Inert skill for offline registration testing'})
    skill = plugin / 'skills' / 'probe-check' / 'SKILL.md'
    skill.parent.mkdir(parents=True)
    skill.write_text('---\nname: probe-check\ndescription: Isolated registration fixture\n---\nSay PROBE ONLY. Do not use tools.\n')

    # WHY: the existing general probe helper inherits non-CLAUDE provider secrets;
    # this probe needs none, so construct rather than filter the child environment.
    env = {
        'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': str(home),
        'CLAUDE_CONFIG_DIR': str(config), 'TMPDIR': str(tmp),
        'XDG_CONFIG_HOME': str(home / '.config'),
        'XDG_CACHE_HOME': str(home / '.cache'), 'XDG_DATA_HOME': str(home / '.local/share'),
        'LANG': 'C.UTF-8', 'TERM': 'dumb',
        'DISABLE_AUTOUPDATER': '1', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC': '1',
    }

    def run(name, args, cwd=project):
        # WHY: even an upstream command unexpectedly writing a host path or making
        # a request cannot escape this test's writable root / network namespace.
        cmd = [BWRAP, '--ro-bind', '/', '/', '--bind', str(root), str(root),
               '--unshare-net', '--die-with-parent', '--chdir', str(cwd),
               '--', CLAUDE, *args]
        started = time.monotonic()
        try:
            proc = subprocess.run(cmd, env=env, stdin=subprocess.DEVNULL,
                                  capture_output=True, text=True, timeout=30)
            item = {'name': name, 'args': args, 'exit': proc.returncode,
                    'seconds': round(time.monotonic() - started, 3),
                    'stdout': proc.stdout[-16000:], 'stderr': proc.stderr[-8000:],
                    'json': parse_json_output(proc.stdout)}
        except subprocess.TimeoutExpired:
            # subprocess.run kills its exact bwrap child; --die-with-parent
            # prevents the confined CLI from becoming an orphan.
            item = {'name': name, 'args': args, 'exit': None, 'timeout': True}
        report['commands'].append(item)
        write_json(OUT, report)
        print(name, 'exit=', item['exit'], flush=True)
        return item

    plugin_id = 'probe-skill@yc-reliability-probe'
    run('version', ['--version'])
    run('validate-marketplace', ['plugin', 'validate', str(market)])
    run('add-marketplace', ['plugin', 'marketplace', 'add', str(market), '--scope', 'user', '--json'])
    run('install', ['plugin', 'install', plugin_id, '--scope', 'user', '--json'])
    installed = run('list-installed', ['plugin', 'list', '--json'])
    run('disable', ['plugin', 'disable', plugin_id, '--scope', 'user', '--json'])
    disabled = run('list-disabled', ['plugin', 'list', '--json'])
    run('enable', ['plugin', 'enable', plugin_id, '--scope', 'user', '--json'])
    enabled = run('list-enabled', ['plugin', 'list', '--json'])
    run('uninstall', ['plugin', 'uninstall', plugin_id, '--scope', 'user', '--json'])
    removed = run('list-removed', ['plugin', 'list', '--json'])
    missing = run('install-missing', ['plugin', 'install', 'does-not-exist@yc-reliability-probe', '--scope', 'user', '--json'])

    def entries(item):
        value = item.get('json')
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            return value.get('plugins', value.get('installed', []))
        return []

    def own(item):
        return [x for x in entries(item) if isinstance(x, dict) and
                (x.get('id') == plugin_id or x.get('name') == plugin_id)]

    checks = {
        'all_ordinary_commands_exit_zero': all(x['exit'] == 0 for x in report['commands'] if x['name'] != 'install-missing'),
        'installed_list_contains_plugin': len(own(installed)) == 1,
        'disabled_list_reports_false': len(own(disabled)) == 1 and own(disabled)[0].get('enabled') is False,
        'enabled_list_reports_true': len(own(enabled)) == 1 and own(enabled)[0].get('enabled') is True,
        'removed_list_omits_plugin': not own(removed) and removed.get('json') is not None,
        'missing_plugin_returns_failure': missing['exit'] is not None and missing['exit'] != 0,
    }
    if EXTENDED:
        report['scope'] = 'offline lifecycle plus local-folder upgrade and project/local scope records'
        run('reinstall-v1', ['plugin', 'install', plugin_id, '--scope', 'user', '--json'])
        # This is our source fixture, never an installed plugin or a live profile.
        write_json(plugin / '.claude-plugin' / 'plugin.json', {
            'name': 'probe-skill', 'version': '1.1.0',
            'description': 'Updated inert registration fixture'})
        run('refresh-local-marketplace', ['plugin', 'marketplace', 'update', 'yc-reliability-probe', '--json'])
        upgrade = run('update-v1-to-v1.1', ['plugin', 'update', plugin_id, '--scope', 'user', '--json'])
        upgraded = run('list-upgraded', ['plugin', 'list', '--json'])
        run('remove-upgraded-user', ['plugin', 'uninstall', plugin_id, '--scope', 'user', '--json'])
        project_b = root / 'project-b'
        project_b.mkdir()
        run('install-project-a', ['plugin', 'install', plugin_id, '--scope', 'project', '--json'])
        a = run('list-from-project-a', ['plugin', 'list', '--json'])
        b_before = run('list-from-project-b-before-local', ['plugin', 'list', '--json'], cwd=project_b)
        run('install-local-b', ['plugin', 'install', plugin_id, '--scope', 'local', '--json'], cwd=project_b)
        b = run('list-from-project-b', ['plugin', 'list', '--json'], cwd=project_b)
        run('remove-project-a', ['plugin', 'uninstall', plugin_id, '--scope', 'project', '--json'])
        b_after = run('list-b-after-removing-a', ['plugin', 'list', '--json'], cwd=project_b)
        # WHY: a surviving registration is not enough if uninstall removed its shared cache.
        surviving_files = bool(own(b_after)) and all(
            (Path(x['installPath']) / '.claude-plugin' / 'plugin.json').is_file()
            for x in own(b_after))
        run('remove-local-b', ['plugin', 'uninstall', plugin_id, '--scope', 'local', '--json'], cwd=project_b)
        last = run('list-after-all-scopes-removed', ['plugin', 'list', '--json'], cwd=project_b)
        checks.update({
            'extended_commands_exit_zero': all(x['exit'] == 0 for x in report['commands'] if x['name'] != 'install-missing'),
            'updated_version_reported': len(own(upgraded)) == 1 and own(upgraded)[0].get('version') == '1.1.0',
            'project_scope_recorded': any(x.get('scope') == 'project' and x.get('projectPath') == str(project) for x in own(a)),
            'local_scope_recorded': any(x.get('scope') == 'local' and x.get('projectPath') == str(project_b) for x in own(b)),
            'removing_project_preserves_other_local': any(x.get('scope') == 'local' and x.get('projectPath') == str(project_b) for x in own(b_after)),
            'other_project_install_initially_disabled': bool(own(b_before)) and all(x.get('enabled') is False for x in own(b_before)),
            'removing_project_preserves_local_cached_files': surviving_files,
            'all_scope_records_removed': own(last) == [] and last.get('json') is not None,
        })
        report['discovery_note'] = 'Inspect lists from both cwd values: installed records are not proof of session-effective skill availability.'
    report['checks'] = checks
    report['temp_state_removed_on_exit'] = True
    write_json(OUT, report)
    for name, ok in checks.items():
        print(('PASS' if ok else 'FAIL'), name)

raise SystemExit(0 if all(report['checks'].values()) else 1)
