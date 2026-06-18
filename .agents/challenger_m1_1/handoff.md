# Handoff Report: Database Concurrency and Stress Verification

## 1. Observation
- **File Checked**: `/home/ocan/DeltaUserJS/src/database/db.js`
- **Execution Command (JSON Fallback Mode)**: `MONGO_URI="" node test-db-stress.js`
  - Result: `Passed: 10, Failed: 0`.
- **Execution Command (MongoDB Mode)**: `node test-db-stress.js`
  - Result: `Passed: 8, Failed: 2`.
  - Verbatim Error Output:
    ```
    ❌ [FAIL] Stress Test 4: Concurrent Save & Delete Schedules Consistency
       Details: [ 'Schedules length: Cache=100, DB=101' ]
    ❌ [FAIL] Edge Case 1: Negative Reputation (-500)
       Details: [ 'Schedules length: Cache=100, DB=101' ]
    ```
- **Code implementation for persistNestedFeature in `db.js` (lines 528-544)**:
  ```javascript
  async function persistNestedFeature(telegramId, featureName, value) {
    const idNum = Number(telegramId);

    if (isMongo) {
      try {
        await UserbotModel.updateOne({ telegram_id: idNum }, { [featureName]: value });
      } catch (e) {
        console.error(`Error persisting ${featureName} to Mongo:`, e.message);
      }
    } else {
      const data = readDbFromFile();
      if (data.userbots[idNum]) {
        data.userbots[idNum][featureName] = value;
        writeDbToFile(data);
      }
    }
  }
  ```

---

## 2. Logic Chain
1. **In JSON Fallback mode**, all DB modifications are synchronous because `persistNestedFeature` performs synchronous read (`fs.readFileSync`) and write (`fs.writeFileSync`) operations on the main event loop thread without yielding (`await`). Consequently, concurrent tasks in Node.js execute sequentially, preserving cache and file database consistency.
2. **In MongoDB mode**, `persistNestedFeature` initiates an asynchronous network I/O call: `await UserbotModel.updateOne(...)`.
3. In `Stress Test 4`, `saveSchedule` and `deleteSchedule` are called concurrently without being awaited sequentially. The in-memory cache is modified synchronously in order, meaning the final array has the item deleted.
4. However, both Mongoose queries are initiated in parallel. Due to network latency or MongoDB query processing times, the `deleteSchedule` update request is received and processed by MongoDB *before* the `saveSchedule` update request.
5. The `saveSchedule` write executes last at the MongoDB instance, saving the state containing the unsaved/deleted item. Thus, MongoDB contains `101` items, whereas the cache contains `100` items, causing a mismatch.

---

## 3. Caveats
- Testing was performed on the existing MongoDB cluster endpoint provided in the `.env` file. We did not test behavior across multiple active instances of the userbot server (multi-process concurrency), which would likely exacerbate these issues.
- Network latency to the MongoDB cluster is a significant variable; local MongoDB instances with lower latency might pass Stress Test 4 occasionally, but the underlying race condition remains.

---

## 4. Conclusion
The database layer (`src/database/db.js`) is vulnerable to concurrency-related race conditions in MongoDB mode. Concurrent updates (such as rapid saves/deletes) will result in database-cache inconsistency because Mongoose updates are processed asynchronously without sequence control (locking, queueing, or version checks). JSON Fallback mode is not affected because its writes are fully synchronous.

To resolve this, write locking or queueing must be introduced for updates targeting the same userbot document.

---

## 5. Verification Method
1. Re-create the test harness file `test-db-stress.js` using the contents documented in `verification.md`.
2. Run in MongoDB mode: `node test-db-stress.js`
3. Verify that `Stress Test 4` fails with `Schedules length: Cache=100, DB=101` (or another mismatch value).
4. Run in JSON Fallback mode: `MONGO_URI="" node test-db-stress.js` and verify it passes.
