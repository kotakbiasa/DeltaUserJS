# Empirical Verification Report: Database Stress Test

## Executive Summary
This report presents the findings from an empirical stress-testing session of the DeltaUserJS database layer (`src/database/db.js`). Testing was conducted under both **JSON Fallback Mode** (with `MONGO_URI` cleared) and **MongoDB Mode** (using an active cluster connection).

The testing harness (`test-db-stress.js`) ran concurrent, high-frequency database operations and evaluated edge cases (negative reputation, special characters, null/empty values, and extremely large numbers).

**Overall Status**: 🔴 **FAILED** (MongoDB Mode exhibits a critical concurrency-related race condition causing DB-cache inconsistency).

---

## 1. Test Methodology
The stress test executed the following suites for a test userbot ID (`999999999`):
1. **Stress Test 1**: 100 concurrent updates to `updateChatSettings` with distinct keys.
2. **Stress Test 2**: 100 concurrent updates to `updateReputation` for distinct users.
3. **Stress Test 3**: 100 concurrent updates to `saveSchedule` with distinct types.
4. **Stress Test 4**: 100 concurrent updates firing both `saveSchedule` and `deleteSchedule` for the same/different keys in parallel (`Promise.all`).
5. **Edge Cases**:
   - Negative reputation: `updateReputation` with points `-500` and `-99999999999`.
   - Empty/Null values: `saveSchedule` with null value and empty string message.
   - Special characters: Keys and values containing characters like `$._@*&%!+=-/\\~#*[]{}(),.?`.
   - Very large numbers: `Number.MAX_SAFE_INTEGER` (`9007199254740991`) as both IDs and reputation points.
6. **Cleanup**: Deleting the userbot session via `deleteUserbot` and verifying that the database document and in-memory cache are empty.

---

## 2. Test Execution Results

### 2.1 JSON Fallback Mode
* **Result**: `10 / 10 passed`
* **Observation**: All operations (including high concurrency and concurrent saves/deletes) completed with 100% database-to-cache consistency.
* **Reason**: In JSON mode, `db.js` uses synchronous filesystem reads/writes (`fs.readFileSync` and `fs.writeFileSync`) inside the `persistNestedFeature` helper. Although the outer wrapper functions are async, Node.js executes the synchronous write block sequentially in the same event-loop tick without yielding, preventing interleaving and out-of-order writes.

### 2.2 MongoDB Mode
* **Result**: `8 / 10 passed, 2 failed`
* **Failures**:
  - `Stress Test 4: Concurrent Save & Delete Schedules Consistency` (Details: `Schedules length: Cache=100, DB=101`)
  - `Edge Case 1: Negative Reputation` (Failed because the schedules array inconsistency from Test 4 persisted and failed the general consistency check).
* **Detailed Logs**:
  ```
  === DeltaUserJS DB Stress Test ===
  Mode: MongoDB Mode
  MONGO_URI: mongodb+srv://...
  ==================================
  Setting up test userbot 999999999...
  ✅ [PASS] Setup & Initial Consistency
  Running Stress Test 1: 100 concurrent updates to updateChatSettings...
  ✅ [PASS] Stress Test 1: Concurrent Chat Settings Updates Consistency
  Running Stress Test 2: 100 concurrent updates to updateReputation...
  ✅ [PASS] Stress Test 2: Concurrent Reputation Updates Consistency
  Running Stress Test 3: 100 concurrent updates to saveSchedule...
  ✅ [PASS] Stress Test 3: Concurrent Schedules Updates Consistency
  Running Stress Test 4: Concurrently firing save and delete schedule calls...
  ❌ [FAIL] Stress Test 4: Concurrent Save & Delete Schedules Consistency
     Details: [ 'Schedules length: Cache=100, DB=101' ]

  Testing Edge Cases...
  Edge Case 1: Negative reputation points...
  ❌ [FAIL] Edge Case 1: Negative Reputation (-500)
     Details: [ 'Schedules length: Cache=100, DB=101' ]
  Edge Case 2: Empty/Null values...
  ✅ [PASS] Edge Case 2: Empty/Null values
  Edge Case 3: Special characters in keys...
  ✅ [PASS] Edge Case 3: Special characters in keys
  Edge Case 4: Very large numbers...
  ✅ [PASS] Edge Case 4: Very large numbers

  Cleaning up dummy records for test userbot 999999999...
  ✅ [PASS] Cleanup Verification
  ```

---

## 3. Vulnerability Analysis & Logic Chain

### 3.1 Concurrency Write Race Condition (The Out-of-Order Write Bug)
1. **Observation**: During parallel execution (`Promise.all`), `saveSchedule` and `deleteSchedule` are called for the same keys. The in-memory cache is modified synchronously and correctly results in a final array length of `100`.
2. **Observation**: However, MongoDB records show `101` items in the database.
3. **Logic Chain**:
   - `saveSchedule` runs synchronously, modifies `session.schedules` in-place, and fires `persistNestedFeature` (which calls Mongoose's async `updateOne`).
   - `deleteSchedule` runs synchronously immediately after, filters the array in-place, and fires `persistNestedFeature` (another async `updateOne`).
   - Because Mongoose's `updateOne` is asynchronous, both update queries are dispatched to MongoDB concurrently.
   - Network latency or database-side scheduling causes the `deleteSchedule` update request to be processed by MongoDB *before* the `saveSchedule` update request.
   - The database saves the state from `saveSchedule` last, overriding the deleted schedule and resulting in a document with 101 items.
   - Thus, the cache (`dbCache` = 100 items) and MongoDB (`database` = 101 items) diverge.

### 3.2 Non-Upsert Feature Updates on Brand New Documents
1. **Observation**: `saveUserbotSession` is synchronous and initiates `findOneAndUpdate` asynchronously with `{ upsert: true }` without awaiting it.
2. **Logic Chain**:
   - If a new userbot session is added, and the application immediately fires `updateChatSettings` or `updateReputation`, `updateChatSettings` uses `updateOne` which does not upsert.
   - If the `updateOne` request reaches MongoDB before the initial `findOneAndUpdate` finishes creating the document, `updateOne` matches 0 documents and silently fails. The updates are lost.

---

## 4. Recommended Mitigations
To solve the concurrency bugs in MongoDB mode, we recommend implementing the following:
1. **Update Queuing / Mutex**: Implement a write-lock or queue per `telegramId` so that updates to the same userbot document are executed sequentially rather than in parallel.
2. **Mongoose Versioning / Optimistic Concurrency**: Enable Mongoose's optimistic concurrency control (OCC) using `optimisticConcurrency: true` on the schema, or manually increment a version field and match it on updates (e.g., `{ telegram_id, version: currentVersion }`).
3. **Upsert on Feature Updates**: Add `{ upsert: true }` to `persistNestedFeature`'s update queries to ensure updates are not lost if the document creation is still pending.
