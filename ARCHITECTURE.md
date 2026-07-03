# DeltaUserJS - Struktur Project

## 📂 Struktur Folder

```
src/
├── bot/                          # Master Bot (grammY)
│   ├── handlers/                 # Handler Master Bot
│   │   ├── admin/               # Owner commands
│   │   │   └── admin.ts         # Panel admin, user management
│   │   ├── core/                # Core handlers
│   │   │   ├── callbacks.ts     # Dashboard callbacks
│   │   │   └── conversations.ts # Registration OTP/QR, custom name
│   │   └── index.ts             # Registry semua handlers
│   ├── keyboards/               # UI Components
│   │   └── dashboard.ts         # Dashboard panel + keyboards
│   ├── middlewares/             # Bot middlewares
│   └── index.ts                 # Master Bot initialization
│
├── userbot/                      # Userbot Engine (GramJS/teleproto)
│   ├── engine/                  # Core userbot engine
│   │   ├── client.ts            # UserbotClient wrapper
│   │   ├── manager.ts           # UserbotManager + watchdog
│   │   ├── pluginLoader.ts      # Dynamic plugin loader
│   │   └── pluginRegistry.ts    # Plugin registry
│   ├── handlers/                # Userbot command handlers
│   │   ├── admin/               # Admin commands (gcast, blacklist, approve)
│   │   ├── system/              # System commands (ping, stats, exec)
│   │   ├── tools/               # Tools (quote, sangmata, carbon, kang)
│   │   └── util/                # Utilities (adzan, stalk, info, id, help)
│   └── middlewares/             # Userbot middlewares
│
├── services/                     # Business logic services
│   ├── UserbotService.ts        # Userbot CRUD operations
│   ├── SystemVarService.ts      # System vars management
│   └── inlineBotManager.ts      # Inline bot manager (stub)
│
├── infrastructure/               # Data persistence layer
│   ├── dbCore.ts                # Database core (MongoDB + file fallback)
│   └── database.ts              # Re-export all DB functions
│
├── utils/                        # Shared utilities
│   ├── logger.ts                # Logging utility
│   ├── permissions.ts           # Permission helpers
│   ├── richMessage.ts           # Rich message wrapper
│   └── richParser.ts            # Rich HTML parser
│
├── config.ts                     # Configuration from .env
└── index.ts                      # Application entry point

```

## 🎯 Arsitektur

### Master Bot Layer
- **Framework**: grammY + conversations
- **Fungsi**: Registrasi akun, dashboard kontrol userbot
- **Handler**: Registration (OTP/QR), Dashboard callbacks, Owner admin

### Userbot Layer
- **Framework**: GramJS/teleproto
- **Fungsi**: Command execution via plugin system
- **Manager**: Start/stop userbot, watchdog auto-reconnect
- **Plugin**: Dynamic loader dari `src/userbot/handlers/`

### Data Layer
- **Primary**: MongoDB (jika `MONGO_URI` di-set)
- **Fallback**: File JSON (`database.json`)
- **Cache**: In-memory Map untuk performance

## 🔄 Flow Registrasi

1. User kirim `/start` → Master Bot
2. Klik **🤖 Userbot** → **🚀 Register Panel**
3. Pilih metode: OTP atau QR
4. Login via conversation flow
5. Session string disimpan di database
6. Userbot auto-start setelah registrasi

## 🧩 Plugin System

Plugin diload otomatis dari `src/userbot/handlers/`:
- `admin/` - Owner-only commands
- `system/` - System info & management
- `tools/` - Utility tools
- `util/` - Helper commands

Format plugin:
```ts
export default {
  name: 'command',
  help: { title, description, usage, detail },
  async execute(client, message, settings, telegramId) { ... }
}
```

## 🚀 Development

```bash
npm run dev      # Watch mode
npm run build    # TypeScript compile
npm start        # Production
```

## 📊 Database Schema

### Userbot Collection
```ts
{
  telegram_id: number,
  phone: string,
  session_string: string,
  is_active: number,
  anti_pm: number,
  auto_reply: number,
  afk_reason: string,
  expired_at: Date,
  custom_name: string,
  disabled_plugins: string[],
  vars: Map<string, string>
}
```

### SystemConfig Collection
```ts
{
  _id: 'system',
  vars: Map<string, string>
}
```

## 🔐 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | ✅ | Master Bot token dari BotFather |
| `OWNER_ID` | ✅ | Telegram ID owner |
| `MONGO_URI` | ➖ | MongoDB connection string |
| `API_ID` | ➖ | Telegram API ID (default: 2496) |
| `API_HASH` | ➖ | Telegram API Hash |
| `LOG_GROUP_ID` | ➖ | Grup log ID |
| `LOG_TOPIC_ID` | ➖ | Topic ID di grup log |
