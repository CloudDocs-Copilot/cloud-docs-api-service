# RFE-AI-001: Abstracción de AI Provider + Modo Local Ollama

## 📋 Resumen

| Campo                   | Valor                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fecha**               | Febrero 16, 2026                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Estado**              | 📋 Propuesto                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Issues relacionadas** | [#46 (US-201)](https://github.com/CloudDocs-Copilot/cloud-docs-web-ui/issues/46), [#47 (US-202)](https://github.com/CloudDocs-Copilot/cloud-docs-web-ui/issues/47), [#48 (US-203)](https://github.com/CloudDocs-Copilot/cloud-docs-web-ui/issues/48), [#51 (US-204)](https://github.com/CloudDocs-Copilot/cloud-docs-web-ui/issues/51), [#52 (US-205)](https://github.com/CloudDocs-Copilot/cloud-docs-web-ui/issues/52) |
| **Épica**               | Inteligencia Artificial (Core MVP)                                                                                                                                                                                                                                                                                                                                                                                       |
| **Prioridad**           | 🔴 Crítica (bloquea todas las US de IA)                                                                                                                                                                                                                                                                                                                                                                                  |
| **Estimación**          | 10h                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Repositorio**         | `cloud-docs-api-service`                                                                                                                                                                                                                                                                                                                                                                                                 |

---

## 🎯 Objetivo

Crear una capa de abstracción que permita intercambiar el proveedor de IA (OpenAI, Ollama, Mock) mediante una variable de entorno, sin cambiar el código de negocio. Esto permite:

1. **Desarrollo y testing gratuitos** con Ollama (modelos locales)
2. **Tests deterministas** con MockAIProvider (sin LLM real)
3. **Despliegue barato** con OpenAI gpt-4o-mini (~$0-5/mes)
4. **Extensibilidad futura** para nuevos proveedores (Anthropic, Groq, etc.)

---

## 📡 Estado Actual

### Lo que existe

| Servicio               | Archivo                                | Estado                              | Problema                                          |
| ---------------------- | -------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| `llm.service.ts`       | `src/services/ai/llm.service.ts`       | Hardcoded OpenAI                    | `require('openai')` directo, sin abstracción      |
| `embedding.service.ts` | `src/services/ai/embedding.service.ts` | Hardcoded OpenAI                    | `text-embedding-3-small` hardcoded                |
| `openai-config.ts`     | `src/configurations/openai-config.ts`  | Singleton OpenAI                    | No contempla otro proveedor                       |
| `rag.service.ts`       | `src/services/ai/rag.service.ts`       | Usa llm + embedding                 | Acoplado indirectamente a OpenAI                  |
| Mock en tests          | `llm.service.ts` línea ~10             | `(global as any).__OPENAI_CREATE__` | Anti-pattern: mock global en código de producción |

### Problema actual

Todo el código de IA está **acoplado directamente a OpenAI**:

- `llm.service.ts` hace `require('openai')` y llama `openai.chat.completions.create()` directamente
- `embedding.service.ts` usa `openai.embeddings.create()` con modelo hardcoded
- No hay forma de usar otro proveedor sin reescribir los servicios
- Para testear se usa un hack con `global.__OPENAI_CREATE__` que mezcla código de test con producción
- **Sin una API key de OpenAI, ninguna funcionalidad de IA funciona** — ni siquiera en desarrollo local

---

## 🏗️ Arquitectura Propuesta

### Diagrama de Componentes

```text
┌────────────────────────────────────────────────────────────────────┐
│                         AI Service Layer                            │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     AIService (Facade)                        │  │
│  │                                                               │  │
│  │  classifyDocument(text) ──┐                                   │  │
│  │  summarizeDocument(text) ─┤── Delegación al provider activo   │  │
│  │  answerQuestion(q, ctx) ──┤                                   │  │
│  │  generateEmbedding(text) ─┘                                   │  │
│  │                                                               │  │
│  │  getProvider(): AIProvider                                    │  │
│  │  getProviderName(): string                                    │  │
│  │  isAvailable(): Promise<boolean>                              │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
│                             │                                       │
│                    AIProviderFactory                                │
│                    (process.env.AI_PROVIDER)                        │
│                             │                                       │
│              ┌──────────────┼──────────────┐                       │
│              │              │              │                        │
│  ┌───────────┴──┐ ┌────────┴───┐ ┌────────┴────┐                  │
│  │ OllamaProvider│ │OpenAIProvider│ │MockAIProvider│                │
│  │              │ │             │ │              │                  │
│  │ llama3.2    │ │ gpt-4o-mini │ │ Deterministic│                  │
│  │ nomic-embed │ │ text-embed  │ │ responses    │                  │
│  │ LOCAL/FREE  │ │ CLOUD/CHEAP │ │ TESTS ONLY   │                  │
│  └──────────────┘ └─────────────┘ └──────────────┘                 │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

### Relación con Servicios Existentes

```text
                    Servicios Actuales (se mantienen)
                    ─────────────────────────────────

  ai.controller.ts ──→ rag.service.ts ──→ AIService (NUEVO)
                        │                      │
                        │                      ├─→ generateEmbedding()
                        │                      ├─→ answerQuestion()
                        │                      └─→ classifyDocument()
                        │
                        └──→ document-processor.service.ts
                                    │
                                    └──→ AIService.generateEmbedding()
                                         (reemplaza embeddingService directo)

  Flujo de migración:
  ANTES: rag.service → embeddingService → OpenAI SDK directo
  DESPUÉS: rag.service → aiService → provider.generateEmbedding() → SDK
```

---

## 📝 Interfaz AIProvider

### Definición TypeScript

```typescript
// src/services/ai/providers/ai-provider.interface.ts

export interface ClassificationResult {
  category: string; // Categoría del documento
  confidence: number; // 0-1
  tags: string[]; // Tags descriptivos (3-7)
}

export interface SummarizationResult {
  summary: string; // Resumen de 2-3 frases
  keyPoints: string[]; // 3-5 puntos clave
}

export interface QAResult {
  answer: string; // Respuesta a la pregunta
  sources: string[]; // Fragmentos del contexto usados
}

export interface EmbeddingResult {
  embedding: number[]; // Vector de embedding
  dimensions: number; // Dimensión del vector
  model: string; // Modelo usado
}

export interface AIProviderConfig {
  temperature?: number; // 0-1, default 0.3
  maxTokens?: number; // Tokens máximos de respuesta
  model?: string; // Override del modelo
}

export interface AIProvider {
  /** Nombre del proveedor para logging */
  readonly name: string;

  /** Verifica que el proveedor está disponible y configurado */
  checkAvailability(): Promise<boolean>;

  /** Clasifica un documento y genera tags */
  classifyDocument(text: string, config?: AIProviderConfig): Promise<ClassificationResult>;

  /** Genera resumen y puntos clave */
  summarizeDocument(text: string, config?: AIProviderConfig): Promise<SummarizationResult>;

  /** Responde una pregunta con contexto (RAG) */
  answerQuestion(question: string, context: string, config?: AIProviderConfig): Promise<QAResult>;

  /** Genera embedding vectorial de un texto */
  generateEmbedding(text: string): Promise<EmbeddingResult>;

  /** Genera embeddings en batch */
  generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]>;
}
```

### Tipos auxiliares

```typescript
// src/services/ai/providers/ai-provider.types.ts

