# Analysis and Proposal: Database Schema & Cache Expansion (Milestone 1)

## Summary of Findings
An analysis of `src/database/db.js` and the requirements in `SCOPE.md` shows that we need to extend the userbot data layer to support schedule, chat-specific settings, and user reputation tracking. Currently, `src/database/db.js` handles data persistence via a Mongoose model (`UserbotModel`) using MongoDB or a local `database.json` fallback, combined with an in-memory cache map (`dbCache`). 

To support the new features, we must:
1. Extend the `UserbotSchema` in Mongoose with `schedules`, `chat_settings`, and `reputation_data`.
2. Update the cache initialization function `initDatabaseAndCache` to read and populate these new fields from both MongoDB and the fallback `database.json` file.
3. Update `saveUserbotSession` to correctly preserve the new fields when upserting or creating sessions.
4. Implement and export 7 helper functions in `src/database/db.js` for getting/setting schedules, chat settings, and reputation, ensuring proper cache updates and database synchronization.

---

## Current State Analysis

### 1. `UserbotSchema` (lines 22-41)
Currently defined as:
```javascript
const UserbotSchema = new mongoose.Schema({
  telegram_id: { type: Number, required: true, unique: true },
  phone: { type: String, default: null },
  session_string: { type: String, required: true },
  is_active: { type: Number, default: 1 },
  auto_read: { type: Number, default: 0 },
  auto_reply: { type: Number, default: 0 },
  anti_pm: { type: Number, default: 0 },
  afk_reason: { type: String, default: 'Saya sedang AFK/Sibuk. Harap tunggu sebentar.' },
  expired_at: { type: String, required: true },
  created_at: { type: String, required: true },
  inline_bot_token: { type: String, default: null },
  inline_bot_username: { type: String, default: null },
  custom_name: { type: String, default: 'DeltaUbotJS' },
  approved_users: { type: [Number], default: [] },
  broadcast_blacklist: { type: [String], default: [] },
  disabled_plugins: { type: [String], default: [] },
  warn_data: { type: mongoose.Schema.Types.Mixed, default: {} },
  lock_config: { type: mongoose.Schema.Types.Mixed, default: {} }
});
```

### 2. Cache Loader (`initDatabaseAndCache`) (lines 72-150)
- **MongoDB path (lines 87-108)**:
  Loads records into `dbCache` but does not currently pull or map `schedules`, `chat_settings`, or `reputation_data`.
- **JSON Fallback path (lines 125-144)**:
  Builds `botData` to set in `dbCache`, missing the new fields.

### 3. Session Creation (`saveUserbotSession`) (lines 161-205)
- Destructures/gathers existing session features but does not currently copy `schedules`, `chat_settings`, or `reputation_data` into the updated `botData`.

---

## Proposed Implementation Plan

### 1. Schema Extensions
Add the following fields to `UserbotSchema` in `src/database/db.js`:
```javascript
  schedules: { type: [mongoose.Schema.Types.Mixed], default: [] },
  chat_settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  reputation_data: { type: mongoose.Schema.Types.Mixed, default: {} }
```

### 2. Update `initDatabaseAndCache`
Update both loaders to correctly map the new fields:

**For MongoDB Loading Loop:**
```javascript
        dbCache.set(bot.telegram_id, {
          // ... (existing fields)
          warn_data: bot.warn_data || {},
          lock_config: bot.lock_config || {},
          schedules: Array.from(bot.schedules || []),
          chat_settings: bot.chat_settings || {},
          reputation_data: bot.reputation_data || {}
        });
```

**For JSON Fallback Loading Loop:**
```javascript
    const botData = {
      // ... (existing fields)
      warn_data: bot.warn_data || {},
      lock_config: bot.lock_config || {},
      schedules: bot.schedules || [],
      chat_settings: bot.chat_settings || {},
      reputation_data: bot.reputation_data || {}
    };
```

### 3. Update `saveUserbotSession`
Update the `botData` definition to preserve existing values or assign defaults:
```javascript
  const botData = {
    // ... (existing fields)
    warn_data: existing.warn_data || {},
    lock_config: existing.lock_config || {},
    schedules: existing.schedules || [],
    chat_settings: existing.chat_settings || {},
    reputation_data: existing.reputation_data || {}
  };
```

### 4. Implement New Helper Functions
Add these helper functions to the end of `src/database/db.js` and export them.

