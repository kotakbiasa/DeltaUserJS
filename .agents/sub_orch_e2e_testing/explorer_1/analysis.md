# DeltaUserJS Codebase Exploration & E2E Testing Suite Design

This document details the read-only exploration of the DeltaUserJS userbot manager, focusing on the GramJS `TelegramClient` lifecycle, database initialization in `db.js`, advanced feature specifications, and a concrete testing architecture design for `test/mockGramJS.js` and `test/runner.js`.

---

## 1. TelegramClient (GramJS) Lifecycle & Usage

In `src/userbot/client.js`, userbots are managed using the `UserbotClient` class, wrapping GramJS's `TelegramClient`.

### 1.1 Instantiation & Connection
- **Instantiation**: 
  ```javascript
  const stringSession = new StringSession(this.sessionString);
  this.client = new TelegramClient(stringSession, config.apiId, config.apiHash, {
    connectionRetries: 5,
    deviceModel: 'Chrome 147',
    systemVersion: 'Android 11',
    appVersion: '2.2 K',
    langCode: 'id',
    systemLangCode: 'id-ID',
  });
  ```
- **Connection**: `await this.client.connect()` starts the event loops and binds to Telegram.

### 1.2 Event Registration
Two major types of events are registered inside `registerHandlers()`:
1. **NewMessage**: Listens for incoming messages.
   ```javascript
   this.client.addEventHandler(async (event) => {
     const message = event.message;
     // sequentially runs plugins on message
   }, new NewMessage({}));
   ```
2. **Raw (BotCallbackQuery)**: Listens for inline button clicks.
   ```javascript
   this.client.addEventHandler(async (event) => {
     const update = event.update;
     // wraps event into callbackEvent and triggers plugin callback handlers
   }, new Raw({ types: [Api.UpdateBotCallbackQuery] }));
   ```

### 1.3 Core Client & Message Methods Used in Plugins
- `client.getMe()`: Returns the profile of the current userbot.
- `client.sendMessage(peerId, { message, parseMode, replyTo, file })`: Sends text or files.
- `client.deleteMessages(peerId, messageIds, { revoke })`: Deletes messages (often used in locks or purge plugins).
- `client.sendFile(chatId, { file, caption })`: Uploads and sends media.
- `client.getEntity(targetInput)`: Resolves Username or ID into a full entity object.
- `client.getMessages(peerId, { limit, offsetId, ids })`: Queries chat history.
- `client.markAsRead(peerId)`: Marks messages as read (used in AFK and anti-PM).
- `client.getDialogs()`: Fetches active chats (used in gcast).
- `client.downloadProfilePhoto(targetEntity)`: Downloads profile pictures.
- `client.invoke(rpcCall)`: Invokes arbitrary Telegram API methods, e.g.:
  - `new Api.messages.SetBotCallbackAnswer({ queryId, alert, message })`
  - `new Api.channels.EditBanned({ channel, participant, bannedRights })` (for ban/mute)
  - `new Api.channels.EditAdmin({ channel, userId, adminRights, rank })` (for promote/demote)
  - `new Api.messages.UpdatePinnedMessage({ peer, id, unpin })`
- `message.edit({ text, parseMode })`: Edits a message in-place (very common in command plugins).
- `message.getReplyMessage()`: Returns the message to which the current message replied.

---

## 2. Database & Cache Initialization & Mocking

`src/database/db.js` exposes database schemas and wraps MongoDB/local fallback access with an in-memory cache layer (`dbCache`).

### 2.1 Initialization Lifecycle
1. On import, `db.js` calls `await initDatabaseAndCache()` at the top level.
2. It checks `MONGO_URI`. If present and not placeholder (`'YOUR_MONGO_URI'`), it runs `mongoose.connect(MONGO_URI)` with a 5000ms timeout.
3. If MongoDB is successful, it sets `isMongo = true` and loads all configurations into `dbCache` (a Map).
4. If connection fails or `MONGO_URI` is not set, it sets `isMongo = false` and reads from `database.json` on disk to load `dbCache`.
5. Database helper functions (e.g. `saveUserbotSession`, `updateUserbotStatus`, `updateUserbotFeature`) update `dbCache` synchronously and then persist asynchronously to either MongoDB (using `UserbotModel.findOneAndUpdate`) or the JSON file (using `writeDbToFile`).

