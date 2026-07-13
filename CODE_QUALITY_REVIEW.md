# Code Quality Audit Report: DeltaUserJS

## Executive Summary

DeltaUserJS is a 7,672-line TypeScript multi-userbot manager using grammy (master bot) and GramJS/teleproto (userbot clients). The codebase is functional and shows awareness of some best practices (input sanitization, rate limiting, AES-256-GCM encryption, MongoDB + JSON fallback), but it has significant code quality issues: type safety is largely disabled, error handling is inconsistent, there are duplicate lock implementations, global state is used extensively, and hardcoded credentials violate security conventions. Many handlers are well-structured but suffer from boilerplate duplication and mixed concerns.

---

## Critical Findings

### 1. Hardcoded Telegram API Credentials
**Severity:** CRITICAL
**Files:** `src/config.ts` lines 12-13
**Details:** `apiId` and `apiHash` are hardcoded in source:
```typescript
apiId: 2496,
apiHash: "8da85b0d5bfe62527e5b244c209159c3",
```
These are public Telegram test credentials, but the pattern normalizes committing secrets.
**Impact:** Even if these are intentionally public, it encourages future commits with real secrets. AGENTS.md explicitly warns against hardcoded credentials.
**Fix:** Require from `.env` with no fallback:
```typescript
apiId: process.env.API_ID ? parseInt(process.env.API_ID) : undefined,
apiHash: process.env.API_HASH,
if (!config.apiId || !config.apiHash) {
  console.error('⛔ FATAL: API_ID and API_HASH must be set in .env');
  process.exit(1);
}
```

### 2. Type Safety Largely Disabled
**Severity:** CRITICAL
**Files:** `tsconfig.json` line 7; 14 files with `// @ts-nocheck`; 196 functions without return types
**Details:**
- `tsconfig.json` sets `"strict": false`
- 14 files disable type checking entirely via `// @ts-nocheck`:
  `src/bot/conversations/registration.ts`, `src/bot/conversations/settings.ts`, `src/bot/handlers/callbacks.ts`, `src/bot/handlers/inlineHelp.ts`, `src/bot/handlers/owner.ts`, `src/bot/index.ts`, `src/bot/ui/keyboards/dashboard.ts`, `src/infrastructure/dbCore.ts`, `src/userbot/engine/client.ts`, `src/userbot/engine/pluginRegistry.ts`, `src/userbot/handlers/tools/carbon.ts`, `src/userbot/handlers/tools/kang.ts`, `src/userbot/handlers/util/info.ts`, `src/userbot/handlers/util/stalk.ts`
- 196 exported/function declarations have no return type annotations
- 3 instances of `as any` type assertions
**Impact:** Type errors go undetected until runtime; refactoring is risky; IDE support is degraded.
**Fix:** Remove `// @ts-nocheck`, enable `"strict": true` incrementally, and add return types to all exported functions.

### 3. Global Prototype Modification
**Severity:** CRITICAL
**Files:** `src/bot/conversations/registration.ts` line 18
**Details:** Directly mutates a third-party class prototype:
```typescript
TelegramClient.prototype.signIn = async function ({ phoneNumber, phoneCodeHash, phoneCode, password }) { ... };
```
**Impact:** Breaks encapsulation, risks conflicts with other patches, makes upgrades unsafe.
**Fix:** Extract into a wrapper utility or subclass; avoid mutating external prototypes.

### 4. Mixed Persistence Strategy Without Abstraction
**Severity:** HIGH
**Files:** `src/infrastructure/dbCore.ts`, `src/services/UserbotService.ts`
**Details:** Every persistence function branches on `if (isMongo) { ... } else { ... }`. `UserbotService.ts` line 342 also bypasses types with `(GroupConfigModel as any).findOneAndUpdate`. The codebase has both a MongoDB path and a JSON-file fallback in the same functions.
**Impact:** Code is harder to test, harder to reason about, and changes to one backend require touching every persistence call.
**Fix:** Abstract behind a repository interface (e.g., `UserbotRepository`) with `MongoUserbotRepository` and `FileUserbotRepository` implementations.

