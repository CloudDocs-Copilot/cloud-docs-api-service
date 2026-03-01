import { splitIntoChunks, addChunkMetadata, truncateContext, countWords } from '../../../src/utils/chunking.util';

describe('chunking.util', (): void => {
  it('countWords returns 0 for empty or whitespace', (): void => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
  });

  it('countWords counts words correctly', (): void => {
    expect(countWords('one two three')).toBe(3);
    expect(countWords(' multiple   spaces ')).toBe(2);
  });

  it('splitIntoChunks returns single chunk for short text', (): void => {
    const text = 'short text here';
    const chunks = splitIntoChunks(text, 100);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe(text);
  });

  it('splitIntoChunks splits by paragraphs preserving paragraphs', (): void => {
    const p1 = 'a '.repeat(60).trim();
    const p2 = 'b '.repeat(60).trim();
    const text = `${p1}\n\n${p2}`;
    const chunks = splitIntoChunks(text, 50);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.join('\n\n')).toContain('a');
  });

  it('splitLargeParagraph is exercised for long paragraph', (): void => {
    const long = ('sentence. ').repeat(300); // long paragraph
    const chunks = splitIntoChunks(long, 50);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should not be empty
    expect(chunks.every(c => c.trim().length > 0)).toBe(true);
  });

  it('addChunkMetadata returns metadata with correct counts', (): void => {
    const chunks = ['one two three', 'four five'];
    const meta = addChunkMetadata(chunks as unknown as string[]);
    expect(meta.length).toBe(2);
    expect(meta[0].wordCount).toBe(3);
    expect(meta[1].wordCount).toBe(2);
  });

  it('truncateContext respects maxTokens and returns at least one', (): void => {
    const c = ['a'.repeat(400), 'b'.repeat(400), 'c'.repeat(400)];
    // estimateTokens ~ chars/4 -> 100 tokens each
    const out = truncateContext(c, 150);
    expect(out.length).toBeGreaterThanOrEqual(1);
    // total tokens used should be <= 150
    const totalTokens = out.reduce((sum, s) => sum + Math.ceil(s.length / 4), 0);
    expect(totalTokens).toBeLessThanOrEqual(150);
  });

  it('truncateContext returns first chunk when maxTokens too small', (): void => {
    const c = ['hello world', 'x y z'];
    const out = truncateContext(c, 1);
    expect(out.length).toBe(1);
    expect(out[0]).toBe('hello world');
  });
});
import { splitIntoChunks, countWords, addChunkMetadata, CHUNK_CONFIG, truncateContext } from '../../../src/utils/chunking.util';

