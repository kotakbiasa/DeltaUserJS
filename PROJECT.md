# Project: DeltaUserJS Advanced Features

## Architecture
- Database: Mongoose models defined in `src/core/database.js` for persistent schedules, per-chat settings, and reputation tracking.
- Scheduler: Automatically starts on userbot startup, queries the persistent schedules from Mongo, and registers timeout/intervals.
- Plugins: Integrated into `src/userbot/plugins/`. Commands are registered via exporting default object with `name`, `help`, `execute`.
- Event Handling: Intercepts service messages for welcome/goodbye/cleanup and monitors message frequency for anti-flood.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | DB Schema & Cache | Extend `db.js` with models and cache helpers for schedules, chat settings, reputation | None | IN_PROGRESS (Conv ID: 77704896-77f6-4e53-9697-ebaa95205d11) |
| 2 | Persistent Scheduler | Implement schedule plugin upgrades, startup scheduler, load schedules on start | M1 | PLANNED |
| 3 | Group Settings & Welcome | Implement welcome/goodbye, cleanservice, prefix, language, logging toggles | M1 | PLANNED |
| 4 | Anti-Flood & Reputation | Implement anti-flood protection and user reputation system | M1 | PLANNED |
| 5 | E2E Testing & Integration | Achieve 100% E2E test pass from E2E Testing Track | M1, M2, M3, M4 | PLANNED |

## Interface Contracts
### Database Schema API
- `saveSchedule(telegramId, chatId, type, value, message)`
- `getSchedules(telegramId)`
- `deleteSchedule(telegramId, chatId, type)`
- `getChatSettings(telegramId, chatId)`
- `updateChatSettings(telegramId, chatId, key, value)`
- `getReputation(telegramId, targetUserId)`
- `updateReputation(telegramId, targetUserId, points)`
