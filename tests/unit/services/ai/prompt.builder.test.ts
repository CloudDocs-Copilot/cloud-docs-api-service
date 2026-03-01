import { buildPrompt, buildSimplePrompt, buildConversationalPrompt, buildSummarizationPrompt, estimateTokens, truncateContext } from '../../../../src/services/ai/prompt.builder';

describe('prompt.builder', (): void => {
  it('buildPrompt throws on empty question', (): void => {
    expect(() => buildPrompt('', ['ctx'])).toThrow('Question cannot be empty');
  });

  it('buildPrompt throws on empty context', (): void => {
    expect(() => buildPrompt('q', [])).toThrow('At least one context chunk is required');
  });

  it('buildPrompt returns formatted prompt containing fragment markers', (): void => {
    const p = buildPrompt('¿Qué?', ['uno', 'dos']);
    expect(p).toContain('[Fragmento 1]');
    expect(p).toContain('[Fragmento 2]');
    expect(p).toContain('PREGUNTA DEL USUARIO');
  });

  it('buildSimplePrompt returns concise prompt', (): void => {
    const p = buildSimplePrompt('Q', ['a', 'b']);
    expect(p).toContain('Contexto:');
    expect(p).toContain('Pregunta: Q');
  });

  it('buildConversationalPrompt includes history when provided', (): void => {
    const hist = [{ role: 'user' as const, content: 'hi' }, { role: 'assistant' as const, content: 'ok' }];
    const p = buildConversationalPrompt('Q', ['ctx'], hist);
    expect(p).toContain('HISTORIAL DE CONVERSACIÓN');
    expect(p).toContain('Usuario: hi');
    expect(p).toContain('Asistente: ok');
  });

  it('buildSummarizationPrompt throws on empty topic', (): void => {
    expect(() => buildSummarizationPrompt('', ['x'])).toThrow('Topic cannot be empty');
  });

  it('estimateTokens approximates tokens', (): void => {
    expect(estimateTokens('abcd')).toBeGreaterThanOrEqual(1);
    expect(estimateTokens('')).toBe(0);
  });

  it('truncateContext shortens context to maxTokens and adds ellipsis when partial', (): void => {
    const longChunk = 'a'.repeat(1000); // ~250 tokens
    const out = truncateContext([longChunk, 'b'.repeat(100)], 100);
    expect(out.length).toBeGreaterThanOrEqual(1);
    // If partial was added it should end with ...
    if (out.length === 2) {
      expect(out[1].endsWith('...')).toBe(true);
    }
  });
});
