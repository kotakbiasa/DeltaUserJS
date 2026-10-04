# DeltaUserJS — AI Agent Guide

**Stack:** TypeScript 6.0, Node.js ≥18, grammy 1.46, mtcute 0.32, MongoDB 9.9, PM2  
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
npm test                 # unit tests + test/runner.js E2E suite
```

## Conventions

- **Master bot** uses grammy; **userbots** use mtcute (`@mtcute/node` + `@mtcute/dispatcher`)
- **Conversation patterns:** Use `@grammyjs/conversations` for multi-step flows (login, subscription)
- **Menu system:** Inline keyboards are plain `reply_markup` objects built by
  `src/bot/ui/keyboards/dashboard/keyboardParts/*.ts` and routed through the
  `rich:<action>` callback pattern — do NOT add `@grammyjs/menu`
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
| `@mtcute/node` | MTProto client for userbots |
| `@mtcute/dispatcher` | Update dispatching for userbot handlers |
| `@mtcute/convert` | Legacy GramJS session → mtcute conversion |
| `@grammyjs/conversations` | Multi-step conversation flows |
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

The canonical current structure, runtime flow, and plugin-loading rules are in
[`docs/architecture.md`](docs/architecture.md). The short version is:

```
src/
├── bot/              # Master bot: conversations, handlers, UI, state
├── userbot/          # mtcute engine and dynamically loaded handlers
├── server/           # Mini App API, route groups, and static files
├── services/         # Cross-layer business logic
├── infrastructure/  # MongoDB/file persistence, models, and cache
├── utils/            # Shared utilities
└── index.ts          # Startup, lifecycle, and health server
```

- **Master bot** runs in polling mode and manages user sessions.
- **Userbot manager** spawns isolated mtcute clients per user.
- **Plugin loader** recursively loads every handler file; do not remove a plugin
  based only on the absence of static imports.
- **Expiration/approval services** run in the background and control active bots.

## Error Handling

- Missing `BOT_TOKEN` → exit(1) immediately
- mtcute client crashes → auto-reconnect with exponential backoff (max 3 retries)
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
