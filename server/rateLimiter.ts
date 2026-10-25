import { getRedisClient } from './redis.ts';
import { dbGetSenderByEmail, dbGetSystemSetting } from './db.ts';

export interface RateLimitCheckResult {
  allowed: boolean;
  sender: string;
  hourWindow: number;
  currentCount: number;
  limit: number;
  rescheduledTo?: number;
  reason?: string;
}

export function getHourWindow(timestamp: number = Date.now()): number {
  return Math.floor(timestamp / (60 * 60 * 1000));
}

export function getHourWindowTimeRange(hourWindow: number): { start: number; end: number; label: string } {
  const start = hourWindow * 3600 * 1000;
  const end = (hourWindow + 1) * 3600 * 1000 - 1;
  const date = new Date(start);
  const label = date.toISOString().replace('T', ' ').substring(0, 16) + ' UTC';
  return { start, end, label };
}

export async function checkAndIncrementRateLimit(senderEmail: string): Promise<RateLimitCheckResult> {
  const redis = getRedisClient();
  const now = Date.now();
  const currentHourWindow = getHourWindow(now);

  // Retrieve sender-specific limit and global limit
  const senderRecord = await dbGetSenderByEmail(senderEmail);
  const senderLimit = senderRecord?.hourly_limit || 20;

  const globalLimitStr = await dbGetSystemSetting('global_hourly_limit', '100');
  const globalLimit = parseInt(globalLimitStr, 10) || 100;

  const senderKey = `rl:sender:${senderEmail}:${currentHourWindow}`;
  const globalKey = `rl:global:${currentHourWindow}`;

  // Use pipeline or transaction to check/increment atomically
  // We increment both keys
  const [senderCount, globalCount] = await Promise.all([
    redis.incr(senderKey),
    redis.incr(globalKey),
  ]);

  // Set TTL of 7200 seconds (2 hours) if this is the first increment in this window
  if (senderCount === 1) {
    await redis.expire(senderKey, 7200);
  }
  if (globalCount === 1) {
    await redis.expire(globalKey, 7200);
  }

  // Check if sender limit exceeded
  if (senderCount > senderLimit) {
    // Revert increment so quota isn't consumed
    await redis.decr(senderKey);
    await redis.decr(globalKey);

    // Calculate start of next hour window + slight offset (e.g., 2-5 seconds)
    const nextWindowStart = (currentHourWindow + 1) * 3600 * 1000 + 1500;

    return {
      allowed: false,
      sender: senderEmail,
      hourWindow: currentHourWindow,
      currentCount: senderCount - 1,
      limit: senderLimit,
      rescheduledTo: nextWindowStart,
      reason: `Sender ${senderEmail} reached hourly limit (${senderLimit}/hr)`,
    };
  }

  // Check if global limit exceeded
  if (globalCount > globalLimit) {
    await redis.decr(senderKey);
    await redis.decr(globalKey);

    const nextWindowStart = (currentHourWindow + 1) * 3600 * 1000 + 2000;

    return {
      allowed: false,
      sender: senderEmail,
      hourWindow: currentHourWindow,
      currentCount: globalCount - 1,
      limit: globalLimit,
      rescheduledTo: nextWindowStart,
      reason: `Global scheduler rate limit reached (${globalLimit}/hr)`,
    };
  }

  return {
    allowed: true,
    sender: senderEmail,
    hourWindow: currentHourWindow,
    currentCount: senderCount,
    limit: senderLimit,
  };
}

export async function getSenderUsageStatus(senderEmail: string): Promise<{
  currentCount: number;
  limit: number;
  percentage: number;
  hourWindow: number;
  windowLabel: string;
}> {
  const redis = getRedisClient();
  const now = Date.now();
  const hourWindow = getHourWindow(now);
  const senderKey = `rl:sender:${senderEmail}:${hourWindow}`;

  const countStr = await redis.get(senderKey);
  const currentCount = countStr ? parseInt(countStr, 10) : 0;

  const senderRecord = await dbGetSenderByEmail(senderEmail);
  const limit = senderRecord?.hourly_limit || 20;

  const { label } = getHourWindowTimeRange(hourWindow);

  return {
    currentCount,
    limit,
    percentage: Math.min(100, Math.round((currentCount / limit) * 100)),
    hourWindow,
    windowLabel: label,
  };
}

export async function resetSenderRateLimitWindow(senderEmail: string): Promise<void> {
  const redis = getRedisClient();
  const now = Date.now();
  const hourWindow = getHourWindow(now);
  const senderKey = `rl:sender:${senderEmail}:${hourWindow}`;
  await redis.del(senderKey);
}
