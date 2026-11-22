import type { Pool } from 'pg';

export interface PersistedCardState {
  stage: number;
  dueAt: string;
  lastReviewedAt: string;
  reviewCount: number;
  successfulReviews: number;
  lapses: number;
  policyVersion: string;
}
export interface AcceptedReview {
  assessmentId: string;
  userId: string;
  opportunityId: string;
  messageId: string;
  expectedCardVersion: number;
  rating: 'again' | 'hard' | 'good' | 'easy';
  evidence: string;
  semanticOutcome: 'correct' | 'incorrect';
  answerForm: 'native_script' | 'transliteration' | 'mixed';
  evaluatorVersion: string;
  assessedAt: string;
  nextState: PersistedCardState;
  /** Server-owned event-time snapshots, not values supplied by a learner/model. */
  practiceTimezone: string;
  dailyGoal: number;
}

/** Accept only a policy-validated grade and pure scheduler result from trusted application code. */
export async function commitAcceptedReview(pool: Pool, input: AcceptedReview): Promise<{ duplicate: boolean; assessmentId: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize progress for one learner, including distinct cards completing concurrently.
    const owner = await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [input.userId]);
    if (!owner.rowCount) throw new Error('Unknown learner');
    const result = await client.query(
      `SELECT o.*, c.sense_id, c.version, c.due_at, c.last_reviewed_at, c.review_count,
              c.successful_reviews, c.lapses, c.direction, c.policy_version
       FROM review_opportunities o JOIN review_cards c ON c.id=o.card_id AND c.user_id=o.user_id
       WHERE o.id=$1 AND o.user_id=$2 FOR UPDATE OF o,c`, [input.opportunityId, input.userId]);
    const row = result.rows[0];
    if (!row) throw new Error('Unknown opportunity');
    const existing = await client.query('SELECT id FROM assessments WHERE opportunity_id=$1', [input.opportunityId]);
    if (existing.rowCount) {
      await client.query('COMMIT');
      return { duplicate: true, assessmentId: existing.rows[0].id as string };
    }
    if (row.status !== 'open' || row.version !== input.expectedCardVersion || row.expected_card_version !== row.version) {
      throw new Error('Stale or closed opportunity');
    }
    const message = await client.query(
      `SELECT body, received_at, received_at AT TIME ZONE $3 AS local_time,
       to_char(received_at AT TIME ZONE $3, 'YYYY-MM-DD') AS local_date
       FROM messages WHERE id=$1 AND user_id=$2 AND session_id=$4 AND direction='inbound'`,
      [input.messageId, input.userId, input.practiceTimezone, row.session_id]);
    const incoming = message.rows[0];
    if (!incoming || !input.evidence || !incoming.body.includes(input.evidence)) throw new Error('Invalid learner evidence');
    const reviewedAt = incoming.received_at as Date;
    if (reviewedAt.getTime() < (row.due_at as Date).getTime()) throw new Error('Review card is not due');
    if (row.last_reviewed_at && reviewedAt.getTime() <= (row.last_reviewed_at as Date).getTime()) throw new Error('Out-of-order review');
    const next = input.nextState;
    if (new Date(next.lastReviewedAt).getTime() !== reviewedAt.getTime()
      || !Number.isFinite(Date.parse(next.dueAt)) || Date.parse(next.dueAt) <= reviewedAt.getTime()
      || next.policyVersion !== row.policy_version
      || next.reviewCount !== row.review_count + 1
      || next.successfulReviews !== row.successful_reviews + (input.rating === 'again' ? 0 : 1)
      || next.lapses !== row.lapses + (input.rating === 'again' ? 1 : 0)) throw new Error('Invalid next card state');
    if ((row.hint_used || input.semanticOutcome === 'incorrect') && input.rating !== 'again') throw new Error('Invalid successful rating');
    if (row.direction === 'source_to_target' && row.grading_policy.allowTransliteration === false && input.answerForm === 'transliteration') {
      throw new Error('Transliteration requires clarification');
    }
    await client.query(
      `INSERT INTO assessments(id,opportunity_id,user_id,message_id,rating,evidence,semantic_outcome,answer_form,evaluator_version,assessed_at,next_state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [input.assessmentId,input.opportunityId,input.userId,input.messageId,input.rating,input.evidence,input.semanticOutcome,input.answerForm,input.evaluatorVersion,input.assessedAt,next]);
    await client.query(
      `UPDATE review_cards SET stage=$1,due_at=$2,last_reviewed_at=$3,review_count=$4,successful_reviews=$5,lapses=$6,policy_version=$7,version=version+1 WHERE id=$8`,
      [next.stage,next.dueAt,next.lastReviewedAt,next.reviewCount,next.successfulReviews,next.lapses,next.policyVersion,row.card_id]);
    await client.query("UPDATE review_opportunities SET status='assessed' WHERE id=$1", [input.opportunityId]);
    await client.query(
      `INSERT INTO practice_events(id,user_id,sense_id,message_id,assessment_id,event_type,occurred_at,local_date,timezone)
       VALUES ($1,$2,$3,$4,$5,'recall_attempt',$6,$7,$8)`,
      [`recall:${input.assessmentId}`,input.userId,row.sense_id,input.messageId,input.assessmentId,reviewedAt,incoming.local_date,input.practiceTimezone]);
    await client.query(
      `INSERT INTO daily_progress(user_id,local_date,timezone,goal_snapshot,sense_ids) VALUES ($1,$2,$3,$4,ARRAY[$5]::text[])
       ON CONFLICT (user_id,local_date) DO UPDATE SET sense_ids=
       ARRAY(SELECT DISTINCT unnest(daily_progress.sense_ids || EXCLUDED.sense_ids) ORDER BY 1)`,
      [input.userId,incoming.local_date,input.practiceTimezone,input.dailyGoal,row.sense_id]);
    await client.query('COMMIT');
    return { duplicate: false, assessmentId: input.assessmentId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
