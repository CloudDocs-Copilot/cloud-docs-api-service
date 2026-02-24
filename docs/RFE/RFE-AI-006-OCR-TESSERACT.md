# RFE-AI-006: OCR con tesseract.js + Extracción Asíncrona

## 📋 Resumen

| Campo                   | Valor                                                                            |
| ----------------------- | -------------------------------------------------------------------------------- |
| **Fecha**               | Febrero 16, 2026                                                                 |
| **Estado**              | 📋 Propuesto                                                                     |
| **Issues relacionadas** | [#47 (US-202)](https://github.com/CloudDocs-Copilot/cloud-docs-web-ui/issues/47) |
| **Épica**               | Inteligencia Artificial (Core MVP)                                               |
| **Prioridad**           | 🟠 Alta (P1 — desbloquea documentos imagen)                                      |
| **Estimación**          | 5h                                                                               |
| **Repositorio**         | `cloud-docs-api-service`                                                         |

---

## 🎯 Objetivo

1. Añadir OCR (Optical Character Recognition) mediante `tesseract.js` para extraer texto de imágenes (PNG, JPG, TIFF, BMP) y PDFs escaneados
2. Refactorizar `text-extraction.service.ts` para usar I/O asíncrono (actualmente usa `readFileSync` que bloquea el event loop)
3. Hacer OCR configurable via `OCR_ENABLED=true/false` para respetar la restricción de coste cero local

---

## 📡 Estado Actual

### Servicio de extracción actual (`src/services/ai/text-extraction.service.ts`)

**Formatos soportados:**

| Formato                 | Soporte | Implementación                |
| ----------------------- | ------- | ----------------------------- |
| PDF (texto)             | ✅      | `pdf-parse`                   |
| DOCX                    | ✅      | `mammoth`                     |
| DOC                     | ✅      | `mammoth` (con limitaciones)  |
| TXT                     | ✅      | `readFileSync`                |
| MD                      | ✅      | `readFileSync`                |
| **Imágenes (PNG, JPG)** | **❌**  | **No soportado**              |
| **PDF escaneados**      | **❌**  | **pdf-parse extrae "" vacío** |

**Bugs existentes:**

1. **I/O síncrono:** Usa `readFileSync` y `existsSync` — bloquea event loop de Node.js
2. **Sin OCR:** Imágenes y PDFs escaneados devuelven texto vacío sin error
3. **Sin detección de PDF escaneado:** No distingue PDF con texto de PDF imagen

---

## 🏗️ Solución Propuesta

### 1. Instalar dependencia

```bash
npm install tesseract.js@5
# tesseract.js es puro JavaScript/WASM — no requiere binarios del sistema
# ~15MB en node_modules, pero NO tiene coste de API
```

### 2. Refactorizar text-extraction.service.ts

```typescript
// src/services/ai/text-extraction.service.ts — REFACTORIZADO

import { promises as fs } from 'fs';
import path from 'path';

export interface ExtractionResult {
  text: string;
  method: 'pdf-parse' | 'mammoth' | 'plaintext' | 'ocr' | 'pdf-ocr';
  pages?: number;
  confidence?: number; // OCR confidence (0-100)
  language?: string;
}

class TextExtractionService {
  private ocrEnabled: boolean;
  private ocrLanguages: string;

  constructor() {
    this.ocrEnabled = process.env.OCR_ENABLED !== 'false';
    this.ocrLanguages = process.env.OCR_LANGUAGES || 'spa+eng';
  }

  /**
   * Extrae texto de un archivo según su tipo MIME.
   * Todas las operaciones son asíncronas (no bloquean event loop).
   */
  async extractText(filePath: string, mimeType: string): Promise<ExtractionResult> {
    // Verificar que el archivo existe (async)
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }

    // Rutear por tipo MIME
    switch (mimeType) {
      case 'application/pdf':
        return this.extractFromPdf(filePath);

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/msword':
        return this.extractFromWord(filePath);

      case 'text/plain':
      case 'text/markdown':
      case 'text/csv':
        return this.extractFromPlaintext(filePath);

      case 'image/png':
      case 'image/jpeg':
      case 'image/jpg':
      case 'image/tiff':
      case 'image/bmp':
      case 'image/webp':
        return this.extractFromImage(filePath);

      default:
        // Intentar como texto plano
        try {
          return await this.extractFromPlaintext(filePath);
        } catch {
          return { text: '', method: 'plaintext' };
        }
    }
  }

  // --- PDF ---

  private async extractFromPdf(filePath: string): Promise<ExtractionResult> {
    const pdfParse = require('pdf-parse');
    const buffer = await fs.readFile(filePath); // ✅ Async
    const data = await pdfParse(buffer);

    const text = data.text?.trim() || '';

    // Detectar PDF escaneado: si tiene páginas pero poco/ningún texto
    if (data.numpages > 0 && text.length < 50) {
      // PDF escaneado — intentar OCR si habilitado
      if (this.ocrEnabled) {
        return this.extractFromPdfWithOcr(filePath, data.numpages);
      }
      return {
        text: '',
        method: 'pdf-parse',
        pages: data.numpages
      };
    }

    return {
      text,
      method: 'pdf-parse',
      pages: data.numpages
    };
  }

  private async extractFromPdfWithOcr(
    filePath: string,
    pageCount: number
  ): Promise<ExtractionResult> {
    // Para PDFs escaneados, convertir cada página a imagen y hacer OCR
    // pdf-parse no soporta esto directamente, usar pdf2pic o similar
    // Por ahora, OCR directo del PDF (tesseract soporta PDFs con --psm)

    // Nota: tesseract.js no soporta PDFs directamente.
    // Alternativa: extraer primera imagen del PDF con pdf-parse o usar
    // la librería pdf-to-img. Para MVP, solo hacemos OCR de imágenes.
    return {
      text: '[PDF escaneado detectado — OCR de PDFs requiere conversor de imágenes adicional]',
      method: 'pdf-ocr',
      pages: pageCount,
      confidence: 0
    };
  }

  // --- Word ---

  private async extractFromWord(filePath: string): Promise<ExtractionResult> {
    const mammoth = require('mammoth');
    const buffer = await fs.readFile(filePath); // ✅ Async
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value || '',
      method: 'mammoth'
    };
  }

  // --- Texto plano ---

  private async extractFromPlaintext(filePath: string): Promise<ExtractionResult> {
    const text = await fs.readFile(filePath, 'utf-8'); // ✅ Async
    return {
      text,
      method: 'plaintext'
    };
  }

  // --- Imágenes (OCR) ---

  private async extractFromImage(filePath: string): Promise<ExtractionResult> {
    if (!this.ocrEnabled) {
      return {
        text: '',
        method: 'ocr',
        confidence: 0
      };
    }

    try {
      const Tesseract = require('tesseract.js');

      const { data } = await Tesseract.recognize(filePath, this.ocrLanguages, {
        logger: (m: any) => {
          // Opcional: log progreso para debugging
          if (m.status === 'recognizing text' && m.progress === 1) {
            console.log(`OCR complete: ${path.basename(filePath)}`);
          }
        }
      });

      return {
        text: data.text?.trim() || '',
        method: 'ocr',
        confidence: data.confidence,
        language: data.language || this.ocrLanguages
      };
    } catch (error) {
      console.error(`OCR failed for ${filePath}:`, error);
      return {
        text: '',
        method: 'ocr',
        confidence: 0
      };
    }
  }

  /**
   * Verifica si un MIME type es soportado para extracción.
   */
  isSupportedMimeType(mimeType: string): boolean {
    const supported = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'text/markdown',
      'text/csv',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/tiff',
      'image/bmp',
      'image/webp'
    ];
    return supported.includes(mimeType);
  }
}

export const textExtractionService = new TextExtractionService();
```

### 3. Worker para OCR pesado (opcional, mejora performance)

Para documentos grandes con muchas imágenes, OCR puede tardar 5-30s. Para no bloquear el pipeline:

```typescript
// src/services/ai/ocr-worker.ts (opcional — mejora de performance)

import { Worker, isMainThread, workerData, parentPort } from 'worker_threads';
import path from 'path';

// Solo si se quiere procesar OCR en un thread separado
export async function extractTextWithOcrWorker(
  filePath: string,
  languages: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: { filePath, languages }
    });
    worker.on('message', resolve);
    worker.on('error', reject);
  });
}

if (!isMainThread) {
  const Tesseract = require('tesseract.js');
  const { filePath, languages } = workerData;

  Tesseract.recognize(filePath, languages)
    .then(({ data }: any) => parentPort?.postMessage(data.text))
    .catch((err: Error) => parentPort?.postMessage(''));
}
```

---

## ⚙️ Variables de Entorno

```env
# OCR Configuration
OCR_ENABLED=true                  # true/false — habilitar OCR
OCR_LANGUAGES=spa+eng            # Idiomas de Tesseract (ISO 639-3)
```

### Idiomas de OCR disponibles

| Idioma  | Código Tesseract | Notas                           |
| ------- | ---------------- | ------------------------------- |
| Español | `spa`            | Default para proyecto CloudDocs |
| Inglés  | `eng`            | Siempre incluir como fallback   |
| Francés | `fra`            | Opcional                        |
| Alemán  | `deu`            | Opcional                        |
| Multi   | `spa+eng`        | Formato para múltiples idiomas  |

---

## 🔄 Integración con Pipeline AI

### En RFE-AI-002 (ai-pipeline.service.ts), el paso 1 ya llama a `textExtractionService.extractText()`

```typescript
// ai-pipeline.service.ts → processDocument() — PASO 1

// Ahora, si el documento es una imagen, extractText() hará OCR automáticamente
const extraction = await textExtractionService.extractText(document.path, document.mimeType);

// extraction.method será 'ocr' para imágenes
// extraction.confidence indicará calidad del OCR
// extraction.text contendrá el texto reconocido

document.extractedText = extraction.text;
```

### Metadata extra del OCR

Opcionalmente, guardar metadata de extracción en el documento:

```typescript
// Añadir al Document model (complementa RFE-AI-002)
extractionMethod: {
  type: String,
  enum: ['pdf-parse', 'mammoth', 'plaintext', 'ocr', 'pdf-ocr'],
  default: null,
},
extractionConfidence: {
  type: Number,
  min: 0,
  max: 100,
  default: null,
},
```

---

## 🧪 Testing

### Tests de OCR

```typescript
describe('TextExtractionService', () => {
  describe('extractFromImage (OCR)', () => {
    it('should extract text from a PNG image', async () => {
      const result = await textExtractionService.extractText(
        'tests/fixtures/files/sample-text-image.png',
        'image/png'
      );

      expect(result.method).toBe('ocr');
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(50);
    });

    it('should extract text from a JPG image', async () => {
      const result = await textExtractionService.extractText(
        'tests/fixtures/files/sample-receipt.jpg',
        'image/jpeg'
      );

      expect(result.method).toBe('ocr');
      expect(result.text).toContain('Total'); // Si la imagen tiene "Total"
    });

    it('should return empty text when OCR is disabled', async () => {
      process.env.OCR_ENABLED = 'false';

      const result = await textExtractionService.extractText(
        'tests/fixtures/files/sample-text-image.png',
        'image/png'
      );

      expect(result.text).toBe('');
      expect(result.confidence).toBe(0);

      process.env.OCR_ENABLED = 'true'; // Restore
    });
  });

  describe('Async I/O (regression)', () => {
    it('should not use readFileSync', async () => {
      const code = await fs.readFile('src/services/ai/text-extraction.service.ts', 'utf-8');
      expect(code).not.toContain('readFileSync');
      expect(code).not.toContain('existsSync');
    });

    it('should extract text from PDF async', async () => {
      const result = await textExtractionService.extractText(
        'tests/fixtures/files/sample.pdf',
        'application/pdf'
      );

      expect(result.method).toBe('pdf-parse');
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('should extract text from DOCX async', async () => {
      const result = await textExtractionService.extractText(
        'tests/fixtures/files/sample.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );

      expect(result.method).toBe('mammoth');
      expect(result.text.length).toBeGreaterThan(0);
    });
  });

  describe('PDF escaneado detection', () => {
    it('should detect scanned PDF (pages but no text)', async () => {
      const result = await textExtractionService.extractText(
        'tests/fixtures/files/scanned-document.pdf',
        'application/pdf'
      );

      // Con OCR habilitado, debería intentar OCR
      expect(result.method).toBe('pdf-ocr');
    });
  });
});
```

### Fixtures necesarias

```text
tests/fixtures/files/
├── sample-text-image.png     ← Imagen con texto claro para OCR
├── sample-receipt.jpg        ← Foto de recibo/factura
├── scanned-document.pdf      ← PDF que es realmente una imagen escaneada
├── sample.pdf                ← PDF con texto (existing)
└── sample.docx               ← DOCX (existing)
```

---

## ✅ Criterios de Aceptación

| #   | Criterio                                                      | Estado |
| --- | ------------------------------------------------------------- | ------ |
| 1   | OCR extrae texto de PNG con confianza > 50%                   | ⬜     |
| 2   | OCR extrae texto de JPG con confianza > 50%                   | ⬜     |
| 3   | Con `OCR_ENABLED=false`, OCR retorna texto vacío (no error)   | ⬜     |
| 4   | PDFs escaneados se detectan (>0 páginas, <50 chars texto)     | ⬜     |
| 5   | I/O es 100% asíncrono: `readFileSync` eliminado               | ⬜     |
| 6   | `existsSync` reemplazado por `fs.access()` async              | ⬜     |
| 7   | Soporta idiomas español + inglés (`spa+eng`)                  | ⬜     |
| 8   | `ExtractionResult` incluye `method`, `confidence`, `language` | ⬜     |
| 9   | Coste de dependencia: $0 (tesseract.js es local/gratuito)     | ⬜     |

---

## 📋 Tareas de Implementación

- [ ] `npm install tesseract.js@5`
- [ ] Refactorizar `text-extraction.service.ts`: reemplazar `readFileSync` → `fs.readFile`, `existsSync` → `fs.access`
- [ ] Añadir handler para MIME types de imagen (png, jpg, tiff, bmp, webp)
- [ ] Implementar detección de PDF escaneado (páginas > 0, texto < 50 chars)
- [ ] Definir interfaz `ExtractionResult` con método, confianza, idioma
- [ ] Añadir variables `OCR_ENABLED`, `OCR_LANGUAGES` a `.env.example`
- [ ] Crear fixtures de test: imagen con texto, recibo JPG, PDF escaneado
- [ ] Tests: OCR de imágenes | OCR deshabilitado | async I/O | PDF escaneado
- [ ] Actualizar `package.json` con dependencia tesseract.js

---

## 📁 Archivos Afectados

```text
src/services/ai/text-extraction.service.ts  ← REESCRIBIR: async + OCR
package.json                                 ← MODIFICAR: añadir tesseract.js
.env.example                                 ← MODIFICAR: OCR_ENABLED, OCR_LANGUAGES
tests/fixtures/files/                        ← CREAR: fixtures de imágenes para OCR
```

---

## ⚠️ Consideraciones

### Performance de OCR

| Formato                    | Tiempo estimado (por archivo) | CPU      | RAM    |
| -------------------------- | ----------------------------- | -------- | ------ |
| PNG simple                 | 2-5s                          | Alto     | ~200MB |
| JPG recibo                 | 3-8s                          | Alto     | ~200MB |
| PDF escaneado (multi-page) | 10-30s                        | Muy alto | ~500MB |

**Mitigación:**

- OCR corre en el AI Pipeline (async, en background)
- No bloquea el upload ni la respuesta HTTP
- `AI_MAX_CONCURRENT=2` evita saturar CPU
- Opcionalmente, usar `worker_threads` para paralelizar

### Tamaño de tesseract.js

- **node_modules:** ~15MB (modelos WASM incluidos)
- **Runtime:** Descarga modelo de idioma (~5MB) la primera vez por idioma
- **Sin coste de API:** Todo corre localmente, gratis
- **Docker:** Incluir en la imagen, no necesita instalación de sistema

### Idiomas de OCR

Los modelos de idioma de tesseract.js se descargan automáticamente desde CDN la primera vez. Para despliegues offline o Docker:

```typescript
// Configurar caché local en Docker
const worker = await Tesseract.createWorker({
  langPath: '/app/tessdata', // Path local en container
  cachePath: '/app/tessdata'
});
```

---

## 🔗 RFEs Relacionadas

| RFE        | Relación                                                          |
| ---------- | ----------------------------------------------------------------- |
| RFE-AI-002 | El pipeline llama `textExtractionService.extractText()` en paso 1 |
| RFE-AI-004 | El texto extraído (incluido OCR) se indexa en ES                  |
