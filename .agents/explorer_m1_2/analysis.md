# Analysis & Implementation Plan: DB Schema & Cache Expansion (Milestone 1)

This report details the findings and implementation plan for extending the database and cache layers in `src/database/db.js` to support schedules, chat settings, and reputation data.

## 1. Context & Architecture Analysis

`src/database/db.js` defines an in-memory cache layer (`dbCache`) and provides automatic sync helpers between this cache and either:
1. **MongoDB** (via Mongoose `UserbotSchema` and `UserbotModel`)
2. **Local Fallback JSON file** (`database.json` parsed/written via `readDbFromFile`/`writeDbToFile`).

To support new features in later milestones (Scheduler, Group Settings, Anti-Flood, and Reputation), we must extend this database layer without breaking existing userbot session loading and saving operations.

---

## 2. Detailed Proposal

### A. Schema Extensions
The `UserbotSchema` will be extended with the following fields:
- `schedules`: `[mongoose.Schema.Types.Mixed]` (default `[]`)
- `chat_settings`: `mongoose.Schema.Types.Mixed` (default `{}`)
- `reputation_data`: `mongoose.Schema.Types.Mixed` (default `{}`)

*Mongoose Configuration:*
```javascript
  schedules: { type: [mongoose.Schema.Types.Mixed], default: [] },
  chat_settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  reputation_data: { type: mongoose.Schema.Types.Mixed, default: {} }
```

### B. Cache & Database Initialization (`initDatabaseAndCache`)
When the server starts, `initDatabaseAndCache` loads all userbot data into the in-memory `dbCache`. We must ensure these three new fields are initialized correctly with fallback defaults if they do not exist in the database record.

**MongoDB loading block:**
```javascript
          schedules: Array.from(bot.schedules || []),
          chat_settings: bot.chat_settings || {},
          reputation_data: bot.reputation_data || {}
```

**Local JSON fallback loading block:**
```javascript
      schedules: bot.schedules || [],
      chat_settings: bot.chat_settings || {},
      reputation_data: bot.reputation_data || {}
```

### C. Session Preservation (`saveUserbotSession`)
When saving or updating a userbot session (e.g., re-authenticating or updating base settings), we must preserve the new fields in `saveUserbotSession` so they are not reset to default values.
```javascript
    schedules: existing.schedules || [],
    chat_settings: existing.chat_settings || {},
    reputation_data: existing.reputation_data || {}
```

### D. Exported Getter/Setter Helpers
We will implement and export seven helpers in `src/database/db.js`. These helpers will interact directly with the `dbCache` (for fast reads/writes) and call the private `persistNestedFeature` helper to handle the background database sync (working transparently for both Mongo and local JSON fallback).

#### 1. `saveSchedule(telegramId, chatKey, type, value, message)`
- Retrieves session from cache.
- Initializes `schedules` as `[]` if not present.
- Upserts the schedule matching both `chatKey` and `type` with `updatedAt` (ISO String).
- Persists to database.
- Returns `true` on success, `false` otherwise.

#### 2. `getSchedules(telegramId)`
- Retrieves session from cache.
- Returns `schedules` array (defaults to `[]`).

#### 3. `deleteSchedule(telegramId, chatKey, type)`
- Retrieves session from cache.
- Filters out schedule matching both `chatKey` and `type`.
- Persists to database.
- Returns `true` on success, `false` otherwise.

#### 4. `getChatSettings(telegramId, chatId)`
- Retrieves session from cache.
- Returns settings object for specific `chatId` (stringified key) from `chat_settings` (defaults to `{}`).

#### 5. `updateChatSettings(telegramId, chatId, key, value)`
- Retrieves session from cache.
- Sets `chat_settings[String(chatId)][key] = value`.
- Persists to database.
- Returns updated settings object for the chat, or `false` on failure.

#### 6. `getReputation(telegramId, targetUserId)`
- Retrieves session from cache.
- Returns reputation score for `targetUserId` (stringified key) from `reputation_data` (defaults to `0` if not present).

#### 7. `updateReputation(telegramId, targetUserId, points)`
- Retrieves session from cache.
- Sets `reputation_data[String(targetUserId)] = points`.
- Persists to database.
- Returns the updated reputation score, or `null`/`false` on failure.

---

## 3. Implementation Steps

1. **Apply the schema patches** to `UserbotSchema`, `initDatabaseAndCache`, and `saveUserbotSession` in `src/database/db.js`.
2. **Append the seven new helper functions** to `src/database/db.js`.
3. **Verify locally** using fallback JSON database and/or MongoDB to ensure correctness.

---

## 4. Verification Plan

An integration test script should be run to verify cache operations and database synchronization:

### Verification Script Example
The implementer should create a temporary test script (e.g. `test-db-integration.js`) in the root directory:

```javascript
import dotenv from 'dotenv';
dotenv.config();
import {
  initDatabaseAndCache,
  saveUserbotSession,
  saveSchedule,
  getSchedules,
  deleteSchedule,
  getChatSettings,
  updateChatSettings,
  getReputation,
  updateReputation,
  getUserbotSession
} from './src/database/db.js';

async function runTests() {
  console.log("🧪 Starting DB extension integration tests...");
  
  // 1. Setup a dummy userbot session
  const testId = 999999999;
  saveUserbotSession(testId, "+123456789", "test_session_string");
  
  // 2. Test Schedules
  console.log("Testing schedules...");
  const s1 = await saveSchedule(testId, "chat_1", "gcast", "hello", "Interval gcast");
  if (!s1) throw new Error("saveSchedule failed");
  
  let schedules = getSchedules(testId);
  if (schedules.length !== 1 || schedules[0].chatKey !== "chat_1") {
    throw new Error("getSchedules validation failed");
  }
  
  const deleted = await deleteSchedule(testId, "chat_1", "gcast");
  if (!deleted || getSchedules(testId).length !== 0) {
    throw new Error("deleteSchedule failed");
  }
  
  // 3. Test Chat Settings
  console.log("Testing chat settings...");
  const updatedSettings = await updateChatSettings(testId, "chat_2", "welcome_message", "Welcome to group!");
  if (!updatedSettings || updatedSettings.welcome_message !== "Welcome to group!") {
    throw new Error("updateChatSettings failed");
  }
  
  const retrievedSettings = getChatSettings(testId, "chat_2");
  if (retrievedSettings.welcome_message !== "Welcome to group!") {
    throw new Error("getChatSettings validation failed");
  }
  
  // 4. Test Reputation
  console.log("Testing reputation...");
  const repScore = await updateReputation(testId, 12345, 10);
  if (repScore !== 10) {
    throw new Error("updateReputation failed");
  }
  
  const score = getReputation(testId, 12345);
  if (score !== 10) {
    throw new Error("getReputation validation failed");
  }
  
  console.log("🟢 All DB Helper tests passed successfully!");
  process.exit(0);
}

// Allow database to initialize before running tests
setTimeout(runTests, 1000);
```

To execute the test:
```bash
node test-db-integration.js
```
Upon verification, the temporary test script should be removed to keep the directory clean.