#### A. Schedule Helpers
```javascript
/**
 * Save or update a schedule for a userbot session
 * @param {number} telegramId 
 * @param {string|number} chatKey 
 * @param {string} type 
 * @param {any} value 
 * @param {string} message 
 * @returns {Promise<boolean>}
 */
export async function saveSchedule(telegramId, chatKey, type, value, message) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return false;

  if (!session.schedules || !Array.isArray(session.schedules)) {
    session.schedules = [];
  }

  const chatKeyStr = String(chatKey);
  const typeStr = String(type);
  const updatedAt = new Date().toISOString();

  const index = session.schedules.findIndex(
    s => s && String(s.chatKey) === chatKeyStr && String(s.type) === typeStr
  );

  const scheduleObj = {
    chatKey: chatKeyStr,
    type: typeStr,
    value,
    message,
    updatedAt
  };

  if (index > -1) {
    session.schedules[index] = scheduleObj;
  } else {
    session.schedules.push(scheduleObj);
  }

  dbCache.set(Number(telegramId), session);
  await persistNestedFeature(telegramId, 'schedules', session.schedules);
  return true;
}

/**
 * Get all schedules for a userbot session
 * @param {number} telegramId 
 * @returns {Array<object>}
 */
export function getSchedules(telegramId) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return [];
  return Array.isArray(session.schedules) ? session.schedules : [];
}

/**
 * Delete a schedule from a userbot session matching chatKey and type
 * @param {number} telegramId 
 * @param {string|number} chatKey 
 * @param {string} type 
 * @returns {Promise<boolean>}
 */
export async function deleteSchedule(telegramId, chatKey, type) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return false;

  if (!session.schedules || !Array.isArray(session.schedules)) {
    session.schedules = [];
    return true;
  }

  const chatKeyStr = String(chatKey);
  const typeStr = String(type);

  session.schedules = session.schedules.filter(
    s => !(s && String(s.chatKey) === chatKeyStr && String(s.type) === typeStr)
  );

  dbCache.set(Number(telegramId), session);
  await persistNestedFeature(telegramId, 'schedules', session.schedules);
  return true;
}
```

#### B. Chat Settings Helpers
```javascript
/**
 * Get chat settings for a specific chat ID
 * @param {number} telegramId 
 * @param {string|number} chatId 
 * @returns {object}
 */
export function getChatSettings(telegramId, chatId) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return {};
  const chatSettings = session.chat_settings || {};
  return chatSettings[String(chatId)] || {};
}

/**
 * Update a key/value setting for a specific chat ID
 * @param {number} telegramId 
 * @param {string|number} chatId 
 * @param {string} key 
 * @param {any} value 
 * @returns {Promise<object|boolean>}
 */
export async function updateChatSettings(telegramId, chatId, key, value) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return false;

  if (!session.chat_settings || typeof session.chat_settings !== 'object') {
    session.chat_settings = {};
  }

  const chatKey = String(chatId);
  if (!session.chat_settings[chatKey] || typeof session.chat_settings[chatKey] !== 'object') {
    session.chat_settings[chatKey] = {};
  }

  session.chat_settings[chatKey][key] = value;
  dbCache.set(Number(telegramId), session);
  await persistNestedFeature(telegramId, 'chat_settings', session.chat_settings);
  return session.chat_settings[chatKey];
}
```

#### C. Reputation Helpers
```javascript
/**
 * Get reputation points for a target user ID
 * @param {number} telegramId 
 * @param {string|number} targetUserId 
 * @returns {number}
 */
export function getReputation(telegramId, targetUserId) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return 0;
  const reputationData = session.reputation_data || {};
  const score = reputationData[String(targetUserId)];
  return score !== undefined ? score : 0;
}

/**
 * Update reputation points for a target user ID
 * @param {number} telegramId 
 * @param {string|number} targetUserId 
 * @param {number} points 
 * @returns {Promise<number|null>}
 */
export async function updateReputation(telegramId, targetUserId, points) {
  const session = dbCache.get(Number(telegramId));
  if (!session) return null;

  if (!session.reputation_data || typeof session.reputation_data !== 'object') {
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

## Verification Plan

Since the database supports both MongoDB and Local JSON fallback, verification will be split into two automated test modules in the future (or a test script run in both environments):
1. **JSON Fallback Tests**: Run test functions with a mock/clean `database.json` and `MONGO_URI` unset or empty.
2. **MongoDB Integration Tests**: Run test functions with `MONGO_URI` set to a local test MongoDB instance.

### Proposed Test Script Structure
We will propose creating a test file `test/database.test.js` or `test-db-extension.js` containing assertions:
- **Initialization Assertions**:
  - Save session, read it, check default fields are initialized (schedules: `[]`, chat_settings: `{}`, reputation_data: `{}`).
- **Schedule Assertions**:
  - `saveSchedule` correctly adds and updates items in cache and DB.
  - `getSchedules` returns arrays.
  - `deleteSchedule` removes specified entries.
- **Chat Settings Assertions**:
  - `updateChatSettings` merges settings and returns updated config.
  - `getChatSettings` retrieves existing config.
- **Reputation Assertions**:
  - `updateReputation` updates scores.
  - `getReputation` retrieves correct scores (defaulting to 0).
