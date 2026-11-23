import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from './config.ts';
import { reminderWindow } from './runtime.ts';

test('live mode cannot silently use fake grades or missing configuration', () => {
  const base = { DATABASE_URL: 'postgres://localhost/test', ADMIN_TOKEN: 'x'.repeat(32) };
  assert.equal(config(base).transport, 'console');
  assert.throws(() => config({ ...base, TRANSPORT: 'retired-provider' }), /Invalid/);
  assert.throws(() => config({ ...base, TRANSPORT: 'web' }), /WEB_PASSWORD_HASH/);
  assert.equal(config(base).bindHost, '127.0.0.1');
  assert.throws(() => config({ ...base, ADMIN_TOKEN: 'short' }), /32/);
});
test('reminder window uses local wall clock and never catches up outside ten minutes', () => {
  assert.equal(reminderWindow('2026-11-22T17:00:00Z', 'America/Los_Angeles', '09:00:00'), true);
  assert.equal(reminderWindow('2026-11-22T17:09:00Z', 'America/Los_Angeles', '09:00:00'), true);
  assert.equal(reminderWindow('2026-11-22T17:10:00Z', 'America/Los_Angeles', '09:00:00'), false);
  assert.equal(reminderWindow('2026-11-22T16:59:00Z', 'America/Los_Angeles', '09:00:00'), false);
  assert.equal(reminderWindow('2026-07-22T16:00:00Z', 'America/Los_Angeles', '09:00:00'), true);
});
