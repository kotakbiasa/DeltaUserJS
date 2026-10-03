# DeltaUserJS — Master Feature Implementation Plan

## Overview
Implementasi semua fitur yang disarankan: Subscription System, Web Dashboard, Plugin Marketplace, Audit Log, Backup/Restore, Quick Wins, dan Advanced features.

---

## Phase 1: Foundation & Subscription System (Priority 1)

### 1.1 Database Schema Updates
- [ ] `Subscription` model: plan, status, startDate, endDate, paymentId, gateway, autoRenew
- [ ] `Payment` model: userId, amount, currency, gateway, status, externalId, payload, createdAt
- [ ] `Plan` model: name, price, durationDays, features[], isActive
- [ ] Indexes untuk query cepat (userId+status, endDate)

### 1.2 Payment Gateway Integration
- [ ] Midtrans (Snap/VTWeb) — primary untuk Indonesia
- [ ] Xendit (Virtual Account/E-Wallet/QRIS) — backup
- [ ] QRIS static/dynamic via Midtrans/Xendit
- [ ] Webhook handler: `/webhook/midtrans`, `/webhook/xendit`
- [ ] Idempotency key untuk prevent double charge

### 1.3 Subscription Logic
- [ ] `subscribe(planId, gateway)` → create payment, return checkout URL
- [ ] `activateSubscription(paymentId)` → set user active, set expired_at
- [ ] `renewSubscription(userId)` → extend expired_at
- [ ] `cancelSubscription(userId)` → stop auto-renew, keep active until endDate
- [ ] Grace period (3 hari) sebelum hard-expire
- [ ] Trial period (3 hari gratis) untuk user baru

### 1.4 Bot Commands
- [ ] `.subscribe` — lihat paket, pilih, bayar
- [ ] `.subscription` — status langganan saya
- [ ] `.invoice <id>` — detail tagihan
- [ ] `.renew` — perpanjangan manual
- [ ] `.cancel` — batalkan auto-renew

### 1.5 Owner Commands
- [ ] `.plans` — CRUD paket langganan
- [ ] `.users` — list user + filter status (active/expired/trial)
- [ ] `.revenue` — statistik pendapatan (harian/bulanan)
- [ ] `.broadcast` — kirim pesan ke semua user aktif

---

## Phase 2: Web Dashboard (Priority 2)

### 2.1 Tech Stack
- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Auth: NextAuth.js (Telegram OAuth + Credentials untuk owner)
- API: tRPC atau REST + React Query
- Charts: Recharts / Tremor
- Deploy: Vercel / Docker + Nginx

### 2.2 Pages
- [ ] **Login** — Telegram OAuth (owner only)
- [ ] **Dashboard Overview** — cards: total users, active, expired, revenue, uptime
- [ ] **Users Table** — search, filter, sort, pagination, actions (view, extend, revoke, ban)
- [ ] **User Detail** — profile, subscription history, command usage, logs
- [ ] **Subscriptions** — plans management, revenue chart, payment history
- [ ] **Analytics** — command usage heatmap, error rate, response time, peak hours
- [ ] **System Health** — bot status, MongoDB, userbot connections, health checks
- [ ] **Settings** — bot config, payment gateway keys, notification channels

### 2.3 Real-time
- [ ] WebSocket / SSE untuk live updates (new user, payment, error)
- [ ] Toast notifications

---

## Phase 3: Plugin Marketplace (Priority 3)

### 3.1 Registry
- [ ] `plugins.json` manifest: name, version, description, author, repo, entryPoint, permissions[]
- [ ] GitHub/GitLab webhook untuk auto-update registry
- [ ] Semantic versioning check

### 3.2 Bot Commands
- [ ] `.plugin list` — marketplace plugins
- [ ] `.plugin install <name>[@version]` — clone repo, validate, load
- [ ] `.plugin update <name>` — pull latest, reload
- [ ] `.plugin remove <name>` — unload, delete files
- [ ] `.plugin info <name>` — detail, changelog, permissions

