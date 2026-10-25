import Redis from 'ioredis';
import { execSync } from 'child_process';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;

let redisClient: Redis | null = null;

export function ensureRedisServerRunning(): void {
  try {
    const testRedis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      connectTimeout: 800,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    // Attempt ping synchronously via exec if possible
    try {
      execSync('redis-cli ping', { stdio: 'pipe', timeout: 1000 });
      return;
    } catch {
      console.log('[Redis] Redis not responding to ping, launching redis-server --daemonize yes...');
      execSync('redis-server --daemonize yes', { stdio: 'inherit' });
      console.log('[Redis] redis-server started in daemon mode.');
    }
  } catch (err) {
    console.warn('[Redis] Warning during Redis startup check:', err);
  }
}

export function getRedisClient(): Redis {
  if (!redisClient) {
    ensureRedisServerRunning();
    redisClient = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      retryStrategy(times) {
        return Math.min(times * 100, 3000);
      },
    });

    redisClient.on('error', (err) => {
      console.error('[Redis Client Error]', err.message);
    });

    redisClient.on('connect', () => {
      console.log(`[Redis] Connected to redis://${REDIS_HOST}:${REDIS_PORT}`);
    });
  }
  return redisClient;
}

export const redisConnectionOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
};
