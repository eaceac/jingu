import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from './config.ts';
import { reminderWindow } from './runtime.ts';
import twilio from 'twilio';

test('live mode cannot silently use fake grades or missing configuration', () => {
  const base = { DATABASE_URL: 'postgres://localhost/test', ADMIN_TOKEN: 'x'.repeat(32) };
  assert.equal(config(base).transport, 'console');
  assert.throws(() => config({ ...base, TRANSPORT: 'twilio' }), /real AI/);
  assert.throws(() => config({ ...base, TRANSPORT: 'twilio', AI_MODE: 'openai' }), /HTTPS/);
  assert.throws(() => config({ ...base, ADMIN_TOKEN: 'short' }), /32/);
});
test('reminder window uses local wall clock and never catches up outside ten minutes', () => {
  assert.equal(reminderWindow('2026-11-22T17:00:00Z', 'America/Los_Angeles', '09:00:00'), true);
  assert.equal(reminderWindow('2026-11-22T17:09:00Z', 'America/Los_Angeles', '09:00:00'), true);
  assert.equal(reminderWindow('2026-11-22T17:10:00Z', 'America/Los_Angeles', '09:00:00'), false);
  assert.equal(reminderWindow('2026-11-22T16:59:00Z', 'America/Los_Angeles', '09:00:00'), false);
  assert.equal(reminderWindow('2026-07-22T16:00:00Z', 'America/Los_Angeles', '09:00:00'), true);
});
test('official Twilio validator rejects altered body and wrong public URL', () => {
  const url = 'https://jingu.example/webhooks/sms/inbound';
  const params = { Body: 'practice', From: '+15550000000' };
  const signature = twilio.getExpectedTwilioSignature('test-token', url, params);
  assert.ok(twilio.validateRequest('test-token', signature, url, params));
  assert.ok(!twilio.validateRequest('test-token', signature, url, { ...params, Body: 'stop' }));
  assert.ok(!twilio.validateRequest('test-token', signature, 'https://wrong.example/', params));
});
