import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { migrate } from '../../packages/db/src/migrate.ts';
import { FakeTutor } from '../../packages/ai/index.ts';
import { koreanStarterPack } from '../../packages/languages/index.ts';
import { config } from './config.ts';
import { PracticeService, seed, readProgress, USER } from './service.ts';
import { communityGarden } from './community.ts';
import { Runtime } from './runtime.ts';
const url = process.env.TEST_DATABASE_URL;
const schema = `jingu_flow_${process.pid}_${Date.now()}`;
const admin = url ? new Pool({ connectionString: url }) : undefined;
const pool = url ? new Pool({ connectionString: url, options: `-c search_path=${schema}` }) : undefined;
const cfg = config({ DATABASE_URL: url ?? 'postgres://unused', ADMIN_TOKEN: 'x'.repeat(32), JINGU_TIMEZONE: 'America/Los_Angeles' });
const skip = { skip: !url && 'Set TEST_DATABASE_URL for flow integration tests' };
let svc: PracticeService;
let clock: number;
const now = () => new Date(clock).toISOString();
before(async () => { if (admin && pool) { await admin.query(`CREATE SCHEMA ${schema}`); await migrate(pool); } });
beforeEach(async () => {
  if (!pool) return;
  await pool.query('TRUNCATE users,vocab_senses,global_ai_usage CASCADE');
  await seed(pool, cfg.timezone);
  svc = new PracticeService(pool, new FakeTutor(), cfg);
  clock = Date.parse('2026-11-22T18:00:00Z');
});
after(async () => { if (admin && pool) { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); } });
async function text(body: string, id = `${clock}:${body}`) {
  clock += 1000;
  await svc.enqueue('test', id, body, now());
  await svc.processNext(now());
}
async function lastReply() {
  return (await pool!.query('SELECT payload FROM outbox ORDER BY created_at DESC,id DESC LIMIT 1')).rows[0]?.payload.text as string;
}

test('five-word daily flow persists session, SRS, streak and garden and survives service restart', skip, async () => {
  await text('START'); await text('PRACTICE');
  assert.equal((await pool!.query('SELECT count(*)::int AS n FROM vocab_senses')).rows[0].n, 50);
  for (const sense of koreanStarterPack.senses.slice(0, 5)) {
    if (sense.rank === 3) svc = new PracticeService(pool!, new FakeTutor(), cfg);
    await text(sense.lemma);
  }
  const p = await readProgress(pool!, now());
  assert.equal(p.completedDays, 1); assert.equal(p.currentStreak, 1); assert.equal(p.garden.growthSteps, 1);
  assert.equal((await pool!.query('SELECT count(*)::int AS n FROM assessments')).rows[0].n, 5);
  assert.match(await lastReply(), /Session complete/);
  assert.equal((await pool!.query('SELECT status FROM sessions')).rows[0].status, 'complete');
});
test('duplicate message cannot count twice; settings snapshot survives mid-session edits', skip, async () => {
  await text('START'); await text('PRACTICE');
  await text('TRANSLITERATION off');
  const s = (await pool!.query('SELECT settings_snapshot FROM sessions')).rows[0].settings_snapshot;
  assert.equal(s.allowTransliteration, true);
  await text('물', 'same-sid'); await text('물', 'same-sid');
  assert.equal((await pool!.query('SELECT count(*)::int AS n FROM assessments')).rows[0].n, 1);
});
test('STOP cancels pending delivery and reminders; opted-out answers never call tutor', skip, async () => {
  await text('START'); await text('REMINDER 09:00'); await text('PRACTICE'); await text('STOP');
  await text('물');
  const u = (await pool!.query('SELECT practice_enabled,reminders_enabled FROM users WHERE id=$1', [USER])).rows[0];
  assert.deepEqual(u, { practice_enabled: false, reminders_enabled: false });
  assert.equal((await pool!.query("SELECT count(*)::int AS n FROM outbox WHERE status='pending'")).rows[0].n, 0);
  assert.equal((await pool!.query('SELECT count(*)::int AS n FROM assessments')).rows[0].n, 0);
});
test('hint remains assisted and cannot be graded as independent recall', skip, async () => {
  await text('START'); await text('PRACTICE'); await text('HINT'); await text('물');
  assert.equal((await pool!.query('SELECT rating FROM assessments')).rows[0].rating, 'again');
});
test('AI failure preserves current question and does not invent a review', skip, async () => {
  await text('START'); await text('PRACTICE');
  const tutor = new FakeTutor(); tutor.grade = async () => { throw new Error('unavailable'); };
  svc = new PracticeService(pool!, tutor, cfg); await text('물');
  assert.match(await lastReply(), /could not grade/);
  assert.equal((await pool!.query('SELECT count(*)::int AS n FROM assessments')).rows[0].n, 0);
  assert.equal((await pool!.query('SELECT current_index FROM sessions')).rows[0].current_index, 0);
});
test('daily reminders deduplicate across ticks and stop after day completion', skip, async () => {
  await text('START'); await text('REMINDER 09:00');
  const runtime = new Runtime(pool!, svc, cfg);
  await runtime.tick('2026-11-23T17:01:00Z'); await runtime.tick('2026-11-23T17:02:00Z');
  const reminders = await pool!.query("SELECT * FROM outbox WHERE operation_key='reminder:personal-learner:2026-11-23'");
  assert.equal(reminders.rowCount, 1);
  await text('STOP');
  await runtime.tick('2026-11-24T17:01:00Z');
  assert.equal((await pool!.query("SELECT count(*)::int AS n FROM outbox WHERE operation_key='reminder:personal-learner:2026-11-24'")).rows[0].n, 0);
});

