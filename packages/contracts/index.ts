export type Direction = 'source_to_target' | 'target_to_source';
export type DirectionMode = Direction | 'mixed';
export type Rating = 'again' | 'hard' | 'good' | 'easy';

export interface Settings {
  wordsPerSession: number;
  directionMode: DirectionMode;
  allowTransliteration: boolean;
  dailyGoal: number;
  maxNewSensesPerDay: number;
  timezone: string;
}

export const defaultSettings: Readonly<Settings> = Object.freeze({
  wordsPerSession: 5,
  directionMode: 'source_to_target',
  allowTransliteration: true,
  dailyGoal: 5,
  maxNewSensesPerDay: 5,
  timezone: 'UTC',
});

export function validateSettings(value: Settings): Settings {
  for (const [key, min, max] of [
    ['wordsPerSession', 1, 50], ['dailyGoal', 1, 50], ['maxNewSensesPerDay', 0, 50],
  ] as const) {
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) {
      throw new Error(`Invalid ${key}`);
    }
  }
  if (!['source_to_target', 'target_to_source', 'mixed'].includes(value.directionMode)) {
    throw new Error('Invalid directionMode');
  }
  if (typeof value.allowTransliteration !== 'boolean') throw new Error('Invalid allowTransliteration');
  if (typeof value.timezone !== 'string' || !value.timezone) throw new Error('Invalid timezone');
  new Intl.DateTimeFormat('en', { timeZone: value.timezone });
  return { ...value };
}

export function timestamp(value: string): number {
  // Only explicit UTC instants; no machine-local date parsing.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) {
    throw new Error('Expected UTC ISO timestamp');
  }
  const result = Date.parse(value);
  if (!Number.isFinite(result) || new Date(result).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    throw new Error('Invalid timestamp');
  }
  return result;
}
