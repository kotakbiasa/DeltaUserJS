# DeltaUserJS Architecture

Multi-userbot manager with clean separation between Master Bot (admin control) and Userbot instances (automation).

## High-Level Overview

```
┌──────────────────────────────────────────────────────────────┐
│                         User / Admin                          │
└───────────────┬──────────────────────────────────────────────┘
                │
        ┌───────▼──────┐
        │  Master Bot  │ (grammY)
        │  Dashboard   │
        └───┬──────────┘
            │
    ┌───────▼────────────────────────────┐
    │   Userbot Manager                  │
    │   - Session registry               │
    │   - Plugin loader                  │
    │   - Expiration checker             │
    │   - Auto-reconnect watchdog        │
    └───┬────────────────────────────────┘
        │
        ├────────► Userbot Instance 1 (teleproto/GramJS)
        ├────────► Userbot Instance 2
        └────────► Userbot Instance N
```

## Two-Layer Design

### Layer 1: Master Bot (`src/bot/`)
- **Framework**: grammY (Bot API)
- **Purpose**: Admin control panel, user onboarding, userbot lifecycle management
- **Auth**: Owner-only commands (via `OWNER_ID` in `.env`)
- **Handlers**:
  - `admin/` — ban/kick/mute, broadcast, eval
  - `core/` — help, filters, anti-PM
  - `group/` — warns, locks, notes, federation, captcha, anti-spam
  - `user/` — guest mode, settings, downloader (`/dl`)
- **No direct message handling**: Master Bot is the control interface, not a userbot

### Layer 2: Userbots (`src/userbot/`)
- **Framework**: teleproto (MTProto, full Telegram client API)
- **Purpose**: Automation, auto-moderation, custom commands, passive monitoring
- **Auth**: Each userbot logs in with phone number + session string
- **Plugin system**: `src/userbot/handlers/` loaded dynamically
  - `admin/` — gcast, approve, blacklist
  - `group/` — AFK, locks (URL detector), notes, warn, zombie cleanup
  - `system/` — ping, stats, sysinfo, speedtest, exec
  - `tools/` — kang sticker, carbon, quote, sangmata, TikTok DL
  - `user/` — anilist, anti-PM
  - `util/` — adzan, help, ID, info, schedule, stalk
- **Lifecycle**: managed by `userbotManager` (auto-start on boot, reconnect on disconnect)

## Directory Structure

```
src/
├── index.ts                # Entry point: starts Master Bot + userbotManager
├── config.ts               # Centralized config (env vars, defaults)
│
├── bot/                    # Master Bot (grammY)
│   ├── index.ts            # Bot setup + middleware
│   ├── handlers/           # Command handlers (admin, core, group, user)
│   └── keyboards/          # Inline menus (dashboard, settings)
│
├── userbot/                # Userbot layer
│   ├── engine/
│   │   ├── manager.ts      # Userbot lifecycle manager
│   │   ├── client.ts       # teleproto client wrapper
│   │   ├── pluginLoader.ts # Load handlers from /handlers
│   │   └── pluginRegistry.ts
│   └── handlers/           # Userbot plugins (admin, group, system, tools, user, util)
│
├── domain/
│   ├── models/             # Mongoose schemas (Userbot, GroupConfig, Federation, SystemConfig)
│   └── services/           # Business logic services
│       ├── downloader/     # Media download services (YouTube, Instagram, TikTok, Twitter, yt-dlp)
│       ├── UserbotService.ts
│       ├── GroupService.ts
│       ├── WarnService.ts
│       ├── FederationService.ts
│       └── ...
│
├── infrastructure/
│   ├── database.ts         # Public API barrel (re-exports dbCore + services)
│   └── dbCore.ts           # Low-level data access (MongoDB + file fallback + in-memory cache)
│
└── utils/
    ├── logger.ts           # Colored ANSI logger
    ├── richMessage.ts      # Rich HTML formatting helpers
    ├── richParser.ts       # Parse text to HTML entities
    └── permissions.ts      # isAdmin(), isOwner(), isGroupAdmin(), adminOnly(), ownerOnly()
```

## Data Flow Examples

### Example 1: User sends `/ban` in a group

```
User → Telegram → Master Bot (grammY)
                    ↓
        bot/handlers/admin/admin_bot.ts
                    ↓
        Check: isAdmin(ctx) → true?
                    ↓
        ctx.banChatMember(targetId)
                    ↓
        Reply: "✅ User banned"
```

### Example 2: Userbot auto-detects URL in locked group

```
User sends message with URL → Telegram → Userbot (teleproto)
                                          ↓
                        userbot/handlers/group/locks.ts
                                          ↓
                        Check group config: locks.url === 1?
                                          ↓
                        Delete message + warn user
```

### Example 3: Admin requests YouTube download via Master Bot

```
User: /dl https://youtube.com/watch?v=xxx
                    ↓
        bot/handlers/user/dl.ts
                    ↓
        domain/services/downloader/index.ts
                    ↓
        YouTubeService (Deline API + ffmpeg merge)
                    ↓
        Reply with 720p MP4 file
```

## Database Layer

- **MongoDB** (primary, via `MONGO_URI`):
  - Persistent storage for userbots, group configs, federations, warnings, reputation
  - Mongoose models in `domain/models/`
