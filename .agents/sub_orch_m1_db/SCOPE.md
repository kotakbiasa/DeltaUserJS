# Scope: DB Schema & Cache Expansion (Milestone 1)

## Architecture Design
We will extend the database layer in `src/database/db.js` by adding three new fields to `UserbotSchema`. This allows us to leverage Mongoose schemas, the in-memory cache (`dbCache`), local JSON database fallback (`database.json`), and the existing sync helpers (like `persistNestedFeature` and `initDatabaseAndCache`).

### Schema Additions:
1. `schedules`: `[mongoose.Schema.Types.Mixed]` (default `[]`)
   - Each schedule object structure:
     ```json
     {
       "chatKey": "string",
       "type": "string",
       "value": "any",
       "message": "string",
       "updatedAt": "string (ISO Date)"
     }
     ```
2. `chat_settings`: `mongoose.Schema.Types.Mixed` (default `{}`)
   - Maps chat IDs to their settings:
     ```json
     {
       "chatId1": {
         "welcome_message": "string",
         "goodbye_message": "string",
         "anti_flood_limit": 5
       }
     }
     ```
3. `reputation_data`: `mongoose.Schema.Types.Mixed` (default `{}`)
   - Maps target user IDs to their reputation score:
     ```json
     {
       "targetUserId1": 10,
       "targetUserId2": -5
     }
     ```

## Interface Contracts

### 1. `saveSchedule(telegramId, chatKey, type, value, message)`
- **Behavior**: Retrieves the userbot session from cache. If `schedules` doesn't exist, initializes it as `[]`. Updates or inserts a schedule matching both `chatKey` and `type` with the new `value`, `message`, and `updatedAt`. Syncs back to the cache and the database (Mongo or JSON).
- **Returns**: `true` on success, `false` otherwise.

### 2. `getSchedules(telegramId)`
- **Behavior**: Retrieves the userbot session from cache and returns the `schedules` array (default to `[]`).
- **Returns**: `Array` of schedule objects.

### 3. `deleteSchedule(telegramId, chatKey, type)`
- **Behavior**: Retrieves the userbot session. Filters out any schedule matching both `chatKey` and `type`. Syncs the updated array back to the cache and database.
- **Returns**: `true` on success, `false` otherwise.

### 4. `getChatSettings(telegramId, chatId)`
- **Behavior**: Retrieves the userbot session. Returns the settings object for the specific `chatId` (stringified) from `chat_settings` (default to `{}`).
- **Returns**: `Object` of settings for the chat.

### 5. `updateChatSettings(telegramId, chatId, key, value)`
- **Behavior**: Retrieves the userbot session. Initializes `chat_settings` and the specific `chatId` object if they don't exist. Sets the key-value pair under that `chatId`. Syncs to the cache and database.
- **Returns**: The updated settings object for the chat on success, or `false` on failure.

### 6. `getReputation(telegramId, targetUserId)`
- **Behavior**: Retrieves the userbot session. Returns the reputation score (number) for `targetUserId` (stringified) from `reputation_data` (default to `0` if not present).
- **Returns**: `number` representing reputation points.

### 7. `updateReputation(telegramId, targetUserId, points)`
- **Behavior**: Retrieves the userbot session. Initializes `reputation_data` if not present. Sets `reputation_data[String(targetUserId)]` to the specified `points` value. Syncs to the cache and database.
- **Returns**: The updated reputation score (number) on success, or `false`/`null` on failure.

## Tasks and Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Extend Schema | Add `schedules`, `chat_settings`, and `reputation_data` to `UserbotSchema` | None | PLANNED |
| 2 | Cache Initialization | Update `initDatabaseAndCache` to load and default these fields in memory cache | M1.1 | PLANNED |
| 3 | Save Session Update | Update `saveUserbotSession` to handle/preserve these fields | M1.2 | PLANNED |
| 4 | Implement Helpers | Implement and export all 7 helper functions in `src/database/db.js` | M1.3 | PLANNED |
| 5 | Verify & Test | Write tests verifying correctness under Mongo and local JSON fallback | M1.4 | PLANNED |
