import test from 'node:test';
import assert from 'node:assert/strict';
import { BlueBubbles, practiceText, type BBMessage } from './bluebubbles.ts';
import { config } from './config.ts';
const learner = { id: 'friend', sender: '+15551234567', chatGuid: 'iMessage;-;+15551234567' };
const message: BBMessage = { guid: 'm1', dateCreated: Date.now(), text: 'jingu 물', isFromMe: false, handle: { address: learner.sender } };
test('only deliberate practice from the allowlisted sender reaches grading; no echo loop', () => {
  assert.equal(practiceText(message, learner), '물');
  assert.equal(practiceText({ ...message, text: 'private conversation' }, learner), null);
  assert.equal(practiceText({ ...message, handle: { address: 'stranger' } }, learner), null);
  assert.equal(practiceText({ ...message, isFromMe: true }, learner), null);
  assert.equal(practiceText({ ...message, associatedMessageGuid: 'reaction' }, learner), null);
  assert.equal(practiceText({ ...message, isFromMe: true }, { ...learner, selfChat: true }), '물');
  assert.equal(practiceText({ ...message, text: '🌱 Jingu: correct!', isFromMe: true }, { ...learner, selfChat: true }), null);
});
test('BlueBubbles config requires loopback, explicit real AI, unique direct chats', () => {
  const env = { DATABASE_URL: 'postgres://unused', ADMIN_TOKEN: 'x'.repeat(32), TRANSPORT: 'bluebubbles', AI_MODE: 'openai', OPENAI_API_KEY: 'test', OPENAI_MODEL: 'test', BLUEBUBBLES_PASSWORD: 'test', BLUEBUBBLES_LEARNERS: JSON.stringify([learner]) };
  assert.equal(config(env).bluebubbles?.learners[0].id, 'friend');
  assert.throws(() => config({ ...env, BLUEBUBBLES_URL: 'http://example.com' }), /loopback/);
  assert.throws(() => config({ ...env, BLUEBUBBLES_LEARNERS: JSON.stringify([learner, learner]) }), /duplicate/);
  assert.throws(() => config({ ...env, BLUEBUBBLES_LEARNERS: JSON.stringify([{ ...learner, chatGuid: 'iMessage;+;group' }]) }), /direct/);
  assert.throws(() => config({ ...env, AI_MODE: 'fake' }), /real AI/);
});
test('connector uses normal AppleScript API and confines reads to designated chat', async () => {
  const requests: { url: URL; init?: RequestInit }[] = [];
  const api = new BlueBubbles('http://127.0.0.1:1234', 'secret', (async (url, init) => {
    requests.push({ url: new URL(String(url)), init });
    return Response.json({ status: 200, data: init?.method === 'POST' ? { guid: 'sent1' } : [message] });
  }) as typeof fetch);
  assert.equal((await api.messages(learner.chatGuid, 10, 20, 0))[0].guid, 'm1');
  assert.ok(requests[0].url.pathname.includes(encodeURIComponent(learner.chatGuid)));
  assert.equal(requests[0].url.searchParams.get('before'), '20');
  assert.deepEqual(await api.send(learner.chatGuid, 'Question'), { sid: 'sent1' });
  const payload = JSON.parse(String(requests[1].init?.body));
  assert.equal(payload.method, 'apple-script');
  assert.equal(payload.chatGuid, learner.chatGuid);
  assert.equal(requests[1].init?.redirect, 'error');
});
