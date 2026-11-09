"""Restricted API adapter, NOT an oracle. Only mounted in submitted-code siblings.

Observations (including unittest text) are untrusted behavior, not coverage proof.
"""
import importlib
import builtins
import json
import sys
import unittest
from pathlib import Path

request = json.loads(sys.stdin.buffer.read(262145))
# WHY: stdlib dependencies load before permitting submission imports. The trusted
# data checker never runs this adapter or adds /work to its own import path.
# Preserve built-in exception identities before importing submitted modules.
exception_families = [('ValueError', builtins.ValueError), ('KeyError', builtins.KeyError)]
sys.path.insert(0, '/work')
if request['operation'] == 'call':
    function = getattr(importlib.import_module(request['module']), request['function'])
    try:
        value = function(*request.get('args', []), **request.get('kwargs', {}))
        # WHY: the original mean assertions compare Python values, not JSON types.
        # Equality is an untrusted API observation, not proof of hidden implementation.
        observation = {'equals': bool(value == request['compareValue'])} if 'compareValue' in request else {'value': value}
    except Exception as error:
        observation = {'exception': next((name for name, family in exception_families if isinstance(error, family)), 'other')}
    print(json.dumps(observation, allow_nan=False))
elif request['operation'] == 'tests':
    suite = unittest.defaultTestLoader.discover('/work/tests')
    result = unittest.TextTestRunner(verbosity=request.get('verbosity', 1)).run(suite)
    sys.exit(not result.wasSuccessful())
else:
    raise ValueError('Unsupported Python operation')