---

## High Findings

### 5. Duplicate AsyncLock Implementations
**Severity:** HIGH
**Files:** `src/infrastructure/dbCore.ts` lines 14-48; `src/userbot/engine/manager.ts` lines 15-32
**Details:** Two separate `AsyncLock` / per-key lock implementations exist:
- `dbCore.ts`: `keyLocks` Map + `acquireCacheLock()` for cache read-modify-write
- `manager.ts`: `locks` Map + `acquireLock()` for userbot lifecycle
The logic is similar but not identical, and both handle queue/release patterns.
**Impact:** Bug fixes must be applied twice; behavior can diverge.
**Fix:** Extract a shared `AsyncLock` utility into `src/utils/AsyncLock.ts` and import from both.

### 6. Global State Mutations
**Severity:** HIGH
**Files:** `src/index.ts` line 115; `src/bot/handlers/callbacks.ts` lines 12-13, 87, 95
**Details:**
```typescript
global.MASTER_BOT_USERNAME = info.username; // index.ts:115
global.approvedUsers = new Set(); // callbacks.ts:13
global.approvedUsers.add(targetId); // callbacks.ts:87
```
**Impact:** Hard to test, creates hidden coupling, and can cause memory leaks since `global.approvedUsers` is never cleaned up.
**Fix:** Encapsulate in an `AppState` class or dedicated service; inject where needed.

### 7. Unbounded In-Memory Maps (Memory Leak Risk)
**Severity:** HIGH
**Files:** Multiple handler and engine files
**Details:**
- `src/infrastructure/dbCore.ts`: `dbCache`, `fedCache`, `groupConfigCache`, `keyLocks` — no TTL cleanup
- `src/userbot/handlers/group/antiflood.ts`: `floodTracker` — has cleanup every 10 min, good
- `src/userbot/handlers/group/reputation.ts`: `cooldownMap` — has cleanup every 10 min, good
- `src/userbot/handlers/util/schedule.ts`: `loopStore` — **no cleanup**; intervals persist even if userbot is stopped
- `src/userbot/handlers/admin/gcast.ts`: `LAST_GCAST` — **no cleanup**; grows with unique users forever
- `src/bot/conversations/registration.ts`: `activeRegClients`, `pendingOtpState` — rely on `cleanupClient()` but can leak on abnormal exits
- `src/userbot/engine/manager.ts`: `clients`, `reconnecting` — rely on lifecycle methods
- `src/userbot/engine/pluginRegistry.ts`: `pluginByName` — static, low risk
**Impact:** Long-running bots accumulate memory; `loopStore` and `LAST_GCAST` will grow unbounded.
**Fix:** Add TTL-based cleanup for `loopStore` and `LAST_GCAST`; ensure `activeRegClients`/`pendingOtpState` are cleared on conversation cancellation.

### 8. Empty Catch Blocks Without Intent Comments
**Severity:** HIGH
**Files:** `src/bot/handlers/callbacks.ts`, `src/bot/handlers/inlineHelp.ts`, `src/bot/handlers/owner.ts`, `src/bot/ui/keyboards/dashboard.ts`, `src/bot/index.ts`, `src/userbot/handlers/tools/carbon.ts`, `src/userbot/handlers/tools/sangmata.ts`, `src/userbot/handlers/util/help.ts`, `src/bot/conversations/registration.ts`, `src/bot/conversations/settings.ts`, `src/userbot/handlers/group/antiflood.ts`, `src/userbot/handlers/group/reputation.ts`, `src/userbot/handlers/util/schedule.ts`, `src/userbot/handlers/admin/gcast.ts`
**Details:** At least 30 empty `catch (_) {}` blocks exist. Some are acceptable (e.g., Telegram `deleteMessage` after already-deleted), but many swallow database errors, API errors, or unknown failures silently:
- `callbacks.ts:21`: `fs.writeFileSync` failure is silently ignored — approval state can be lost
- `gcast.ts:104`: Broadcast failures are counted but `err` details are lost
- `dbCore.ts:200`: `chain.catch(() => { next(); })` silently swallows write-lock promise rejections
**Impact:** Silent data loss, undetected API failures, impossible debugging.
**Fix:** Add comments like `/* ignore: already answered */` for truly acceptable cases; log or handle errors for database, filesystem, and API operations.