export type AIProviderType = 'local' | 'openai' | 'mock';

export interface AIServiceConfig {
  provider: AIProviderType;
  enabled: boolean;
  autoProcess: boolean;
  maxConcurrent: number;
  cooldownMs: number;
  maxTextLength: number;
}

export function getAIConfig(): AIServiceConfig {
  return {
    provider: (process.env.AI_PROVIDER as AIProviderType) || 'local',
    enabled: process.env.AI_ENABLED !== 'false',
    autoProcess: process.env.AI_AUTO_PROCESS !== 'false',
    maxConcurrent: parseInt(process.env.AI_MAX_CONCURRENT || '2'),
    cooldownMs: parseInt(process.env.AI_COOLDOWN_MS || '1000'),
    maxTextLength: parseInt(process.env.MAX_TEXT_LENGTH || '50000')
  };
}
```

---

## 📝 Implementación de Providers

### 1. OllamaProvider (modo local, gratis)

```typescript
// src/services/ai/providers/ollama.provider.ts

import {
  AIProvider,
  ClassificationResult,
  SummarizationResult,
  QAResult,
  EmbeddingResult,
  AIProviderConfig
} from './ai-provider.interface';

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';

  private baseUrl: string;
  private chatModel: string;
  private embeddingModel: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.chatModel = process.env.OLLAMA_MODEL || 'llama3.2';
    this.embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
  }

  async checkAvailability(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async classifyDocument(text: string, config?: AIProviderConfig): Promise<ClassificationResult> {
    const prompt = this.buildClassificationPrompt(text);
    const response = await this.chat(prompt, config);
    return this.parseClassificationResponse(response);
  }

  async summarizeDocument(text: string, config?: AIProviderConfig): Promise<SummarizationResult> {
    const prompt = this.buildSummarizationPrompt(text);
    const response = await this.chat(prompt, config);
    return this.parseSummarizationResponse(response);
  }

  async answerQuestion(
    question: string,
    context: string,
    config?: AIProviderConfig
  ): Promise<QAResult> {
    const prompt = this.buildQAPrompt(question, context);
    const response = await this.chat(prompt, config);
    return this.parseQAResponse(response);
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.embeddingModel, input: text })
    });

    if (!res.ok) throw new Error(`Ollama embedding error: ${res.statusText}`);

    const data = await res.json();
    const embedding = data.embeddings[0];

    return {
      embedding,
      dimensions: embedding.length,
      model: this.embeddingModel
    };
  }

  async generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    // Ollama /api/embed soporta batch nativo con `input: string[]`
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.embeddingModel, input: texts })
    });

    if (!res.ok) throw new Error(`Ollama embedding error: ${res.statusText}`);

    const data = await res.json();
    return data.embeddings.map((emb: number[]) => ({
      embedding: emb,
      dimensions: emb.length,
      model: this.embeddingModel
    }));
  }

  // --- Métodos privados ---

  private async chat(prompt: string, config?: AIProviderConfig): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config?.model || this.chatModel,
        prompt,
        stream: false,
        options: {
          temperature: config?.temperature ?? 0.3,
          num_predict: config?.maxTokens ?? 1000
        }
      })
    });

    if (!res.ok) throw new Error(`Ollama chat error: ${res.statusText}`);

    const data = await res.json();
    return data.response;
  }

  private buildClassificationPrompt(text: string): string {
    const truncated = text.slice(0, 50000);
    return `Eres un asistente de clasificación de documentos. Analiza el siguiente texto y devuelve:

1. La categoría más apropiada de esta lista:
   - Factura
   - Contrato
   - Informe
   - Presentación
   - Correspondencia
   - Manual técnico
   - Imagen/Fotografía
   - Hoja de cálculo
   - Documento personal
   - Otro

2. Entre 3 y 7 etiquetas descriptivas relevantes.
   Las etiquetas deben ser específicas al contenido (no genéricas como "documento").

3. Un nivel de confianza de 0 a 1.

Responde SOLO en formato JSON:
{"category": "...", "confidence": 0.XX, "tags": ["...", "..."]}

TEXTO DEL DOCUMENTO:
---
${truncated}
---`;
  }

  private buildSummarizationPrompt(text: string): string {
    const truncated = text.slice(0, 50000);
    return `Resume el siguiente documento en 2-3 frases concisas.
Extrae también los 3-5 puntos clave más importantes.

Responde SOLO en formato JSON:
{"summary": "...", "keyPoints": ["...", "..."]}

TEXTO DEL DOCUMENTO:
---
${truncated}
---`;
  }

  private buildQAPrompt(question: string, context: string): string {
    return `Eres un asistente que responde preguntas basándose ÚNICAMENTE en los documentos proporcionados. Si la respuesta no está en los documentos, di "No encontré esa información en tus documentos."

DOCUMENTOS:
${context}

PREGUNTA DEL USUARIO:
${question}

Responde de forma clara y cita qué documento(s) usaste.`;
  }

  private parseClassificationResponse(response: string): ClassificationResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        category: parsed.category || 'Otro',
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0)),
        tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 7) : []
      };
    } catch {
      return { category: 'Otro', confidence: 0, tags: [] };
    }
  }

  private parseSummarizationResponse(response: string): SummarizationResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary || 'No se pudo generar resumen.',
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : []
      };
    } catch {
      return { summary: 'No se pudo generar resumen.', keyPoints: [] };
    }
  }

  private parseQAResponse(response: string): QAResult {
    return {
      answer: response,
      sources: [] // Ollama no devuelve fuentes estructuradas, el prompt invita a citarlas
    };
  }
}
```

### 2. OpenAIProvider (modo cloud, bajo coste)

```typescript
// src/services/ai/providers/openai.provider.ts

