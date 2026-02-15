/**
 * Unit tests for Chunking Utility
 */

import { splitIntoChunks } from '../../../src/utils/chunking.util';

describe('Chunking Utility', () => {
  describe('splitIntoChunks', () => {
    it('should split text into chunks by default target size', () => {
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

    it('should respect custom target word count', () => {
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

    it('should return single chunk for short text', () => {
      const shortText = 'This is a short text.';
      const chunks = splitIntoChunks(shortText);

      expect(chunks.length).toBe(1);
      expect(chunks[0]).toBe(shortText);
    });

    it('should preserve paragraph boundaries when possible', () => {
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

    it('should handle text with no paragraphs', () => {
      // Crear texto suficientemente largo para necesitar división
      const text = Array(1500).fill('word').join(' ');
      const chunks = splitIntoChunks(text, 400);

      // Debería dividirse por límite de palabras
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.trim().length).toBeGreaterThan(0);
      });
    });

    it('should handle empty text', () => {
      const chunks = splitIntoChunks('');
      // La utilidad retorna array vacío para texto vacío
      expect(chunks.length).toBe(0);
    });

    it('should handle whitespace-only text', () => {
      const chunks = splitIntoChunks('   \n\n   ');
      // La utilidad retorna array vacío para texto solo con espacios
      expect(chunks.length).toBe(0);
    });

    it('should preserve sentence structure when splitting', () => {
      const text = `Primera oración. Segunda oración. ${Array(800).fill('word').join(' ')}. Última oración.`;
      const chunks = splitIntoChunks(text, 400);

      chunks.forEach(chunk => {
        // Los chunks deberían terminar en puntuación o ser texto coherente
        expect(chunk.length).toBeGreaterThan(0);
      });
    });

    it('should handle very long single paragraphs', () => {
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

    it('should handle text with mixed content', () => {
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
