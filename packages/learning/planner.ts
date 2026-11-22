import { timestamp, validateSettings, type Direction, type Settings } from '../contracts/index.ts';
import { validateCard, type Card } from './scheduler.ts';

const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export interface PlanInput {
  cards: readonly Card[];
  settings: Settings;
  now: string;
  /** All senses ever introduced, including introductions earlier today. */
  introducedSenseIds: readonly string[];
  /** Distinct senses introduced on the current local day, across directions. */
  introducedToday: readonly string[];
}

export function planSession(input: PlanInput) {
  const settings = validateSettings(input.settings);
  const now = timestamp(input.now);
  const seenIds = new Set<string>();
  for (const card of input.cards) {
    validateCard(card);
    if (seenIds.has(card.id)) throw new Error('Duplicate card ID');
    seenIds.add(card.id);
  }
  const introduced = new Set([...input.introducedSenseIds, ...input.introducedToday]);
  let remainingNew = Math.max(0, settings.maxNewSensesPerDay - new Set(input.introducedToday).size);
  const eligible = input.cards.filter(c => timestamp(c.dueAt) <= now &&
    (settings.directionMode === 'mixed' || c.direction === settings.directionMode));
  const chosen: Card[] = [];
  const senses = new Set<string>();
  let nextDirection: Direction | undefined;
  for (const isNew of [false, true]) {
    const queues = {
      source_to_target: eligible.filter(c => (c.reviewCount === 0) === isNew && c.direction === 'source_to_target'),
      target_to_source: eligible.filter(c => (c.reviewCount === 0) === isNew && c.direction === 'target_to_source'),
    };
    const sort = (a: Card, b: Card) => (isNew ? a.packRank - b.packRank : timestamp(a.dueAt) - timestamp(b.dueAt)) || compareId(a.id, b.id);
    queues.source_to_target.sort(sort);
    queues.target_to_source.sort(sort);
    if (!nextDirection) {
      const a = queues.source_to_target[0], b = queues.target_to_source[0];
      nextDirection = !a || (b && !isNew && timestamp(b.dueAt) < timestamp(a.dueAt)) ? 'target_to_source' : 'source_to_target';
      // No due cards: start the new-card phase with production on a tie.
      if (!a && !b) nextDirection = undefined;
    }
    while (chosen.length < settings.wordsPerSession) {
      const preferred: Direction = nextDirection ?? 'source_to_target';
      const other: Direction = preferred === 'source_to_target' ? 'target_to_source' : 'source_to_target';
      let selected: Card | undefined;
      for (const direction of [preferred, other]) {
        while (queues[direction].length) {
          const candidate = queues[direction].shift()!;
          if (senses.has(candidate.senseId)) continue;
          if (isNew && !introduced.has(candidate.senseId) && remainingNew === 0) continue;
          selected = candidate;
          break;
        }
        if (selected) break;
      }
      if (!selected) break;
      if (isNew && !introduced.has(selected.senseId)) {
        remainingNew--;
        introduced.add(selected.senseId);
      }
      chosen.push({ ...selected });
      senses.add(selected.senseId);
      nextDirection = selected.direction === 'source_to_target' ? 'target_to_source' : 'source_to_target';
    }
  }
  return { plannedAt: input.now, settings: { ...settings }, cards: chosen,
    requestedWords: settings.wordsPerSession, shortfall: settings.wordsPerSession - chosen.length };
}