### 9. Inconsistent Logging Strategy
**Severity:** HIGH
**Files:** `src/index.ts`, `src/infrastructure/dbCore.ts`, `src/bot/conversations/registration.ts`, `src/userbot/engine/manager.ts`, `src/userbot/handlers/group/reputation.ts`, `src/userbot/handlers/admin/gcast.ts`, `src/utils/logger.ts`
**Details:** The codebase uses at least four logging styles:
1. Custom ANSI console helpers in `src/index.ts` (`logInfo`, `logError`, etc.)
2. Direct `console.log`/`console.error` scattered in handlers and `dbCore.ts`
3. `Logger.logSystem` / `Logger.logUser` from `src/utils/logger.ts`
4. GramJS client error callbacks in `manager.ts` mixing Logger and console
**Impact:** Log aggregation is fragmented; some errors bypass the bot's logging to `LOG_GROUP_ID`.
**Fix:** Route all logs through `Logger.ts`; replace direct `console.log` in `dbCore.ts` and handlers with `Logger.logSystem`.

### 10. Repeated Deep Clone via JSON
**Severity:** HIGH
**Files:** `src/services/UserbotService.ts` lines 51, 53, 202, 271, 293, 310
**Details:** `JSON.parse(JSON.stringify(...))` is used 6 times to deep-clone objects before persisting. This silently drops `undefined`, `Map`, `Set`, functions, and circular references.
**Impact:** Data corruption risk if nested structures ever contain non-JSON-safe values; performance overhead.
**Fix:** Extract a `deepClone` utility using a proper serializer or lodash `cloneDeep`.

---

## Medium Findings

### 11. Repeated Test-Detection Logic
**Severity:** MEDIUM
**Files:** `src/userbot/handlers/group/antiflood.ts` line 103; `src/userbot/handlers/group/reputation.ts` line 144; `src/userbot/handlers/group/welcome.ts` line 20
**Details:** Each handler independently checks test mode:
```typescript
const isTest = process.env.NODE_ENV === 'test' || process.argv[1]?.includes('runner.js');
```
**Impact:** Boilerplate; behavior may diverge if detection logic changes.
**Fix:** Extract to `src/utils/testEnv.ts` or use a single exported constant from a shared module.

### 12. Missing Return Type Annotations on Functions
**Severity:** MEDIUM
**Files:** `src/index.ts` (9 functions without return types); `src/bot/conversations/registration.ts`; `src/bot/conversations/settings.ts`; `src/infrastructure/dbCore.ts`
**Details:** 196 functions lack explicit return types. While TypeScript can infer some, exported functions and async functions should be annotated for API clarity.
**Impact:** Reduced readability; harder to catch signature mismatches.
**Fix:** Add return types to all exported and async functions.

### 13. Hardcoded DC Preset Without Abstraction
**Severity:** MEDIUM
**Files:** `src/bot/conversations/registration.ts` lines 59-61
**Details:** Indonesian DC 5 is hardcoded for `+62` numbers:
```typescript
if (phoneNumber && phoneNumber.startsWith('+62')) {
  session.setDC(5, '91.108.56.121', 80);
}
```
**Impact:** If Telegram changes DCs or routing, this breaks silently.
**Fix:** Move to a configuration map or let teleproto/gramjs handle DC selection.

