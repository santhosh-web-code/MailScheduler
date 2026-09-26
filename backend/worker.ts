import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
dotenv.config();

import { emailWorker } from './src/modules/queue/emailWorker';
import { reconcileQueue } from './src/modules/queue/reconcile';
import { initElasticsearchIndex } from './src/modules/search/esClient';

// Minimal HTTP server so Render can run worker as a free Web Service
const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.get('/', (_req: Request, res: Response) => {
  res.status(200).send('Worker running');
});

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).send('OK');
});

const httpServer = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Worker HTTP] Health check server listening on port ${PORT}`);
});

const concurrency = Number(process.env.WORKER_CONCURRENCY) || 5;
const redisTarget = process.env.REDIS_URL
  ? '[Configured via REDIS_URL]'
  : `${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;

console.log('========================================================');
console.log(`Worker started, listening on queue: email-send, concurrency: ${concurrency}`);
console.log(`Connected to Redis: ${redisTarget}`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log('========================================================');

async function bootstrap() {
  try {
    await initElasticsearchIndex().catch(() => {});
    await reconcileQueue();
    console.log('[Worker] Startup reconciliation completed. Worker is now actively consuming jobs.\n');
  } catch (err) {
    console.error('[Worker] Startup reconciliation encountered an error:', err);
  }
}

bootstrap();

const shutdown = async (signal: string) => {
  console.log(`\n[Worker] Received ${signal}. Gracefully closing BullMQ worker and HTTP server...`);
  try {
    httpServer.close();
    await emailWorker.close();
    console.log('[Worker] Worker and HTTP server closed cleanly.');
    process.exit(0);
  } catch (error) {
    console.error('[Worker] Error during worker shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
