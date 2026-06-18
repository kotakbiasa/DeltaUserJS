# Project Context

## Project Name
DeltaUserJS Telegram Userbot

## Description
A multi-userbot manager utilizing grammY for Master Bot and GramJS for userbots. The goal is to implement 5 advanced moderation and scheduling features:
1. Persistent schedules (`.schedule HH:MM <msg>`, `.every <duration> <msg>`, `.rmschedule`, `.schedules`).
2. Welcome/Goodbye and automatic service message cleanup.
3. Anti-flood moderation (`.antiflood on`, `.setflood <msg_count> <seconds>`).
4. Per-chat group settings configuration (`.chatsettings`).
5. User Reputation system (`.rep`, `.good`, `.bad`).

## Technology Stack
- Node.js (ES Module type)
- Mongoose / MongoDB
- GramJS (Telegram Client)
- grammY

## Directory Structure
- `src/database/db.js`: Mongoose models, map cache layer, database helper functions.
- `src/userbot/client.js`: Telegram client initialization and plugin event handlers.
- `src/userbot/manager.js`: Handles starting, stopping, and reconnecting userbots.
- `src/userbot/pluginLoader.js`: Automatically loads plugin files from `plugins/` folder.
- `src/userbot/plugins/`: Directory for individual plugin handlers.