### 14. Silent Failure in File Persistence Error Paths
**Severity:** MEDIUM
**Files:** `src/infrastructure/dbCore.ts` lines 176, 186
**Details:** `readDbFromFile` and `writeDbToFile` log errors but return empty fallbacks:
```typescript
console.error('❌ Error reading database file:', err);
return { userbots: {}, systemConfig: { vars: {} }, groups: {} };
```
**Impact:** Callers may proceed with an empty database after a transient filesystem error, losing data.
**Fix:** Re-throw or surface the error so callers can decide whether to continue.

### 15. Missing `.editorconfig`
**Severity:** MEDIUM
**Files:** Project root
**Details:** `.editorconfig` is absent despite having `.prettierrc` and `.eslintrc.json`.
**Impact:** Cross-editor inconsistency (line endings, indentation, trailing whitespace).
**Fix:** Add `.editorconfig` with standard settings.

### 16. Inconsistent `escapeHtml` Usage
**Severity:** MEDIUM
**Files:** Multiple `src/userbot/handlers/**/*.ts`
**Details:** Some HTML messages correctly use `escapeHtml()` (e.g., `reputation.ts`, `settings.ts`), but `responseHelpers.ts` sends loading/error HTML without escaping, and `gcast.ts` lines 51, 113, 123 use double-escaped `\\n` instead of `\n` in template literals, producing literal backslash-n in messages.
**Impact:** Minor display bugs; potential XSS if user input reaches unescaped interpolations.
**Fix:** Audit all `parseMode: 'html'` messages; fix double-escaped newlines.

---

## Low Findings

### 17. Magic Numbers and Strings
**Severity:** LOW
**Files:** Multiple
**Details:** Values like `60_000` (expiration interval), `10 * 60 * 1000` (cleanup interval), `'User_'` (default name prefix), `3800` (message length cap), and hardcoded strings like `'DeltaUbotJS'` are repeated.
**Impact:** Hard to maintain if values change.
**Fix:** Extract to named constants in a config or constants module.

### 18. Verbose Inline HTML Template Construction
**Severity:** LOW
**Files:** `src/bot/handlers/inlineHelp.ts`, `src/bot/conversations/registration.ts`, `src/userbot/handlers/group/reputation.ts`
**Details:** Long template-literal HTML strings are built inline with string concatenation (`+`).
**Impact:** Hard to read and maintain; no compile-time HTML validation.
**Fix:** Consider a lightweight template helper or keep HTML in separate template files if the project grows.

### 19. `setInterval` Used Without Explicit Cleanup on Hot Reload / Tests
**Severity:** LOW
**Files:** `src/userbot/handlers/group/antiflood.ts` line 10; `src/userbot/handlers/group/reputation.ts` line 9; `src/userbot/handlers/util/schedule.ts`
**Details:** Module-level `setInterval` for cleanup runs immediately on import. In tests or `tsx` watch mode, this can accumulate intervals.
**Impact:** Minor in production; problematic in tests.
**Fix:** Register intervals in a centralized `startCleanup()` exported from each module, called explicitly from the manager or test setup.

### 20. `catch (_) {}` Pattern Should Use `catch {}` Syntax
**Severity:** LOW
**Files:** Multiple
**Details:** Many empty catches use `catch (_) {}` instead of the cleaner `catch {}`. The skill explicitly prefers `catch { /* suppress */ }` with a comment documenting intent.
**Impact:** Minor style inconsistency.
**Fix:** Replace with `catch { /* suppress */ }` where appropriate.

---

## Summary Table

