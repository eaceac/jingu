import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { migrate } from '../src/migrate.ts';
import { commitAcceptedReview, type AcceptedReview } from '../src/reviews.ts';
import { acceptGrade } from '../../learning/grading.ts';
import { createCard, reviewCard } from '../../learning/scheduler.ts';
import { progress, type DailyInput } from '../../learning/progress.ts';

const connectionString = process.env.TEST_DATABASE_URL;
const schema = `jingu_test_${process.pid}_${Date.now()}`;
const admin = connectionString ? new Pool({ connectionString }) : undefined;
const pool = connectionString ? new Pool({ connectionString, options: `-c search_path=${schema}` }) : undefined;
before(async () => {
  if (!admin || !pool) return;
  await admin.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  await migrate(pool); // Applying an already applied migration is harmless.
});
after(async () => {
  if (!admin || !pool) return;
  await pool.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});
beforeEach(async () => {
  if (!pool) return;
  await pool.query('TRUNCATE users, vocab_senses CASCADE');
  await pool.query(`
    INSERT INTO users(id,timezone) VALUES ('u','America/Los_Angeles'),('other','UTC');
    INSERT INTO learning_profiles(id,user_id,source_language,target_language) VALUES ('p','u','en','ko');
    INSERT INTO vocab_senses(id,language,canonical_form,gloss) VALUES ('water','ko','물','water');
    INSERT INTO review_cards(id,user_id,profile_id,sense_id,direction,due_at)
      VALUES ('card','u','p','water','source_to_target','2026-11-20T00:00:00Z');
    INSERT INTO sessions(id,user_id,profile_id,settings_snapshot,ordered_card_ids,started_at)
      VALUES ('session','u','p','{}','["card"]','2026-11-22T07:00:00Z');
    INSERT INTO review_opportunities(id,user_id,card_id,session_id,expected_card_version,grading_policy)
      VALUES ('opp','u','card','session',0,'{"allowTransliteration":false}'),
             ('stale','u','card','session',0,'{"allowTransliteration":false}');
    INSERT INTO messages(id,user_id,session_id,provider,external_id,direction,body,received_at)
      VALUES ('message','u','session','sim','m1','inbound','물','2026-11-22T07:30:00Z');
  `);
});