import OpenAI from 'openai';
import {
  AIProvider,
  ClassificationResult,
  SummarizationResult,
  QAResult,
  EmbeddingResult,
  AIProviderConfig
} from './ai-provider.interface';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';

  private client: OpenAI;
  private chatModel: string;
  private embeddingModel: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60000,
      maxRetries: 3
    });
    this.chatModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  }

  async checkAvailability(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  async classifyDocument(text: string, config?: AIProviderConfig): Promise<ClassificationResult> {
    const truncated = text.slice(0, 50000);
    const response = await this.chat(
      'Eres un asistente de clasificación de documentos. Responde SOLO en JSON.',
      `Analiza el siguiente texto y devuelve:
1. Categoría (Factura, Contrato, Informe, Presentación, Correspondencia, Manual técnico, Imagen/Fotografía, Hoja de cálculo, Documento personal, Otro)
2. Entre 3 y 7 etiquetas descriptivas específicas al contenido
3. Confianza (0-1)

JSON: {"category":"...","confidence":0.XX,"tags":["...","..."]}

TEXTO:
---
${truncated}
---`,
      config
    );
    return this.parseClassification(response);
  }

  async summarizeDocument(text: string, config?: AIProviderConfig): Promise<SummarizationResult> {
    const truncated = text.slice(0, 50000);
    const response = await this.chat(
      'Eres un asistente de resumen de documentos. Responde SOLO en JSON.',
      `Resume en 2-3 frases. Extrae 3-5 puntos clave.
JSON: {"summary":"...","keyPoints":["...","..."]}

TEXTO:
---
${truncated}
---`,
      config
    );
    return this.parseSummarization(response);
  }

  async answerQuestion(
    question: string,
    context: string,
    config?: AIProviderConfig
  ): Promise<QAResult> {
    const response = await this.chat(
      `Eres un asistente que responde preguntas basándose ÚNICAMENTE en los documentos proporcionados. Si la respuesta no está en los documentos, di "No encontré esa información en tus documentos."`,
      `DOCUMENTOS:\n${context}\n\nPREGUNTA: ${question}`,
      config
    );
    return { answer: response, sources: [] };
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: text
    });
    const embedding = response.data[0].embedding;
    return {
      embedding,
      dimensions: embedding.length,
      model: this.embeddingModel
    };
  }

  async generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: texts
    });
    return response.data.map(item => ({
      embedding: item.embedding,
      dimensions: item.embedding.length,
      model: this.embeddingModel
    }));
  }

  // --- Privados ---

  private async chat(system: string, user: string, config?: AIProviderConfig): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: config?.model || this.chatModel,
      temperature: config?.temperature ?? 0.3,
      max_tokens: config?.maxTokens ?? 1000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    });
    return response.choices[0]?.message?.content || '';
  }

  private parseClassification(response: string): ClassificationResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        category: parsed.category || 'Otro',
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0)),
        tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 7) : []
      };
    } catch {
      return { category: 'Otro', confidence: 0, tags: [] };
    }
  }

  private parseSummarization(response: string): SummarizationResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary || 'No se pudo generar resumen.',
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : []
      };
    } catch {
      return { summary: 'No se pudo generar resumen.', keyPoints: [] };
    }
  }
}
```

### 3. MockAIProvider (tests)

```typescript
// src/services/ai/providers/mock.provider.ts

