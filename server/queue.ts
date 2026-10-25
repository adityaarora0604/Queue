import { Queue, Worker, Job } from 'bullmq';
import { redisConnectionOptions, getRedisClient } from './redis.ts';
import { EmailJobData, QueueTelemetry } from './types.ts';
import {
  dbGetEmailById,
  dbUpdateEmailStatus,
  dbGetEmailsByStatus,
  dbRecordRateLimitEvent,
  dbGetSystemSetting,
} from './db.ts';
import { checkAndIncrementRateLimit, getHourWindowTimeRange } from './rateLimiter.ts';
import { sendEmailViaEthereal } from './smtp.ts';
import { sendSlackRateLimitAlert } from './slack.ts';
import { elasticsearch } from './elasticsearch.ts';

export const EMAIL_QUEUE_NAME = 'reachinbox-email-queue';

let emailQueue: Queue<EmailJobData> | null = null;
let emailWorker: Worker<EmailJobData> | null = null;
let currentConcurrency = 5;

export function getEmailQueue(): Queue<EmailJobData> {
  if (!emailQueue) {
    emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
      connection: redisConnectionOptions,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
        removeOnComplete: false, // Keep in queue for Bull Board visibility
        removeOnFail: false,
      },
    });

    emailQueue.on('error', (err) => {
      console.error('[BullMQ Queue Error]', err.message);
    });
  }
  return emailQueue;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function initializeQueueAndWorker(): Promise<void> {
  const queue = getEmailQueue();

  // Load configured worker concurrency
  const concurrencySetting = await dbGetSystemSetting('worker_concurrency', '5');
  currentConcurrency = parseInt(concurrencySetting, 10) || 5;

  console.log(`[BullMQ Worker] Initializing with concurrency=${currentConcurrency}...`);

  emailWorker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJobData>) => {
      const { emailId, sender, recipient, subject, body, delayBetweenEmailsMs } = job.data;
      console.log(`[BullMQ Worker] Picked up job ${job.id} for email ${emailId} -> ${recipient}`);

      // 1. Idempotency & Database Verification
      const emailRecord = await dbGetEmailById(emailId);
      if (!emailRecord) {
        console.warn(`[BullMQ Worker] Email ${emailId} not found in DB. Skipping job ${job.id}.`);
        return { skipped: true, reason: 'not_found' };
      }

      if (emailRecord.status === 'sent') {
        console.log(`[BullMQ Worker] Email ${emailId} is already marked as 'sent'. Skipping duplicate job execution.`);
        return { skipped: true, reason: 'already_sent' };
      }

      if (emailRecord.status === 'cancelled') {
        console.log(`[BullMQ Worker] Email ${emailId} was cancelled by user. Skipping.`);
        return { skipped: true, reason: 'cancelled' };
      }

      // 2. Rate Limiting Check (Atomic Redis Counter per sender / global)
      const rateLimitCheck = await checkAndIncrementRateLimit(sender);

      if (!rateLimitCheck.allowed) {
        const rescheduledTo = rateLimitCheck.rescheduledTo || Date.now() + 3600000;
        console.warn(`[Rate Limit Hit] Sender ${sender} hit hourly limit! Rescheduling email ${emailId} to ${new Date(rescheduledTo).toISOString()}`);

        const { label: windowLabel } = getHourWindowTimeRange(rateLimitCheck.hourWindow);

        // Record rate limit event in SQLite
        await dbRecordRateLimitEvent({
          sender,
          hour_window: rateLimitCheck.hourWindow,
          hour_timestamp: windowLabel,
          count_attempted: rateLimitCheck.currentCount + 1,
          limit_value: rateLimitCheck.limit,
          rescheduled_to: rescheduledTo,
          slack_notified: 1,
        });

        // Update email status in DB
        const newJobId = `job_${emailId}_resched_${Date.now()}`;
        await dbUpdateEmailStatus(emailId, {
          status: 'rescheduled',
          rescheduled_from: emailRecord.scheduled_at,
          scheduled_at: rescheduledTo,
          job_id: newJobId,
          last_error: rateLimitCheck.reason,
        });

        // Trigger Slack Notification
        sendSlackRateLimitAlert({
          sender,
          hourWindow: rateLimitCheck.hourWindow,
          count: rateLimitCheck.limit,
          limit: rateLimitCheck.limit,
          rescheduledTo,
        }).catch((err) => console.error('[Slack Dispatch Error]', err));

        // Re-enqueue as a delayed job in BullMQ for the next window
        const delayMs = Math.max(1000, rescheduledTo - Date.now());
        await queue.add(
          'send-email',
          { ...job.data, scheduledAt: rescheduledTo },
          { delay: delayMs, jobId: newJobId }
        );

        return {
          rateLimited: true,
          rescheduledTo,
          reason: rateLimitCheck.reason,
        };
      }

      // 3. Mark as Sending
      await dbUpdateEmailStatus(emailId, {
        status: 'sending',
        attempts: (emailRecord.attempts || 0) + 1,
      });

      // 4. Mimic Provider Throttling (Inter-Email Minimum Delay)
      const interEmailDelay = delayBetweenEmailsMs || 2000;
      if (interEmailDelay > 0) {
        console.log(`[BullMQ Worker] Enforcing minimum inter-email delay: ${interEmailDelay}ms`);
        await sleep(interEmailDelay);
      }

      // 5. Send via Ethereal SMTP
      console.log(`[BullMQ Worker] Dispatching email to SMTP transporter for ${recipient}...`);
      const sendResult = await sendEmailViaEthereal({
        from: sender,
        to: recipient,
        subject,
        body,
      });

      if (!sendResult.success) {
        throw new Error(sendResult.error || 'SMTP delivery failure');
      }

      // 6. Update Database with Success State
      const sentAt = Date.now();
      await dbUpdateEmailStatus(emailId, {
        status: 'sent',
        sent_at: sentAt,
        ethereal_message_id: sendResult.messageId,
        ethereal_preview_url: sendResult.previewUrl,
        last_error: null,
      });

      // 7. Update Elasticsearch Inverted Index
      const updatedRecord = await dbGetEmailById(emailId);
      if (updatedRecord) {
        elasticsearch.indexDocument(updatedRecord);
      }

      console.log(`[BullMQ Worker] Email ${emailId} successfully delivered! Ethereal Preview: ${sendResult.previewUrl}`);

      return {
        success: true,
        emailId,
        messageId: sendResult.messageId,
        previewUrl: sendResult.previewUrl,
        sentAt,
      };
    },
    {
      connection: redisConnectionOptions,
      concurrency: currentConcurrency,
    }
  );

  emailWorker.on('completed', (job) => {
    console.log(`[BullMQ Worker] Job ${job.id} completed.`);
  });

  emailWorker.on('failed', async (job, err) => {
    console.error(`[BullMQ Worker] Job ${job?.id} failed:`, err.message);
    if (job?.data?.emailId) {
      await dbUpdateEmailStatus(job.data.emailId, {
        status: 'failed',
        last_error: err.message,
      });
      const updated = await dbGetEmailById(job.data.emailId);
      if (updated) elasticsearch.indexDocument(updated);
    }
  });

  // Run Cold-Restart Persistence Recovery
  await recoverScheduledJobsOnRestart();
}

