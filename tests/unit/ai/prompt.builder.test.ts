import {
  buildPrompt,
  buildSimplePrompt,
  buildConversationalPrompt,
  estimateTokens,
  truncateContext
} from '../../../src/services/ai/prompt.builder';

describe('prompt.builder', (): void => {
  test('buildPrompt throws on empty question', (): void => {
    expect(() => buildPrompt('', ['ctx'])).toThrow('Question cannot be empty');
  });

  test('buildPrompt throws on empty context', (): void => {
    expect(() => buildPrompt('What?', [])).toThrow('At least one context chunk is required');
  });

  test('buildPrompt includes fragment markers', (): void => {
    const prompt = buildPrompt('Q', ['one', 'two']);
    expect(prompt).toContain('[Fragmento 1]');
    expect(prompt).toContain('[Fragmento 2]');
  });

  test('buildSimplePrompt returns simple formatted string', (): void => {
    const out = buildSimplePrompt('Q', ['c']);
    expect(out).toContain('Contexto:');
    expect(out).toContain('Pregunta: Q');
  });

  test('buildConversationalPrompt includes history', (): void => {
    const out = buildConversationalPrompt('Q', ['c'], [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'ok' }
    ]);
    expect(out).toContain('HISTORIAL DE CONVERSACIÓN');
    expect(out).toContain('Usuario: hi');
  });

  test('estimateTokens and truncateContext work together', (): void => {
    const chunks = ['a'.repeat(400), 'b'.repeat(400)];
    const t = estimateTokens(chunks[0]);
    expect(t).toBeGreaterThan(0);
    const truncated = truncateContext(chunks, t + 10);
    expect(truncated.length).toBeGreaterThanOrEqual(1);
  });
});