| # | Issue | Severity | Files | Lines |
|---|---|---|---|---|
| 1 | Hardcoded credentials | CRITICAL | `src/config.ts` | 12-13 |
| 2 | Type safety disabled | CRITICAL | `tsconfig.json` + 14 files | project-wide |
| 3 | Global prototype modification | CRITICAL | `src/bot/conversations/registration.ts` | 18 |
| 4 | Mixed persistence without abstraction | HIGH | `src/infrastructure/dbCore.ts`, `src/services/UserbotService.ts` | multiple |
| 5 | Duplicate AsyncLock | HIGH | `src/infrastructure/dbCore.ts`, `src/userbot/engine/manager.ts` | 14-48, 15-32 |
| 6 | Global state mutations | HIGH | `src/index.ts`, `src/bot/handlers/callbacks.ts` | 115, 12-13, 87, 95 |
| 7 | Unbounded in-memory Maps | HIGH | `src/userbot/handlers/util/schedule.ts`, `src/userbot/handlers/admin/gcast.ts`, others | 6, 40, 110, 113-114 |
| 8 | Empty catch without intent | HIGH | 14+ files | 30+ locations |
| 9 | Inconsistent logging | HIGH | 8+ files | project-wide |
| 10 | Repeated JSON deep clone | HIGH | `src/services/UserbotService.ts` | 51, 53, 202, 271, 293, 310 |
| 11 | Repeated test-detection logic | MEDIUM | 3 handler files | multiple |
| 12 | Missing return types | MEDIUM | `src/index.ts`, conversations, dbCore | 196 functions |
| 13 | Hardcoded DC preset | MEDIUM | `src/bot/conversations/registration.ts` | 59-61 |
| 14 | Silent file-persistence fallback | MEDIUM | `src/infrastructure/dbCore.ts` | 176, 186 |
| 15 | Missing `.editorconfig` | MEDIUM | project root | — |
| 16 | Inconsistent `escapeHtml` / double-escaped `\n` | MEDIUM | multiple handlers | multiple |
| 17 | Magic numbers/strings | LOW | multiple | project-wide |
| 18 | Verbose inline HTML templates | LOW | inlineHelp, registration, reputation | multiple |
| 19 | Module-level `setInterval` without test cleanup | LOW | antiflood, reputation, schedule | 10, 9, 31 |
| 20 | Inconsistent empty-catch syntax | LOW | multiple | multiple |

---

## Prioritized Action Plan

**High Priority (Fix immediately):**
1. Move `apiId`/`apiHash` to `.env` (Finding 1).
2. Enable strict TypeScript: remove `// @ts-nocheck`, add return types, enable `"strict": true` (Finding 2).
3. Stop mutating `TelegramClient.prototype`; wrap or subclass instead (Finding 3).
4. Add comments to all empty catches or log the error (Finding 8).
5. Unify logging through `Logger.ts`; remove direct `console.*` from production code (Finding 9).
6. Extract shared `AsyncLock` utility (Finding 5).

**Medium Priority (Next sprint):**
7. Abstract persistence behind repository interfaces (Finding 4).
8. Add TTL cleanup for `loopStore`, `LAST_GCAST`, and unbounded caches (Finding 7).
9. Extract `deepClone` utility and replace 6 `JSON.parse(JSON.stringify(...))` calls (Finding 10).
10. Extract shared test-mode detection constant (Finding 11).
11. Add `.editorconfig` and fix double-escaped newlines in HTML messages (Findings 15, 16).

**Low Priority (Future):**
12. Extract magic numbers to constants (Finding 17).
13. Consider HTML template helpers if handlers grow further (Finding 18).
14. Normalize empty-catch syntax with intent comments (Finding 20).

---

## Files Reviewed
- `src/config.ts`
- `src/index.ts`
- `src/infrastructure/dbCore.ts`
- `src/infrastructure/database.ts`
- `src/services/UserbotService.ts`
- `src/utils/crypto.ts`
- `src/utils/logger.ts`
- `src/bot/index.ts`
- `src/bot/handlers/callbacks.ts`
- `src/bot/handlers/inlineHelp.ts`
- `src/bot/handlers/owner.ts`
- `src/bot/conversations/registration.ts`
- `src/bot/conversations/settings.ts`
- `src/bot/ui/keyboards/dashboard.ts`
- `src/userbot/engine/manager.ts`
- `src/userbot/handlers/group/antiflood.ts`
- `src/userbot/handlers/group/reputation.ts`
- `src/userbot/handlers/util/schedule.ts`
- `src/userbot/handlers/admin/gcast.ts`
- `src/userbot/handlers/system/exec.ts`