test('uncertain provider sends are not automatically retried after reconnect', skip, async () => {
  await text('START');
  let calls = 0;
  const runtime = new Runtime(pool!, svc, cfg, async () => { calls++; throw new Error('socket reset after request'); });
  await runtime.tick(now()); await runtime.tick(now());
  assert.equal(calls, 1);
  assert.equal((await pool!.query('SELECT status FROM outbox')).rows[0].status, 'ambiguous');
});

test('completed day suppresses reminder and the next local day remains eligible', skip, async () => {
  await text('START'); await text('REMINDER 09:00'); await text('PRACTICE');
  for (const sense of koreanStarterPack.senses.slice(0, 5)) await text(sense.lemma);
  const runtime = new Runtime(pool!, svc, cfg);
  await runtime.tick('2026-11-22T17:01:00Z');
  assert.equal((await pool!.query("SELECT count(*)::int AS n FROM outbox WHERE operation_key='reminder:personal-learner:2026-11-22'")).rows[0].n, 0);
  await runtime.tick('2026-11-23T17:01:00Z');
  assert.equal((await pool!.query("SELECT count(*)::int AS n FROM outbox WHERE operation_key='reminder:personal-learner:2026-11-23'")).rows[0].n, 1);
});

test('invited learners have independent queues, cards, settings, progress and delivery', skip, async () => {
  await seed(pool!, 'Asia/Seoul', 'friend');
  const friend = new PracticeService(pool!, new FakeTutor(), cfg, 'friend');
  await text('START'); await text('PRACTICE'); await text('물');
  await friend.enqueue('test', 'friend-start', 'START', now());
  await friend.enqueue('test', 'friend-practice', 'PRACTICE', now());
  await svc.processNext(now()); // Must not pick up friend's queued practice.
  assert.equal((await pool!.query("SELECT count(*)::int AS n FROM sessions WHERE user_id='friend'")).rows[0].n, 0);
  await friend.processNext(now());
  assert.equal((await pool!.query("SELECT count(*)::int AS n FROM sessions WHERE user_id='friend'")).rows[0].n, 1);
  assert.equal((await readProgress(pool!, now(), 'friend')).today?.count ?? 0, 0);
  assert.equal((await readProgress(pool!, now())).today?.count, 1);
  await friend.enqueue('test', 'friend-setting', 'WORDS 2', now()); await friend.processNext(now());
  assert.equal((await pool!.query('SELECT words_per_session FROM learning_profiles WHERE user_id=$1', [USER])).rows[0].words_per_session, 5);
  const sent: string[] = [];
  const runtime = new Runtime(pool!, friend, cfg, async text => { sent.push(text); return { sid: 'friend-delivery' }; });
  await runtime.tick(now());
  assert.equal(sent.length, 1);
  assert.equal((await pool!.query("SELECT user_id FROM outbox WHERE provider_message_id='friend-delivery'")).rows[0].user_id, 'friend');
  await friend.enqueue('test', 'friend-stop', 'STOP', now());
  assert.equal((await pool!.query('SELECT practice_enabled FROM users WHERE id=$1', [USER])).rows[0].practice_enabled, true);
});