### 3.3 Security
- [ ] Permission system: `fs.read`, `fs.write`, `net.http`, `eval`, `shell`, `db.read`, `db.write`
- [ ] Sandbox: isolate plugin context, deny dangerous globals
- [ ] Code review required untuk permission tinggi
- [ ] Signed plugins (optional future)

---

## Phase 4: Audit Log & Compliance (Priority 4)

### 4.1 Audit Model
- [ ] `AuditLog`: userId, actorId, action, resource, before, after, ip, userAgent, timestamp
- [ ] Indexes: userId+timestamp, action+timestamp

### 4.2 Tracked Actions
- [ ] Auth: login, logout, session create/revoke
- [ ] Subscription: create, renew, cancel, expire
- [ ] Admin: ban, kick, mute, promote, config change
- [ ] Plugin: install, update, remove, permission change
- [ ] Payment: success, failed, refund, chargeback
- [ ] System: backup, restore, deploy, restart

### 4.3 Commands
- [ ] `.audit <userId> [limit]` — riwayat user
- [ ] `.audit-action <action> [date]` — filter by action
- [ ] `.export-audit <start> <end>` — export CSV/JSON (owner only)

---

## Phase 5: Backup/Restore (Priority 5)

### 5.1 Backup
- [ ] `mongodump` ke GDrive (rclone) / S3 (AWS/MinIO) / local
- [ ] Schedule: harian jam 03:00, retensi 30 hari
- [ ] Compress + encrypt (AES-256, key dari ENCRYPTION_KEY)
- [ ] Verify checksum setelah upload

### 5.2 Restore
- [ ] `.backup list` — daftar backup tersedia
- [ ] `.backup restore <timestamp>` — stop bot, restore, restart
- [ ] Point-in-time recovery (oplog replay) — advanced

### 5.3 Monitoring
- [ ] Alert jika backup gagal > 2x berturut
- [ ] Health check endpoint include last backup time

---

## Phase 6: Quick Wins (Parallel - Low Effort)

| Task | File | Est. |
|---|---|---|
| `.stats` tambah metrics | `stats.ts` | 15m |
| `.ping` latency breakdown | `ping.ts` | 10m |
| `.sysinfo` disk I/O, net RX/TX | `sysinfo.ts` | 15m |
| Help fuzzy search | `help.ts` + `inlineHelp.ts` | 30m |
| Command cooldown visual | `bot/index.ts` rate limiter | 20m |
| Response time header | `bot/index.ts` middleware | 10m |

---

## Phase 7: Advanced (Future)

- [ ] Cluster/Sharding (Redis pub/sub)
- [ ] Plugin Sandbox (Worker/VM isolation)
- [ ] AI Integration (`.ai <prompt>`)
- [ ] Voice/Video Call (GramJS call API)
- [ ] Story/Status Viewer

---

## Implementation Order

```
Week 1: Phase 1 (Subscription) + Phase 6 (Quick Wins)
Week 2: Phase 2 (Dashboard) - parallel frontend/backend
Week 3: Phase 3 (Plugin Marketplace)
Week 4: Phase 4 (Audit Log) + Phase 5 (Backup/Restore)
Week 5: Testing, bug fixes, documentation, deploy
```

---

## Breaking Changes & Migration

| Area | Change | Migration |
|---|---|---|
| Database | New collections | Auto-create on startup |
| Config | Payment keys | `.env.example` update |
| Bot | New commands | Auto-register |
| Userbot | No breaking changes | - |

---

## Success Metrics

- [ ] Subscription flow end-to-end < 2 menit
- [ ] Dashboard load < 2s (p95)
- [ ] Plugin install < 10s
- [ ] Backup/restore tested monthly
- [ ] 99.9% uptime SLA
- [ ] Zero data loss on restore test

---

## Notes

- Semua fitur harus **testable** (unit + e2e)
- **Feature flag** untuk rollout bertahap
- **Rollback plan** untuk setiap deploy
- Documentation update di setiap PR