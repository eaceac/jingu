import test from 'node:test';
import assert from 'node:assert/strict';
import { gardenState, type GardenCompletion } from './garden.ts';
import { progress, type DailyInput } from './progress.ts';

const date = (index: number) => new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
const completions = (n: number): GardenCompletion[] => Array.from({ length: n }, (_, i) => ({ date: date(i), longestStreak: i + 1 }));
function history(counts: number[]): DailyInput[] {
  return counts.map((count, i) => ({ date: date(i), goal: 5,
    attempts: Array.from({ length: count }, (_, j) => ({ assessmentId: `${i}:${j}`, senseId: `sense:${j}`, localDate: date(i) })) }));
}

test('new garden is one empty box with a seven-day next milestone', () => {
  const g = gardenState([]);
  assert.equal(g.boxCount, 1);
  assert.deepEqual(g.boxes[0].slots, [null, null, null, null]);
  assert.equal(g.plants.length, 0);
  assert.equal(g.growthSteps, 0);
  assert.equal(g.nextBoxAtStreak, 7);
});

test('five daily steps mature a plant, with species-specific appearance', () => {
  const stages = ['seed', 'sprout', 'leaves', 'developing', 'mature'];
  for (let n = 1; n <= 5; n++) {
    const plant = gardenState(completions(n)).plants[0];
    assert.equal(plant.stage, stages[n - 1]);
    assert.equal(plant.growthSteps, n);
    assert.equal(plant.species, 'basil');
  }
  assert.equal(gardenState(completions(4)).plants[0].visualStage, 'leafy');
  assert.equal(gardenState(completions(5)).plants[0].visualStage, 'harvestable');
  assert.equal(gardenState(completions(5)).activePlant, null);
  const g = gardenState(completions(20));
  assert.deepEqual(g.plants.map(p => p.species), ['basil', 'lavender', 'strawberry', 'echinacea']);
  assert.deepEqual(g.plants.map(p => p.visualStage), ['harvestable', 'bloom', 'fruiting', 'bloom']);
  assert.equal(gardenState(completions(21)).activePlant?.species, 'basil');
});

test('seven-day thresholds unlock exactly one empty box after growth', () => {
  for (const [n, count] of [[6, 1], [7, 2], [13, 2], [14, 3], [21, 4]]) {
    const g = gardenState(completions(n));
    assert.equal(g.boxCount, count);
    assert.equal(g.nextBoxAtStreak, count * 7);
    if (n % 7 === 0) {
      assert.deepEqual(g.boxes.at(-1)?.slots, [null, null, null, null]);
      assert.equal(g.boxes.at(-1)?.unlockedOn, date(n - 1));
    }
  }
});

test('new planting uses the newest available box without moving existing plants', () => {
  const seven = gardenState(completions(7)), eleven = gardenState(completions(11));
  for (const plant of seven.plants) {
    const later = eleven.plants.find(p => p.id === plant.id)!;
    assert.equal(later.species, plant.species);
    assert.equal(later.boxId, plant.boxId);
    assert.equal(later.slot, plant.slot);
  }
  assert.equal(eleven.activePlant?.boxId, 'box-2');
  assert.equal(eleven.activePlant?.slot, 0);
});

test('hold at six preserves progress; next full day unlocks the seventh-day box', () => {
  const counts = [5, 5, 5, 5, 5, 5, 1];
  const held = progress(history(counts), date(6));
  assert.equal(held.currentStreak, 6);
  assert.deepEqual(held.garden, progress(history(counts.slice(0, 6)), date(5)).garden);
  const resumed = progress(history([...counts, 5]), date(7));
  assert.equal(resumed.currentStreak, 7);
  assert.equal(resumed.garden.boxCount, 2);
  assert.equal(resumed.garden.growthSteps, 7);
  assert.equal(resumed.garden.boxes[1].unlockedOn, date(7));
});

test('missed days reset streak but preserve all earned plants and boxes', () => {
  const before = progress(history(Array(14).fill(5)), date(13));
  const missed = progress(history([...Array(14).fill(5), 0]), date(15));
  assert.equal(missed.currentStreak, 0);
  assert.deepEqual(missed.garden, before.garden);
  const restart = progress(history([...Array(14).fill(5), 0, 5]), date(15));
  assert.equal(restart.currentStreak, 1);
  assert.equal(restart.garden.boxCount, 3);
  assert.equal(restart.garden.growthSteps, 15);
});

test('re-earning the same streak threshold does not duplicate boxes', () => {
  const counts = [...Array(7).fill(5), 0, ...Array(7).fill(5)];
  const result = progress(history(counts), date(14));
  assert.equal(result.completedDays, 14);
  assert.equal(result.longestStreak, 7);
  assert.equal(result.garden.boxCount, 2);
});

test('full beds move oldest mature plant to permanent collection without losing rewards', () => {
  // Practice every other day: grow many plants without earning additional boxes.
  const events = Array.from({ length: 41 }, (_, i) => ({ date: date(i * 2), longestStreak: 1 }));
  const g = gardenState(events);
  assert.equal(g.boxCount, 1);
  assert.equal(g.plants.length, 9);
  assert.equal(g.maturePlants, 8);
  assert.equal(g.collection.length, 5);
  assert.equal(g.collection[0].collectedOn, date(40));
  assert.equal(g.collection[0].species, 'basil');
  assert.equal(g.activePlant?.stage, 'seed');
  const displayed = g.plants.filter(p => p.collectedOn === null);
  assert.equal(displayed.length, 4);
  assert.equal(new Set(displayed.map(p => `${p.boxId}:${p.slot}`)).size, 4);
  assert.equal(new Set(g.plants.map(p => p.id)).size, 9);
});

test('replay and duplicate completion delivery do not add rewards or mutate input', () => {
  const events = completions(14);
  const original = structuredClone(events);
  const expected = gardenState(events);
  assert.deepEqual(gardenState([...events].reverse()), expected);
  assert.deepEqual(gardenState([...events, events[6]]), expected);
  assert.deepEqual(events, original);
  const serialized = JSON.parse(JSON.stringify(events));
  assert.deepEqual(gardenState(serialized), expected);
});

test('daily duplicates, held-to-complete upgrades, and corrections recompute canonical rewards', () => {
  const days = history([5, 5, 5, 5, 5, 5, 1]);
  days[0].attempts = [...days[0].attempts, ...days[0].attempts];
  assert.equal(progress(days, date(6)).garden.boxCount, 1);
  const corrected = history(Array(7).fill(5));
  assert.equal(progress(corrected, date(6)).garden.boxCount, 2);
  const revoked = history([5, 5, 5, 0, 5, 5, 5]);
  assert.equal(progress(revoked, date(6)).garden.boxCount, 1);
  assert.equal(progress(revoked, date(6)).garden.growthSteps, 6);
});

test('invalid completion dates and impossible streak jumps are rejected', () => {
  assert.throws(() => gardenState([{ date: '2026-02-30', longestStreak: 1 }]), /timestamp/);
  for (const longestStreak of [0, -1, 7, NaN, 1.5]) {
    assert.throws(() => gardenState([{ date: date(0), longestStreak }]), /history/);
  }
  assert.throws(() => gardenState([...completions(2), { date: date(2), longestStreak: 1 }]), /history/);
  assert.throws(() => gardenState([...completions(7), { date: date(6), longestStreak: 6 }]), /Conflicting/);
});
