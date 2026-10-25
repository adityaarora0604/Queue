export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'failed' | 'rescheduled' | 'cancelled';

export interface EmailJobData {
  emailId: string;
  campaignId?: string;
  recipient: string;
  sender: string;
  subject: string;
  body: string;
  scheduledAt: number;
  delayBetweenEmailsMs: number;
  hourlyLimit: number;
}

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
  ethereal_user?: string;
  ethereal_pass?: string;
  hourly_limit: number;
  active: number;
  created_at: number;
}

export interface CampaignRecord {
  id: string;
  title: string;
  sender: string;
  template_subject: string;
  template_body: string;
  delay_between_emails_ms: number;
  hourly_limit: number;
  total_leads: number;
  sent_count: number;
  status: 'active' | 'completed' | 'paused';
  created_at: number;
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
  access_token: string;
  channel_name: string;
  enabled: boolean;
  last_alert_at: number | null;
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
