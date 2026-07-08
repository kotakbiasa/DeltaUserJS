# Performance Review: DeltaUserJS

## Executive Summary

DeltaUserJS is a multi-tenant Telegram userbot manager with 25+ plugins. The codebase shows good architectural patterns but has several performance bottlenecks, memory leak risks, and inefficiencies that need attention, especially as the number of concurrent userbots scales.

**Key Findings:**
- ✅ Good: In-memory caching, per-key locking, rate limiting
- ⚠️ Concerns: Unbounded in-memory trackers, N+1 database patterns, blocking operations in hot paths
- 🔴 Critical: Potential memory leaks in flood/reputation trackers, inefficient plugin iteration

---

## 1. Memory Issues

### 🔴 CRITICAL: Unbounded In-Memory Trackers

**Files:** `antiflood.ts`, `reputation.ts`, `schedule.ts`

#### Issue 1: floodTracker (antiflood.ts:6)
```typescript
const floodTracker = new Map();
// Key: `${telegramId}_${chatId}_${senderId}` -> timestamps[]
```
- **Problem**: Keys are never cleaned up when timestamps array becomes empty. While there's a cleanup at line 122-124, it only runs when the array is filtered to empty. In high-traffic groups with many unique users, this can grow unbounded.
- **Impact**: Memory leak proportional to unique (user, chat, bot) combinations over time.
- **Recommendation**: 
  - Add a periodic cleanup (e.g., every 5 minutes) to remove stale entries.
  - Use a `WeakMap` or TTL-based eviction.
  - Cap the total number of tracked keys.

#### Issue 2: cooldownMap (reputation.ts:5)
```typescript
const cooldownMap = new Map();
// Key: `${telegramId}_${chatId}_${senderId}_${targetId}` -> lastVoteTime
```
- **Problem**: Entries are never removed. Over months, this accumulates indefinitely.
- **Impact**: Linear memory growth with every unique vote pair.
- **Recommendation**: 
  - Implement TTL: delete entries older than 30 seconds (the cooldown period).
  - Use `setTimeout` to auto-delete after cooldown expires.
  - Example:
    ```typescript
    cooldownMap.set(voterKey, Date.now());
    setTimeout(() => {
      if (cooldownMap.get(voterKey) === Date.now()) {
        cooldownMap.delete(voterKey);
      }
    }, 30000);
    ```

#### Issue 3: loopStore (schedule.ts:5)
```typescript
export const loopStore = new Map();
// telegramId -> Map<chatId, { intervalId, ... }>
```
- **Problem**: When a userbot is stopped, its loops are not automatically cleared from `loopStore`. The `stopLoop` function is called, but if the userbot crashes or is force-stopped, intervals may leak.
- **Recommendation**: 
  - In `UserbotClient.stop()`, call `stopAllLoops(telegramId)`.
  - Add a cleanup on `userbotManager.stopUserbot()`.

### ⚠️ WARNING: Global Maps Without Cleanup

**Files:** `dbCore.ts`, `manager.ts`

- `dbCache` (Map): Holds all userbot sessions. This is bounded by the number of registered users (likely fine).
- `fedCache`, `groupConfigCache`: Similar to dbCache, bounded.
- `locks` in `manager.ts` (line 16): Per-ID mutex promises. These are cleaned up after release, but if a lock is acquired and never released (e.g., due to an unhandled exception), the key remains forever.
  - **Recommendation**: Add a timeout to lock acquisition and ensure `release()` is always called in a `finally` block.

---

## 2. Inefficient Database Operations

### 🔴 N+1 Query Pattern in `UserbotService.ts`

Multiple functions update the cache and then persist to DB separately, causing two writes:

```typescript
// Example: updateUserbotFeature (line 56-70)
cached[featureName] = value;          // Write 1: in-memory
return persistField(idNum, featureName, value); // Write 2: DB
```

- **Problem**: For MongoDB, this results in two operations. For JSON file, it reads the entire file, modifies, and writes it back — every time.
- **Impact**: High I/O overhead, especially for JSON backend.
- **Recommendation**: 
  - Batch updates when possible.
  - For JSON, debounce writes (e.g., write every 5 seconds instead of immediately).
  - Consider using a proper embedded DB like SQLite for better write performance.

### ⚠️ Redundant Cache Lookups

In `dbCore.ts`, functions like `updateCacheField` (line 50-60) acquire a per-key lock, then read the entire cache entry, clone it, modify one field, and write back. This is safe but inefficient for frequent updates.

- **Recommendation**: For hot fields (e.g., `is_active`, `vars`), consider direct field updates without full object cloning.

### ⚠️ JSON File I/O on Every Write

`readDbFromFile()` and `writeDbToFile()` are called on every single field update when using JSON backend.

