import Redis, { RedisOptions } from 'ioredis';
import { config } from '../../config';

const redisUrl = process.env.REDIS_URL || config.redis.url;

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
};

export const redisConnection = redisUrl
  ? new Redis(redisUrl, redisOptions)
  : new Redis({
      host: config.redis.host || 'localhost',
      port: config.redis.port || 6379,
      ...redisOptions,
    });

redisConnection.on('connect', () => {
  if (redisUrl) {
    console.log('[Redis] Connected to Redis via REDIS_URL');
  } else {
    console.log(`[Redis] Connected to Redis at ${config.redis.host}:${config.redis.port}`);
  }
});

redisConnection.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

export default redisConnection;
