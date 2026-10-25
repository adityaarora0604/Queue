# Queue (by ReachInbox) — Distributed Email Scheduler

A production-grade, distributed email scheduler service and real-time dashboard built for high-throughput, persistent cold email outreach at scale.

Designed to mirror ReachInbox's core scheduling architecture:
- **Queue & Scheduler:** BullMQ delayed jobs backed by a persistent Redis instance (**0% cron jobs**).
- **Persistent Relational DB:** SQLite relational engine storing campaigns, emails, senders, and rate-limit audit events.
- **SMTP Provider:** Ethereal fake SMTP with live message preview URLs to inspect rendered emails.
- **Search Engine:** Elasticsearch-compatible indexing engine supporting inverted full-text search and query DSL.
- **Rate Limiting & Throttling:** Atomic Redis sliding-window counters per sender, inter-email delay pacing, and automatic postponement without job loss.
- **Slack Alert Integration:** Real-time Block Kit notifications triggered to Slack when a sender hits their hourly quota.
- **Telemetry UI:** Live BullMQ monitoring dashboard and Bull Board UI at `/admin/queues`.

---

## 🏗 Architecture Overview

```
 ┌─────────────────┐       ┌─────────────────┐       ┌────────────────────────┐
 │ React Dashboard │ <───> │ Express Backend │ <───> │ SQLite Relational DB   │
 └─────────────────┘       └────────┬────────┘       └────────────────────────┘
                                    │
                                    ├───> Redis (Atomic Counters & BullMQ)
                                    ├───> BullMQ Delayed Queue & Workers
                                    ├───> Elasticsearch Inverted Index
                                    ├───> Ethereal SMTP Transporter
                                    └───> Slack Rate Limit Webhooks
```

### 1. How Scheduling Works (No Cron)
- When a user schedules an email batch (via API or CSV upload in UI), each recipient is assigned a deterministic execution timestamp `scheduledAt = startTime + (index * interEmailDelay)`.
- A database record is saved in SQLite (`status: 'scheduled'`).
- A BullMQ delayed job is enqueued with `{ delay: Math.max(0, scheduledAt - Date.now()), jobId: 'job_' + emailId }`.
- BullMQ calculates timer offsets internally using Redis sorted sets (`zadd`), firing workers precisely when the target timestamp arrives without needing cron or polling loops.

### 2. How Persistence on Server Restart is Handled
- **Dual Persistence:** Both Redis data (AOF/RDB) and SQLite (`reachinbox.sqlite`) persist to disk.
- **Cold Restart Recovery:** When the backend server boots or restarts, `recoverScheduledJobsOnRestart()` scans SQLite for any emails marked `scheduled` or `rescheduled`. If a job is missing from Redis (e.g. after a hard restart), it re-enqueues it with the correct remaining delay: `Math.max(0, email.scheduled_at - Date.now())`.
- **Idempotency Guard:** Before sending, workers atomically check if the email is already `sent` or `cancelled`. If so, the worker cleanly skips execution, preventing duplicate emails.

### 3. Rate Limiting & Concurrency Architecture
- **Worker Concurrency:** BullMQ worker concurrency is configurable (default: `5`, dynamically adjustable from 1x to 25x in the UI). Multiple workers safely pull from the queue in parallel.
- **Inter-Email Delay (Throttling):** Workers enforce a configurable minimum pacing delay (default: `2000ms` / 2 seconds) between individual sends to prevent provider rate triggers and mimic real-world email deliverability pacing.
- **Sliding-Window Hourly Rate Limiting:**
  - Tracked via Redis atomic keys: `rl:sender:<email>:<hourWindow>` where `hourWindow = Math.floor(timestamp / 3600000)`.
  - Atomically increments counter. If `currentCount > senderLimit`:
    - The counter is reverted.
    - The job is **not dropped or failed**.
    - It is automatically rescheduled into the beginning of the next hour window (`(hourWindow + 1) * 3600000 + 1500`).
    - The email status is updated to `rescheduled`.
    - A rate-limit event is saved in the SQLite audit log.
    - A live Block Kit alert is immediately dispatched to the user's Slack workspace.

---

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18
- Redis server (`redis-server`)

### Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Run backend & frontend together in dev mode
npm run dev

# 3. Access the application
# Dashboard: http://localhost:3000
# BullMQ Board: http://localhost:3000/admin/queues
# Elasticsearch Search: http://localhost:3000/api/es/emails/_search
```

### Environment Variables
Configure in `.env`:
```env
PORT=3000
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
APP_URL=http://localhost:3000
WORKER_CONCURRENCY=5
DELAY_BETWEEN_EMAILS_MS=2000
```

---

## 🧪 Features Implemented

### Backend
- ✅ **BullMQ + Redis Job Queue:** Delayed jobs, retry backoff, worker lifecycle.
- ✅ **No Cron:** Fully driven by BullMQ delayed queues.
- ✅ **Relational SQLite DB:** Persistent disk storage with campaigns, senders, emails, and audit tables.
- ✅ **Server Restart Recovery:** Startup check recovers pending jobs and enforces idempotency.
- ✅ **Configurable Worker Concurrency:** Concurrency level dynamically adjustable (1x-25x).
- ✅ **Inter-Email Delay:** 2-second minimum delay between sends to mimic provider throttling.
- ✅ **Hourly Rate Limiting:** Multi-sender Redis atomic counters with zero-drop auto-rescheduling.
- ✅ **Live Slack Notifications:** Real Block Kit HTTP dispatch on rate limit hit, with test pinging and disconnect/reconnect resilience.
- ✅ **Elasticsearch Indexing:** Inverted index with full-text search, field filtering, BM25-style scoring, and text highlights.
- ✅ **Bull Board:** Express adapter mounted at `/admin/queues`.
- ✅ **Ethereal Fake SMTP:** Dynamic test account creation with generated web preview URLs.

### Frontend
- ✅ **Google Login View:** Single-click authentication displaying user's name, email, avatar, and logout.
- ✅ **Top Bar Contract:** Clean 1-line brand wordmark, single-line tabs, tabular figures, and primary CTA.
- ✅ **Compose Modal:** CSV/text lead parsing, recipient count detection, start time presets, delay and rate-limit controls.
- ✅ **Scheduled Emails Table:** Elasticsearch-powered search, live countdown timer (`in Xm Ys`), Send Now, and Cancel actions.
- ✅ **Sent Emails Table:** Delivery status badges and clickable `View in Ethereal` links to inspect the rendered HTML email in browser.
- ✅ **BullMQ Live Queue Monitor:** Real-time counters (Delayed, Active, Waiting, Completed, Failed), concurrency controls, and restart simulation.
- ✅ **Rate Limits & Slack Panel:** Sender quota progress bars, editable limits, Slack webhook configuration, test ping button, and rate-limit event trail.
- ✅ **Anti-Slop Design:** Zero-pill metadata discipline, dark slate theme, tabular numerals, accessible contrast.

---

## 📝 Assumptions & Trade-offs
1. **SQLite for Relational Database:** Used `sql.js` with disk serialization (`reachinbox.sqlite`) for self-contained relational storage that runs in any environment without requiring external database daemon setup.
2. **Elasticsearch Indexing:** Implemented an in-process Elasticsearch engine providing full inverted indexing, tokenization, highlight snippets, and DSL compatibility (`/api/es/emails/_search`), matching ES behavior without requiring a separate 2GB JVM container.
3. **Rescheduling Window:** When a sender's hourly limit is reached, jobs are postponed to the start of the next hour window + 1.5s jitter to ensure clean window rollover while preserving sequence order.