import {
  AIProvider,
  ClassificationResult,
  SummarizationResult,
  QAResult,
  EmbeddingResult,
  AIProviderConfig
} from './ai-provider.interface';

export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  // Contadores para aserciones en tests
  public classifyCalls = 0;
  public summarizeCalls = 0;
  public questionCalls = 0;
  public embeddingCalls = 0;

  // Respuestas configurables desde tests
  public classifyResponse: ClassificationResult = {
    category: 'Documento General',
    confidence: 0.95,
    tags: ['test', 'mock', 'documento']
  };

  public summarizeResponse: SummarizationResult = {
    summary: 'Este es un documento de prueba utilizado en tests automatizados.',
    keyPoints: ['Punto clave 1', 'Punto clave 2', 'Punto clave 3']
  };

  public qaResponse: QAResult = {
    answer: 'Respuesta mock para testing.',
    sources: ['Documento de prueba']
  };

  async checkAvailability(): Promise<boolean> {
    return true; // Siempre disponible en tests
  }

  async classifyDocument(_text: string, _config?: AIProviderConfig): Promise<ClassificationResult> {
    this.classifyCalls++;
    return { ...this.classifyResponse };
  }

  async summarizeDocument(_text: string, _config?: AIProviderConfig): Promise<SummarizationResult> {
    this.summarizeCalls++;
    return { ...this.summarizeResponse };
  }

  async answerQuestion(
    _question: string,
    _context: string,
    _config?: AIProviderConfig
  ): Promise<QAResult> {
    this.questionCalls++;
    return { ...this.qaResponse };
  }

  async generateEmbedding(_text: string): Promise<EmbeddingResult> {
    this.embeddingCalls++;
    // Vector determinista basado en el texto para testear similaridad
    const embedding = new Array(768).fill(0).map((_, i) => Math.sin(i * 0.1));
    return { embedding, dimensions: 768, model: 'mock-embedding' };
  }

  async generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    return Promise.all(texts.map(t => this.generateEmbedding(t)));
  }

  /** Reset para usar entre tests */
  reset(): void {
    this.classifyCalls = 0;
    this.summarizeCalls = 0;
    this.questionCalls = 0;
    this.embeddingCalls = 0;
  }
}
```

### 4. AIProviderFactory + AIService

```typescript
// src/services/ai/ai.service.ts

