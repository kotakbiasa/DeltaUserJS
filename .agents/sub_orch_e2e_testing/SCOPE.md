# Scope: E2E Testing Suite for DeltaUserJS Advanced Features

## Architecture
We will design a requirement-driven, opaque-box E2E test suite. Because this test suite must run on local/CI environments without real Telegram API credentials (which are unavailable/unreliable in standard test environments), we will implement:
1. **Mock GramJS Interface**: A mock replacement or wrapper for `TelegramClient` and the `telegram` library. This mock client allows test code to simulate:
   - Incoming messages from arbitrary users (e.g. `client.sendMessage`, event listeners).
   - Telegram service messages (e.g. `MessageActionChatAddUser`, `MessageActionChatDeleteUser`).
   - Callback queries and inline button interactions.
   - Userbot command processing via intercepted events.
   - MongoDB database state simulation/mocking or connection to a local test MongoDB.
2. **Test Runner**: A test harness (`test/runner.js`) that:
   - Configures the test environment (e.g. setting up a clean memory/test database).
   - Dispatches a series of test cases.
   - Evaluates assertions against the state of the mock client (e.g., did the bot edit its message? did it send a welcome message? did it kick/mute the spammer?).
   - Summarizes test execution results, providing exit code 0 on success, and non-zero on failure.
   - Generates coverage metrics and checklists.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Mock GramJS & Runner Setup | Implement `test/mockGramJS.js` and `test/runner.js` to create the test framework | None | PLANNED |
| 2 | Test Cases Implementation | Implement Tiers 1-4 test cases (minimum 60 test cases across 5 features) in `test/e2e.test.js` | M1 | PLANNED |
| 3 | Verification & Auditing | Run tests on unimplemented codebase to verify fail status, then publish TEST_INFRA.md and TEST_READY.md | M2 | PLANNED |

## E2E Feature Specifications & Minimum Test Cases (Tiers 1-4)
We target the 5 advanced moderation and scheduling features:
- **Feature 1: Persistent Scheduler** (`.loop`, `.rmloop`, `.listloop`, database persistence and auto-resume on start)
- **Feature 2: Chat Settings & Custom Prefix** (`.setprefix`, language, logging toggles, per-chat persistence)
- **Feature 3: Welcome, Goodbye & CleanService** (automated member join/leave messages and deletion of service messages)
- **Feature 4: Anti-Flood Protection** (detecting spamming behavior, warnings, group lock/mute actions, admin immunity)
- **Feature 5: User Reputation System** (upvote/downvote tracking, reputation check, leaderboard)

### E2E Test Cases Catalog (60 cases)
#### Tier 1: Feature Coverage (25 tests)
1. **TS-T1-01**: Scheduler - `.loop 1 Hello` starts an active loop.
2. **TS-T1-02**: Scheduler - `.rmloop` stops the active loop in the current chat.
3. **TS-T1-03**: Scheduler - `.listloop` lists all active loops for the userbot.
4. **TS-T1-04**: Scheduler - Loop message is actually sent at the correct intervals.
5. **TS-T1-05**: Scheduler - Loops are persisted in MongoDB.
6. **CS-T1-06**: Settings - `.setprefix !` changes the command prefix to `!`.
7. **CS-T1-07**: Settings - Commands respond to new prefix (e.g., `!ping` works).
8. **CS-T1-08**: Settings - Commands ignore old prefix (e.g., `.ping` does nothing).
9. **CS-T1-09**: Settings - Toggle language settings via command or config.
10. **CS-T1-10**: Settings - Toggle logging settings.
11. **WG-T1-11**: Welcome - Welcome message is sent when a new user joins a chat.
12. **WG-T1-12**: Welcome - Goodbye message is sent when a user leaves/is kicked.
13. **WG-T1-13**: Welcome - CleanService deletes Telegram join service messages when enabled.
14. **WG-T1-14**: Welcome - CleanService leaves join messages intact when disabled.
15. **WG-T1-15**: Welcome - Welcome and goodbye messages default to standard messages when not configured.
16. **AF-T1-16**: Anti-Flood - Messages exceeding threshold trigger anti-flood warning.
17. **AF-T1-17**: Anti-Flood - Exceeding maximum warnings triggers mute action.
18. **AF-T1-18**: Anti-Flood - Exceeding maximum warnings triggers kick action if configured.
19. **AF-T1-19**: Anti-Flood - Userbot admins are immune to anti-flood triggers.
20. **AF-T1-20**: Anti-Flood - Anti-flood warning count resets after the specified time window.
21. **RP-T1-21**: Reputation - Upvoting a user with `+` or `+rep` increases their reputation.
22. **RP-T1-22**: Reputation - Downvoting a user with `-` or `-rep` decreases their reputation.
23. **RP-T1-23**: Reputation - Command `.reputation` (or custom prefix version) displays user's reputation.
24. **RP-T1-24**: Reputation - Leaderboard command `.reps` shows top users sorted by reputation.
25. **RP-T1-25**: Reputation - Self-upvoting or downvoting is blocked.

