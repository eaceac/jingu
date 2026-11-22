import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSettings, timestamp, validateSettings } from '../contracts/index.ts';
import { createCard, reviewCard, planSession, acceptGrade, progress, localDate, type DailyInput, type Opportunity } from './index.ts';
import { koreanStarterPack, spanishFixturePack } from '../languages/index.ts';

const now = '2026-11-22T12:00:00.000Z';
const card = () => createCard('water-forward', 'ko:water', 'source_to_target', now);

test('scheduler transitions have exact intervals and do not mutate prior state', () => {
  const original = card();
  const good = reviewCard(original, 'good', now, 0);
  assert.equal(good.dueAt, '2026-11-23T12:00:00.000Z');
  assert.equal(good.stage, 0);
  assert.equal(original.reviewCount, 0);
  assert.deepEqual(reviewCard(original, 'good', now, 0), good);
  const second = reviewCard(good, 'good', good.dueAt, 1);
  assert.equal(second.stage, 1);
  assert.equal(second.dueAt, '2026-11-26T12:00:00.000Z');
  assert.equal(reviewCard(original, 'easy', now, 0).dueAt, '2026-11-25T12:00:00.000Z');
  assert.equal(reviewCard(original, 'hard', now, 0).dueAt, good.dueAt);
});

test('failures relearn after ten minutes; repeated early practice cannot advance schedule', () => {
  const failed = reviewCard(card(), 'again', now, 0);
  assert.equal(failed.dueAt, '2026-11-22T12:10:00.000Z');
  assert.equal(failed.lapses, 1);
  assert.throws(() => reviewCard(failed, 'good', '2026-11-22T12:05:00Z', 1), /not due/);
  assert.equal(reviewCard(failed, 'good', failed.dueAt, 1).stage, 0);
});

test('stale and out-of-order reviews rejected, stages cap at 240 days', () => {
  const first = reviewCard(card(), 'good', now, 0);
  assert.throws(() => reviewCard(first, 'good', first.dueAt, 0), /Stale/);
  assert.throws(() => reviewCard(first, 'good', now, 1), /Out-of-order/);
  let state = card();
  for (let n = 0; n < 12; n++) state = reviewCard(state, 'easy', state.dueAt, state.version);
  assert.equal(state.stage, 7);
  assert.equal(timestamp(state.dueAt) - timestamp(state.lastReviewedAt!), 240 * 86_400_000);
});

const cards = koreanStarterPack.senses.slice(0, 8).flatMap(s => [
  createCard(`${s.id}:f`, s.id, 'source_to_target', now, s.rank),
  createCard(`${s.id}:r`, s.id, 'target_to_source', now, s.rank),
]);
const plan = (overrides: Partial<Parameters<typeof planSession>[0]> = {}) => planSession({
  cards, settings: { ...defaultSettings }, now, introducedSenseIds: [], introducedToday: [], ...overrides,
});

test('new-sense cap gives an explicit shorter plan; reverse introductions are not charged twice', () => {
  const settings = { ...defaultSettings, maxNewSensesPerDay: 3 };
  assert.equal(plan({ settings }).cards.length, 3);
  assert.equal(plan({ settings }).shortfall, 2);
  assert.equal(plan({ settings, introducedToday: ['ko:water', 'ko:cooked-rice', 'ko:coffee'] }).cards.length, 3);
  assert.equal(plan().cards.length, 5, 'fresh learner can reach the default daily goal');
  const reverse = plan({ settings: { ...defaultSettings, directionMode: 'target_to_source', maxNewSensesPerDay: 0 }, introducedSenseIds: ['ko:water'] });
  assert.equal(reverse.cards.length, 1);
  assert.equal(reverse.cards[0].direction, 'target_to_source');
});

test('mixed selection is stable across input order and avoids reverse leakage in the same session', () => {
  const settings = { ...defaultSettings, directionMode: 'mixed' as const, maxNewSensesPerDay: 5 };
  const a = plan({ settings }), b = plan({ settings, cards: [...cards].reverse() });
  assert.deepEqual(a, b);
  assert.deepEqual(a.cards.map(c => c.direction), ['source_to_target', 'target_to_source', 'source_to_target', 'target_to_source', 'source_to_target']);
  assert.equal(new Set(a.cards.map(c => c.senseId)).size, 5);
  settings.wordsPerSession = 20;
  assert.equal(a.settings.wordsPerSession, 5);
});

