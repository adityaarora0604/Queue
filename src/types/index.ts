export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'failed' | 'rescheduled' | 'cancelled';

export interface EmailRecord {
  id: string;
  campaign_id: string | null;
  recipient: string;
  sender: string;
  subject: string;
  body: string;
  scheduled_at: number;
  sent_at: number | null;
  status: EmailStatus;
  job_id: string;
  ethereal_message_id: string | null;
  ethereal_preview_url: string | null;
  attempts: number;
  last_error: string | null;
  rescheduled_from: number | null;
  created_at: number;
}

export interface SenderRecord {
  id: string;
  name: string;
  email: string;
  hourly_limit: number;
  active: number;
  created_at: number;
  usage?: {
    currentCount: number;
    limit: number;
    percentage: number;
    hourWindow: number;
    windowLabel: string;
  };
}

export interface QueueTelemetry {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: boolean;
  concurrency: number;
  minDelayMs: number;
  maxHourlyLimit: number;
  redisConnected: boolean;
}

export interface RateLimitEvent {
  id: string;
  sender: string;
  hour_window: number;
  hour_timestamp: string;
  count_attempted: number;
  limit_value: number;
  rescheduled_to: number;
  slack_notified: number;
  created_at: number;
}

export interface SlackConfig {
  webhook_url: string;
  has_token: boolean;
  channel_name: string;
  enabled: boolean;
  last_alert_at: number | null;
}

export interface UserProfile {
  name: string;
  email: string;
  avatar: string;
  role: string;
}
