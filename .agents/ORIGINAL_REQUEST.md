# Original User Request

## Initial Request — 2026-06-12T04:40:53Z

Implement 5 advanced moderation and scheduling features for the DeltaUserJS Telegram Userbot: Persistent schedules, Group Welcome/Goodbye with service message cleanup, Anti-flood/spam moderation, Per-chat group settings configuration, and a User Reputation system.

Working directory: /home/ocan/DeltaUserJS
Integrity mode: development

## Requirements

### R1. Database & Persistence
Extend the MongoDB schema and database logic to support the new features. You have full autonomy to decide the most efficient schema structure (e.g., embedding in the existing Userbot model vs creating new collections).

### R2. Schedule Plugin Enhancement
Upgrade the existing scheduling logic to support `.schedule HH:MM <message>`, `.every <duration> <message>`, `.rmschedule`, and `.schedules`. These scheduled tasks must persist across bot restarts.

### R3. Moderation & Reputation Plugins
Build or enhance plugins to support:
- Welcome/Goodbye messages and automatic service message cleanup (`.welcome on`, `.cleanservice on`).
- Anti-flood moderation (`.antiflood on`, `.setflood <msg_count> <seconds>`) to mute spammers.
- User Reputation (`.rep @user`, `.good @user`, `.bad @user`).

### R4. Group Settings Plugin
Create a `.chatsettings` command to configure per-chat properties like prefix, language, and logging toggles.

## Acceptance Criteria

### Automated Verification
- [ ] A programmatic Node.js test script (e.g., `test_features.js`) must be provided.
- [ ] The test script must invoke the plugin `execute()` functions using mocked GramJS message objects to simulate user inputs without requiring live Telegram API calls.
- [ ] The test script objectively verifies that the `.schedule` command correctly persists data to the MongoDB database.
- [ ] The test script objectively verifies that the `.antiflood` logic correctly triggers a simulated mute/ban action when the threshold is exceeded.
- [ ] The test script objectively verifies that `.good` and `.bad` commands correctly increment or decrement a user's reputation points in the database.
