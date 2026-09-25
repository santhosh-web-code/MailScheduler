import { RedisMemoryServer } from 'redis-memory-server';

async function run() {
  const server = new RedisMemoryServer({ instance: { port: 6379 } });
  await server.start();
  console.log(`[RedisDaemon] In-memory Redis server listening on port 6379`);

  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });
}

run().catch((err) => {
  console.error('[RedisDaemon] Failed to start:', err);
  process.exit(1);
});