test('oldest due direction starts mixed mode; all due cards precede new cards', () => {
  const forward = { ...reviewCard(cards[0], 'good', now, 0), dueAt: '2026-11-22T10:00:00Z' };
  const reverse = { ...reviewCard(cards[3], 'good', now, 0), dueAt: '2026-11-22T09:00:00Z' };
  const selected = plan({ cards: [forward, reverse, ...cards.slice(4)], settings: { ...defaultSettings, directionMode: 'mixed' } });
  assert.deepEqual(selected.cards.slice(0, 2).map(c => c.id), [reverse.id, forward.id]);
  const future = { ...forward, dueAt: '2026-11-30T00:00:00Z' };
  assert.equal(plan({ cards: [future] }).cards.length, 0);
});

test('scheduler has no Korean dependency and directional cards stay independent', () => {
  const sense = spanishFixturePack.senses[0];
  const forward = createCard('es:f', sense.id, 'source_to_target', now);
  const reverse = createCard('es:r', sense.id, 'target_to_source', now);
  const reviewed = reviewCard(forward, 'good', now, 0);
  assert.equal(reviewed.reviewCount, 1);
  assert.equal(reverse.reviewCount, 0);
  assert.equal(plan({ cards: [forward] }).cards[0].senseId, 'es:water');
});

const opportunity: Opportunity = { id: 'o1', senseId: 'ko:water', direction: 'source_to_target',
  policyVersion: 'semantic-v1', allowTransliteration: true, targetScript: 'Hangul', hintUsed: false, status: 'open' };
const proposal = { opportunityId: 'o1', senseId: 'ko:water', direction: 'source_to_target',
  policyVersion: 'semantic-v1', evidence: 'mul', outcome: 'correct', answerForm: 'transliteration', explanation: 'Recognizable romanization of 물.' };

test('validated semantic output can accept romanization; off clarifies without a grade', () => {
  assert.equal(acceptGrade(opportunity, 'mul', proposal).status, 'accepted');
  assert.deepEqual(acceptGrade({ ...opportunity, allowTransliteration: false }, 'mul', proposal), { status: 'clarify', reason: 'format_mismatch' });
  assert.equal(acceptGrade({ ...opportunity, allowTransliteration: false }, '물', { ...proposal, evidence: '물', answerForm: 'native_script' }).status, 'accepted');
  const reverse = { ...opportunity, direction: 'target_to_source' as const, allowTransliteration: false };
  assert.equal(acceptGrade(reverse, 'water', { ...proposal, direction: reverse.direction, evidence: 'water' }).status, 'accepted');
});

test('hints cannot be overridden by model output; uncertainty never reschedules', () => {
  const result = acceptGrade({ ...opportunity, hintUsed: true }, 'mul', proposal, 'easy');
  assert.equal(result.status === 'accepted' && result.rating, 'again');
  assert.deepEqual(acceptGrade(opportunity, 'mul', { ...proposal, outcome: 'uncertain' }), { status: 'clarify', reason: 'uncertain' });
  assert.throws(() => acceptGrade(opportunity, 'mul', { ...proposal, hintUsed: false }), /schema/);
});

test('mislabeling romanized target evidence as mixed cannot bypass native-script policy', () => {
  assert.deepEqual(acceptGrade({ ...opportunity, allowTransliteration: false }, 'mul', { ...proposal, answerForm: 'mixed' }),
    { status: 'clarify', reason: 'format_mismatch' });
});

test('hydrated invalid cards and negative pack ranks are rejected', () => {
  assert.throws(() => plan({ cards: [{ ...card(), senseId: '' }] }), /identity/);
  assert.throws(() => reviewCard({ ...card(), direction: 'mixed' as never }, 'good', now, 0), /identity/);
  assert.throws(() => createCard('x', 'ko:x', 'source_to_target', now, -1), /counter/);
});

test('invented evidence, selected-word replacement, stale policy, and closed opportunities are rejected', () => {
  assert.throws(() => acceptGrade(opportunity, 'hello', proposal), /evidence/);
  assert.throws(() => acceptGrade(opportunity, 'mul', { ...proposal, senseId: 'ko:bread' }), /match/);
  assert.throws(() => acceptGrade(opportunity, 'mul', { ...proposal, policyVersion: 'old' }), /match/);
  assert.throws(() => acceptGrade({ ...opportunity, status: 'assessed' }, 'mul', proposal), /closed/);
});