/**
 * Ensures that if the server restarted, any scheduled emails in SQLite
 * that need to fire in the future or pending past are still properly enqueued in BullMQ.
 */
export async function recoverScheduledJobsOnRestart(): Promise<{ recoveredCount: number; checkedCount: number }> {
  console.log('[Recovery] Running server startup / restart recovery check on persistent database...');
  const queue = getEmailQueue();
  const scheduledEmails = await dbGetEmailsByStatus(['scheduled', 'rescheduled']);
  let recoveredCount = 0;

  for (const email of scheduledEmails) {
    try {
      // Check if job already exists in BullMQ (delayed, active, or waiting)
      const existingJob = await queue.getJob(email.job_id);

      if (!existingJob) {
        const remainingDelay = Math.max(0, email.scheduled_at - Date.now());
        console.log(`[Recovery] Re-enqueuing missing job ${email.job_id} for email ${email.id} (remaining delay: ${Math.round(remainingDelay / 1000)}s)`);

        await queue.add(
          'send-email',
          {
            emailId: email.id,
            campaignId: email.campaign_id || undefined,
            recipient: email.recipient,
            sender: email.sender,
            subject: email.subject,
            body: email.body,
            scheduledAt: email.scheduled_at,
            delayBetweenEmailsMs: 2000,
            hourlyLimit: 20,
          },
          {
            delay: remainingDelay,
            jobId: email.job_id,
          }
        );
        recoveredCount++;
      } else {
        const state = await existingJob.getState();
        console.log(`[Recovery] Persistent job ${email.job_id} verified in BullMQ (state: ${state}).`);
      }
    } catch (err: any) {
      console.warn(`[Recovery] Could not verify job ${email.job_id}:`, err.message);
    }
  }

  console.log(`[Recovery] Restart check complete. Total checked: ${scheduledEmails.length}, Re-enqueued: ${recoveredCount}`);
  return { recoveredCount, checkedCount: scheduledEmails.length };
}