import { AIProvider, AIProviderType, getAIConfig } from './providers/ai-provider.interface';
import { OllamaProvider } from './providers/ollama.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { MockAIProvider } from './providers/mock.provider';

class AIService {
  private provider: AIProvider | null = null;
  private config = getAIConfig();

  getProvider(): AIProvider {
    if (!this.provider) {
      this.provider = this.createProvider();
    }
    return this.provider;
  }

  getProviderName(): string {
    return this.getProvider().name;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.enabled) return false;
    return this.getProvider().checkAvailability();
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  /** Permite inyectar un provider en tests */
  setProvider(provider: AIProvider): void {
    this.provider = provider;
  }

  private createProvider(): AIProvider {
    // En NODE_ENV=test, siempre usar Mock
    if (process.env.NODE_ENV === 'test') {
      return new MockAIProvider();
    }

    switch (this.config.provider) {
      case 'local':
        return new OllamaProvider();
      case 'openai':
        return new OpenAIProvider();
      case 'mock':
        return new MockAIProvider();
      default:
        console.warn(`AI_PROVIDER '${this.config.provider}' no reconocido, usando mock`);
        return new MockAIProvider();
    }
  }
}

// Singleton
export const aiService = new AIService();
```

---

## ⚙️ Variables de Entorno

### Nuevas variables a añadir

```env
# --- AI Configuration ---
AI_ENABLED=true                         # true/false - habilitar/deshabilitar IA
AI_PROVIDER=local                       # local | openai | mock
AI_AUTO_PROCESS=true                    # Procesar automáticamente al subir documento

