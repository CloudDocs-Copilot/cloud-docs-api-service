/**
 * Unit tests for Prompt Builder
 */

import { buildPrompt } from '../../../src/services/ai/prompt.builder';

describe('Prompt Builder', () => {
  describe('buildPrompt', () => {
    it('should build a valid RAG prompt with context', () => {
      const question = '¿Cuáles son los objetivos principales?';
      const chunks = [
        'Los objetivos principales incluyen aumentar las ventas en un 20%.',
        'También buscamos mejorar la satisfacción del cliente.',
        'Se implementarán nuevas funcionalidades de IA.'
      ];

      const prompt = buildPrompt(question, chunks);

      expect(prompt).toContain(question);
      expect(prompt).toContain('Los objetivos principales');
      expect(prompt).toContain('satisfacción del cliente');
      expect(prompt).toContain('funcionalidades de IA');
      expect(prompt).toContain('[Fragmento 1]');
      expect(prompt).toContain('[Fragmento 2]');
      expect(prompt).toContain('[Fragmento 3]');
    });

    it('should number chunks sequentially', () => {
      const question = 'Test question';
      const chunks = ['First chunk', 'Second chunk', 'Third chunk', 'Fourth chunk'];

      const prompt = buildPrompt(question, chunks);

      expect(prompt).toContain('[Fragmento 1]');
      expect(prompt).toContain('First chunk');
      expect(prompt).toContain('[Fragmento 2]');
      expect(prompt).toContain('Second chunk');
      expect(prompt).toContain('[Fragmento 3]');
      expect(prompt).toContain('Third chunk');
      expect(prompt).toContain('[Fragmento 4]');
      expect(prompt).toContain('Fourth chunk');
    });

    it('should include instructions to answer based on context', () => {
      const question = 'What is the answer?';
      const chunks = ['This is context'];

      const prompt = buildPrompt(question, chunks);

      // Debe contener instrucciones sobre cómo responder
      expect(prompt.toLowerCase()).toMatch(/context|información|fragmentos|documents/i);
    });

    it('should handle empty chunks array', () => {
      const question = '¿Qué información hay?';
      const chunks: string[] = [];

      // Debería lanzar error cuando no hay chunks
      expect(() => buildPrompt(question, chunks)).toThrow('At least one context chunk is required');
    });

    it('should handle single chunk', () => {
      const question = 'Single chunk test?';
      const chunks = ['Only one piece of information here.'];

      const prompt = buildPrompt(question, chunks);

      expect(prompt).toContain(question);
      expect(prompt).toContain('[Fragmento 1]');
      expect(prompt).toContain('Only one piece of information here');
    });

    it('should handle chunks with special characters', () => {
      const question = 'Test with special chars?';
      const chunks = [
        'Text with "quotes" and \'apostrophes\'',
        'Text with $pecial ch@racters & symbols',
        'Text with\nnewlines\nand\ttabs'
      ];

      const prompt = buildPrompt(question, chunks);

      expect(prompt).toContain('"quotes"');
      expect(prompt).toContain('$pecial');
      expect(prompt).toContain('&');
    });

    it('should handle very long chunks', () => {
      const question = 'Long chunk test?';
      const longChunk = 'A'.repeat(5000);
      const chunks = [longChunk];

      const prompt = buildPrompt(question, chunks);

      expect(prompt).toContain(question);
      expect(prompt.length).toBeGreaterThan(5000);
    });

    it('should handle multilingual content', () => {
      const question = '¿Qué idiomas se soportan?';
      const chunks = [
        'English content here',
        'Contenido en español aquí',
        '中文内容在这里',
        'Contenu français ici'
      ];

      const prompt = buildPrompt(question, chunks);

      expect(prompt).toContain('English content');
      expect(prompt).toContain('español');
      expect(prompt).toContain('中文');
      expect(prompt).toContain('français');
    });

    it('should maintain chunk order', () => {
      const question = 'Order test?';
      const chunks = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];

      const prompt = buildPrompt(question, chunks);

      const firstIndex = prompt.indexOf('[Fragmento 1]');
      const secondIndex = prompt.indexOf('[Fragmento 2]');
      const thirdIndex = prompt.indexOf('[Fragmento 3]');
      const fourthIndex = prompt.indexOf('[Fragmento 4]');
      const fifthIndex = prompt.indexOf('[Fragmento 5]');

      expect(firstIndex).toBeGreaterThan(-1);
      expect(secondIndex).toBeGreaterThan(firstIndex);
      expect(thirdIndex).toBeGreaterThan(secondIndex);
      expect(fourthIndex).toBeGreaterThan(thirdIndex);
      expect(fifthIndex).toBeGreaterThan(fourthIndex);
    });

    it('should handle chunks with markdown-like content', () => {
      const question = 'Markdown test?';
      const chunks = [
        '# Heading\n\n## Subheading',
        '- Item 1\n- Item 2\n- Item 3',
        '**Bold** and *italic* text',
        '[Link](https://example.com)'
      ];

      const prompt = buildPrompt(question, chunks);

      expect(prompt).toContain('# Heading');
      expect(prompt).toContain('- Item 1');
      expect(prompt).toContain('**Bold**');
      expect(prompt).toContain('[Link]');
    });
  });
});
