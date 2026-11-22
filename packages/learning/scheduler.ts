import { timestamp, type Direction, type Rating } from '../contracts/index.ts';

export const POLICY = 'ladder-v1' as const;
export const INTERVAL_DAYS = [1, 3, 7, 14, 30, 60, 120, 240] as const;

export interface Card {
  id: string;
  senseId: string;
  direction: Direction;
  stage: number;
  dueAt: string;
  lastReviewedAt: string | null;
  successfulReviews: number;
  lapses: number;
  reviewCount: number;
  version: number;
  policyVersion: typeof POLICY;
  packRank: number;
}

export function createCard(id: string, senseId: string, direction: Direction, now: string, packRank = 0): Card {
  timestamp(now);
  if (!id || !senseId || !['source_to_target', 'target_to_source'].includes(direction)) throw new Error('Invalid card identity');
  const card: Card = { id, senseId, direction, stage: -1, dueAt: now, lastReviewedAt: null,
    successfulReviews: 0, lapses: 0, reviewCount: 0, version: 0, policyVersion: POLICY, packRank };
  validateCard(card);
  return card;
}

export function validateCard(card: Card): void {
  if (typeof card.id !== 'string' || !card.id.trim() || typeof card.senseId !== 'string' || !card.senseId.trim() ||
      !['source_to_target', 'target_to_source'].includes(card.direction)) throw new Error('Invalid card identity');
  if (card.policyVersion !== POLICY) throw new Error('Unsupported scheduler policy');
  if (!Number.isInteger(card.stage) || card.stage < -1 || card.stage >= INTERVAL_DAYS.length) throw new Error('Invalid stage');
  for (const n of [card.reviewCount, card.successfulReviews, card.lapses, card.version, card.packRank]) {
    if (!Number.isInteger(n) || n < 0) throw new Error('Invalid card counter');
  }
  if (card.successfulReviews + card.lapses !== card.reviewCount) throw new Error('Inconsistent review counts');
  timestamp(card.dueAt);
  if (card.lastReviewedAt !== null) timestamp(card.lastReviewedAt);
}

export function reviewCard(card: Card, rating: Rating, reviewedAt: string, expectedVersion: number): Card {
  validateCard(card);
  const now = timestamp(reviewedAt);
  if (!['again', 'hard', 'good', 'easy'].includes(rating)) throw new Error('Invalid rating');
  if (expectedVersion !== card.version) throw new Error('Stale card version');
  if (card.lastReviewedAt && now <= timestamp(card.lastReviewedAt)) throw new Error('Out-of-order review');
  if (now < timestamp(card.dueAt)) throw new Error('Card is not due');
  const stage = rating === 'again' ? -1 : rating === 'hard' ? Math.max(0, card.stage)
    : Math.min(INTERVAL_DAYS.length - 1, card.stage + (rating === 'easy' ? 2 : 1));
  const interval = rating === 'again' ? 10 * 60_000 : INTERVAL_DAYS[stage] * 86_400_000;
  return { ...card, stage, dueAt: new Date(now + interval).toISOString(), lastReviewedAt: reviewedAt,
    successfulReviews: card.successfulReviews + Number(rating !== 'again'),
    lapses: card.lapses + Number(rating === 'again'), reviewCount: card.reviewCount + 1, version: card.version + 1 };
}