function review(overrides: Partial<AcceptedReview> = {}): AcceptedReview {
  return {
    assessmentId: 'assessment',userId:'u',opportunityId:'opp',messageId:'message',expectedCardVersion:0,
    rating:'good',evidence:'물',semanticOutcome:'correct',answerForm:'native_script',evaluatorVersion:'fake-v1',
    assessedAt:'2026-11-22T08:30:00Z',practiceTimezone:'America/Los_Angeles',dailyGoal:5,
    nextState:{stage:0,dueAt:'2026-11-23T07:30:00Z',lastReviewedAt:'2026-11-22T07:30:00Z',reviewCount:1,successfulReviews:1,lapses:0,policyVersion:'ladder-v1'},
    ...overrides,
  };
}
const options = { skip: !connectionString && 'Set TEST_DATABASE_URL to an isolated PostgreSQL test database' };
test('concurrent duplicate delivery commits exactly one grade and one practice event', options, async () => {
  const results = await Promise.all(Array.from({length:8},()=>commitAcceptedReview(pool!,review())));
  assert.equal(results.filter(r=>!r.duplicate).length,1);
  assert.equal((await pool!.query('SELECT count(*)::int AS n FROM assessments')).rows[0].n,1);
  assert.equal((await pool!.query('SELECT count(*)::int AS n FROM practice_events')).rows[0].n,1);
  const card = (await pool!.query('SELECT review_count,version FROM review_cards')).rows[0];
  assert.deepEqual(card,{review_count:1,version:1});
  const day = (await pool!.query("SELECT to_char(local_date,'YYYY-MM-DD') AS day,sense_ids FROM daily_progress")).rows[0];
  assert.deepEqual(day,{day:'2026-11-21',sense_ids:['water']});
});
test('competing opportunities cannot apply two transitions to the same card version', options, async () => {
  const results = await Promise.allSettled([
    commitAcceptedReview(pool!,review()),
    commitAcceptedReview(pool!,review({opportunityId:'stale',assessmentId:'a2'})),
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await pool!.query('SELECT review_count FROM review_cards')).rows[0].review_count,1);
});
test('invalid evidence rolls back every write', options, async () => {
  await assert.rejects(commitAcceptedReview(pool!,review({evidence:'invented'})),/evidence/);
  assert.equal((await pool!.query('SELECT count(*)::int AS n FROM assessments')).rows[0].n,0);
  assert.equal((await pool!.query('SELECT version FROM review_cards')).rows[0].version,0);
});
test('a constraint failure after assessment insertion rolls back assessment and card', options, async () => {
  await assert.rejects(commitAcceptedReview(pool!,review({dailyGoal:0})));
  assert.equal((await pool!.query('SELECT count(*)::int AS n FROM assessments')).rows[0].n,0);
  assert.equal((await pool!.query('SELECT version FROM review_cards')).rows[0].version,0);
  assert.equal((await pool!.query('SELECT status FROM review_opportunities WHERE id=$1',['opp'])).rows[0].status,'open');
});
test('another learner cannot grade or reference the opportunity', options, async () => {
  await assert.rejects(commitAcceptedReview(pool!,review({userId:'other'})),/Unknown opportunity/);
  await assert.rejects(pool!.query(`INSERT INTO review_opportunities(id,user_id,card_id,session_id,expected_card_version,grading_policy)
    VALUES ('bad','other','card','session',0,'{}')`));
});
test('disallowed romanization cannot be committed as a graded attempt', options, async () => {
  await pool!.query("UPDATE messages SET body='mul' WHERE id='message'");
  await assert.rejects(commitAcceptedReview(pool!,review({answerForm:'transliteration',evidence:'mul'})),/clarification/);
  assert.equal((await pool!.query('SELECT count(*)::int AS n FROM practice_events')).rows[0].n,0);
});
test('wrong scheduler counters and stale message timestamps are rejected', options, async () => {
  const input=review();
  await assert.rejects(commitAcceptedReview(pool!,{...input,nextState:{...input.nextState,reviewCount:2}}),/Invalid next/);
  await pool!.query("UPDATE review_cards SET last_reviewed_at='2026-11-22T07:40:00Z'");
  await assert.rejects(commitAcceptedReview(pool!,input),/Out-of-order/);
});
test('persisted hints cannot be graded as independent successful recall', options, async () => {
  await pool!.query("UPDATE review_opportunities SET hint_used=true WHERE id='opp'");
  await assert.rejects(commitAcceptedReview(pool!,review()),/Invalid successful rating/);
  const input=review();
  await commitAcceptedReview(pool!,{...input,rating:'again',nextState:{...input.nextState,stage:-1,dueAt:'2026-11-22T07:40:00Z',successfulReviews:0,lapses:1}});
  assert.equal((await pool!.query('SELECT successful_reviews,lapses FROM review_cards')).rows[0].successful_reviews,0);
});
test('incidental early practice cannot advance a card', options, async () => {
  await pool!.query("UPDATE review_cards SET due_at='2026-11-23T00:00:00Z'");
  await assert.rejects(commitAcceptedReview(pool!,review()),/not due/);
});
test('real grading and scheduling persist facts that rebuild the same garden after reconnect', options, async () => {
  const grade = acceptGrade({id:'opp',senseId:'water',direction:'source_to_target',policyVersion:'grading-v1',
    allowTransliteration:false,targetScript:'Hangul',hintUsed:false,status:'open'}, '물', {
    opportunityId:'opp',senseId:'water',direction:'source_to_target',policyVersion:'grading-v1',
    evidence:'물',outcome:'correct',answerForm:'native_script',explanation:'Correct Korean word for water.',
  });
  assert.equal(grade.status,'accepted');
  if (grade.status !== 'accepted' || grade.proposal.outcome === 'uncertain') throw new Error('Expected accepted grade');
  const card=createCard('card','water','source_to_target','2026-11-20T00:00:00Z');
  const next=reviewCard(card,grade.rating,'2026-11-22T07:30:00Z',0);
  assert.ok(next.lastReviewedAt);
  await commitAcceptedReview(pool!,review({rating:grade.rating,evidence:grade.proposal.evidence,
    semanticOutcome:grade.proposal.outcome,answerForm:grade.proposal.answerForm,dailyGoal:1,
    nextState:{...next,lastReviewedAt:next.lastReviewedAt}}));

  // A fresh connection has no in-memory learner state; reconstruct solely from durable facts.
  const reconnect = new Pool({connectionString,options:`-c search_path=${schema}`});
  try {
    const facts = await reconnect.query(`
      SELECT to_char(d.local_date,'YYYY-MM-DD') AS date, d.goal_snapshot AS goal,
        jsonb_agg(jsonb_build_object('assessmentId',e.assessment_id,'senseId',e.sense_id,
          'localDate',to_char(e.local_date,'YYYY-MM-DD')) ORDER BY e.id) AS attempts
      FROM daily_progress d JOIN practice_events e ON e.user_id=d.user_id AND e.local_date=d.local_date
      WHERE d.user_id=$1 AND e.event_type='recall_attempt'
      GROUP BY d.local_date,d.goal_snapshot ORDER BY d.local_date`,['u']);
    const restored=progress(facts.rows as DailyInput[],'2026-11-22');
    assert.equal(restored.currentStreak,1);
    assert.equal(restored.completedDays,1);
    assert.equal(restored.garden.policyVersion,'garden-v2');
    assert.equal(restored.garden.growthSteps,1);
    assert.equal(restored.garden.boxCount,1);
    assert.equal(restored.garden.activePlant?.stage,'seed');
    assert.equal(restored.garden.activePlant?.species,'basil');
    assert.equal(restored.garden.boxes[0].slots[0],restored.garden.activePlant?.id);
    assert.equal(restored.daily[0]?.date,'2026-11-21'); // Receipt day, not later grading day.
    const saved=(await reconnect.query('SELECT due_at,version FROM review_cards WHERE id=$1',['card'])).rows[0];
    assert.equal((saved.due_at as Date).toISOString(),next.dueAt);
    assert.equal(saved.version,next.version);
  } finally { await reconnect.end(); }
});
test('practice event cannot attach another learner’s assessment', options, async () => {
  await commitAcceptedReview(pool!,review());
  await pool!.query(`INSERT INTO messages(id,user_id,provider,external_id,direction,body,received_at)
    VALUES ('other-message','other','sim','other-message','inbound','물','2026-11-22T07:30:00Z')`);
  await assert.rejects(pool!.query(`INSERT INTO practice_events(id,user_id,sense_id,message_id,assessment_id,event_type,occurred_at,local_date,timezone)
    VALUES ('cross-user','other','water','other-message','assessment','learner_use','2026-11-22T07:30:00Z','2026-11-22','UTC')`),
    (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23503');
});