### 2.2 Database Mocking Strategy for Tests
To achieve 100% isolation without a running MongoDB daemon or polluting the disk:

#### Strategy A: Mongoose Mocking (For Mongo Path)
By stubbing Mongoose methods before importing `db.js`, we can test MongoDB-dependent code paths entirely in-memory:
```javascript
import mongoose from 'mongoose';

const mockDbStore = [];

mongoose.connect = async function() {
  mongoose.connection.readyState = 1; // connected
  mongoose.connection.name = 'MockDB';
  return mongoose;
};

mongoose.disconnect = async function() {
  mongoose.connection.readyState = 0;
  return Promise.resolve();
};

mongoose.Model.find = async function(query) {
  return mockDbStore;
};

mongoose.Model.findOneAndUpdate = async function(query, update, options) {
  let bot = mockDbStore.find(b => b.telegram_id === query.telegram_id);
  const data = update.$set || update;
  if (!bot && options?.upsert) {
    bot = { telegram_id: query.telegram_id, ...data };
    mockDbStore.push(bot);
  } else if (bot) {
    Object.assign(bot, data);
  }
  return bot;
};

mongoose.Model.updateOne = async function(query, update) {
  let bot = mockDbStore.find(b => b.telegram_id === query.telegram_id);
  if (bot) {
    if (update.$push) {
      for (const [k, v] of Object.entries(update.$push)) {
        if (!bot[k]) bot[k] = [];
        bot[k].push(v);
      }
    }
    // Implement $pull, $addToSet, etc.
  }
  return { nModified: 1 };
};

mongoose.Model.deleteOne = async function(query) {
  const index = mockDbStore.findIndex(b => b.telegram_id === query.telegram_id);
  if (index > -1) mockDbStore.splice(index, 1);
  return { deletedCount: 1 };
};
```

#### Strategy B: Filesystem Mocking (For Local Fallback Path)
If `MONGO_URI` is set to undefined/empty, `db.js` will default to `database.json`. We can mock Node’s `fs` exports to intercept JSON read/write operations and keep them in-memory:
```javascript
import fs from 'fs';

let mockJsonDb = { userbots: {} };

fs.existsSync = (path) => path.endsWith('database.json') ? true : fs.existsSync(path);
fs.readFileSync = (path, enc) => path.endsWith('database.json') ? JSON.stringify(mockJsonDb) : fs.readFileSync(path, enc);
fs.writeFileSync = (path, data) => {
  if (path.endsWith('database.json')) {
    mockJsonDb = JSON.parse(data);
    return;
  }
  fs.writeFileSync(path, data);
};
```

---

## 3. Specifications for the 5 Advanced Moderation & Scheduling Features

Based on `PROJECT.md` and `SCOPE.md`, the five advanced features require the following behavioral contract:

### 3.1 Persistent Scheduler
- **Commands**: `.loop <menit> <pesan>`, `.rmloop`, `.listloop`.
- **Requirements**:
  - Registers recurring announcements to a chat.
  - Persists loop objects in DB schema: `saveSchedule(telegramId, chatId, type, value, message)`.
  - On userbot startup (inside `UserbotManager`), loads schedules via `getSchedules(telegramId)` and resumes all intervals immediately.
  - `.rmloop` removes intervals and deletes schedules from the DB (`deleteSchedule`).
  - `.loop 0` or negative values must be rejected. HTML tags must be preserved in messages. Self-spam must not trigger anti-flood.

