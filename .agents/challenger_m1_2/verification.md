# Empirical Verification Report — Database Helpers Stress Test

## Challenge Summary

**Overall risk assessment**: HIGH (for MongoDB deployments) / LOW (for JSON Fallback deployments)

During our empirical stress testing of `src/database/db.js`, we discovered a **Critical Concurrency Defect** in the MongoDB persistence layer. When multiple updates or deletions are run concurrently (e.g., via `Promise.all` or high-frequency event loops), the database state becomes inconsistent with the in-memory cache (`dbCache`). The JSON Fallback mode, however, is immune to this issue because its read-write path is entirely synchronous.

---

## Findings & Challenges

### 🚨 [Critical] MongoDB Async Write Race Condition (Cache-DB Inconsistency)

- **Assumption challenged**: That calling `await` on helpers like `saveSchedule`, `deleteSchedule`, `updateChatSettings`, and `updateReputation` guarantees that the database and the cache remain consistent.
- **Attack scenario**:
  1. Multiple concurrent calls are dispatched to update or delete nested features (e.g., schedules, reputation).
  2. The functions synchronously mutate the in-memory `session` object (retrieved from `dbCache` Map).
  3. The `persistNestedFeature` helper yields to the event loop when awaiting `UserbotModel.updateOne`.
  4. The MongoDB driver sends multiple update queries concurrently. Because these network/DB updates complete out of order, an update reflecting an *earlier* cache state (e.g., 35 schedules remaining) can finish *after* an update reflecting the *final* cache state (e.g., 25 schedules remaining).
  5. The database is left with stale data (35 items), while the in-memory cache correctly has 25 items. Upon the next application restart, the cache is re-hydrated from MongoDB, losing the actual updates.
- **Blast radius**: Schedule losses, wrong reputation values, incorrect chat configuration settings, and database desynchronization.
- **Mitigation**: Implement a serialization mechanism (e.g., a mutex/semaphore, or a queue-based write lock per `telegramId`) to ensure that database updates for the same userbot are executed in sequence, or use MongoDB atomic operators (like `$push`, `$pull`, `$set`) rather than replacing the entire nested array/object on every update.

---

## Stress Test Results

We ran 24 test cases spanning concurrent operations, negative values, empty/null values, special characters, and large numbers in both MongoDB and JSON Fallback modes.

| Test Case / Scenario | Expected Behavior | Actual Behavior (MongoDB Mode) | Actual Behavior (JSON Mode) | Result |
|---|---|---|---|---|
| **Session Cache Creation** | Session is saved to cache | Cached correctly | Cached correctly | **PASS** |
| **Session DB Creation** | Session is saved to DB | Synced to DB correctly | Synced to DB correctly | **PASS** |
| **Concurrent Saves (Schedules)** | 50 concurrent schedule additions | 50 items in cache & DB | 50 items in cache & DB | **PASS** (1) |
| **Concurrent Saves (Reputation)** | 50 concurrent reputation updates | 50 entries in cache & DB | 50 entries in cache & DB | **PASS** |
| **Concurrent Saves (Chat Settings)**| 50 concurrent settings updates | 50 entries in cache & DB | 50 entries in cache & DB | **PASS** |
| **Concurrent Deletes (Schedules)** | Delete 25 schedules concurrently | **Stale DB State (35/50 items)** | 25/50 items in DB | **FAIL (MongoDB)** / **PASS (JSON)** |
| **Negative Reputation** | Storing negative points (e.g. -99999) | Stored -99999 in DB & Cache | Stored -99999 in DB & Cache | **PASS** |
| **Empty/Null Values** | Storing `null` or `""` value/message | Stored as `null`/`""` | Stored as `null`/`""` | **PASS** |
| **Keys with Dots (`chat.with.dots`)** | Key stored successfully | Stored successfully | Stored successfully | **PASS** (2) |
| **Keys with Dollars (`chat$dollar`)** | Key stored successfully | Stored successfully | Stored successfully | **PASS** |
| **Keys with Emojis (`chat_emoji_🔥`)**| Key stored successfully | Stored successfully | Stored successfully | **PASS** |
| **Large Numbers (MAX_SAFE_INT)** | Telegram ID `9007199254740991` | Handled without precision loss | Handled without precision loss| **PASS** |

### Notes:
1. *(1) Concurrent Saves*: While the count matched in this particular run, the same write race condition *could* theoretically cause concurrent saves to overwrite each other if the final database write resolves out of order.
2. *(2) Keys with Dots*: Storing keys with dots inside `Mixed` fields succeeded because we are replacing the entire field, and the environment's MongoDB version (5.0+) supports dots in keys.

---

## Unchallenged Areas
- **Multiple simultaneous Mongo cluster connections** — out of scope.
- **Underlying Mongoose Schema validations** — assumed standard mongoose driver behavior.

## Verification Command Executed
- MongoDB Mode: `node test-db-stress.js`
- JSON Fallback Mode: `MONGO_URI="" node test-db-stress.js`
