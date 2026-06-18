# Handoff Report - explorer_1

## 1. Observation

- **TelegramClient Lifecycle**: Instantiated in `src/userbot/client.js` on lines 37-46:
  ```javascript
  const stringSession = new StringSession(this.sessionString);
  this.client = new TelegramClient(stringSession, config.apiId, config.apiHash, { ... });
  ```
  Connected on line 48:
  ```javascript
  await this.client.connect();
  ```
  Handlers registered on lines 93-197:
  ```javascript
  this.client.addEventHandler(async (event) => { ... }, new NewMessage({}));
  this.client.addEventHandler(async (event) => { ... }, new Raw({ types: [Api.UpdateBotCallbackQuery] }));
  ```
- **Database & Cache Setup**: Initialized immediately on import in `src/database/db.js` on line 153:
  ```javascript
  await initDatabaseAndCache();
  ```
  If `MONGO_URI` is present and valid, it runs line 79:
  ```javascript
  await mongoose.connect(MONGO_URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 5000 });
  ```
  Otherwise, it falls back to the local database file `database.json` on line 119:
  ```javascript
  const data = readDbFromFile();
  ```
- **Feature Requirements**: The exact requirements for the 5 advanced features (Persistent Scheduler, Chat Settings, Welcome/Goodbye, Anti-Flood, and User Reputation System) are cataloged in detail under `SCOPE.md` (lines 25-101) containing 60 concrete test cases divided into Tiers 1-4.

---

## 2. Logic Chain

1. Since `UserbotClient.start()` in `src/userbot/client.js` initiates the network connection and registers handlers, we can mock GramJS behavior entirely without touching `src/` by overriding `UserbotClient.prototype.start` inside our test helper.
2. Inside the overridden `start()` method, we can instantiate a `MockTelegramClient` which implements all the methods requested by plugins (e.g. `sendMessage`, `deleteMessages`, `getEntity`, `downloadProfilePhoto`, `invoke`, `markAsRead`) and records all operations in arrays.
3. Since `initDatabaseAndCache()` in `src/database/db.js` runs automatically upon ESM import, we can intercept and isolate database connections by stubbing `mongoose.connect`, `mongoose.Model` static methods, and Node's `fs` module functions *before* importing `db.js`.
4. In this way, `isMongo` can be toggled to `true` or `false` in tests to test both MongoDB operations (in-memory) and local JSON storage (via mocked `fs.writeFileSync`) without requiring a running Mongo instance or writing to disk.

---

## 3. Caveats

- This investigation was read-only and no source code files under `src/` were modified.
- The proposed mocking strategy depends on JS prototype modification. If future modules load `TelegramClient` or instantiate it differently (outside of `UserbotClient`), they will bypass this stub.
- The stubs for MongoDB models handle common MongoDB operations like `$push`, `$pull`, `$addToSet`, but do not implement full MongoDB query/update features. If plugins use complex MongoDB queries, the mock must be expanded.

---

## 4. Conclusion

- We have completed the read-only exploration and synthesized findings into `/home/ocan/DeltaUserJS/.agents/sub_orch_e2e_testing/explorer_1/analysis.md`.
- We recommend a design where `test/runner.js` performs global Mongoose and FS stubs, overrides `UserbotClient.prototype.start`, and imports the codebase.
- The `test/mockGramJS.js` file should export a `MockTelegramClient` that supports `simulateNewMessage` and `simulateCallbackQuery` to emulate Telegram interactions.

---

## 5. Verification Method

To verify the test suite and mock designs:
1. Implement the mock and runner files as proposed in `analysis.md` inside a `test/` directory.
2. Run the test runner with Node:
   ```bash
   node test/runner.js
   ```
3. Check that the tests fail when features are not implemented, and succeed once the features are implemented.
