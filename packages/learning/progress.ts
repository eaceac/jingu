import { timestamp } from '../contracts/index.ts';
import { gardenState, type GardenCompletion } from './garden.ts';
export { gardenState } from './garden.ts';

export function localDate(instant: string, timezone: string): string {
  const date = new Date(timestamp(instant));
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function dayNumber(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid local date');
  const n = timestamp(`${date}T00:00:00Z`) / 86_400_000;
  return n;
}

export interface PracticeAttempt {
  assessmentId: string;
  senseId: string;
  /** Persisted from server receipt timestamp + the event-time timezone snapshot. */
  localDate: string;
}
export interface DailyInput {
  date: string;
  goal: number;
  attempts: readonly PracticeAttempt[];
}
export type DailyStatus = 'complete' | 'held' | 'partial' | 'missed' | 'in_progress';

/** All inputs are accepted review attempts; casual uses/exposures never enter this projection. */
export function progress(days: readonly DailyInput[], today: string) {
  const currentDay = dayNumber(today);
  const sorted = [...days].sort((a, b) => dayNumber(a.date) - dayNumber(b.date));
  const seenDates = new Set<string>();
  const seenAssessments = new Map<string, PracticeAttempt>();
  const daily: { date: string; goal: number; count: number; status: DailyStatus }[] = [];
  let streak = 0, longest = 0, completedDays = 0;
  const gardenCompletions: GardenCompletion[] = [];
  let previousDay: number | undefined;
  let previousStatus: DailyStatus | undefined;
  let todayState: { date: string; goal: number; count: number; status: DailyStatus } | undefined;
  let holdAvailableToday = false;
  for (const day of sorted) {
    const dayIndex = dayNumber(day.date);
    if (dayIndex > currentDay) throw new Error('Future practice date');
    if (seenDates.has(day.date)) throw new Error('Duplicate daily record');
    seenDates.add(day.date);
    if (!Number.isInteger(day.goal) || day.goal < 1 || day.goal > 50) throw new Error('Invalid daily goal');
    if (previousDay === undefined || dayIndex - previousDay > 1) { streak = 0; previousStatus = undefined; }
    const senses = new Set<string>();
    for (const attempt of day.attempts) {
      if (!attempt.assessmentId || !attempt.senseId || attempt.localDate !== day.date) throw new Error('Invalid attempt');
      const prior = seenAssessments.get(attempt.assessmentId);
      if (prior && (prior.senseId !== attempt.senseId || prior.localDate !== attempt.localDate)) throw new Error('Conflicting duplicate assessment');
      seenAssessments.set(attempt.assessmentId, attempt);
      senses.add(attempt.senseId);
    }
    const canHold = streak > 0 && previousStatus === 'complete';
    if (dayIndex === currentDay) holdAvailableToday = canHold;
    let status: DailyStatus;
    if (senses.size >= day.goal) {
      status = 'complete'; streak++; completedDays++; longest = Math.max(longest, streak);
      gardenCompletions.push({ date: day.date, longestStreak: longest });
    } else if (senses.size > 0 && canHold) {
      status = 'held';
    } else {
      status = senses.size ? 'partial' : dayIndex === currentDay ? 'in_progress' : 'missed';
      // Today remains open: yesterday's chain can still be continued before midnight.
      if (dayIndex < currentDay) streak = 0;
    }
    const result = { date: day.date, goal: day.goal, count: senses.size, status };
    daily.push(result);
    if (dayIndex === currentDay) todayState = result;
    previousDay = dayIndex;
    previousStatus = status;
  }
  if (previousDay === undefined || currentDay - previousDay > 1) streak = 0;
  if (!todayState) holdAvailableToday = streak > 0 && previousDay === currentDay - 1 && previousStatus === 'complete';
  if (todayState?.status === 'complete') holdAvailableToday = false;
  return {
    policyVersion: 'daily-hold-v1', currentStreak: streak, longestStreak: longest,
    completedDays, today: todayState ?? null, holdAvailableToday, daily,
    garden: gardenState(gardenCompletions),
  };
}