- **Impact**: For a busy userbot with many settings changes, this causes constant disk I/O.
- **Recommendation**: 
  - Implement a write-back cache: buffer changes and flush to disk periodically (e.g., every 10 seconds).
  - Use `fs.appendFile` with a log-structured approach for better performance.

---

## 3. Blocking Operations in Hot Paths

### 🔴 Plugin Execution is Sequential

**File:** `client.ts` lines 169-177

```typescript
for (const plugin of loadedPlugins) {
  if (disabled.has(normalizePluginName(plugin.name))) continue;
  try {
    await plugin.execute(this.client, message, settings, this.telegramId);
  } catch (err) { ... }
}
```

- **Problem**: All plugins execute sequentially in the message handler. If one plugin is slow (e.g., `kang.ts` downloading media, `stalk.ts` fetching 100 messages), it blocks all subsequent plugins.
- **Impact**: High message processing latency, especially with 25+ plugins.
- **Recommendation**:
  - Run plugins in parallel with `Promise.allSettled`, but respect plugin dependencies if any.
  - Add a timeout per plugin (e.g., 5 seconds) to prevent one slow plugin from blocking others.
  - Prioritize fast plugins (e.g., `antiflood`, `reputation`) before slow ones.

### ⚠️ Synchronous File Operations

**File:** `kang.ts` lines 79, 82, 166-168

```typescript
fs.writeFileSync(tmpPath, buffer);
fs.unlinkSync(tmpPath);
```

- **Problem**: Synchronous file I/O blocks the event loop.
- **Impact**: If multiple users run `.kang` simultaneously, the entire process stalls.
- **Recommendation**: Use `fs.promises.writeFile` and `fs.promises.unlink` instead.

### ⚠️ Logger Sends Telegram Messages Synchronously

**File:** `logger.ts` lines 30-37, 55-61

```typescript
await masterBot.api.sendMessage(logChatId, ...);
```

- **Problem**: Every `Logger.logSystem()` and `Logger.logUser()` call sends a Telegram message. If logging is verbose, this creates a flood of API calls.
- **Impact**: Rate limits, increased latency, unnecessary network traffic.
- **Recommendation**:
  - Make logging asynchronous with a queue and batch messages.
  - Add a log level filter (e.g., only send ERROR/WARN to Telegram).
  - Debounce: collect logs and send every 5 seconds.

---

## 4. Unbounded Loops & Missing Safeguards

### ⚠️ `restartAllActive()` Has No Concurrency Limit

**File:** `manager.ts` lines 135-150

```typescript
for (const bot of activeBots) {
  const delayMs = Math.floor(Math.random() * 3000) + 2000;
  await sleep(delayMs);
  await this.startUserbot(bot.telegram_id, bot.session_string);
}
```

- **Problem**: If there are 100+ active userbots, this loop runs sequentially with random delays, taking potentially hours to start all.
- **Impact**: Slow startup, especially after a restart.
- **Recommendation**:
  - Start userbots in parallel with a concurrency limit (e.g., 5 at a time).
  - Use `p-limit` or a simple semaphore.

### ⚠️ `getDialogs()` Fetches All Dialogs

**File:** `gcast.ts` line 56

```typescript
const dialogs = await client.getDialogs();
```

- **Problem**: For users in thousands of groups, this API call can be slow and memory-intensive.
- **Impact**: `.gcast` command may timeout or consume excessive memory.
- **Recommendation**:
  - Paginate: fetch dialogs in batches.
  - Cache the dialog list and refresh periodically instead of fetching every time.

### ⚠️ `getMessages` Fetches 100 Messages

**File:** `stalk.ts` line 48-51

```typescript
const history = await client.getMessages(message.peerId, {
  fromUser: targetUser,
  limit: 100
});
```

- **Problem**: Fetching 100 messages for every `.stalk` command is heavy.
- **Impact**: Slow response, high API usage.
- **Recommendation**:
  - Reduce limit to 20-30.
  - Cache results per (chat, user) for a short TTL (e.g., 1 minute).

---

## 5. Missing Caching Opportunities

### ⚠️ Repeated `getUserbotSession()` Calls

In `client.ts` line 130, `getUserbotSession(this.telegramId)` is called on every message. This is an O(1) Map lookup, so it's fine. However, in plugins like `antiflood.ts` and `reputation.ts`, `getChatSettings()` is called multiple times per message.

- **Recommendation**: Cache `chatSettings` for the duration of message processing. Since settings don't change mid-message, read once and reuse.

### ⚠️ `getEntity()` Called Repeatedly for Same User

In `antiflood.ts` lines 171-172, 185-186 and `reputation.ts` lines 68-69, 109-110, 165-166, 171-172, `client.getEntity(userId)` is called multiple times for the same user in quick succession.

- **Problem**: Each call hits Telegram's API (or entity cache), which is slow.
- **Recommendation**: 
  - Cache entity results per user ID for the lifetime of the client session.
  - Teleproto/GramJS may already have an internal entity cache; verify and leverage it.

