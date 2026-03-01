import OpenAI from 'openai';

/**
 * Cliente de OpenAI para embeddings y chat completions
 *
 * Este módulo exporta una instancia configurada del cliente OpenAI.
 * La API key se obtiene de la variable de entorno OPENAI_API_KEY.
 */

/**
 * Obtener la API key de OpenAI desde las variables de entorno
 * @throws {Error} Si OPENAI_API_KEY no está configurada
 */
function getOpenAIApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('OPENAI_API_KEY is not configured in environment variables');
  }

  return apiKey;
}

/**
 * Cliente singleton de OpenAI
 */
class OpenAIClient {
  private static instance: OpenAI | null = null;

  /**
   * Obtener instancia singleton del cliente OpenAI
   * @throws {Error} Si OPENAI_API_KEY no está configurada
   */
  public static getInstance(): OpenAI {
    if (!OpenAIClient.instance) {
      const apiKey = getOpenAIApiKey();

      OpenAIClient.instance = new OpenAI({
        apiKey,
        timeout: 60000, // 60 segundos
        maxRetries: 3
      });

      console.warn('✅ OpenAI client initialized');
    }

    return OpenAIClient.instance;
  }

  /**
   * Verificar que el cliente está configurado correctamente
   * @returns true si el cliente puede hacer llamadas a la API
   */
  public static async checkConnection(): Promise<boolean> {
    try {
      const client = OpenAIClient.getInstance();
      // Hacer una llamada mínima para verificar que la API key es válida
      await client.models.list();
      console.warn('✅ OpenAI API connection successful');
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ OpenAI connection failed:', errorMessage);
      return false;
    }
  }
}

/**
 * Instancia exportada del cliente OpenAI
 * Usa lazy initialization - se crea cuando se llama a getInstance()
 */
export default OpenAIClient;