### 3.2 Chat Settings & Custom Prefix
- **Commands**: `.setprefix <char>`, language toggles, logging toggles.
- **Requirements**:
  - Toggles are managed per-chat and persisted via `updateChatSettings(telegramId, chatId, key, value)`.
  - The custom prefix changes command invocation for that specific chat (e.g. `!ping` works, `.ping` is ignored).
  - Multi-character or space prefixes must be rejected. Regex characters (`*`, `?`, `+`) must be escaped properly so they do not break matching logic.

### 3.3 Welcome, Goodbye & CleanService
- **Events**: Listens for chat member join (`MessageActionChatAddUser`, `MessageActionChatJoinedByLink`) and leave/kick (`MessageActionChatDeleteUser`) service messages.
- **Requirements**:
  - Automatically sends custom or default welcome/goodbye messages.
  - Formats variables: `{name}` (user's name), `{id}` (user's ID), `{title}` (chat title).
  - If `CleanService` setting is enabled, deletes the Telegram join/leave service message instantly (`client.deleteMessages`). If disabled, leaves it intact.

### 3.4 Anti-Flood Protection
- **Commands**: `.antiflood on/off`, `.setflood <msg_count> <seconds>`.
- **Requirements**:
  - Audits user message frequencies.
  - Exceeding the message threshold (e.g., >5 messages in 3 seconds) triggers a warning.
  - Exceeding warning count (default 3) triggers mute (`EditBanned` with write restrictions) or kick.
  - Warn status resets after the specified time window. Owner/admins are immune.

### 3.5 User Reputation System
- **Triggers**: Replying to a message with `+`, `+rep`, `-`, or `-rep`.
- **Requirements**:
  - Increments or decrements target user's score in the DB (`updateReputation`).
  - Cooldown checks (e.g. 5 minutes between votes for the same target) to prevent spamming.
  - Self-reputation adjustments must be blocked.
  - Commands `.reputation` (check user rep) and `.reps` (display leaderboard) must respond to the chat's custom prefix.

---

## 4. Proposed E2E Test Suite Design

To implement opaque-box e2e testing that works locally/offline, we override `UserbotClient.prototype.start` to inject a mock GramJS client.

### 4.1 mockGramJS.js Design
This module mimics the Telegram API. It records outgoing operations and allows tests to simulate incoming event dispatches.

