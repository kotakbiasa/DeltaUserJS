# Analysis and Proposed Implementation Plan: DB Schema & Cache Expansion (Milestone 1)

This document presents a comprehensive, read-only analysis of `src/database/db.js` and provides a detailed implementation plan to extend the database layer of the project according to `SCOPE.md`.

---

## 1. Schema Extension (Mongoose)

### Observations:
In `src/database/db.js`, `UserbotSchema` currently defines fields from `telegram_id` up to `lock_config`. 
To add `schedules`, `chat_settings`, and `reputation_data` we must extend `UserbotSchema` as follows:

- **`schedules`**: An array of mixed objects (each representing a scheduled task) defaulting to `[]`.
- **`chat_settings`**: A mixed type mapping chat IDs to their settings, defaulting to `{}`.
- **`reputation_data`**: A mixed type mapping target user IDs to their reputation scores, defaulting to `{}`.

### Proposed Diff for `UserbotSchema` (around lines 39-41):

```javascript
<<<<
  warn_data: { type: mongoose.Schema.Types.Mixed, default: {} },
  lock_config: { type: mongoose.Schema.Types.Mixed, default: {} }
});
====
  warn_data: { type: mongoose.Schema.Types.Mixed, default: {} },
  lock_config: { type: mongoose.Schema.Types.Mixed, default: {} },
  schedules: { type: [mongoose.Schema.Types.Mixed], default: [] },
  chat_settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  reputation_data: { type: mongoose.Schema.Types.Mixed, default: {} }
});
>>>>
```

---

## 2. Cache Initialization (`initDatabaseAndCache`)

`initDatabaseAndCache` loads userbot sessions into the in-memory Map `dbCache`. We must ensure these three new fields are correctly retrieved from MongoDB/local fallback, defaulting them appropriately if they do not exist on the records.

### A. MongoDB Load Section (around lines 103-108):
We must update the Map initialization loop to load the fields:

```javascript
<<<<
          disabled_plugins: Array.from(bot.disabled_plugins || []),
          warn_data: bot.warn_data || {},
          lock_config: bot.lock_config || {}
        });
====
          disabled_plugins: Array.from(bot.disabled_plugins || []),
          warn_data: bot.warn_data || {},
          lock_config: bot.lock_config || {},
          schedules: Array.from(bot.schedules || []),
          chat_settings: bot.chat_settings || {},
          reputation_data: bot.reputation_data || {}
        });
>>>>
```

### B. Local JSON File Load Fallback Section (around lines 140-144):
Similarly, in the fallback file database parser:

```javascript
<<<<
      disabled_plugins: bot.disabled_plugins || [],
      warn_data: bot.warn_data || {},
      lock_config: bot.lock_config || {}
    };
====
      disabled_plugins: bot.disabled_plugins || [],
      warn_data: bot.warn_data || {},
      lock_config: bot.lock_config || {},
      schedules: bot.schedules || [],
      chat_settings: bot.chat_settings || {},
      reputation_data: bot.reputation_data || {}
    };
>>>>
```

---

## 3. Session Preservation (`saveUserbotSession`)

When a userbot is registered or re-saved via `saveUserbotSession`, we must ensure existing schedules, chat settings, and reputation data are preserved rather than overwritten by empty defaults.

### Proposed Changes to `saveUserbotSession` (around lines 183-187):

```javascript
<<<<
    disabled_plugins: existing.disabled_plugins || [],
    warn_data: existing.warn_data || {},
    lock_config: existing.lock_config || {}
  };
====
    disabled_plugins: existing.disabled_plugins || [],
    warn_data: existing.warn_data || {},
    lock_config: existing.lock_config || {},
    schedules: existing.schedules || [],
    chat_settings: existing.chat_settings || {},
    reputation_data: existing.reputation_data || {}
  };
>>>>
```

---

## 4. Helper Interfaces Implementation

The following functions should be exported from `src/database/db.js`. We will utilize the existing `persistNestedFeature(telegramId, featureName, value)` helper to simplify database synchronization (writing both to MongoDB and the local JSON file database under the hood).

### 1. `saveSchedule`
```javascript
/**
 * Add or update a schedule for a userbot chat.
 * @param {number|string} telegramId
 * @param {string} chatKey
 * @param {string} type
 * @param {any} value
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export async function saveSchedule(telegramId, chatKey, type, value, message) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return false;

  if (!session.schedules) {
    session.schedules = [];
  }

  const updatedAt = new Date().toISOString();
  const scheduleIndex = session.schedules.findIndex(
    s => s.chatKey === String(chatKey) && s.type === String(type)
  );

  const scheduleObj = {
    chatKey: String(chatKey),
    type: String(type),
    value,
    message: String(message),
    updatedAt
  };

  if (scheduleIndex > -1) {
    session.schedules[scheduleIndex] = scheduleObj;
  } else {
    session.schedules.push(scheduleObj);
  }

  dbCache.set(Number(telegramId), session);
  await persistNestedFeature(telegramId, 'schedules', session.schedules);
  return true;
}
```