function day(date: string, count: number, goal = 5): DailyInput {
  return { date, goal, attempts: Array.from({ length: count }, (_, i) => ({ assessmentId: `${date}:${i}`, senseId: `sense:${i}`, localDate: date })) };
}

test('complete, hold, complete grows streak twice and garden twice', () => {
  const days = [day('2026-11-20', 5), day('2026-11-21', 1), day('2026-11-22', 5)];
  const result = progress(days, '2026-11-22');
  assert.equal(result.currentStreak, 2);
  assert.equal(result.longestStreak, 2);
  assert.deepEqual(result.daily.map(d => d.status), ['complete', 'held', 'complete']);
  assert.equal(result.garden.growthSteps, 2);
  assert.equal(result.garden.activePlant?.stage, 'sprout');
});

test('second partial day stays open today but breaks chain at day end', () => {
  const days = [day('2026-11-20', 5), day('2026-11-21', 1), day('2026-11-22', 1)];
  assert.equal(progress(days, '2026-11-22').currentStreak, 1);
  assert.equal(progress(days, '2026-11-22').holdAvailableToday, false);
  assert.equal(progress(days, '2026-11-23').currentStreak, 0);
  assert.equal(progress([...days, day('2026-11-23', 5)], '2026-11-23').currentStreak, 1);
});

test('zero practice breaks chain without removing garden; hold cannot start a streak', () => {
  assert.equal(progress([day('2026-11-22', 1)], '2026-11-22').currentStreak, 0);
  const result = progress([day('2026-11-19', 5), day('2026-11-22', 1)], '2026-11-22');
  assert.equal(result.currentStreak, 0);
  assert.equal(result.garden.growthSteps, 1);
  assert.equal(result.longestStreak, 1);
});

test('held day upgrade is counted once; goal of one completes normally', () => {
  const result = progress([day('2026-11-21', 5), day('2026-11-22', 5)], '2026-11-22');
  assert.equal(result.currentStreak, 2);
  assert.equal(result.completedDays, 2);
  assert.equal(progress([day('2026-11-22', 1, 1)], '2026-11-22').today?.status, 'complete');
});

test('duplicates and multiple directional attempts cannot inflate distinct senses or growth', () => {
  const input = day('2026-11-22', 1);
  input.attempts = [...input.attempts, input.attempts[0], { ...input.attempts[0], assessmentId: 'other-direction' }];
  const first = progress([input], '2026-11-22');
  assert.equal(first.today?.count, 1);
  assert.equal(first.garden.growthSteps, 0);
  assert.deepEqual(progress([input], '2026-11-22'), first);
  assert.throws(() => progress([input, input], '2026-11-22'), /Duplicate/);
});

test('late accepted assessment recomputes date and garden from persisted event facts', () => {
  const before = progress([day('2026-11-21', 4)], '2026-11-22');
  const after = progress([day('2026-11-21', 5)], '2026-11-22');
  assert.equal(before.currentStreak, 0);
  assert.equal(after.currentStreak, 1);
  assert.equal(after.holdAvailableToday, true);
  assert.equal(after.garden.growthSteps, 1);
});

test('IANA local dates handle midnight and DST without elapsed-day arithmetic', () => {
  assert.equal(localDate('2026-11-22T07:59:59Z', 'America/Los_Angeles'), '2026-11-21');
  assert.equal(localDate('2026-11-22T08:00:00Z', 'America/Los_Angeles'), '2026-11-22');
  assert.equal(localDate('2026-11-01T08:30:00Z', 'America/Los_Angeles'), localDate('2026-11-01T09:30:00Z', 'America/Los_Angeles'));
  assert.equal(progress([day('2026-10-31', 5), day('2026-11-01', 5)], '2026-11-02').currentStreak, 2);
  assert.throws(() => progress([day('2026-02-30', 5)], '2026-11-22'), /timestamp/);
});

test('settings reject invalid inputs instead of silently changing the learning policy', () => {
  for (const wordsPerSession of [0, -1, 51, 1.5, NaN]) assert.throws(() => validateSettings({ ...defaultSettings, wordsPerSession }));
  assert.throws(() => validateSettings({ ...defaultSettings, timezone: 'not/a-zone' }));
  assert.throws(() => timestamp('2026-11-22'));
});
