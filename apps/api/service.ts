import { validNickname, validPatchName } from './nickname.ts';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { koreanStarterPack } from '../../packages/languages/index.ts';
import { defaultSettings, type Settings } from '../../packages/contracts/index.ts';
import { planSession, reviewCard, acceptGrade, progress, localDate, type Card, type DailyInput, type Opportunity } from '../../packages/learning/index.ts';
import { commitReviewInTransaction } from '../../packages/db/src/reviews.ts';
import { fallbackQuestion, type Tutor, type TestContext } from '../../packages/ai/index.ts';
import type { Config } from './config.ts';

export const USER = 'personal-learner';
const profileFor = (userId: string) => userId === USER ? 'personal-ko-en' : `${userId}:ko-en`;
const HELP = 'Jingu: PRACTICE, DONE, HINT, PROGRESS, SETTINGS. WORDS 5, DIRECTION forward|reverse|mixed, TRANSLITERATION on|off, REMINDER 09:00, PAUSE, NICKNAME your-name, PATCH patch-name. STOP pause practices; START opts in. Practice text is sent to our AI provider for grading.';
const pack = koreanStarterPack;
const iso = (value: Date) => value.toISOString();
function card(row: any): Card {
  return { id: row.id, senseId: row.sense_id, direction: row.direction, stage: row.stage, dueAt: iso(row.due_at),
    lastReviewedAt: row.last_reviewed_at ? iso(row.last_reviewed_at) : null, reviewCount: row.review_count,
    successfulReviews: row.successful_reviews, lapses: row.lapses, version: row.version, policyVersion: row.policy_version,
    packRank: pack.senses.find(s => s.id === row.sense_id)!.rank };
}
export async function seed(pool: Pool, timezone: string, userId = USER, nickname = 'Gardener') {
  const profileId = profileFor(userId);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('INSERT INTO users(id,timezone) VALUES($1,$2) ON CONFLICT DO NOTHING', [userId, timezone]);
    await c.query('UPDATE users SET garden_name=COALESCE(garden_name,$2) WHERE id=$1', [userId, validNickname(nickname) ? nickname : 'Gardener']);
    await c.query('INSERT INTO learning_profiles(id,user_id,source_language,target_language) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [profileId, userId, 'en', 'ko']);
    for (const sense of pack.senses) {
      await c.query('INSERT INTO vocab_senses(id,language,canonical_form,gloss,metadata) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [sense.id, sense.language, sense.lemma, sense.gloss, sense]);
      for (const form of sense.acceptedForms) await c.query('INSERT INTO vocab_variants(sense_id,form) VALUES($1,$2) ON CONFLICT DO NOTHING', [sense.id, form]);
      for (const direction of ['source_to_target', 'target_to_source']) await c.query(
        'INSERT INTO review_cards(id,user_id,profile_id,sense_id,direction,due_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
        [`${profileId}:${sense.id}:${direction}`, userId, profileId, sense.id, direction, '2020-01-01T00:00:00Z']);
    }
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}

export async function readProgress(db: Pool | PoolClient, now: string, userId = USER) {
  const user = (await db.query('SELECT * FROM users WHERE id=$1', [userId])).rows[0];
  const facts = await db.query(`SELECT to_char(d.local_date,'YYYY-MM-DD') AS date,d.goal_snapshot AS goal,
    jsonb_agg(jsonb_build_object('assessmentId',e.assessment_id,'senseId',e.sense_id,'localDate',to_char(e.local_date,'YYYY-MM-DD'))) AS attempts
    FROM daily_progress d JOIN practice_events e ON e.user_id=d.user_id AND e.local_date=d.local_date
    WHERE d.user_id=$1 AND e.event_type='recall_attempt' GROUP BY d.local_date,d.goal_snapshot ORDER BY d.local_date`, [userId]);
  return progress(facts.rows as DailyInput[], localDate(now, user.timezone));
}

export class PracticeService {
  constructor(private pool: Pool, private tutor: Tutor, private cfg: Config, readonly userId = USER) {}
  private get profileId() { return profileFor(this.userId); }
  async enqueue(provider: string, externalId: string, body: string, now: string, optOutType?: string) {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const user = (await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [this.userId])).rows[0];
      const command = (optOutType ?? body.trim()).toUpperCase();
      const stop = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT'].includes(command);
      if (!stop) {
        const recent = (await c.query(`SELECT count(*)::int AS n FROM messages WHERE user_id=$1
          AND (processing_status='pending' OR received_at >= $2::timestamptz - interval '1 hour')`, [this.userId, now])).rows[0].n;
        if (recent >= 120) { await c.query('COMMIT'); return false; }
      }
      const inserted = await c.query(`INSERT INTO messages(id,user_id,provider,external_id,direction,body,received_at,practice_timezone,goal_snapshot)
        VALUES($1,$2,$3,$4,'inbound',$5,$6,$7,$8) ON CONFLICT(provider,external_id) DO NOTHING RETURNING id`,
      [randomUUID(), this.userId, provider, externalId, body, now, user.timezone, user.daily_goal]);
      if (!inserted.rowCount) { await c.query('COMMIT'); return false; }
      const id = inserted.rows[0].id;
      if (stop) {
        await c.query('UPDATE users SET practice_enabled=false,reminders_enabled=false WHERE id=$1', [this.userId]);
        await c.query("UPDATE outbox SET status='cancelled' WHERE user_id=$1 AND status='pending'", [this.userId]);
        await c.query("UPDATE messages SET processing_status='cancelled' WHERE user_id=$1 AND processing_status='pending'", [this.userId]);
        await c.query("UPDATE sessions SET status='ended',ended_at=$2 WHERE user_id=$1 AND status='active'", [this.userId, now]);
        await c.query("UPDATE review_opportunities SET status='cancelled' WHERE user_id=$1 AND status='open'", [this.userId]);
        await c.query("UPDATE messages SET processing_status='complete' WHERE id=$1", [id]);
      } else if (['START', 'UNSTOP'].includes(command)) {
        await c.query('UPDATE users SET practice_enabled=true WHERE id=$1', [this.userId]);
        await this.reply(c, id, 'Welcome to Jingu! Enter PRACTICE to begin Korean. Your practice answer goes to our AI provider for grading. Enter HELP for settings, STOP to pause practice.');
        await c.query("UPDATE messages SET processing_status='complete' WHERE id=$1", [id]);
      } else if (optOutType === 'HELP' || !user.practice_enabled) {
        await c.query("UPDATE messages SET processing_status='complete' WHERE id=$1", [id]);
      }
      await c.query('COMMIT'); return true;
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  private async reply(c: PoolClient, key: string, text: string, kind = 'reply', date?: string) {
    await c.query(`INSERT INTO outbox(id,user_id,operation_key,payload) VALUES($1,$2,$3,$4) ON CONFLICT(operation_key) DO NOTHING`,
      [randomUUID(), this.userId, `${kind}:${key}`, { text: text.slice(0, 900), kind, date }]);
  }
  private async callAI<T>(fn: () => Promise<T>, now: string, timezone: string): Promise<T> {
    if (this.cfg.maxGlobalAI) {
      const global = await this.pool.query(`INSERT INTO global_ai_usage(utc_date,calls) VALUES($1,1)
        ON CONFLICT(utc_date) DO UPDATE SET calls=global_ai_usage.calls+1 WHERE global_ai_usage.calls<$2 RETURNING calls`,
        [now.slice(0,10), this.cfg.maxGlobalAI]);
      if (!global.rowCount) throw new Error('AI_GLOBAL_DAILY_LIMIT');
    }
    const usage = await this.pool.query(`INSERT INTO ai_usage(user_id,local_date,calls) VALUES($1,$2,1)
      ON CONFLICT(user_id,local_date) DO UPDATE SET calls=ai_usage.calls+1 WHERE ai_usage.calls < $3 RETURNING calls`,
    [this.userId, localDate(now, timezone), this.cfg.maxAI]);
    if (!usage.rowCount) throw new Error('AI_DAILY_LIMIT');
    return fn();
  }
  async processNext(now: string): Promise<boolean> {
    const c = await this.pool.connect();
    let failedMessage: string | undefined;
    try {
      await c.query('BEGIN');
      // Learner work is serialized globally for this small invite-only deployment. Transaction lock is released on crash.
      if (!(await c.query('SELECT pg_try_advisory_xact_lock(191887,2) AS locked')).rows[0].locked) { await c.query('ROLLBACK'); return false; }
      const message = (await c.query("SELECT * FROM messages WHERE processing_status='pending' AND direction='inbound' AND user_id=$1 ORDER BY received_at,id LIMIT 1 FOR UPDATE", [this.userId])).rows[0];
      if (!message) { await c.query('COMMIT'); return false; }
      failedMessage = message.id;
      const user = (await c.query('SELECT * FROM users WHERE id=$1', [this.userId])).rows[0];
      let response = '';
      if (user.practice_enabled) response = await this.turn(c, message, user, now);
      if (response) await this.reply(c, message.id, response);
      await c.query("UPDATE messages SET processing_status='complete' WHERE id=$1", [message.id]);
      await c.query('COMMIT'); return true;
    } catch (e) {
      await c.query('ROLLBACK');
      if (failedMessage) await c.query(`UPDATE messages SET processing_attempts=processing_attempts+1,
        processing_status=CASE WHEN processing_attempts>=2 THEN 'failed' ELSE 'pending' END WHERE id=$1`, [failedMessage]);
      throw e;
    } finally { c.release(); }
  }
  private async prompt(c: PoolClient, session: any, timezone: string, now: string): Promise<string> {
    if (session.current_index >= session.ordered_card_ids.length) {
      await c.query("UPDATE sessions SET status='complete',ended_at=$2 WHERE id=$1", [session.id, now]);
      return `Session complete. ${await this.summary(c, now)} Enter PRACTICE any time.`;
    }
    const row = (await c.query('SELECT * FROM review_cards WHERE id=$1', [session.ordered_card_ids[session.current_index]])).rows[0];
    const existing = (await c.query('SELECT * FROM review_opportunities WHERE session_id=$1 AND card_id=$2', [session.id, row.id])).rows[0];
    if (existing?.prompt_text) return existing.prompt_text;
    const sense = pack.senses.find(s => s.id === row.sense_id)!;
    const ctx: TestContext = { sense, direction: row.direction, allowTransliteration: session.settings_snapshot.allowTransliteration, prompt: '' };
    let text = fallbackQuestion(ctx);
    try { text = await this.callAI(() => this.tutor.question(ctx), now, timezone); } catch { /* curated question still works */ }
    const numbered = `${session.current_index + 1}/${session.ordered_card_ids.length}: ${text}`;
    const policy = { ...session.settings_snapshot, policyVersion: 'semantic-v1', targetScript: pack.targetScript };
    await c.query(`INSERT INTO review_opportunities(id,user_id,card_id,session_id,expected_card_version,grading_policy,prompt_text,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [randomUUID(), this.userId, row.id, session.id, row.version, policy, numbered, now]);
    return numbered;
  }
  private async summary(c: PoolClient, now: string) {
    const p = await readProgress(c, now, this.userId);
    const goal = (await c.query('SELECT daily_goal FROM users WHERE id=$1', [this.userId])).rows[0].daily_goal;
    const state = p.today?.status === 'held' ? 'Streak held today; complete your goal tomorrow.' : p.today?.status === 'complete' ? 'Daily goal complete!' : 'Keep practicing toward your daily goal.';
    return `Today ${p.today?.count ?? 0}/${goal} words. Streak: ${p.currentStreak}. Garden: ${p.garden.boxCount} boxes, ${p.garden.maturePlants} mature plants. ${state}`;
  }
  private async turn(c: PoolClient, message: any, user: any, now: string): Promise<string> {
    const text = message.body.trim();
    if (/^PATCH(?:\s|$)/i.test(text)) {
      const name = text.replace(/^PATCH\s*/i, '').trim();
      if (!validPatchName(name)) return 'Name your patch with PATCH Moon Garden. Use 1–40 letters, spaces, apostrophes, hyphens, & or !. The name appears in the shared garden.';
      await c.query('UPDATE users SET garden_patch_name=$2 WHERE id=$1', [this.userId, name]);
      return `Your patch is now called ${name}.`;
    }
    if (/^NICKNAME(?:\s|$)/i.test(text)) {
      const nickname = text.replace(/^NICKNAME\s*/i, '').trim();
      if (!validNickname(nickname)) return 'Choose a nickname of 1–24 letters, spaces, apostrophes or hyphens. It appears in the shared garden; don’t use private contact information.';
      await c.query('UPDATE users SET garden_name=$2 WHERE id=$1', [this.userId, nickname]);
      return `Your shared garden name is now ${nickname}.`;
    }
    const command = text.toLowerCase();
    const profile = (await c.query('SELECT * FROM learning_profiles WHERE id=$1', [this.profileId])).rows[0];
    const settings: Settings = { ...defaultSettings, wordsPerSession: profile.words_per_session, directionMode: profile.direction_mode,
      allowTransliteration: profile.allow_transliteration, maxNewSensesPerDay: profile.max_new_senses_per_day, dailyGoal: user.daily_goal, timezone: user.timezone };
    if (command === 'help') return HELP;
    if (command === 'progress') return this.summary(c, now);
    if (command === 'settings') return `Words/session: ${settings.wordsPerSession}. Direction: ${settings.directionMode}. Transliteration: ${settings.allowTransliteration ? 'on' : 'off'}. Daily goal: ${settings.dailyGoal}. Reminders: ${user.reminders_enabled ? user.reminder_local_time : 'off'} (${user.timezone}). Changes apply to new sessions. ${HELP}`;
    if (command === 'pause') { await c.query('UPDATE users SET reminders_enabled=false WHERE id=$1', [this.userId]); return 'Reminders paused. Enter REMINDER 09:00 to enable them again.'; }
    const reminder = /^reminder (\d{2}):(\d{2})$/.exec(command);
    if (reminder && +reminder[1] < 24 && +reminder[2] < 60) {
      await c.query('UPDATE users SET reminders_enabled=true,reminder_local_time=$2 WHERE id=$1', [this.userId, `${reminder[1]}:${reminder[2]}`]);
      return `Daily reminder set for ${reminder[1]}:${reminder[2]} ${user.timezone}. Enter PAUSE to disable.`;
    }
    const words = /^words (\d+)$/.exec(command);
    if (words && +words[1] >= 1 && +words[1] <= 50) {
      await c.query('UPDATE learning_profiles SET words_per_session=$2,settings_version=settings_version+1 WHERE id=$1', [this.profileId, +words[1]]);
      return `New sessions will test up to ${+words[1]} words. Daily goal stays ${user.daily_goal}.`;
    }
    const direction = /^direction (forward|reverse|mixed)$/.exec(command);
    if (direction) {
      const mode = { forward: 'source_to_target', reverse: 'target_to_source', mixed: 'mixed' }[direction[1]];
      await c.query('UPDATE learning_profiles SET direction_mode=$2,settings_version=settings_version+1 WHERE id=$1', [this.profileId, mode]);
      return `Direction updated to ${direction[1]} for new sessions.`;
    }
    const translit = /^transliteration (on|off)$/.exec(command);
    if (translit) {
      await c.query('UPDATE learning_profiles SET allow_transliteration=$2,settings_version=settings_version+1 WHERE id=$1', [this.profileId, translit[1] === 'on']);
      return `Transliteration ${translit[1]} for new sessions.`;
    }
    if (/^(words|direction|transliteration|reminder)\b/.test(command)) return `Setting not understood. ${HELP}`;
    let session = (await c.query("SELECT * FROM sessions WHERE user_id=$1 AND status='active'", [this.userId])).rows[0];
    if (command === 'done') {
      if (session) {
        await c.query("UPDATE sessions SET status='ended',ended_at=$2 WHERE id=$1", [session.id, now]);
        await c.query("UPDATE review_opportunities SET status='cancelled' WHERE session_id=$1 AND status='open'", [session.id]);
      }
      return this.summary(c, now);
    }
    // A session crossing local midnight ends; this message is not graded against a new prompt.
    if (session && localDate(iso(session.started_at), settings.timezone) !== localDate(iso(message.received_at), settings.timezone)) {
      await c.query("UPDATE sessions SET status='ended',ended_at=$2 WHERE id=$1", [session.id, now]); session = undefined;
    }
    if (!session) {
      if (command !== 'practice') return 'Enter PRACTICE to begin a session, or HELP for commands.';
      const cards = (await c.query('SELECT * FROM review_cards WHERE profile_id=$1', [this.profileId])).rows.map(card);
      const introduced = await c.query(`SELECT DISTINCT rc.sense_id FROM review_opportunities o JOIN review_cards rc ON rc.id=o.card_id WHERE o.user_id=$1`, [this.userId]);
      const today = await c.query(`SELECT DISTINCT rc.sense_id FROM review_opportunities o JOIN review_cards rc ON rc.id=o.card_id
        WHERE o.user_id=$1 GROUP BY rc.sense_id HAVING to_char(min(o.created_at) AT TIME ZONE $2,'YYYY-MM-DD')=$3`, [this.userId, settings.timezone, localDate(iso(message.received_at), settings.timezone)]);
      const plan = planSession({ cards, settings, now: iso(message.received_at), introducedSenseIds: introduced.rows.map(r => r.sense_id), introducedToday: today.rows.map(r => r.sense_id) });
      if (!plan.cards.length) return `No eligible words right now. ${await this.summary(c, now)} New words are available tomorrow; missed words return after ten minutes.`;
      session = { id: randomUUID(), current_index: 0, ordered_card_ids: plan.cards.map(c => c.id), settings_snapshot: settings };
      await c.query(`INSERT INTO sessions(id,user_id,profile_id,settings_snapshot,ordered_card_ids,started_at) VALUES($1,$2,$3,$4,$5,$6)`, [session.id, this.userId, this.profileId, settings, JSON.stringify(session.ordered_card_ids), message.received_at]);
      return this.prompt(c, session, settings.timezone, now);
    }
    if (command === 'practice') return this.prompt(c, session, settings.timezone, now);
    const row = (await c.query('SELECT * FROM review_cards WHERE id=$1', [session.ordered_card_ids[session.current_index]])).rows[0];
    const op = (await c.query("SELECT * FROM review_opportunities WHERE session_id=$1 AND card_id=$2 AND status='open'", [session.id, row.id])).rows[0];
    if (!op) return this.prompt(c, session, settings.timezone, now);
    const sense = pack.senses.find(s => s.id === row.sense_id)!;
    if (command === 'hint') {
      await c.query('UPDATE review_opportunities SET hint_used=true WHERE id=$1', [op.id]);
      return `Hint: ${row.direction === 'source_to_target' ? sense.lemma : sense.gloss}. Try using it in a reply. This will be recorded as assisted practice.`;
    }
    if (message.received_at < op.created_at) return 'That reply arrived before this question was ready. Please answer the current question again.';
    await c.query('UPDATE messages SET session_id=$2 WHERE id=$1', [message.id, session.id]);
    const ctx: TestContext = { sense, direction: row.direction, allowTransliteration: op.grading_policy.allowTransliteration, prompt: op.prompt_text };
    let grade;
    try { grade = await this.callAI(() => this.tutor.grade(ctx, text), now, user.timezone); }
    catch { return 'I could not grade that reply right now. No review was recorded. Please try your answer again later, or text DONE.'; }
    const opportunity: Opportunity = { id: op.id, senseId: row.sense_id, direction: row.direction,
      policyVersion: 'semantic-v1', allowTransliteration: op.grading_policy.allowTransliteration, targetScript: pack.targetScript, hintUsed: op.hint_used, status: 'open' };
    let decision;
    try { decision = acceptGrade(opportunity, text, { opportunityId: op.id, senseId: row.sense_id, direction: row.direction, policyVersion: 'semantic-v1',
      evidence: grade.evidence, outcome: grade.outcome, answerForm: grade.answerForm, explanation: grade.explanation }); }
    catch { return 'I could not confidently validate that answer. Please try again; no review was recorded.'; }
    if (decision.status === 'clarify') return decision.reason === 'format_mismatch' ? 'Please answer the Korean word in Hangul. Transliteration is off for this session; no review recorded yet.' : grade.reply;
    const next = reviewCard(card(row), decision.rating, iso(message.received_at), op.expected_card_version);
    await c.query('UPDATE messages SET ai_result=$2 WHERE id=$1', [message.id, { ...grade, model: this.tutor.version }]);
    await commitReviewInTransaction(c, { assessmentId: randomUUID(), userId: this.userId, opportunityId: op.id, messageId: message.id,
      expectedCardVersion: op.expected_card_version, rating: decision.rating, evidence: grade.evidence,
      semanticOutcome: grade.outcome as 'correct' | 'incorrect', answerForm: grade.answerForm, evaluatorVersion: this.tutor.version, assessedAt: now,
      nextState: { ...next, lastReviewedAt: next.lastReviewedAt! }, practiceTimezone: message.practice_timezone, dailyGoal: message.goal_snapshot });
    session.current_index++;
    await c.query('UPDATE sessions SET current_index=$2 WHERE id=$1', [session.id, session.current_index]);
    return `${grade.reply}\n${await this.prompt(c, session, settings.timezone, now)}`;
  }
}