#### Tier 2: Boundary & Edge Cases (25 tests)
26. **TS-T2-01**: Scheduler - `.loop 0` or negative intervals are rejected.
27. **TS-T2-02**: Scheduler - Loop message containing HTML formatting is preserved.
28. **TS-T2-03**: Scheduler - Multiple loops running concurrently in different chats.
29. **TS-T2-04**: Scheduler - Startup scheduler reads persistent schedules and restarts loops.
30. **TS-T2-05**: Scheduler - `.rmloop` in a chat without active loop returns informational message.
31. **CS-T2-06**: Settings - Multi-character prefix or space prefix is rejected.
32. **CS-T2-07**: Settings - Regex-active prefix characters (e.g. `?`, `*`, `+`) work correctly.
33. **CS-T2-08**: Settings - Setting values not matching constraints are rejected.
34. **CS-T2-09**: Settings - Custom name changes reflected in footer signature.
35. **CS-T2-10**: Settings - Concurrent prefix changes in separate chats isolate settings.
36. **WG-T2-11**: Welcome - Empty/whitespace welcome text sets to default message.
37. **WG-T2-12**: Welcome - Welcome message correctly parses placeholders `{name}`, `{id}`, `{title}`.
38. **WG-T2-13**: Welcome - Goodbye message correctly parses placeholders.
39. **WG-T2-14**: Welcome - Concurrent users joining triggers welcome messages for each.
40. **WG-T2-15**: Welcome - Welcome message fails gracefully if bot lacks permission to send messages.
41. **AF-T2-16**: Anti-Flood - Anti-flood triggers exactly at the configured threshold boundary (N messages).
42. **AF-T2-17**: Anti-Flood - Invalid threshold configuration (0 or negative) falls back to defaults.
43. **AF-T2-18**: Anti-Flood - Large message payloads and quick media attachments count towards flood rate.
44. **AF-T2-19**: Anti-Flood - Rapid parallel messages from multiple distinct users are audited correctly.
45. **AF-T2-20**: Anti-Flood - Custom warning thresholds allow configurable warnings count before restriction.
46. **RP-T2-21**: Reputation - Reputation points do not drop below zero if negative floor is enforced (or checks boundaries).
47. **RP-T2-22**: Reputation - Upvoting multiple times within cooldown period is blocked.
48. **RP-T2-23**: Reputation - Reputation command on non-existent or unranked user returns default 0 rep.
49. **RP-T2-24**: Reputation - Special characters or non-ASCII characters in username do not break reputation storage/leaderboard.
50. **RP-T2-25**: Reputation - User reputation is retained after user leaves and rejoins chat.

#### Tier 3: Cross-Feature Combinations (5 tests)
51. **CF-T3-01**: Scheduler loops continue to post successfully even when the chat's custom prefix is modified.
52. **CF-T3-02**: Messages sent by the scheduler do not trigger the userbot's own anti-flood threshold (self-spam immunity).
53. **CF-T3-03**: Large wave of concurrent joins triggers welcome messages which are rate-limited or monitored correctly without tripping anti-flood locks.
54. **CF-T3-04**: Reputation upvote/downvote commands respond only to the custom prefix set for the chat.
55. **CF-T3-05**: Reputation upvote events write log entries to the configured log channel when log toggles are enabled.

#### Tier 4: Real-World Application Scenarios (5 tests)
56. **RW-T4-01**: **Complete Channel Moderation**: Admin configures settings (custom prefix `!`, logging on), enables anti-flood (limit 3 messages/sec), user joins (triggers welcome, service message deleted), user spams (warned & muted), another user upvotes helpful answers (reputation verified), and scheduler posts hourly announcements.
57. **RW-T4-02**: **Database Crash & Auto-Resume**: Userbot has 3 active scheduler loops and custom prefixes. The process is killed. MongoDB state persists. The process starts up, the persistent scheduler queries MongoDB, resumes all 3 loops at correct intervals, and prefix settings are validated.
58. **RW-T4-03**: **Multi-Tenant Chat Isolation**: Userbot manages Group A and Group B. Group A has prefix `/`, welcome on, reputation on. Group B has prefix `!`, welcome off, reputation off. Verify prefix commands, join events, and upvotes in Group A do not affect Group B.
59. **RW-T4-04**: **Raid / Spam Defense Simulation**: A massive wave of join events occurs alongside spam messages. Anti-flood blocks the spammers, cleanservice clears service logs, while regular users successfully upvote one another and command prefix commands continue to execute reliably.
60. **RW-T4-05**: **Reputation Economy & Leaderboards**: A community engagement cycle over time. Users upvote/downvote multiple other users, database stores reputation, leaderboards are queried and formatted, some users leave and return retaining their scores, prefix is customized mid-cycle.
