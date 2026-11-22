import assert from 'node:assert/strict';
import test from 'node:test';
import { koreanStarterPack, spanishFixturePack } from './index.ts';

test('Korean seed contains 50 uniquely identified senses in stable introduction order', () => {
  assert.equal(koreanStarterPack.senses.length, 50);
  assert.equal(new Set(koreanStarterPack.senses.map(sense => sense.id)).size, 50);
  assert.deepEqual(koreanStarterPack.senses.map(sense => sense.rank), Array.from({ length: 50 }, (_, i) => i + 1));
  for (const sense of koreanStarterPack.senses) {
    assert.match(sense.id, /^ko:[a-z-]+$/);
    assert.equal(sense.language, 'ko');
    assert.equal(sense.sourceLanguage, 'en');
    assert.ok(sense.acceptedForms.includes(sense.lemma));
    assert.equal(new Set(sense.acceptedForms).size, sense.acceptedForms.length);
    assert.ok(sense.examples.length > 0);
    for (const form of [sense.lemma, ...sense.acceptedForms, ...sense.examples.map(example => example.target)]) {
      assert.equal(form, form.normalize('NFC'));
      assert.match(form, /[가-힣]/);
    }
  }
});

test('verb references retain inflections and disambiguation without substring matching', () => {
  const eat = koreanStarterPack.senses.find(sense => sense.id === 'ko:eat');
  assert.ok(eat?.acceptedForms.includes('먹어요'));
  assert.ok(eat?.acceptedForms.includes('먹다'));
  assert.ok(koreanStarterPack.senses.find(sense => sense.id === 'ko:tea')?.notes?.includes('car'));
  assert.ok(koreanStarterPack.senses.find(sense => sense.id === 'ko:please-give')?.notes);
});

test('language pack shape supports another script and explicitly declares review status', () => {
  for (const pack of [koreanStarterPack, spanishFixturePack]) {
    assert.equal(pack.reviewStatus, 'draft-needs-pedagogical-review');
    assert.ok(pack.provenance.length > 20);
    assert.ok(pack.senses.every(sense => sense.language === pack.language));
  }
  assert.equal(spanishFixturePack.senses[0]?.lemma, 'agua');
});