- **File fallback** (`database.json`):
  - Used when MongoDB unavailable
  - Synced to disk on every write
- **In-memory cache**:
  - `dbCache` (userbot sessions), `groupConfigCache`, `fedCache`, `systemConfigCache`
  - Speeds up reads, avoids DB round-trips

## Key Design Decisions

1. **Two-layer separation**: Master Bot (control plane) vs Userbots (data plane)
   - Prevents single point of failure
   - Master Bot can manage multiple userbots
   - Each userbot is isolated (separate session, plugin registry)

2. **Plugin architecture for userbots**:
   - Dynamic loading from `userbot/handlers/`
   - Each plugin exports: `{ name, version, description, help?, execute() }`
   - Allows enable/disable per-userbot without code changes

3. **Hybrid database**:
   - MongoDB for production (scalable, concurrent writes)
   - File fallback for dev/testing (no external dependency)
   - Cache layer for performance (read-heavy workloads)

4. **Shared downloader services**:
   - `domain/services/downloader/` used by both Master Bot (`/dl`) and Userbot plugins (`tiktokdl.ts`)
   - YouTube service: Deline API (fast) + ffmpeg merge (720p) + yt-dlp fallback
   - Streaming downloads (no memory buffering) with redirect handling

5. **Centralized permissions**:
   - `utils/permissions.ts` consolidates admin checks
   - `isOwner()` = bot owner (from `.env`)
   - `isAdmin()` = group admin (creator/administrator status)
   - `isGroupAdmin(ctx, userId)` = check specific user's group admin status
   - Eliminates 10+ duplicate implementations across handlers

## Configuration

### Environment Variables (`.env`)
```bash
# Master Bot
BOT_TOKEN=your_bot_token_here

# Telegram API credentials (for userbots)
API_ID=123456
API_HASH=abcdef1234567890

# Owner (full access to admin commands)
OWNER_ID=123456789

# Logging (optional)
LOG_GROUP_ID=-1001234567890
LOG_TOPIC_ID=12345

# Database (optional, falls back to database.json)
MONGO_URI=mongodb://localhost:27017
DB_NAME=DeltaUbotJS
```

### Deployment

**Development**:
```bash
npm run dev    # tsx watch (hot reload)
```

**Production**:
```bash
npm run build  # TypeScript → dist/
npm start      # node dist/index.js
```

**Docker**:
```bash
docker compose up -d
```

## Extension Points

### Adding a new Master Bot command
1. Create handler in `src/bot/handlers/<category>/<name>.ts`
2. Register in `src/bot/handlers/index.ts` via `bot.command(...)` or middleware
3. Use `utils/permissions.ts` for access control
4. Use `utils/richMessage.ts` for formatted replies

### Adding a new Userbot plugin
1. Create plugin in `src/userbot/handlers/<category>/<name>.ts`
2. Export: `{ name, version, description, help?, execute(client, message, settings, telegramId) }`
3. Plugin auto-loaded by `pluginLoader.ts` on userbot start
4. Use `domain/services/` for business logic (DB access, external APIs)

### Adding a new downloader service
1. Create service in `src/domain/services/downloader/<platform>.ts`
2. Implement `MediaService` interface: `supports(url)`, `getMetadata(url)`, `download(url, id)`
3. Register in `downloader/index.ts` (before `YtDlpService` fallback)
4. Use `fetchToFile()` from `base.ts` for streaming downloads

## Testing

```bash
npm test       # runs test/runner.js (E2E tests with mock GramJS)
```

Mock environment available in `test/` for simulating Telegram events without hitting API.

## Security Considerations

- **Owner-only commands**: Critical actions (eval, broadcast, ban) gated by `isOwner()` or `adminOnly()` middleware
- **Rate limiting**: grammY rate limiter enabled by default (see `bot/index.ts`)
- **Input sanitization**: Use `richMessage.ts` helpers to escape HTML entities
- **Session security**: Userbot session strings stored in MongoDB (encrypted at rest if using Atlas)
- **No plaintext credentials**: `.env` file gitignored, Docker secrets supported

## Monitoring & Logging

- **Colored console logs**: `utils/logger.ts` provides timestamped ANSI output
- **Expiration checker**: Runs every 60s, auto-stops expired userbots
- **Reconnect watchdog**: Auto-reconnects disconnected userbots (exponential backoff)
- **Log group**: Set `LOG_GROUP_ID` + `LOG_TOPIC_ID` to forward critical events to Telegram

## Performance Notes

- **In-memory caching**: Userbot sessions, group configs, federations cached after first load
- **Parallel downloads**: `fetchAllToFiles()` fetches multiple media URLs concurrently
- **Streaming downloads**: No memory buffering for large files (YouTube, Instagram carousels)
- **MongoDB connection pooling**: Mongoose default pool size is 5 (configurable)

## Roadmap

- [ ] TypeScript strict mode (currently `strict: false`)
- [ ] Web dashboard (alternative to Telegram Master Bot)
- [ ] Plugin marketplace (install community plugins via command)
- [ ] Multi-language support (i18n for bot replies)
- [ ] Metrics & analytics (command usage, uptime, error rates)