test('shared AI cap prevents friends collectively exceeding owner allowance', skip, async () => {
  await seed(pool!, cfg.timezone, 'friend');
  svc = new PracticeService(pool!, new FakeTutor(), { ...cfg, maxGlobalAI: 1 });
  await text('START'); await text('PRACTICE');
  let calls = 0;
  const tutor = new FakeTutor(); tutor.question = async () => { calls++; return 'Test'; };
  const friend = new PracticeService(pool!, tutor, { ...cfg, maxGlobalAI: 1 }, 'friend');
  await friend.enqueue('test', 'cap-start', 'START', now());
  await friend.enqueue('test', 'cap-practice', 'PRACTICE', now());
  await friend.processNext(now());
  assert.equal(calls, 0);
  assert.equal((await pool!.query('SELECT calls FROM global_ai_usage')).rows[0].calls, 1);
});


test('shared garden exposes nicknames and separate progress, never private learner data', skip, async () => {
  await seed(pool!, 'America/Los_Angeles', 'friend-private-id', 'Mina');
  await text('START'); await text('NICKNAME Rowan'); await text('PRACTICE');
  for (const answer of ['물', '밥', '집', '학교', '친구']) await text(answer);
  const result = await communityGarden(pool!, [USER, 'friend-private-id'], now());
  assert.equal(result.total, 2); assert.equal(result.tendedToday, 1);
  assert.equal(result.members[0].nickname, 'Rowan');
  assert.equal(result.members[0].garden.growthSteps, 1);
  assert.equal(result.members[1].nickname, 'Mina');
  assert.equal(result.members[1].garden.plants.length, 0);
  const serialized = JSON.stringify(result);
  for (const privateValue of [USER, 'friend-private-id', 'assessmentId', 'phone', 'acceptedForms', 'OPENAI_API_KEY']) assert.ok(!serialized.includes(privateValue));
  await text('NICKNAME +15551234567');
  assert.equal((await communityGarden(pool!, [USER], now())).members[0].nickname, 'Rowan');
  assert.equal((await communityGarden(pool!, ['friend-private-id'], now())).total, 1);
});


test('PATCH names persist for the sending learner without changing another garden', skip, async () => {
  await seed(pool!, cfg.timezone, 'friend', 'Mina');
  await text('START'); await text('PATCH Moon Garden');
  const result = await communityGarden(pool!, [USER, 'friend'], now());
  assert.equal(result.members[0].patchName, 'Moon Garden');
  assert.equal(result.members[1].patchName, null);
  await text('PATCH <script>alert(1)</script>');
  await text('PATCH private@example.com');
  assert.equal((await communityGarden(pool!, [USER], now())).members[0].patchName, 'Moon Garden');
  svc = new PracticeService(pool!, new FakeTutor(), cfg);
  assert.equal((await communityGarden(pool!, [USER], now())).members[0].patchName, 'Moon Garden');
});
