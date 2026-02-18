import { Client } from '@elastic/elasticsearch';

/**
 * Cliente de Elasticsearch para búsqueda de documentos
 */
class ElasticsearchClient {
  private static instance: Client | null = null;

  /**
   * Obtener instancia singleton del cliente Elasticsearch
   */
  public static getInstance(): Client {
    if (!ElasticsearchClient.instance) {
      const esNode = process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';

      ElasticsearchClient.instance = new Client({
        node: esNode,
        auth:
          process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD
            ? {
                username: process.env.ELASTICSEARCH_USERNAME,
                password: process.env.ELASTICSEARCH_PASSWORD
              }
            : undefined,
        maxRetries: 5,
        requestTimeout: 60000,
        sniffOnStart: false
      });

      console.log(`✅ Elasticsearch client initialized: ${esNode}`);
    }

    return ElasticsearchClient.instance;
  }

  /**
   * Verificar conexión con Elasticsearch
   */
  public static async checkConnection(): Promise<boolean> {
    try {
      const client = ElasticsearchClient.getInstance();
      const health = await client.cluster.health();
      console.log(`✅ Elasticsearch cluster status: ${health.status}`);
      return true;
    } catch (error: any) {
      console.error('❌ Elasticsearch connection failed:', error.message);
      return false;
    }
  }

  /**
   * Crear índice para documentos si no existe
   */
  public static async createDocumentIndex(): Promise<void> {
    const client = ElasticsearchClient.getInstance();
    const indexName = 'documents';

    try {
      const indexExists = await client.indices.exists({ index: indexName });

      if (!indexExists) {
        await client.indices.create({
          index: indexName,
          settings: {
            number_of_shards: 1,
            number_of_replicas: 1,
            analysis: {
              analyzer: {
                custom_analyzer: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'asciifolding']
                }
              }
            }
          },
          mappings: {
            properties: {
              filename: {
                type: 'text',
                analyzer: 'custom_analyzer',
                fields: {
                  keyword: { type: 'keyword' }
                }
              },
              originalname: {
                type: 'text',
                analyzer: 'custom_analyzer'
              },
              content: {
                type: 'text',
                analyzer: 'custom_analyzer'
              },
              mimeType: {
                type: 'keyword'
              },
              size: {
                type: 'long'
              },
              uploadedBy: {
                type: 'keyword'
              },
              organization: {
                type: 'keyword'
              },
              folder: {
                type: 'keyword'
              },
              uploadedAt: {
                type: 'date'
              }
            }
          }
        });

        console.log(`✅ Elasticsearch index '${indexName}' created successfully`);
      } else {
        console.log(`ℹ️  Elasticsearch index '${indexName}' already exists`);
      }
    } catch (error: any) {
      console.error(`❌ Error creating Elasticsearch index:`, error.message);
      throw error;
    }
  }
}

export default ElasticsearchClient;
