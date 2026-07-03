# Refactor Notes — Phase 1

This pass focused on **safe, verifiable cleanup + Bot API 10.1 rich-message groundwork**.
No userbot feature behaviour was changed; the goal was to get the project into a
clean, working, maintainable baseline.

## 1. Removed cruft (30 files + 1 leaked secret)

Deleted one-off scripts that had accumulated in the repo root:

- `fix_*.cjs` / `fix_db.js` (14 files) — ad-hoc import/DB rewriters
- `test_bot_api*.js`, `test_grammy*.js`, `test_teleproto*.js` (9 files) — scratch probes
- `scratch_*.js`, `refine_replies.js`, `replace_imports.cjs`,
  `update_db*.cjs`, `update_help.cjs`, `upgrade_*.js`, `check_*.js`, `fix.js`

**Security:** a real `.env` (with live tokens) was committed in the archive — removed.
Rotate `BOT_TOKEN` / `API_HASH` if they were ever pushed. `.gitignore` now blocks
`.env` / `.env.*` (keeps `.env.example`), `database.json`, logs, and `.agents/`.

`TEST_INFRA.md` / `TEST_READY.md` moved to `docs/testing/`.

## 2. Fixed the broken test harness (suite now runs)

The code had been reorganised into `engine/` and `core/`, but tests still pointed at
the old layout. Fixed import paths so `npm test` actually executes:

| Before | After |
|---|---|
| `src/userbot/manager.js` | `src/userbot/engine/manager.js` |
| `src/userbot/client.js` | `src/userbot/engine/client.js` |
| `src/userbot/pluginLoader.js` | `src/userbot/engine/pluginLoader.js` |
| `src/database/db.js` | `src/core/database.js` |
| `import { deleteUserbotSession }` (missing export) | `deleteUserbot as deleteUserbotSession` |
| `import { Api } from 'telegram'` (wrong package) | `from 'teleproto'` |

**Result:** suite went from *fails to start (0 run)* → **15 / 60 passing**.

## 3. Bot API 10.1 rich messages

grammY 1.44 supports Bot API 10.1 (PR #911). Added `src/utils/richMessage.js`:

- `replyRich(ctx, content, opts)` / `sendRich(api, chatId, ...)` / `editRich(ctx, ...)`
  — send via `replyWithRichMessage({ html | markdown })` with **automatic fallback**
  to a classic `parse_mode` message if the client/chat doesn't support rich messages.
- HTML builders: `b, i, u, s, code, pre, spoiler, link, quote (+expandable), list, heading, details, escapeHtml`.

Migrated to the helper (was using raw, fallback-less `replyWithRichMessage` or
inconsistent `parse_mode`):

- `src/bot/plugins/group/notes.js`
- `src/bot/plugins/group/welcome.js`

## Known state — 45 failing tests are unimplemented features (not regressions)

The E2E suite encodes the **target** behaviour from `PROJECT.md` milestones 2–5
(Scheduler, Group Settings/Welcome, Anti-Flood, Reputation), most of which are marked
`PLANNED`. Those userbot features largely don't exist yet, so their tests fail. This is
a feature-build effort, separate from this cleanup pass.

## Suggested next phases

- **Phase 2:** migrate the remaining ~60 `parse_mode` call sites to `replyRich`.
- **Phase 3:** implement milestones 2–5 to turn the red tests green (staged per milestone).
- **Phase 4:** consolidate the parallel bot/userbot plugin layouts and dedupe shared logic.
