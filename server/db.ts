import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { CampaignRecord, EmailRecord, EmailStatus, RateLimitEvent, SenderRecord, SlackConfig } from './types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'reachinbox.sqlite');

let db: Database | null = null;
let saveDebounceTimer: NodeJS.Timeout | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    try {
      const fileBuffer = fs.readFileSync(DB_FILE);
      db = new SQL.Database(fileBuffer);
      console.log(`[Database] Loaded persistent SQLite database from ${DB_FILE}`);
    } catch (e) {
      console.error('[Database] Failed to read existing SQLite file, creating new one', e);
      db = new SQL.Database();
    }
  } else {
    console.log('[Database] Initializing fresh SQLite database...');
    db = new SQL.Database();
  }

  initSchema(db);
  seedInitialData(db);
  saveDatabaseSync(db);

  return db;
}

export function saveDatabase(): void {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    if (db) {
      saveDatabaseSync(db);
    }
  }, 250);
}

export function saveDatabaseSync(database: Database): void {
  try {
    const data = database.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
  } catch (err) {
    console.error('[Database] Failed to persist SQLite to disk:', err);
  }
}

function initSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS senders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      ethereal_user TEXT,
      ethereal_pass TEXT,
      hourly_limit INTEGER DEFAULT 20,
      active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      sender TEXT NOT NULL,
      template_subject TEXT NOT NULL,
      template_body TEXT NOT NULL,
      delay_between_emails_ms INTEGER DEFAULT 2000,
      hourly_limit INTEGER DEFAULT 20,
      total_leads INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      campaign_id TEXT,
      recipient TEXT NOT NULL,
      sender TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      scheduled_at INTEGER NOT NULL,
      sent_at INTEGER,
      status TEXT NOT NULL,
      job_id TEXT UNIQUE NOT NULL,
      ethereal_message_id TEXT,
      ethereal_preview_url TEXT,
      attempts INTEGER DEFAULT 0,
      last_error TEXT,
      rescheduled_from INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_emails_status ON emails (status);
    CREATE INDEX IF NOT EXISTS idx_emails_scheduled ON emails (scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_emails_sender ON emails (sender);

    CREATE TABLE IF NOT EXISTS rate_limit_events (
      id TEXT PRIMARY KEY,
      sender TEXT NOT NULL,
      hour_window INTEGER NOT NULL,
      hour_timestamp TEXT NOT NULL,
      count_attempted INTEGER NOT NULL,
      limit_value INTEGER NOT NULL,
      rescheduled_to INTEGER NOT NULL,
      slack_notified INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS slack_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      webhook_url TEXT,
      access_token TEXT,
      channel_name TEXT,
      enabled INTEGER DEFAULT 1,
      last_alert_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function seedInitialData(database: Database): void {
  // Check if senders exist
  const res = database.exec('SELECT COUNT(*) as count FROM senders');
  const count = res[0]?.values[0]?.[0] as number;
  if (!count || count === 0) {
    const now = Date.now();
    database.run(`
      INSERT INTO senders (id, name, email, hourly_limit, active, created_at)
      VALUES 
        ('sender_1', 'Alex Rivera (Growth)', 'growth@reachinbox.ai', 20, 1, ${now}),
        ('sender_2', 'Sarah Chen (Enterprise Outbound)', 'sarah.chen@reachinbox.ai', 15, 1, ${now}),
        ('sender_3', 'Devin Vance (Product Partnerships)', 'devin@reachinbox.ai', 10, 1, ${now});
    `);

    // Insert sample slack config
    database.run(`
      INSERT OR REPLACE INTO slack_config (id, webhook_url, access_token, channel_name, enabled, last_alert_at)
      VALUES (1, '', '', '#email-rate-limit-alerts', 1, NULL);
    `);

    // Insert default system settings
    database.run(`
      INSERT OR REPLACE INTO system_settings (key, value) VALUES
        ('worker_concurrency', '5'),
        ('min_delay_ms', '2000'),
        ('global_hourly_limit', '100');
    `);

    // Seed a couple of historical sent emails so dashboard displays real-looking data immediately
    const pastTime1 = now - 1800000; // 30 mins ago
    const pastTime2 = now - 900000;  // 15 mins ago
    database.run(`
      INSERT INTO emails (
        id, campaign_id, recipient, sender, subject, body,
        scheduled_at, sent_at, status, job_id, ethereal_message_id, ethereal_preview_url, attempts, created_at
      ) VALUES
      (
        'seed_email_1', 'camp_seed', 'jason.bourne@acme-ventures.com', 'growth@reachinbox.ai',
        'Scaling B2B outbound sequences without spam filters',
        'Hey Jason,\n\nNoticed Acme recently expanded its sales engineering squad. ReachInbox handles persistent high-volume scheduling with BullMQ and strict sender rate limits.\n\nOpen to a brief 7-minute exchange?\n\nBest,\nAlex',
        ${pastTime1}, ${pastTime1 + 1200}, 'sent', 'job_seed_1', '<msg-101@ethereal.email>', 'https://ethereal.email/message/XxL2vP01Q98kL', 1, ${pastTime1 - 60000}
      ),
      (
        'seed_email_2', 'camp_seed', 'claire.watson@cloudscale.io', 'sarah.chen@reachinbox.ai',
        'Quick feedback on CloudScale pipeline automation',
        'Hi Claire,\n\nWe deployed our new multi-worker email scheduler with Redis sliding window throttles and Slack rate-limit webhook triggers.\n\nWould love your thoughts.\n\nCheers,\nSarah',
        ${pastTime2}, ${pastTime2 + 1150}, 'sent', 'job_seed_2', '<msg-102@ethereal.email>', 'https://ethereal.email/message/YyM3wQ12R09lM', 1, ${pastTime2 - 60000}
      );
    `);
  }
}

// Data Access Helpers
export async function dbGetSenders(): Promise<SenderRecord[]> {
  const d = await getDb();
  const res = d.exec('SELECT * FROM senders ORDER BY created_at ASC');
  if (!res[0]) return [];
  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const obj: any = {};
    cols.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as SenderRecord;
  });
}

