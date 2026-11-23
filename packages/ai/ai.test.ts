import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAITutor, fallbackQuestion, type TestContext } from './index.ts';
import { koreanStarterPack } from '../languages/index.ts';
const ctx: TestContext = { sense: koreanStarterPack.senses[0], direction: 'source_to_target', allowTransliteration: true, prompt: 'Say water in Korean.' };
function response(value: unknown) { return new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] })); }
test('AI request uses structured output and only task context; alternate romanization can pass semantic grading', async () => {
  const request: typeof fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    assert.equal(body.store, false);
    assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.text.format.strict, true);
    assert.ok(!body.input.includes('+1555'));
    assert.equal(body.model, 'configured-model');
    return response({ outcome: 'correct', evidence: 'mool', answerForm: 'transliteration', explanation: 'Recognizable phonetic spelling.', reply: 'Yes—물!' });
  };
  const grade = await new OpenAITutor('test-key', 'configured-model', request).grade(ctx, 'mool');
  assert.equal(grade.outcome, 'correct');
});
test('AI prompt revealing Korean answer falls back to a curated prompt', async () => {
  const ai = new OpenAITutor('key', 'model', async () => response({ question: 'Say 물.' }));
  assert.equal(await ai.question(ctx), fallbackQuestion(ctx));
});
test('malformed, refused, incomplete, and fabricated model responses fail closed', async () => {
  for (const output of [new Response('{}', { status: 429 }), new Response(JSON.stringify({ status: 'incomplete' })), response({ outcome: 'correct' }),
    response({ outcome: 'correct', evidence: 'invented', answerForm: 'native_script', explanation: 'x', reply: 'yes' })]) {
    const ai = new OpenAITutor('key', 'model', async () => output);
    await assert.rejects(ai.grade(ctx, 'mool'));
  }
});
