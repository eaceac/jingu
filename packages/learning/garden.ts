import { timestamp } from '../contracts/index.ts';

export const GARDEN_POLICY = 'garden-v2' as const;
export const BOX_CAPACITY = 4;
export const BOX_STREAK_INTERVAL = 7;
const SPECIES = ['basil', 'lavender', 'strawberry', 'echinacea'] as const;
export type PlantSpecies = typeof SPECIES[number];
export type PlantStage = 'seed' | 'sprout' | 'leaves' | 'developing' | 'mature';
const STAGES: readonly PlantStage[] = ['seed', 'sprout', 'leaves', 'developing', 'mature'];

/** Emitted once for each completed local day by the daily-progress reducer. */
export interface GardenCompletion {
  date: string;
  longestStreak: number;
}
export interface GardenPlant {
  id: string;
  species: PlantSpecies;
  stage: PlantStage;
  visualStage: string;
  growthSteps: number;
  plantedOn: string;
  maturedOn: string | null;
  boxId: string;
  slot: number;
  collectedOn: string | null;
}
export interface GardenBox {
  id: string;
  unlockedAtStreak: number;
  unlockedOn: string | null;
  capacity: number;
  /** Slot index is stable. Null means empty soil, not a generated plant. */
  slots: (string | null)[];
}

function visualStage(species: PlantSpecies, steps: number): string {
  if (steps < 4) return STAGES[steps - 1];
  if (species === 'basil') return steps === 4 ? 'leafy' : 'harvestable';
  if (species === 'strawberry') return steps === 4 ? 'flowering' : 'fruiting';
  return steps === 4 ? 'bud' : 'bloom';
}

/** Replay canonical completion history. No RNG, clock, provider, or mutable reward ledger. */
export function gardenState(completions: readonly GardenCompletion[]) {
  const ordered = [...completions].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const boxes: GardenBox[] = [{ id: 'box-1', unlockedAtStreak: 0, unlockedOn: null,
    capacity: BOX_CAPACITY, slots: Array(BOX_CAPACITY).fill(null) }];
  const plants: GardenPlant[] = [];
  const seen = new Map<string, number>();
  let active: GardenPlant | null = null;
  let growthSteps = 0;
  let longestStreak = 0;
  for (const event of ordered) {
    timestamp(`${event.date}T00:00:00Z`);
    if (seen.has(event.date)) {
      if (seen.get(event.date) !== event.longestStreak) throw new Error('Conflicting garden completion');
      continue;
    }
    if (!Number.isSafeInteger(event.longestStreak) || event.longestStreak < 1 ||
        event.longestStreak < longestStreak || event.longestStreak > longestStreak + 1 ||
        event.longestStreak > growthSteps + 1) throw new Error('Invalid garden streak history');
    seen.set(event.date, event.longestStreak);
    growthSteps++;
    longestStreak = event.longestStreak;

    if (!active) {
      // Prefer newly unlocked beds for the next planting, keeping all prior plants in place.
      let box = [...boxes].reverse().find(b => b.slots.includes(null));
      if (!box) {
        const oldest = plants.find(p => p.stage === 'mature' && p.collectedOn === null)!;
        oldest.collectedOn = event.date;
        box = boxes.find(b => b.id === oldest.boxId)!;
        box.slots[oldest.slot] = null;
      }
      const slot = box.slots.indexOf(null);
      const species = SPECIES[plants.length % SPECIES.length];
      active = { id: `plant-${event.date}`, species, stage: 'seed', visualStage: 'seed', growthSteps: 1,
        plantedOn: event.date, maturedOn: null, boxId: box.id, slot, collectedOn: null };
      plants.push(active);
      box.slots[slot] = active.id;
    } else {
      active.growthSteps++;
      active.stage = STAGES[active.growthSteps - 1];
      active.visualStage = visualStage(active.species, active.growthSteps);
      if (active.stage === 'mature') { active.maturedOn = event.date; active = null; }
    }

    // Unlock after today's growth: a newly earned box always arrives empty.
    const earnedBoxes = 1 + Math.floor(longestStreak / BOX_STREAK_INTERVAL);
    while (boxes.length < earnedBoxes) {
      boxes.push({ id: `box-${boxes.length + 1}`, unlockedAtStreak: boxes.length * BOX_STREAK_INTERVAL,
        unlockedOn: event.date, capacity: BOX_CAPACITY, slots: Array(BOX_CAPACITY).fill(null) });
    }
  }
  return {
    policyVersion: GARDEN_POLICY,
    growthSteps,
    boxCount: boxes.length,
    boxes,
    plants,
    activePlant: active,
    maturePlants: plants.filter(p => p.stage === 'mature').length,
    collection: plants.filter(p => p.collectedOn !== null),
    nextBoxAtStreak: boxes.length * BOX_STREAK_INTERVAL,
  };
}
