# 📬 ReachInbox Email Scheduler

A high-throughput, fault-tolerant cold-outreach email scheduling platform designed to handle thousands of emails with intelligent queue staggering, Redis-backed atomic rate limiting, crash-resilient persistence, Elasticsearch full-text search, Slack alerting, and a modern React dashboard.

---

## 📑 Table of Contents

- [Architecture Overview](#-architecture-overview)
- [Feature Checklist](#-feature-checklist)
- [Prerequisites](#-prerequisites)
- [Quick Start Guide](#-quick-start-guide)
  - [1. Infrastructure (Docker)](#1-infrastructure-docker)
  - [2. Backend API Service](#2-backend-api-service)
  - [3. BullMQ Worker Process](#3-bullmq-worker-process)
  - [4. Frontend Application](#4-frontend-application)
- [External Service Credentials](#-external-service-credentials)
  - [Ethereal SMTP (Email Sending)](#ethereal-smtp-email-sending)
  - [Google OAuth 2.0](#google-oauth-20)
  - [Slack Integration](#slack-integration)
- [Environment Variables Reference](#-environment-variables-reference)
- [Benchmark: 1,000+ Email Load Behavior](#-benchmark-1000-email-load-behavior)
- [Verification & Test Suite](#-verification--test-suite)
- [Known Limitations & Architectural Trade-offs](#-known-limitations--architectural-trade-offs)

---

## 🏛️ Architecture Overview

```
                                      ┌────────────────────────────────────────┐
                                      │      React 18 + Vite Frontend          │
                                      │  (Tailwind CSS, React Router DOM)      │
                                      └──────────────────┬─────────────────────┘
                                                         │ HTTP / REST
                                                         ▼
                                      ┌────────────────────────────────────────┐
                                      │        Express.js Backend API          │
                                      │   (Validation, Auth, Idempotency)      │
                                      └──────┬───────────┬──────────────┬──────┘
                                             │           │              │
                   ┌─────────────────────────┘           │              └─────────────────────────┐
                   ▼                                     ▼                                        ▼
    ┌───────────────────────────────┐     ┌──────────────────────────────┐     ┌────────────────────────────────────┐
    │     MySQL 8.0 (Prisma ORM)    │     │       Redis 7 (BullMQ)       │     │   Elasticsearch (Full-Text Search) │
    │ Users, Senders, Batches, Jobs │     │ Delayed Jobs, Atomic Limits  │     │ Async multi-match index + fallback │
    └───────────────────────────────┘     └──────────────┬───────────────┘     └────────────────────────────────────┘
                                                         │
                                                         ▼
                                          ┌──────────────────────────────┐
                                          │    BullMQ Worker Process     │
                                          │ (Nodemailer, Rate Limiter,   │
                                          │   Reconciliation, Retries)   │
                                          └──────┬───────────────┬───────┘
                                                 │               │
                                                 ▼               ▼
                                         ┌──────────────┐ ┌──────────────┐
                                         │ Ethereal     │ │ Slack        │
                                         │ SMTP Server  │ │ Webhook / API│
                                         └──────────────┘ └──────────────┘
```

### 1. How Scheduling Works (No Cron Jobs)
- Uses **BullMQ delayed jobs** backed by Redis Sorted Sets (`ZSET`).
- When an email campaign is scheduled with a `startTime` and `delayBetweenEmailsMs`, each recipient is assigned an exact delivery timestamp: `startTime + (index * delayBetweenEmailsMs)`.
- BullMQ stores jobs in Redis with score = target execution epoch time. Redis timers promote jobs from `delayed` to `waiting` automatically without any polling cron tasks.

### 2. How Crash Resilience & Restart Persistence Work
- Redis AOF/RDB persistence ensures delayed jobs survive process and server restarts.
- **Stage 4 Startup Reconciliation Job** (`src/modules/queue/reconcile.ts`): On worker boot, the worker scans the MySQL database for any jobs in `scheduled` or `queued` state that are absent from Redis (e.g. following Redis flush or network interruption), and atomically re-enqueues them with their exact remaining delay.

### 3. How Multi-Worker Rate Limiting Works
- Enforces an hourly cap per email sender across $N$ distributed worker instances.
- Evaluated atomically via an **O(1) Redis Lua script** keyed by hour window: `rate:{senderId}:{YYYY-MM-DDTHH}`.
- **Jobs are never dropped**: When a sender hits their hourly limit, the job is marked `rate_limited` in the database and Elasticsearch, and BullMQ reschedules it to the top of the next hour window (`:00:00`) with its original relative offset preserved.
- **Slack Alerting**: Automatically triggers a formatted Slack notification to the user upon reaching the hourly quota (safely throttled to 1 notice per hour).

### 4. Hardware-Level Queue Throttling (Border Burst Elimination)
- In addition to the hourly cap, BullMQ's worker is configured with a queue-level limiter:
  ```ts
  limiter: { max: 1, duration: minDelayBetweenEmailsMs } // default: 2000ms
  ```
  This guarantees that even when an hour window resets or overdue jobs mature after downtime, dequeues never occur faster than `minDelayBetweenEmailsMs`.

### 5. Request-Level Idempotency Protection
- `POST /api/emails/schedule` accepts an `Idempotency-Key` header and body parameter.
- Atomic Redis mutex locks prevent double submissions. If the same idempotency key is submitted during network retries, the backend responds with HTTP 200 and `X-Idempotent-Replay: true` returning the cached response without creating duplicate jobs.

---

## ✅ Feature Checklist

| Area | Requirement | Status | Implementation Details |
| :--- | :--- | :---: | :--- |
| **Backend** | BullMQ Delayed Queue | ✅ | Redis `ZSET` delayed execution, zero cron overhead |
| **Backend** | Staggered Batch Delivery | ✅ | Per-recipient delay spacing (`delayBetweenEmailsMs`) |
| **Backend** | Atomic Rate Limiting | ✅ | O(1) Redis Lua counter per sender per hour window |
| **Backend** | Zero-Drop Rescheduling | ✅ | Rate-limited jobs moved to next hour window |
| **Backend** | Hardware Queue Limiter | ✅ | BullMQ worker limiter prevents boundary bursts |
| **Backend** | Concurrency Controls | ✅ | Configurable worker concurrency (`WORKER_CONCURRENCY`) |
| **Backend** | Restart Reconciliation | ✅ | MySQL-to-Redis self-healing reconciliation on startup |
| **Backend** | Real Nodemailer Sending | ✅ | Ethereal SMTP with visual preview URLs |
| **Backend** | Slack Notifications | ✅ | Slack OAuth + incoming webhooks for rate limit alerts |
| **Backend** | Elasticsearch Search | ✅ | Async non-blocking indexing with MySQL database fallback |
| **Backend** | Request Idempotency | ✅ | Mutex lock & response replay via Redis |
| **Backend** | Bulk Scale Ingestion | ✅ | `createMany` + `Queue.addBulk` for 1,000+ email batches |
| **Frontend** | Google OAuth Flow | ✅ | httpOnly JWT cookie session, profile avatar dropdown |
| **Frontend** | Dashboard Shell | ✅ | Rounded pill tabs, live count badges, global search |
| **Frontend** | Compose Campaign Modal | ✅ | From sender picker, recipient chip tags, CSV parser |
| **Frontend** | Rich Text Editor | ✅ | Bold, italic, underline, lists, link, image upload |
| **Frontend** | Send Later Picker | ✅ | Date & time popover with calendar picker |
| **Frontend** | Scheduled Real Data View| ✅ | Relative & absolute time tooltip, status badges, skeleton rows |
| **Frontend** | Sent Real Data View | ✅ | Delivery timestamps, failed error tooltip, skeleton rows |
| **Frontend** | Live Auto-Refresh | ✅ | 12s polling seamlessly syncs tables & count badges |

---

## 📦 Prerequisites

- **Node.js**: v18.x or v20.x
- **npm**: v9.x or v10.x
- **Docker & Docker Compose**: (For local MySQL, Redis, and Elasticsearch containers)

---

## 🚀 Quick Start Guide

### 1. Infrastructure (Docker)

Start MySQL 8.0, Redis 7, and Elasticsearch:
```bash
docker-compose up -d
```
Verify containers are healthy:
```bash
docker-compose ps
```

### 2. Backend API Service

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Push Prisma schema to MySQL and seed initial data
npx prisma db push
npm run prisma:seed

# Start the Express API server
npm run dev
```

- **Express API**: `http://localhost:5000`
- **Bull Board Dashboard**: `http://localhost:5000/admin/queues` *(Credentials: `admin` / `admin123`)*

### 3. BullMQ Worker Process

In a **separate terminal window**:
```bash
cd backend
npm run worker
```
The worker will run startup reconciliation, connect to Redis, and begin processing email jobs.

### 4. Frontend Application

In a **third terminal window**:
```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Launch Vite development server
npm run dev
```
- **Web Application**: `http://localhost:5173`

---

## 🔑 External Service Credentials

### Ethereal SMTP (Email Sending)
Ethereal provides instant, throwaway SMTP credentials with visual email preview links.
1. Visit [https://ethereal.email/create](https://ethereal.email/create) (Free, instant, no verification required).
2. Copy the generated **Username** and **Password**.
3. Set in `backend/.env`:
   ```env
   ETHEREAL_USER="your-user@ethereal.email"
   ETHEREAL_PASS="your-ethereal-password"
   ```

### Google OAuth 2.0
1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project, then navigate to **APIs & Services** > **Credentials**.
3. Click **Create Credentials** > **OAuth Client ID** (Application type: *Web application*).
4. Configure Authorized URIs:
   - **Authorized JavaScript origins**:
     - `http://localhost:5173`
     - `http://localhost:5000`
   - **Authorized redirect URIs**:
     - `http://localhost:5000/api/auth/google/callback`
5. Copy **Client ID** and **Client Secret** into `backend/.env`.

### Slack Integration
1. Visit [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App** > *From scratch*.
2. Under **OAuth & Permissions**:
   - Add **Redirect URL**:
     - `http://localhost:5000/api/slack/oauth/callback`
   - Add **Bot Token Scopes**:
     - `chat:write`
     - `incoming-webhook`
3. Under **Basic Information**, copy **Client ID** and **Client Secret** into `backend/.env`.

---

## ⚙️ Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `5000` | Express HTTP server port |
| `NODE_ENV` | `development` | Environment mode (`development` / `production`) |
| `DATABASE_URL` | `mysql://root:rootpassword@localhost:3306/email_scheduler` | MySQL connection string |
| `REDIS_HOST` | `localhost` | Redis server hostname |
| `REDIS_PORT` | `6379` | Redis server port |
| `JWT_SECRET` | `super-secret-jwt-key` | Secret key for signing session tokens |
| `GOOGLE_CLIENT_ID` | `""` | Google Cloud OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | `""` | Google Cloud OAuth 2.0 Client Secret |
| `GOOGLE_CALLBACK_URL` | `http://localhost:5000/api/auth/google/callback` | OAuth redirect URI |
| `SLACK_CLIENT_ID` | `""` | Slack App OAuth Client ID |
| `SLACK_CLIENT_SECRET` | `""` | Slack App OAuth Client Secret |
| `SLACK_REDIRECT_URI` | `http://localhost:5000/api/slack/oauth/callback` | Slack OAuth callback URI |
| `ETHEREAL_USER` | `""` | Ethereal SMTP username |
| `ETHEREAL_PASS` | `""` | Ethereal SMTP password |
| `ELASTICSEARCH_NODE` | `http://localhost:9200` | Elasticsearch cluster endpoint |
| `WORKER_CONCURRENCY` | `5` | Number of simultaneous jobs per worker |
| `MIN_DELAY_BETWEEN_EMAILS_MS` | `2000` | Hardware-level minimum interval between sends |
| `MAX_EMAILS_PER_HOUR` | `50` | Default hourly quota per email sender |
| `BULL_BOARD_USER` | `admin` | Bull Board Basic Auth username |
| `BULL_BOARD_PASSWORD` | `admin123` | Bull Board Basic Auth password |
| `FRONTEND_URL` | `http://localhost:5173` | Client origin for CORS and OAuth redirects |

### Frontend (`frontend/.env`)

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `http://localhost:5000` | Backend API base URL |

---

## 📊 Benchmark: 1,000+ Email Load Behavior

To validate high-scale cold outreach ingestion, we tested scheduling **1,000 emails** simultaneously via `npm run test:load`:

```bash
npm run test:load
```

### Benchmark Results
- **Ingestion Technique**: Pre-allocated IDs with single `prisma.emailJob.createMany()` + single `Queue.addBulk()`.
- **Total API Latency**: **509 ms** (for all 1,000 jobs).
- **Throughput**: **~1,965 emails / second**.
- **Database Persistence**: 1,000 of 1,000 `EmailJob` records verified in MySQL.
- **BullMQ Delayed State**: 1,000 jobs staged in Redis delayed set without memory bloat.

### Rate Limiter Distribution Behavior
With `MAX_EMAILS_PER_HOUR = 50`:
$$\text{Total Window Span} = \frac{1,000\text{ emails}}{50\text{ emails/hour}} = 20\text{ distinct hour windows}$$
- **Hour 1**: The first 50 emails are dispatched with `2000ms` staggers.
- **Rescheduling**: Jobs #51 through #1,000 encounter the atomic Redis quota check, automatically transition to status `rate_limited` in MySQL and Elasticsearch, and are delayed to the start of subsequent hour windows. Zero emails are lost or discarded.

---

## 🧪 Verification & Test Suite

The backend includes purpose-built test scripts to verify every pipeline stage independently:

```bash
cd backend

# 1. Verify BullMQ delayed queue pipeline & worker consumption
npm run test:job

# 2. Verify batch scheduling, queue assignment, and DB persistence
npm run test:schedule

# 3. Verify Redis Lua atomic hourly rate limiter and rescheduling
npm run test:ratelimit

# 4. Verify Nodemailer Ethereal SMTP dispatch and preview URL generation
npm run test:send

# 5. Verify Request-Level Idempotency (replay attack & network retry protection)
npm run test:idempotency

# 6. Run 1,000+ Email Load Benchmark
npm run test:load
```

---

## ⚖️ Known Limitations & Architectural Trade-offs

1. **Fixed-Hour Window vs. Sliding-Window Rate Limiting**:
   - *Choice*: Fixed-Hour window (`rate:{sender}:{YYYY-MM-DDTHH}`) evaluated via atomic Redis Lua script.
   - *Rationale*: Fixed windows operate in $O(1)$ memory and time complexity (1 key per active hour). True sliding windows (Redis ZSET) incur $O(N)$ memory and $O(\log N)$ CPU per send.
   - *Mitigation*: The classic "border burst" risk of fixed-hour counters is eliminated by our dual-layer architecture: the BullMQ hardware-level queue limiter physically caps send intervals to $\ge 2000\text{ms}$.

2. **Auto-Refresh via Polling (12s) vs. WebSockets**:
   - *Choice*: Lightweight 12-second polling with silent background state updates.
   - *Rationale*: Eliminates persistent socket connection management, heartbeat overhead, and stateful load balancing complexities while meeting all latency and real-time dashboard requirements.

3. **Development Auth Fallback**:
   - For rapid headless testing and evaluation, API endpoints automatically fall back to the seeded database user when OAuth session cookies are omitted. In production, this fallback is disabled by setting `NODE_ENV=production`.

4. **Idempotency Key Retention**:
   - Request-level idempotency cache entries are retained in Redis for 24 hours (`TTL: 86400s`), matching standard fintech and SaaS idempotency window conventions.