# --- Ollama (modo local) ---
OLLAMA_BASE_URL=http://localhost:11434  # URL del servidor Ollama
OLLAMA_MODEL=llama3.2                   # Modelo para chat/clasificación
OLLAMA_EMBEDDING_MODEL=nomic-embed-text # Modelo para embeddings

# --- OpenAI (modo cloud) --- (ya existen)
OPENAI_API_KEY=sk-...                   # API key (solo si AI_PROVIDER=openai)
OPENAI_MODEL=gpt-4o-mini               # Modelo chat
OPENAI_EMBEDDING_MODEL=text-embedding-3-small  # Modelo embeddings

# --- Límites ---
MAX_TEXT_LENGTH=50000                   # Máx caracteres a enviar al LLM
AI_MAX_CONCURRENT=2                    # Procesamientos simultáneos máximos
AI_COOLDOWN_MS=1000                    # Pausa entre procesamientos
```

### Variables en `.env.test`

```env
AI_ENABLED=true
AI_PROVIDER=mock
OLLAMA_BASE_URL=http://localhost:11434
OPENAI_API_KEY=test-key-not-used
```

---

## 🐳 Docker Compose — Servicio Ollama

### Añadir al `docker-compose.yml` raíz

```yaml
  ollama:
    image: ollama/ollama:latest
    container_name: clouddocs-ollama
    profiles: ["ai", "full"]
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        limits:
          memory: 4G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - clouddocs-network

volumes:
  ollama_data:
```

### Primer arranque

```bash
# Levantar con perfil AI
docker-compose --profile ai up -d

# Descargar modelo (una sola vez, ~2GB)
docker exec clouddocs-ollama ollama pull llama3.2
docker exec clouddocs-ollama ollama pull nomic-embed-text
```

### Backend docker-compose — variables de entorno

```yaml
backend:
  environment:
    AI_ENABLED: ${AI_ENABLED:-true}
    AI_PROVIDER: ${AI_PROVIDER:-local}
    OLLAMA_BASE_URL: http://ollama:11434
    OLLAMA_MODEL: ${OLLAMA_MODEL:-llama3.2}
    OLLAMA_EMBEDDING_MODEL: ${OLLAMA_EMBEDDING_MODEL:-nomic-embed-text}
    OPENAI_API_KEY: ${OPENAI_API_KEY:-}
    OPENAI_MODEL: ${OPENAI_MODEL:-gpt-4o-mini}
  depends_on:
    ollama:
      condition: service_healthy
      required: false # No bloquea si no se usa perfil ai
