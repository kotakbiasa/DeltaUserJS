# DeltaUserJS — AI Agent Guide

**Stack:** TypeScript 6.0, Node.js ≥18, grammy 1.44, teleproto 1.227, GramJS, MongoDB 9.7, PM2  
**Package Manager:** npm (package-lock.json locked)

## Commands

```bash
npm install              # install deps
npm run dev              # dev with tsx watch (hot reload)
npm run build            # rm -rf dist && tsc
npm run start            # production: node --no-warnings dist/index.js
pm2 start dist/index.js --name deltauserjs
pm2 save && pm2 startup  # persist across reboots
npm run lint             # eslint src/ --ext .ts
npm run lint:fix         # eslint --fix
npm run format           # prettier --write src/
npm run test             # node test/runner.js
```

## Conventions

- **Master bot** uses grammy; **userbots** use GramJS via `teleproto` bridge
- **Conversation patterns:** Use `@grammyjs/conversations` for multi-step flows (login, subscription)
- **Menu system:** Use `@grammyjs/menu` for inline keyboards — never raw `reply_markup`
- **Rate limiting:** `@grammyjs/ratelimiter` middleware on all user-facing handlers
- **Error logging:** Structured log format with ANSI timestamps — `[SYSTEM]`, `[SUCCESS]`, `[WARN]`, `[ERROR]`
- **Database:** Mongoose schemas in `infrastructure/database.js`, connection pooled

## Boundaries

- **NEVER** commit `.env` or real MongoDB URIs — use `mongodb+srv://user:***@cluster/` placeholder
- **NEVER** modify `.agents/` directory (auto-generated agent context)
- **NEVER** bypass the expiration checker — subscription expiry runs every 60s in background
- **NEVER** store raw Telegram session strings unencrypted — use `ENCRYPTION_KEY`
- **ALWAYS** validate user ownership before allowing userbot control

## Dependencies

| Package | Purpose |
|---------|---------|
| `grammy` | Master bot framework |
| `teleproto` | GramJS ↔ grammy protocol bridge for userbots |
| `@grammyjs/conversations` | Multi-step conversation flows |
| `@grammyjs/menu` | Inline keyboard menu builder |
| `@grammyjs/ratelimiter` | Per-user rate limiting |
| `mongoose` | MongoDB ODM |
| `qrcode` | QR code generation for userbot auth |
| `jimp` | Image processing (avatar, thumbnails) |
| `speedtest-net` | Network diagnostics for userbot health |
| `dotenv` | Environment config |

## Config

Required env vars (see `.env.example`):

| Var | Description |
|-----|-------------|
| `BOT_TOKEN` | Master bot token from @BotFather |
| `OWNER_ID` | Telegram user ID of bot owner |
| `LOG_GROUP_ID` | Channel/group for system logs |
| `LOG_TOPIC_ID` | Topic ID in forum-style log group |
| `MONGO_URI` | MongoDB connection string (atlas or self-hosted) |
| `MUSLIM_SALAT_API_KEY` | API key for prayer times feature |
| `ENCRYPTION_KEY` | 32-byte key for session encryption (auto-generated if omitted) |

## Architecture

```
src/
├── bot/           # Master bot (grammy) — handlers, menus, conversations
├── userbot/       # Userbot engine (GramJS + teleproto) — session mgmt, client lifecycle
├── infrastructure/ # Database (Mongoose), caching, encryption
└── config.js      # Environment validation, defaults
```

- **Master bot** runs in polling mode, manages user sessions via MongoDB
- **Userbot manager** spawns isolated GramJS clients per user, bridges updates to grammy via teleproto
- **Expiration checker** runs every 60s — marks expired userbots inactive, notifies users

## Error Handling

- Missing `BOT_TOKEN` → exit(1) immediately
- GramJS client crashes → auto-reconnect with exponential backoff (max 3 retries)
- MongoDB connection failures → retry every 5s, log to `LOG_GROUP_ID`
- Userbot session invalid → mark inactive, notify user, offer re-auth flow
- All unhandled errors caught at top-level with structured logging

## Troubleshooting

1. **"Session string invalid"** → User's Telegram session expired; trigger re-auth via `/login` command
2. **MongoDB connection timeout** → Verify `MONGO_URI` network accessibility, check Atlas IP whitelist
3. **PM2 process exits with code 1** → Check logs: usually missing env var or MongoDB unreachable
4. **Userbot stuck in "connecting"** → Network issue or Telegram DC ban; run speedtest, rotate proxy
5. **Conversation timeout / stuck** → `@grammyjs/conversations` has a 5-minute default timeout; check `CONVERSATION_TIMEOUT` env or implement custom timeout handler
6. **Rate limit errors (429)** → `@grammyjs/ratelimiter` is active; reduce request frequency or increase `interval` config