### 2. `getSchedules`
```javascript
/**
 * Retrieve all schedules for a specific userbot.
 * @param {number|string} telegramId
 * @returns {Array}
 */
export function getSchedules(telegramId) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return [];
  return session.schedules || [];
}
```

### 3. `deleteSchedule`
```javascript
/**
 * Delete a specific schedule matching chatKey and type.
 * @param {number|string} telegramId
 * @param {string} chatKey
 * @param {string} type
 * @returns {Promise<boolean>}
 */
export async function deleteSchedule(telegramId, chatKey, type) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return false;

  if (!session.schedules) {
    session.schedules = [];
    return true;
  }

  session.schedules = session.schedules.filter(
    s => !(s.chatKey === String(chatKey) && s.type === String(type))
  );

  dbCache.set(Number(telegramId), session);
  await persistNestedFeature(telegramId, 'schedules', session.schedules);
  return true;
}
```

### 4. `getChatSettings`
```javascript
/**
 * Get chat-specific settings for a chat.
 * @param {number|string} telegramId
 * @param {number|string} chatId
 * @returns {Object}
 */
export function getChatSettings(telegramId, chatId) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return {};
  const chatKey = String(chatId);
  return session.chat_settings?.[chatKey] || {};
}
```

### 5. `updateChatSettings`
```javascript
/**
 * Update a specific key-value setting for a chat.
 * @param {number|string} telegramId
 * @param {number|string} chatId
 * @param {string} key
 * @param {any} value
 * @returns {Promise<Object|boolean>}
 */
export async function updateChatSettings(telegramId, chatId, key, value) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return false;

  if (!session.chat_settings) {
    session.chat_settings = {};
  }

  const chatKey = String(chatId);
  if (!session.chat_settings[chatKey]) {
    session.chat_settings[chatKey] = {};
  }

  session.chat_settings[chatKey][key] = value;

  dbCache.set(Number(telegramId), session);
  await persistNestedFeature(telegramId, 'chat_settings', session.chat_settings);
  return session.chat_settings[chatKey];
}
```

### 6. `getReputation`
```javascript
/**
 * Get target user's reputation score.
 * @param {number|string} telegramId
 * @param {number|string} targetUserId
 * @returns {number}
 */
export function getReputation(telegramId, targetUserId) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return 0;
  const userKey = String(targetUserId);
  return session.reputation_data?.[userKey] !== undefined ? session.reputation_data[userKey] : 0;
}
```

### 7. `updateReputation`
```javascript
/**
 * Set target user's reputation score.
 * @param {number|string} telegramId
 * @param {number|string} targetUserId
 * @param {number} points
 * @returns {Promise<number|null>}
 */
export async function updateReputation(telegramId, targetUserId, points) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return null;

  if (!session.reputation_data) {
    session.reputation_data = {};
  }

  const userKey = String(targetUserId);
  session.reputation_data[userKey] = Number(points);

  dbCache.set(Number(telegramId), session);
  await persistNestedFeature(telegramId, 'reputation_data', session.reputation_data);
  return session.reputation_data[userKey];
}
```

---

## 5. Verification Strategy & Test Script

To verify both database engines, we propose using a temporary node script named `test-extended-db.js`. This script creates a test session, runs all 7 helpers, verifies the local JSON sync behavior, and optionally tests MongoDB sync.

### Proposed Verification Script (`test-extended-db.js`):