```javascript
// test/mockGramJS.js
import { Api } from 'telegram';

export class MockTelegramClient {
  constructor(telegramId) {
    this.telegramId = telegramId;
    this.handlers = [];
    this.connected = true;
    
    // Test verification hooks
    this.sentMessages = [];
    this.editedMessages = [];
    this.deletedMessages = [];
    this.invokedCalls = [];
    this.markedAsRead = [];
  }

  addEventHandler(handler, eventType) {
    this.handlers.push({ handler, eventType });
  }

  removeEventHandler(handler) {
    this.handlers = this.handlers.filter(h => h.handler !== handler);
  }

  async connect() {
    this.connected = true;
  }

  async disconnect() {
    this.connected = false;
  }

  async getMe() {
    return {
      id: this.telegramId,
      username: `mock_userbot_${this.telegramId}`,
      firstName: `Mock Ubot ${this.telegramId}`,
    };
  }

  async getEntity(target) {
    const id = typeof target === 'number' ? target : 99999;
    const username = typeof target === 'string' ? target.replace('@', '') : `user_${id}`;
    return {
      id,
      username,
      title: `Mock Group ${id}`,
      firstName: `Mock First ${id}`,
    };
  }

  async sendMessage(peerId, options) {
    const msgId = Math.floor(Math.random() * 1000000);
    const peerNum = peerId.userId || peerId.channelId || peerId.chatId || peerId;
    
    const sentMsg = {
      id: msgId,
      peerId,
      chatId: peerNum,
      message: options.message || '',
      replyTo: options.replyTo,
      out: true,
      senderId: this.telegramId,
      date: new Date(),
    };

    sentMsg.edit = async (editOpts) => {
      sentMsg.message = editOpts.text || editOpts.message || sentMsg.message;
      this.editedMessages.push({
        messageId: msgId,
        peerId,
        text: sentMsg.message,
        parseMode: editOpts.parseMode
      });
      return sentMsg;
    };

    sentMsg.getReplyMessage = async () => {
      if (!options.replyTo) return null;
      const replyMsgId = options.replyTo.replyToMsgId || options.replyTo;
      return this.sentMessages.find(m => m.id === replyMsgId) || null;
    };

    this.sentMessages.push(sentMsg);
    return sentMsg;
  }

  async deleteMessages(peerId, messageIds, options = {}) {
    this.deletedMessages.push({ peerId, messageIds, revoke: options.revoke });
    this.sentMessages = this.sentMessages.filter(m => !messageIds.includes(m.id));
    return true;
  }

  async invoke(rpcCall) {
    this.invokedCalls.push(rpcCall);
    
    // Mock key RPC requests
    if (rpcCall instanceof Api.messages.SetBotCallbackAnswer) {
      return { queryId: rpcCall.queryId, alert: rpcCall.alert, message: rpcCall.message };
    }
    if (rpcCall instanceof Api.users.GetFullUser) {
      return {
        fullUser: { id: rpcCall.id },
        user: { id: rpcCall.id, username: `user_${rpcCall.id}` }
      };
    }
    if (rpcCall instanceof Api.channels.GetFullChannel) {
      return {
        fullChat: { id: rpcCall.channel },
        chats: [{ id: rpcCall.channel, title: `Channel_${rpcCall.channel}` }]
      };
    }
    return {};
  }

  async markAsRead(peerId) {
    this.markedAsRead.push(peerId);
    return true;
  }

  // --- E2E Simulation Hooks ---
  async simulateNewMessage({ senderId, chatId, text, replyToMsgId, out = false, action = null }) {
    const msgId = Math.floor(Math.random() * 1000000);
    const peerId = { userId: senderId };
    
    const msg = {
      id: msgId,
      senderId,
      peerId,
      chatId,
      message: text,
      out,
      action,
      date: new Date(),
      replyTo: replyToMsgId ? { replyToMsgId } : null,
    };

    msg.edit = async (editOpts) => {
      msg.message = editOpts.text || editOpts.message || msg.message;
      this.editedMessages.push({
        messageId: msgId,
        peerId,
        text: msg.message,
        parseMode: editOpts.parseMode
      });
      return msg;
    };

    msg.getReplyMessage = async () => {
      if (!replyToMsgId) return null;
      return this.sentMessages.find(m => m.id === replyToMsgId) || null;
    };

    const event = { message: msg };

    for (const { handler, eventType } of this.handlers) {
      if (eventType?.constructor?.name === 'NewMessage') {
        await handler(event);
      }
    }
    return msg;
  }

  async simulateCallbackQuery({ queryId, data, peer, msgId }) {
    const update = { queryId, data, peer, msgId };
    const event = { update };

    for (const { handler, eventType } of this.handlers) {
      if (eventType?.constructor?.name === 'Raw' && eventType.types?.includes(Api.UpdateBotCallbackQuery)) {
        await handler(event);
      }
    }
  }
}
```

### 4.2 runner.js Design
A vanilla Node.js ESM script that aggregates test cases, prints detailed progress, tracks checklists for Tiers 1-4, and returns exit code 0 or 1.