export async function dbGetSenderByEmail(email: string): Promise<SenderRecord | null> {
  const senders = await dbGetSenders();
  return senders.find(s => s.email.toLowerCase() === email.toLowerCase()) || null;
}

export async function dbUpdateSenderHourlyLimit(senderEmail: string, limit: number): Promise<void> {
  const d = await getDb();
  d.run('UPDATE senders SET hourly_limit = ? WHERE email = ?', [limit, senderEmail]);
  saveDatabase();
}

export async function dbInsertEmail(email: EmailRecord): Promise<void> {
  const d = await getDb();
  d.run(`
    INSERT INTO emails (
      id, campaign_id, recipient, sender, subject, body,
      scheduled_at, sent_at, status, job_id, ethereal_message_id,
      ethereal_preview_url, attempts, last_error, rescheduled_from, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    email.id,
    email.campaign_id,
    email.recipient,
    email.sender,
    email.subject,
    email.body,
    email.scheduled_at,
    email.sent_at,
    email.status,
    email.job_id,
    email.ethereal_message_id,
    email.ethereal_preview_url,
    email.attempts,
    email.last_error,
    email.rescheduled_from,
    email.created_at,
  ]);
  saveDatabase();
}

export async function dbGetEmailById(id: string): Promise<EmailRecord | null> {
  const d = await getDb();
  const res = d.exec('SELECT * FROM emails WHERE id = ?', [id]);
  if (!res[0] || res[0].values.length === 0) return null;
  const cols = res[0].columns;
  const obj: any = {};
  cols.forEach((col, idx) => {
    obj[col] = res[0].values[0][idx];
  });
  return obj as EmailRecord;
}

export async function dbGetEmailByJobId(jobId: string): Promise<EmailRecord | null> {
  const d = await getDb();
  const res = d.exec('SELECT * FROM emails WHERE job_id = ?', [jobId]);
  if (!res[0] || res[0].values.length === 0) return null;
  const cols = res[0].columns;
  const obj: any = {};
  cols.forEach((col, idx) => {
    obj[col] = res[0].values[0][idx];
  });
  return obj as EmailRecord;
}

export async function dbGetEmailsByStatus(status: EmailStatus | EmailStatus[]): Promise<EmailRecord[]> {
  const d = await getDb();
  const statuses = Array.isArray(status) ? status : [status];
  const placeholders = statuses.map(() => '?').join(',');
  const res = d.exec(`SELECT * FROM emails WHERE status IN (${placeholders}) ORDER BY scheduled_at ASC, created_at DESC`, statuses);
  if (!res[0]) return [];
  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const obj: any = {};
    cols.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as EmailRecord;
  });
}

export async function dbGetAllEmails(): Promise<EmailRecord[]> {
  const d = await getDb();
  const res = d.exec('SELECT * FROM emails ORDER BY created_at DESC');
  if (!res[0]) return [];
  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const obj: any = {};
    cols.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as EmailRecord;
  });
}

export async function dbUpdateEmailStatus(
  id: string,
  updates: {
    status: EmailStatus;
    sent_at?: number | null;
    ethereal_message_id?: string | null;
    ethereal_preview_url?: string | null;
    last_error?: string | null;
    attempts?: number;
    rescheduled_from?: number | null;
    scheduled_at?: number;
    job_id?: string;
  }
): Promise<void> {
  const d = await getDb();
  const current = await dbGetEmailById(id);
  if (!current) return;

  const newStatus = updates.status ?? current.status;
  const newSentAt = updates.sent_at !== undefined ? updates.sent_at : current.sent_at;
  const newMsgId = updates.ethereal_message_id !== undefined ? updates.ethereal_message_id : current.ethereal_message_id;
  const newPreview = updates.ethereal_preview_url !== undefined ? updates.ethereal_preview_url : current.ethereal_preview_url;
  const newErr = updates.last_error !== undefined ? updates.last_error : current.last_error;
  const newAttempts = updates.attempts !== undefined ? updates.attempts : current.attempts;
  const newReschedFrom = updates.rescheduled_from !== undefined ? updates.rescheduled_from : current.rescheduled_from;
  const newSchedAt = updates.scheduled_at !== undefined ? updates.scheduled_at : current.scheduled_at;
  const newJobId = updates.job_id !== undefined ? updates.job_id : current.job_id;

  d.run(`
    UPDATE emails SET
      status = ?,
      sent_at = ?,
      ethereal_message_id = ?,
      ethereal_preview_url = ?,
      last_error = ?,
      attempts = ?,
      rescheduled_from = ?,
      scheduled_at = ?,
      job_id = ?
    WHERE id = ?
  `, [
    newStatus,
    newSentAt,
    newMsgId,
    newPreview,
    newErr,
    newAttempts,
    newReschedFrom,
    newSchedAt,
    newJobId,
    id,
  ]);
  saveDatabase();
}

export async function dbRecordRateLimitEvent(event: Omit<RateLimitEvent, 'id' | 'created_at'>): Promise<string> {
  const d = await getDb();
  const id = `rle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();
  d.run(`
    INSERT INTO rate_limit_events (
      id, sender, hour_window, hour_timestamp, count_attempted,
      limit_value, rescheduled_to, slack_notified, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    event.sender,
    event.hour_window,
    event.hour_timestamp,
    event.count_attempted,
    event.limit_value,
    event.rescheduled_to,
    event.slack_notified ? 1 : 0,
    now,
  ]);
  saveDatabase();
  return id;
}

export async function dbGetRateLimitEvents(limit: number = 30): Promise<RateLimitEvent[]> {
  const d = await getDb();
  const res = d.exec(`SELECT * FROM rate_limit_events ORDER BY created_at DESC LIMIT ${limit}`);
  if (!res[0]) return [];
  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const obj: any = {};
    cols.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj as RateLimitEvent;
  });
}

export async function dbGetSlackConfig(): Promise<SlackConfig> {
  const d = await getDb();
  const res = d.exec('SELECT webhook_url, access_token, channel_name, enabled, last_alert_at FROM slack_config WHERE id = 1');
  if (!res[0] || res[0].values.length === 0) {
    return {
      webhook_url: '',
      access_token: '',
      channel_name: '#email-rate-limit-alerts',
      enabled: true,
      last_alert_at: null,
    };
  }
  const row = res[0].values[0];
  return {
    webhook_url: (row[0] as string) || '',
    access_token: (row[1] as string) || '',
    channel_name: (row[2] as string) || '#email-rate-limit-alerts',
    enabled: Boolean(row[3]),
    last_alert_at: (row[4] as number) || null,
  };
}

export async function dbSaveSlackConfig(config: Partial<SlackConfig>): Promise<SlackConfig> {
  const d = await getDb();
  const current = await dbGetSlackConfig();
  const updated: SlackConfig = { ...current, ...config };
  d.run(`
    INSERT OR REPLACE INTO slack_config (id, webhook_url, access_token, channel_name, enabled, last_alert_at)
    VALUES (1, ?, ?, ?, ?, ?)
  `, [
    updated.webhook_url,
    updated.access_token,
    updated.channel_name,
    updated.enabled ? 1 : 0,
    updated.last_alert_at,
  ]);
  saveDatabase();
  return updated;
}

export async function dbGetSystemSetting(key: string, defaultValue: string): Promise<string> {
  const d = await getDb();
  const res = d.exec('SELECT value FROM system_settings WHERE key = ?', [key]);
  if (!res[0] || res[0].values.length === 0) return defaultValue;
  return String(res[0].values[0][0]);
}

export async function dbSetSystemSetting(key: string, value: string): Promise<void> {
  const d = await getDb();
  d.run('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)', [key, value]);
  saveDatabase();
}

export async function dbGetOverviewStats() {
  const d = await getDb();
  const res = d.exec(`
    SELECT 
      SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled_count,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_count,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
      SUM(CASE WHEN status = 'rescheduled' THEN 1 ELSE 0 END) as rescheduled_count,
      COUNT(*) as total_count
    FROM emails
  `);
  if (!res[0] || !res[0].values[0]) {
    return { scheduled: 0, sent: 0, failed: 0, rescheduled: 0, total: 0 };
  }
  const row = res[0].values[0];
  return {
    scheduled: Number(row[0] || 0),
    sent: Number(row[1] || 0),
    failed: Number(row[2] || 0),
    rescheduled: Number(row[3] || 0),
    total: Number(row[4] || 0),
  };
}
