# Handoff Report: Database Schema & Cache Expansion (Milestone 1)

## 1. Observation
- File `src/database/db.js` defines `UserbotSchema` (lines 22-41) and exports helper functions to interact with userbot sessions.
  ```javascript
  22: const UserbotSchema = new mongoose.Schema({
  23:   telegram_id: { type: Number, required: true, unique: true },
  ...
  39:   warn_data: { type: mongoose.Schema.Types.Mixed, default: {} },
  40:   lock_config: { type: mongoose.Schema.Types.Mixed, default: {} }
  41: });
  ```
- File `src/database/db.js` initializes the database cache via `initDatabaseAndCache` (lines 72-150) for both MongoDB and JSON file (`database.json`) modes:
  - MongoDB (lines 87-108):
    ```javascript
    89:         dbCache.set(bot.telegram_id, {
    ...
    106:           warn_data: bot.warn_data || {},
    107:           lock_config: bot.lock_config || {}
    108:         });
    ```
  - Local JSON Fallback (lines 125-144):
    ```javascript
    125:     const botData = {
    ...
    142:       warn_data: bot.warn_data || {},
    143:       lock_config: bot.lock_config || {}
    144:     };
    ```
- Session updates/creation via `saveUserbotSession` (lines 161-205) map existing session features to `botData`:
  ```javascript
  168:   const botData = {
  ...
  185:     warn_data: existing.warn_data || {},
  186:     lock_config: existing.lock_config || {}
  187:   };
  ```
- A private persistence helper `persistNestedFeature` exists in `src/database/db.js` (lines 516-532):
  ```javascript
  516: async function persistNestedFeature(telegramId, featureName, value) {
  517:   const idNum = Number(telegramId);
  518: 
  519:   if (isMongo) {
  520:     try {
  521:       await UserbotModel.updateOne({ telegram_id: idNum }, { [featureName]: value });
  522:     } catch (e) {
  ...
  526:   } else {
  527:     const data = readDbFromFile();
  528:     if (data.userbots[idNum]) {
  529:       data.userbots[idNum][featureName] = value;
  530:       writeDbToFile(data);
  531:     }
  532:   }
  533: }
  ```

---

## 2. Logic Chain
- **Requirement 1**: Extend `UserbotSchema` to include `schedules`, `chat_settings`, and `reputation_data`.
  - *Reasoning*: Adding these fields to `UserbotSchema` using the appropriate Mongoose types ensures validation and schema compliance during MongoDB operations.
- **Requirement 2**: Correct initialization in `initDatabaseAndCache`.
  - *Reasoning*: If we do not load `schedules`, `chat_settings`, and `reputation_data` into the in-memory cache (`dbCache`) during initialization, any call to read them will return empty values despite being present in the database. Thus, both loaders must retrieve these fields.
- **Requirement 3**: Preserved/managed in `saveUserbotSession`.
  - *Reasoning*: `saveUserbotSession` generates a clean `botData` object. If `schedules`, `chat_settings`, and `reputation_data` are not preserved from the `existing` session, they will be overwritten and lost whenever a user saves or updates a session string or phone number.
- **Requirement 4**: Implement clean getter/setter helper functions.
  - *Reasoning*: The existing helper functions in `src/database/db.js` (such as warnings and lock configuration) use the private `persistNestedFeature` function to synchronously update `dbCache` and write back to either MongoDB or the JSON file fallback. Reusing `persistNestedFeature` inside the new setter helper functions guarantees consistency and code reuse.

---

## 3. Caveats
- The parameter name in `PROJECT.md` for `saveSchedule` is `chatId`, whereas in `SCOPE.md` it is `chatKey`. To maintain robustness, the proposed code handles both by mapping the key argument to the `chatKey` field inside the schedule object.
- The `database.json` fallback format requires keys inside JSON objects to be stringified. When retrieving or setting chat settings or reputation, the keys (chat ID, user ID) must be stringified (e.g., `String(chatId)`) to ensure consistency.

---

## 4. Conclusion
The database schema can be successfully extended, cached, and synced to MongoDB/JSON. The proposed implementation plan in `analysis.md` contains the exact code changes and helper signatures to meet all of the sub-orchestrator's specifications.

---

## 5. Verification Method
- Code changes can be verified by running the project's start command (or importing `src/database/db.js` in a test script) and checking for database errors during initialization.
- Write a simple test harness (e.g. `test-db-extension.js`) to assert that:
  - `saveSchedule` adds a schedule to both MongoDB/JSON and `dbCache`.
  - `getSchedules` correctly retrieves schedules.
  - `deleteSchedule` removes a schedule.
  - `getChatSettings` and `updateChatSettings` persist configurations.
  - `getReputation` and `updateReputation` correctly track scores.