```javascript
// test/runner.js
import fs from 'fs';
import mongoose from 'mongoose';

// 1. Stub database connections before importing codebase modules
let mockJsonDb = { userbots: {} };
const mockMongoStore = [];

mongoose.connect = async function() {
  mongoose.connection.readyState = 1;
  mongoose.connection.name = 'MockDB';
  return mongoose;
};

mongoose.disconnect = async () => {
  mongoose.connection.readyState = 0;
};

// Simple stubs for schema actions
mongoose.Model.find = async () => mockMongoStore;
mongoose.Model.findOneAndUpdate = async (query, update, opts) => {
  let bot = mockMongoStore.find(b => b.telegram_id === query.telegram_id);
  const data = update.$set || update;
  if (!bot && opts?.upsert) {
    bot = { telegram_id: query.telegram_id, ...data };
    mockMongoStore.push(bot);
  } else if (bot) {
    Object.assign(bot, data);
  }
  return bot;
};

fs.existsSync = (path) => path.endsWith('database.json') ? true : fs.existsSync(path);
fs.readFileSync = (path, enc) => path.endsWith('database.json') ? JSON.stringify(mockJsonDb) : fs.readFileSync(path, enc);
fs.writeFileSync = (path, data) => {
  if (path.endsWith('database.json')) {
    mockJsonDb = JSON.parse(data);
    return;
  }
  fs.writeFileSync(path, data);
};

// 2. Import modules to test
import userbotManager from '../src/userbot/manager.js';
import { UserbotClient } from '../src/userbot/client.js';
import { MockTelegramClient } from './mockGramJS.js';

// 3. Override UserbotClient instantiation
UserbotClient.prototype.start = async function() {
  // Injects our mock client
  this.client = new MockTelegramClient(this.telegramId);
  this.isActive = true;
  this.registerHandlers();
};

const testCases = [];
function test(id, name, fn) {
  testCases.push({ id, name, fn });
}

// --- Example Test Cases ---

// Feature 1: Persistent Scheduler
test('TS-T1-01', 'Scheduler - .loop 1 Hello starts an active loop', async () => {
  const ubot = userbotManager.clients.get(12345);
  await ubot.client.simulateNewMessage({
    senderId: 12345,
    chatId: 67890,
    text: '.loop 1 Hello',
    out: true
  });
  
  // Assert: loop is recorded in mock client messages
  const lastEdit = ubot.client.editedMessages.find(m => m.text.includes('Loop Aktif'));
  if (!lastEdit) throw new Error('Failed to activate loop command');
});

// Feature 2: Custom Prefix
test('CS-T1-06', 'Settings - .setprefix ! changes the command prefix to !', async () => {
  const ubot = userbotManager.clients.get(12345);
  await ubot.client.simulateNewMessage({
    senderId: 12345,
    chatId: 67890,
    text: '.setprefix !',
    out: true
  });
  // Assert: setting changed to '!'
});

// 4. Test Execution Engine
async function runSuite() {
  console.log('🏁 Starting E2E Testing Runner (Tiers 1-4)...');
  
  // Start mock userbot instance
  await userbotManager.startUserbot(12345, 'mock_session');

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const tc of testCases) {
    try {
      await tc.fn();
      console.log(`  ✅ [PASS] ${tc.id}: ${tc.name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${tc.id}: ${tc.name} -> ${err.message}`);
      failed++;
      failures.push({ id: tc.id, name: tc.name, error: err.message });
    }
  }

  console.log('\n======================================');
  console.log('📊 TEST SUMMARY');
  console.log(`Passed: ${passed} / ${testCases.length}`);
  console.log(`Failed: ${failed} / ${testCases.length}`);
  console.log('======================================\n');

  await userbotManager.stopUserbot(12345);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite().catch(e => {
  console.error('Fatal runner crash:', e);
  process.exit(1);
});
```

---

## 5. Conclusion & Verification Plan

1. **Verification of Mocking Logic**: When running the test suite on the unimplemented codebase, all test cases related to Milestone 2-4 features (Persistent Scheduler, Welcome/Goodbye, Anti-Flood, Custom Prefix, Reputation) must report `❌ [FAIL]`, confirming the test suite is opaque-box and sensitive to feature absence.
2. **Execution Method**: Tests can be launched simply by running:
   ```bash
   node test/runner.js
   ```
   This does not require Docker, real API credentials, or external network access, fully matching the `CODE_ONLY` network constraint.
