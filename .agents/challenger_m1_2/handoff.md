# Handoff Report — challenger_m1_2

## 1. Observation
- In `src/database/db.js` (lines 528-544):
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
- Executing `node test-db-stress.js` (MongoDB Mode) outputted:
  ```
  ❌ FAIL: DB schedules count after delete - Expected 25, got 35
  ```
- Executing `MONGO_URI="" node test-db-stress.js` (JSON Fallback Mode) outputted:
  ```
  Passed: 24/24
  Failed: 0/24
  ✅ ALL TESTS PASSED!
  ```

## 2. Logic Chain
- `persistNestedFeature` is an `async` function. In MongoDB mode, it awaits `UserbotModel.updateOne`, yielding control back to the event loop.
- When concurrent operations are invoked (e.g., inside `Promise.all` or rapidly in succession), they read and modify the shared cache object synchronously, but trigger the database update asynchronously.
- Because MongoDB driver updates run concurrently over the network/DB connection, their execution or commitment order is non-deterministic.
- A database write from a tick containing *fewer* deletions (representing a stale cache state of 35 items) can resolve *after* a write containing *more* deletions (representing the latest cache state of 25 items).
- Consequently, the database is left with the stale 35-item array, while the in-memory `dbCache` Map correctly has 25 items. Upon the next process boot, the stale database state will overwrite memory, causing silent data loss.
- In JSON Fallback mode, the `else` block executes fully synchronously via `fs.readFileSync` and `fs.writeFileSync`. As there are no asynchronous yields, operations are fully serialized, preventing race conditions.

## 3. Caveats
- Key restrictions: Key dots/dollar signs succeeded in this test because the environment runs a newer MongoDB version (5.0+) that accepts dots/dollars inside subdocuments. On older MongoDB versions, this would fail and catch/suppress the mongoose write error, causing further desynchronization.
- Precision: Telegram IDs and reputation points exceeding `Number.MAX_SAFE_INTEGER` (`9007199254740991`) suffer from standard JavaScript IEEE-754 double-precision rounding.

## 4. Conclusion
The database helper layer in `src/database/db.js` is thread-unsafe under concurrency when running in MongoDB mode, leading to silent cache-DB desynchronization and data loss for schedules, settings, and reputation updates. JSON fallback mode is safe because it is entirely synchronous.

## 5. Verification Method
- Re-create `test-db-stress.js` using the code saved in `verification.md` or this report.
- Run `node test-db-stress.js` (MongoDB mode) to reproduce the desynchronization.
- Run `MONGO_URI="" node test-db-stress.js` (JSON mode) to verify fallback correctness.