```javascript
import {
  initDatabaseAndCache,
  saveUserbotSession,
  getUserbotSession,
  saveSchedule,
  getSchedules,
  deleteSchedule,
  getChatSettings,
  updateChatSettings,
  getReputation,
  updateReputation
} from './src/database/db.js';
import fs from 'fs';
import assert from 'assert';

async function runTests() {
  console.log('🧪 Starting DB Extension Verification Tests...');

  const TEST_ID = 999999999;
  
  // 1. Create a dummy session
  console.log('📝 Creating dummy session...');
  saveUserbotSession(TEST_ID, '+123456789', 'test_session_string');

  const session = getUserbotSession(TEST_ID);
  assert.ok(session, 'Session should exist in cache');
  assert.deepStrictEqual(session.schedules, [], 'Schedules should default to []');
  assert.deepStrictEqual(session.chat_settings, {}, 'Chat settings should default to {}');
  assert.deepStrictEqual(session.reputation_data, {}, 'Reputation data should default to {}');
  console.log('✅ Initialization verified.');

  // 2. Test schedules helpers
  console.log('📝 Testing schedules...');
  const scheduleSaved = await saveSchedule(TEST_ID, 'chat123', 'broadcast', 'hourly', 'Hello World');
  assert.strictEqual(scheduleSaved, true, 'saveSchedule should return true');

  const schedules = getSchedules(TEST_ID);
  assert.strictEqual(schedules.length, 1, 'Should have exactly 1 schedule');
  assert.strictEqual(schedules[0].chatKey, 'chat123');
  assert.strictEqual(schedules[0].type, 'broadcast');
  assert.strictEqual(schedules[0].value, 'hourly');
  assert.strictEqual(schedules[0].message, 'Hello World');
  assert.ok(schedules[0].updatedAt, 'updatedAt should be set');

  // Overwriting schedule
  await saveSchedule(TEST_ID, 'chat123', 'broadcast', 'daily', 'Hello Again');
  const updatedSchedules = getSchedules(TEST_ID);
  assert.strictEqual(updatedSchedules.length, 1, 'Should still have 1 schedule after update');
  assert.strictEqual(updatedSchedules[0].value, 'daily');
  assert.strictEqual(updatedSchedules[0].message, 'Hello Again');

  // Deleting schedule
  const deleted = await deleteSchedule(TEST_ID, 'chat123', 'broadcast');
  assert.strictEqual(deleted, true);
  assert.strictEqual(getSchedules(TEST_ID).length, 0, 'Schedules should be empty after deletion');
  console.log('✅ Schedule helpers verified.');

  // 3. Test chat settings helpers
  console.log('📝 Testing chat settings...');
  const initialSettings = getChatSettings(TEST_ID, 'chat456');
  assert.deepStrictEqual(initialSettings, {}, 'Should return empty object if no settings present');

  const updatedSettings = await updateChatSettings(TEST_ID, 'chat456', 'welcome_message', 'Welcome to the chat!');
  assert.strictEqual(updatedSettings.welcome_message, 'Welcome to the chat!');

  const fetchedSettings = getChatSettings(TEST_ID, 'chat456');
  assert.strictEqual(fetchedSettings.welcome_message, 'Welcome to the chat!');
  console.log('✅ Chat settings helpers verified.');

  // 4. Test reputation helpers
  console.log('📝 Testing reputation...');
  const initialRep = getReputation(TEST_ID, 12345);
  assert.strictEqual(initialRep, 0, 'Reputation should default to 0');

  const updatedRep = await updateReputation(TEST_ID, 12345, 15);
  assert.strictEqual(updatedRep, 15, 'updateReputation should return new score');

  const fetchedRep = getReputation(TEST_ID, 12345);
  assert.strictEqual(fetchedRep, 15, 'getReputation should return correct score');
  console.log('✅ Reputation helpers verified.');

  // 5. Verify local JSON persistence if Mongo is inactive
  const dbData = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
  const savedBot = dbData.userbots[TEST_ID];
  if (savedBot) {
    console.log('📝 Checking database.json persistence...');
    assert.strictEqual(savedBot.chat_settings.chat456.welcome_message, 'Welcome to the chat!');
    assert.strictEqual(savedBot.reputation_data['12345'], 15);
    console.log('✅ Local JSON database.json persistence verified.');
  }

  // Clean up test data
  console.log('🧹 Cleaning up test data...');
  const { default: mongoose } = await import('mongoose');
  if (mongoose.connection.readyState === 1) {
    const UserbotModel = mongoose.models.Userbot;
    await UserbotModel.deleteOne({ telegram_id: TEST_ID });
    console.log('✅ MongoDB clean up complete.');
  } else {
    delete dbData.userbots[TEST_ID];
    fs.writeFileSync('./database.json', JSON.stringify(dbData, null, 2));
    console.log('✅ JSON clean up complete.');
  }

  console.log('🎉 All database extension tests passed successfully!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Tests failed:', err);
  process.exit(1);
});
```

---

## 6. Caveats & Assumptions

1. **Schema Validation Flexibility**: The fields `chat_settings` and `reputation_data` are declared as `mongoose.Schema.Types.Mixed` to allow maximum schema-less flexibility. However, Mongoose will not perform deep key validations under `Mixed` fields.
2. **Synchronous local writing**: When using the file database fallback, writing to `database.json` blocks CPU execution because it uses `fs.writeFileSync`. This matches the project's existing implementation design pattern for database files.
3. **Array mutation safety**: When fetching `schedules` via `getSchedules`, the function returns a direct reference to the internal `schedules` array from `dbCache`. Callers should be instructed not to mutate this array directly but to use the helper setter functions (`saveSchedule`, `deleteSchedule`) to trigger database synchronization.
