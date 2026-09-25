import { Client } from '@elastic/elasticsearch';
import { config } from '../../config';

export const EMAILS_INDEX = 'emails';

export const esClient = new Client({
  node: config.elasticsearchUrl || 'http://localhost:9200',
  maxRetries: 3,
  requestTimeout: 3000,
});

export async function initElasticsearchIndex(): Promise<void> {
  try {
    const exists = await esClient.indices.exists({ index: EMAILS_INDEX });

    if (!exists) {
      console.log(`[Elasticsearch] Index "${EMAILS_INDEX}" does not exist. Creating with explicit mappings...`);

      await esClient.indices.create({
        index: EMAILS_INDEX,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            analysis: {
              analyzer: {
                email_analyzer: {
                  type: 'custom',
                  tokenizer: 'uax_url_email',
                  filter: ['lowercase'],
                },
              },
            },
          },
          mappings: {
            properties: {
              id: { type: 'keyword' },
              recipientEmail: {
                type: 'text',
                analyzer: 'email_analyzer',
                fields: {
                  keyword: { type: 'keyword' },
                },
              },
              subject: {
                type: 'text',
                fields: {
                  keyword: { type: 'keyword' },
                },
              },
              bodyHtml: { type: 'text' },
              status: { type: 'keyword' },
              scheduledFor: { type: 'date' },
              sentAt: { type: 'date' },
              senderId: { type: 'keyword' },
              userId: { type: 'keyword' },
            },
          },
        },
      });

      console.log(`[Elasticsearch] Index "${EMAILS_INDEX}" created successfully.`);
    } else {
      console.log(`[Elasticsearch] Index "${EMAILS_INDEX}" already exists and verified.`);
    }
  } catch (error) {

    console.warn(
      `[Elasticsearch] Warning: Could not connect to Elasticsearch at ${config.elasticsearchUrl}:`,
      (error as Error).message
    );
  }
}

export default esClient;
