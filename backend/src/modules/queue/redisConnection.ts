import Redis, { RedisOptions } from 'ioredis';
import { config } from '../../config';

const redisOptions: RedisOptions = {
  host: config.redis.host || 'localhost',
  port: config.redis.port || 6379,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
};

export const redisConnection = new Redis(redisOptions);

redisConnection.on('connect', () => {
  console.log(`[Redis] Connected to Redis at ${config.redis.host}:${config.redis.port}`);
});

redisConnection.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

export default redisConnection;