```

---

## 📋 Tareas de Implementación

### Fase 1: Crear la interfaz y providers (5h)

- [ ] Crear `src/services/ai/providers/ai-provider.interface.ts` con la interfaz `AIProvider`
- [ ] Crear `src/services/ai/providers/ai-provider.types.ts` con tipos y config
- [ ] Crear `src/services/ai/providers/ollama.provider.ts`
- [ ] Crear `src/services/ai/providers/openai.provider.ts` (adaptar código existente de `llm.service.ts` + `embedding.service.ts`)
- [ ] Crear `src/services/ai/providers/mock.provider.ts`
- [ ] Crear `src/services/ai/ai.service.ts` (facade + factory)

### Fase 2: Migrar servicios existentes (3h)

- [ ] Refactorizar `rag.service.ts` para usar `aiService.getProvider()` en vez de `llmService`/`embeddingService` directos
- [ ] Refactorizar `document-processor.service.ts` para usar `aiService.getProvider().generateEmbeddings()`
- [ ] Eliminar pattern `(global as any).__OPENAI_CREATE__` de `llm.service.ts`
- [ ] Actualizar `ai.controller.ts` para verificar `aiService.isEnabled()` antes de procesar
- [ ] Añadir variables de entorno a `.env.example` y `.env.test.example`

### Fase 3: Docker + Testing (2h)

- [ ] Añadir servicio `ollama` a `docker-compose.yml` raíz con profile `ai`
- [ ] Añadir variables AI al backend en docker-compose
- [ ] Tests unitarios de `OllamaProvider` (mock fetch)
- [ ] Tests unitarios de `OpenAIProvider` (mock OpenAI SDK)
- [ ] Tests unitarios de `MockAIProvider`
- [ ] Tests de `AIService` (factory crea provider correcto según env)
- [ ] Test de integración: pipeline completo con `MockAIProvider`
- [ ] Actualizar tests existentes para usar `MockAIProvider` en vez de global mock

---

## 📁 Árbol de Archivos Resultante

```text
src/services/ai/
├── ai.service.ts                    ← NUEVO: Facade + factory
├── providers/
│   ├── ai-provider.interface.ts     ← NUEVO: Interfaz AIProvider
│   ├── ai-provider.types.ts         ← NUEVO: Tipos y config
│   ├── ollama.provider.ts           ← NUEVO: Implementación Ollama
│   ├── openai.provider.ts           ← NUEVO: Adapta código existente
│   └── mock.provider.ts             ← NUEVO: Para tests
├── llm.service.ts                   ← MODIFICAR: delegar a provider o deprecar
├── embedding.service.ts             ← MODIFICAR: delegar a provider o deprecar
├── rag.service.ts                   ← MODIFICAR: usar aiService
├── prompt.builder.ts                ← SIN CAMBIOS (prompts se mueven a providers)
├── text-extraction.service.ts       ← SIN CAMBIOS (no usa IA)
└── document-processor.service.ts    ← MODIFICAR: usar aiService para embeddings
```

---

## ⚠️ Consideraciones

### Dimensiones de embedding entre proveedores

| Proveedor | Modelo                   | Dimensiones |
| --------- | ------------------------ | ----------- |
| OpenAI    | `text-embedding-3-small` | 1536        |
| Ollama    | `nomic-embed-text`       | 768         |
| Mock      | N/A                      | 768         |

**Implicación:** Si se cambia de proveedor, los chunks existentes en MongoDB Atlas tienen embeddings de dimensión distinta. Opciones:

1. Re-procesar todos los documentos (recomendado al cambiar proveedor)
2. Almacenar dimensión por chunk y normalizar en búsqueda (más complejo)
3. Usar OpenAI `text-embedding-3-small` con `dimensions: 768` para compatibilizar

### Fallback graceful

Si `AI_ENABLED=false` o el provider no está disponible:

- Upload funciona normalmente (sin procesamiento AI)
- `aiProcessingStatus` se queda en `'none'`
- Búsqueda funciona por nombre de archivo (como ahora)
- Frontend oculta secciones de IA
- **Nada se rompe. IA es un enhancement, no un requisito.**

### Migración gradual

Los servicios existentes (`llm.service.ts`, `embedding.service.ts`) pueden mantenerse temporalmente como wrappers que delegan al provider activo, para no romper tests existentes. Se deprecan y eliminan en iteración posterior.

---

## 🔗 RFEs Relacionadas

| RFE        | Relación                                                       |
| ---------- | -------------------------------------------------------------- |
| RFE-AI-002 | Usa los providers para el pipeline automático                  |
| RFE-AI-003 | `classifyDocument()` definido aquí                             |
| RFE-AI-005 | `generateEmbedding()` del provider reemplaza embedding directo |
| RFE-AI-007 | `summarizeDocument()` definido aquí                            |
