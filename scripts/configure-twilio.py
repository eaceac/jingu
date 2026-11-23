#!/usr/bin/env python3
"""Interactive local-only secret entry; never echoes credentials or commits them."""
from pathlib import Path
from getpass import getpass
import os
import re

root = Path(__file__).resolve().parent.parent
path = root / '.env'
lines = path.read_text().splitlines()
values = dict(line.split('=', 1) for line in lines if '=' in line and not line.startswith('#'))
print('Connect Jingu to Twilio and OpenAI. Credentials stay in the ignored local .env.')
print('Copy Twilio Auth Token from your account console. Typing/pasting is hidden.')
twilio_token = getpass('Twilio Auth Token (Return keeps existing): ').strip()
print('Use an OpenAI API key with billing available; a ChatGPT subscription is separate.')
openai_key = getpass('OpenAI API key (Return keeps existing): ').strip()
updates = {'TRANSPORT': 'twilio', 'AI_MODE': 'openai', 'SMS_RECEIVE_MODE': 'poll', 'BIND_HOST': '127.0.0.1',
           'OPENAI_MODEL': values.get('OPENAI_MODEL') or 'gpt-4.1-mini', 'PUBLIC_URL': ''}
for key, label in [('TWILIO_ACCOUNT_SID', 'Twilio Account SID'), ('TWILIO_FROM_NUMBER', 'Jingu Twilio number (+countrycode)'), ('LEARNER_PHONE', 'Your practice phone (+countrycode)')]:
    existing = values.get(key, '')
    answer = input(f'{label} [{existing}]: ').strip() or existing
    if key.endswith('SID'):
        if not re.fullmatch(r'AC[0-9a-fA-F]{32}', answer): raise SystemExit('Invalid Account SID; no changes saved.')
    elif not re.fullmatch(r'\+[1-9]\d{7,14}', answer): raise SystemExit('Invalid phone number; no changes saved.')
    updates[key] = answer
if twilio_token: updates['TWILIO_AUTH_TOKEN'] = twilio_token
if openai_key: updates['OPENAI_API_KEY'] = openai_key
for key in ('TWILIO_AUTH_TOKEN', 'OPENAI_API_KEY'):
    value = updates.get(key) or values.get(key, '')
    if not value or any(c in value for c in '\n\r\"\' '): raise SystemExit('Missing/invalid credential; no changes saved.')
seen = set()
output = []
for line in lines:
    key = line.split('=', 1)[0]
    if key in updates:
        output.append(f'{key}={updates[key]}'); seen.add(key)
    else: output.append(line)
output.extend(f'{key}={value}' for key, value in updates.items() if key not in seen)
tmp = path.with_suffix('.env.tmp')
fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as f: f.write('\n'.join(output) + '\n')
os.replace(tmp, path)
print('Saved securely. No messages sent. Tell Codex configuration is ready for verification.')