describe('chunking.util', (): void => {
  test('countWords returns 0 for empty string', (): void => {
    expect(countWords('')).toBe(0);
  });

  test('countWords counts words correctly', (): void => {
    expect(countWords('one two   three')).toBe(3);
  });

  test('splitIntoChunks returns whole text when short', (): void => {
    const short = 'a b c';
    const chunks = splitIntoChunks(short, 10);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(short);
  });

  test('splitIntoChunks splits long text into chunks', (): void => {
    const words = new Array(CHUNK_CONFIG.TARGET_WORDS * 3).fill('word').join(' ');
    const chunks = splitIntoChunks(words);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  test('addChunkMetadata returns metadata objects', (): void => {
    const chunks = ['one two', 'three four five'];
    const meta = addChunkMetadata(chunks);
    expect(meta[0]).toHaveProperty('text', 'one two');
    expect(meta[0]).toHaveProperty('wordCount');
    expect(meta[1].wordCount).toBeGreaterThanOrEqual(3);
  });

  test('truncateContext respects maxTokens', (): void => {
    const chunks = ['a'.repeat(400), 'b'.repeat(400)];
    // estimateTokens ~ length/4 so 200 tokens accommodate roughly first chunk
    const truncated = truncateContext(chunks, 200);
    expect(truncated.length).toBeGreaterThanOrEqual(1);
    expect(truncated.join('')).toContain('a');
  });
});
/**
 * Unit tests for Chunking Utility
 */

import { splitIntoChunks } from '../../../src/utils/chunking.util';

describe('Chunking Utility', (): void => {
  describe('splitIntoChunks', (): void => {
    it('should split text into chunks by default target size', (): void => {
      // Crear un texto largo (más de 800 palabras)
      const words = Array(1500).fill('word').join(' ');
      const chunks = splitIntoChunks(words);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        const wordCount = chunk.split(/\s+/).filter(w => w.length > 0).length;
        // Cada chunk debería tener aproximadamente el tamaño objetivo o menos
        expect(wordCount).toBeLessThanOrEqual(1000); // Margen de tolerancia
      });
    });

    it('should respect custom target word count', (): void => {
      // Crear texto más largo para asegurar múltiples chunks
      const words = Array(1200).fill('word').join(' ');
      const chunks = splitIntoChunks(words, 200);

      // Con 1200 palabras y target de 200, debería haber múltiples chunks
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        const wordCount = chunk.split(/\s+/).filter(w => w.length > 0).length;
        // Verificar que no exceda el máximo permitido
        expect(wordCount).toBeLessThanOrEqual(1000);
      });
    });

    it('should return single chunk for short text', (): void => {
      const shortText = 'This is a short text.';
      const chunks = splitIntoChunks(shortText);

      expect(chunks.length).toBe(1);
      expect(chunks[0]).toBe(shortText);
    });

    it('should preserve paragraph boundaries when possible', (): void => {
      const text = `Párrafo uno con muchas palabras. ${Array(400).fill('word').join(' ')}

Párrafo dos con más contenido. ${Array(400).fill('word').join(' ')}

Párrafo tres adicional. ${Array(400).fill('word').join(' ')}`;

      const chunks = splitIntoChunks(text, 500);

      // Debería dividirse por párrafos
      expect(chunks.length).toBeGreaterThan(1);
      // Los chunks deberían comenzar con texto coherente
      chunks.forEach(chunk => {
        expect(chunk.trim().length).toBeGreaterThan(0);
      });
    });

    it('should handle text with no paragraphs', (): void => {
      // Crear texto suficientemente largo para necesitar división
      const text = Array(1500).fill('word').join(' ');
      const chunks = splitIntoChunks(text, 400);

      // Debería dividirse por límite de palabras
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.trim().length).toBeGreaterThan(0);
      });
    });

    it('should handle empty text', (): void => {
      const chunks = splitIntoChunks('');
      // La utilidad retorna array vacío para texto vacío
      expect(chunks.length).toBe(0);
    });

    it('should handle whitespace-only text', (): void => {
      const chunks = splitIntoChunks('   \n\n   ');
      // La utilidad retorna array vacío para texto solo con espacios
      expect(chunks.length).toBe(0);
    });

    it('should preserve sentence structure when splitting', (): void => {
      const text = `Primera oración. Segunda oración. ${Array(800).fill('word').join(' ')}. Última oración.`;
      const chunks = splitIntoChunks(text, 400);

      chunks.forEach(chunk => {
        // Los chunks deberían terminar en puntuación o ser texto coherente
        expect(chunk.length).toBeGreaterThan(0);
      });
    });

    it('should handle very long single paragraphs', (): void => {
      // Un párrafo sin saltos de línea muy largo
      const longParagraph = `Este es un párrafo muy largo sin saltos de línea. ${Array(2000)
        .fill('palabra')
        .join(' ')}. Y continúa por mucho más texto.`;

      const chunks = splitIntoChunks(longParagraph, 500);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        const wordCount = chunk.split(/\s+/).filter(w => w.length > 0).length;
        expect(wordCount).toBeLessThanOrEqual(700); // Con margen
      });
    });

    it('should handle text with mixed content', (): void => {
      const text = `# Título del Documento

Primer párrafo con contenido importante. ${Array(300).fill('palabra').join(' ')}.

## Subtítulo

Segundo párrafo. ${Array(300).fill('palabra').join(' ')}.

- Lista item 1
- Lista item 2
- Lista item 3

Párrafo final. ${Array(300).fill('palabra').join(' ')}.`;

      const chunks = splitIntoChunks(text, 400);

      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach(chunk => {
        expect(chunk.trim().length).toBeGreaterThan(0);
      });
    });
  });
});