export async function scheduleEmailJob(data: EmailJobData): Promise<string> {
  const queue = getEmailQueue();
  const delay = Math.max(0, data.scheduledAt - Date.now());
  const jobId = `job_${data.emailId}`;

  await queue.add('send-email', data, {
    delay,
    jobId,
  });

  console.log(`[Scheduler] Enqueued BullMQ delayed job '${jobId}' for email ${data.emailId} with delay: ${Math.round(delay / 1000)}s`);
  return jobId;
}

export async function cancelQueueJob(jobId: string): Promise<boolean> {
  const queue = getEmailQueue();
  const job = await queue.getJob(jobId);
  if (job) {
    await job.remove();
    console.log(`[Scheduler] Removed job ${jobId} from BullMQ.`);
    return true;
  }
  return false;
}

export async function triggerJobNow(jobId: string): Promise<boolean> {
  const queue = getEmailQueue();
  const job = await queue.getJob(jobId);
  if (job) {
    await job.promote();
    console.log(`[Scheduler] Promoted job ${jobId} to run immediately.`);
    return true;
  }
  return false;
}

export async function getQueueTelemetry(): Promise<QueueTelemetry> {
  const queue = getEmailQueue();
  const [counts, isPaused] = await Promise.all([
    queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed'),
    queue.isPaused(),
  ]);

  const minDelayStr = await dbGetSystemSetting('min_delay_ms', '2000');
  const globalLimitStr = await dbGetSystemSetting('global_hourly_limit', '100');

  let redisOk = false;
  try {
    const redis = getRedisClient();
    const pong = await redis.ping();
    redisOk = pong === 'PONG';
  } catch {
    redisOk = false;
  }

  return {
    waiting: counts.waiting || 0,
    active: counts.active || 0,
    delayed: counts.delayed || 0,
    completed: counts.completed || 0,
    failed: counts.failed || 0,
    paused: isPaused,
    concurrency: currentConcurrency,
    minDelayMs: parseInt(minDelayStr, 10) || 2000,
    maxHourlyLimit: parseInt(globalLimitStr, 10) || 100,
    redisConnected: redisOk,
  };
}

export async function updateWorkerConcurrency(concurrency: number): Promise<number> {
  currentConcurrency = Math.max(1, Math.min(25, concurrency));
  if (emailWorker) {
    emailWorker.concurrency = currentConcurrency;
  }
  return currentConcurrency;
}
