import { redisConnection } from '../queue/redisConnection';
import { config } from '../../config';

const HOURLY_RATE_LIMIT_LUA = `
local key = KEYS[1]
local max_limit = tonumber(ARGV[1])
local ttl_seconds = tonumber(ARGV[2])

local current = redis.call('GET', key)

if current and tonumber(current) >= max_limit then
    -- Limit reached: do not increment
    return {0, tonumber(current)}
else
    -- Under limit: increment counter
    local count = redis.call('INCR', key)
    if count == 1 then
        -- Set TTL to 2 hours (7200s) to keep memory clean after window expires
        redis.call('EXPIRE', key, ttl_seconds)
    end
    return {1, count}
end
`;

export interface RateLimitCheckResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  nextWindowDate: Date;
  msUntilNextWindow: number;
}

export function getHourKey(senderId: string, date: Date = new Date()): string {

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  return `rate:${senderId}:${year}-${month}-${day}T${hour}`;
}

export function getNextHourWindow(date: Date = new Date()): Date {
  const next = new Date(date);
  next.setUTCHours(next.getUTCHours() + 1, 0, 0, 0);
  return next;
}

export async function consumeHourlyQuota(
  senderId: string,
  limitOverride?: number
): Promise<RateLimitCheckResult> {
  const maxLimit = limitOverride ?? config.rateLimit.maxEmailsPerHour ?? 50;
  const now = new Date();
  const hourKey = getHourKey(senderId, now);
  const nextWindowDate = getNextHourWindow(now);
  const msUntilNextWindow = Math.max(1000, nextWindowDate.getTime() - now.getTime());

  const ttlSeconds = 7200;

  try {
    const result = (await redisConnection.eval(
      HOURLY_RATE_LIMIT_LUA,
      1,
      hourKey,
      maxLimit,
      ttlSeconds
    )) as [number, number];

    const allowed = result[0] === 1;
    const currentCount = result[1];

    return {
      allowed,
      currentCount,
      limit: maxLimit,
      nextWindowDate,
      msUntilNextWindow,
    };
  } catch (error) {
    console.error(`[RateLimiter] Error evaluating Lua script for ${hourKey}:`, error);

    return {
      allowed: true,
      currentCount: 0,
      limit: maxLimit,
      nextWindowDate,
      msUntilNextWindow,
    };
  }
}
