import { defaultSettings } from '../../packages/contracts/index.ts';
import { koreanStarterPack } from '../../packages/languages/index.ts';
import { createCard, planSession, acceptGrade, reviewCard, progress } from '../../packages/learning/index.ts';

const now = '2026-11-22T12:00:00.000Z';
const cards = koreanStarterPack.senses.flatMap(sense => [
  createCard(`${sense.id}:f`, sense.id, 'source_to_target', now, sense.rank),
  createCard(`${sense.id}:r`, sense.id, 'target_to_source', now, sense.rank),
]);
const plan = planSession({ cards, settings: { ...defaultSettings, directionMode: 'mixed' }, now,
  introducedSenseIds: [], introducedToday: [] });
console.log('Jingu foundation demo — fixed fixtures, no AI calls, no database writes.\n');
console.log('Deterministic mixed-direction session:');
for (const card of plan.cards) {
  const sense = koreanStarterPack.senses.find(s => s.id === card.senseId)!;
  console.log(`  ${card.direction === 'source_to_target' ? `English → Korean: ${sense.gloss}` : `Korean → English: ${sense.lemma}`}`);
}
const selected = plan.cards[0];
const assessment = acceptGrade({ id: 'demo-opportunity', senseId: selected.senseId, direction: selected.direction,
  policyVersion: 'semantic-v1', hintUsed: false, allowTransliteration: true, targetScript: koreanStarterPack.targetScript, status: 'open' }, 'mul', {
  opportunityId: 'demo-opportunity', senseId: selected.senseId, direction: selected.direction,
  policyVersion: 'semantic-v1', evidence: 'mul', outcome: 'correct', answerForm: 'transliteration',
  explanation: 'Fixture: recognizable romanization of 물. This is not a live model judgment.',
});
if (assessment.status === 'accepted') {
  console.log(`\nSaved-model-output fixture: "mul" → ${assessment.rating}; next due ${reviewCard(selected, assessment.rating, now, selected.version).dueAt}`);
}
const days = [['2026-11-20', 5], ['2026-11-21', 1], ['2026-11-22', 5]] as const;
const result = progress(days.map(([date, count]) => ({ date, goal: 5,
  attempts: Array.from({ length: count }, (_, i) => ({ assessmentId: `${date}:${i}`, senseId: `ko:${i}`, localDate: date })),
})), '2026-11-22');
console.log('\nDaily goal → one-word hold → daily goal:');
for (const day of result.daily) console.log(`  ${day.date}: ${day.count}/${day.goal} — ${day.status}`);
console.log(`Streak: ${result.currentStreak}; garden growth: ${result.garden.growthSteps} days; plant: ${result.garden.activePlant?.stage}`);

console.log('\nGarden milestones (scripted completed days):');
for (const count of [0, 1, 5, 7, 11, 14, 21]) {
  const history = Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10);
    return { date, goal: 1, attempts: [{ assessmentId: `garden:${i}`, senseId: 'ko:water', localDate: date }] };
  });
  const garden = progress(history, history.at(-1)?.date ?? '2026-01-01').garden;
  console.log(`  Day ${count}: ${garden.boxCount} boxes, ${garden.maturePlants} mature plants; next box at streak ${garden.nextBoxAtStreak}`);
  if (garden.activePlant) console.log(`    Growing ${garden.activePlant.species}: ${garden.activePlant.visualStage} in ${garden.activePlant.boxId}`);
}