### ⚠️ No Caching for `getGroupConfig()`

`getGroupConfig()` (in `UserbotService.ts` line 315-331) always returns from `groupConfigCache`, which is good. But it also constructs a default object every time for missing configs. This is minor but could be optimized by caching the default template.

---

## 6. Network Call Optimization

### ⚠️ No Request Deduplication

If multiple plugins need the same data (e.g., user entity, chat settings), they each make separate calls.

- **Recommendation**: Implement a request deduplication layer (like React Query's `staleTime`). For example, if two plugins need `client.getEntity(userId)` within 1 second, only one API call should be made.

### ⚠️ `gcast` Dynamic Delay is Inefficient

**File:** `gcast.ts` lines 100-102

```typescript
const delay = i >= MAX_MESSAGES_PER_MINUTE ? 5000 : 2000;
await new Promise(r => setTimeout(r, delay));
```

- **Problem**: Fixed delays don't adapt to actual API rate limits. If Telegram returns a flood wait error, the plugin doesn't back off.
- **Recommendation**: Implement exponential backoff based on actual API responses.

---

## 7. Database Optimization

### ⚠️ No Indexes on Frequently Queried Fields

In `dbCore.ts`, Mongoose schemas define indexes on `telegram_id` and `chat_id`, which is good. However, queries like `getAllActiveUserbots()` scan the entire collection if `is_active` is not indexed.

- **Recommendation**: Add a compound index on `{ is_active: 1, telegram_id: 1 }` for faster active userbot lookups.

### ⚠️ `persistField` Uses `$set` but Still Updates Entire Document

For MongoDB, `UserbotModel.updateOne({ telegram_id: idNum }, { $set: update })` is efficient. However, for JSON backend, the entire file is read and written on every field update.

- **Recommendation**: For JSON, implement a journaling system: append updates to a separate log file and periodically compact.

---

## 8. Code Path Analysis: Hot Paths

### Message Handler (client.ts lines 125-178)
**Frequency**: Every message received by every userbot.
**Operations**:
1. `getUserbotSession()` — O(1) Map lookup ✅
2. Build `disabledSet` — O(n) where n = number of disabled plugins (small) ✅
3. Iterate all plugins — O(p) where p = 25+ plugins ⚠️
4. Each plugin may call DB, API, file I/O 🔴

**Bottleneck**: Sequential plugin execution + slow plugins.

### Watchdog (manager.ts lines 172-208)
**Frequency**: Every 120 seconds.
**Operations**:
1. `getAllActiveUserbots()` — O(n) scan of dbCache ✅
2. For each active bot, check connection and possibly reconnect.
3. `startUserbot()` acquires lock, creates client, connects.

**Bottleneck**: If many userbots are down, reconnection storms can occur.

### Expiration Checker (index.ts lines 34-78)
**Frequency**: Every 60 seconds.
**Operations**:
1. `getAllRegisteredUsers()` — O(n) scan of dbCache ✅
2. For each user, check expiration and possibly stop userbot.

**Bottleneck**: None significant, but runs synchronously with no concurrency control.

---

## Recommendations Summary

### High Priority (Performance Impact)

1. **Parallelize plugin execution** with timeouts and error isolation.
2. **Add TTL to in-memory trackers** (floodTracker, cooldownMap) to prevent memory leaks.
3. **Implement write-back caching** for JSON database to reduce I/O.
4. **Add concurrency limit** to `restartAllActive()` and `watchdog`.
5. **Use async file I/O** in `kang.ts` and other file operations.

### Medium Priority (Scalability)

6. **Cache `client.getEntity()` results** to reduce API calls.
7. **Add database indexes** on `is_active` and frequently queried fields.
8. **Implement request deduplication** for concurrent identical requests.
9. **Debounce logger Telegram messages** to reduce API flood.
10. **Paginate `getDialogs()`** in `gcast.ts`.

### Low Priority (Code Quality)

11. **Add TypeScript strict mode** to catch type-related bugs.
12. **Add performance monitoring** (e.g., track plugin execution times).
13. **Document plugin execution order** and dependencies.
14. **Add graceful degradation** when DB or API is slow.

---

## Estimated Impact

| Optimization | Expected Improvement |
|--------------|---------------------|
| Parallel plugin execution | 2-5x faster message processing |
| TTL on trackers | Prevents memory leaks (unbounded growth) |
| Write-back caching | 10-100x fewer disk writes |
| Concurrency limits | Faster startup, controlled resource usage |
| Entity caching | 50-80% fewer API calls |

---

## Conclusion

DeltaUserJS has a solid foundation with good separation of concerns and in-memory caching. The main performance risks are unbounded memory growth in trackers, sequential plugin execution, and inefficient I/O patterns. Addressing the high-priority items will significantly improve scalability and stability, especially as the number of concurrent userbots grows beyond 10-20.
