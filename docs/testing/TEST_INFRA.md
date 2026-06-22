# E2E Test Infrastructure

This document outlines the architecture, design, and execution of the E2E testing framework implemented for DeltaUserJS advanced features.

## Testing Architecture

The test suite is designed as a requirement-driven, opaque-box testing framework. It simulates a live Telegram environment offline and ensures 100% test isolation.

### 1. Mock GramJS Interface (`test/mockGramJS.js`)

To test Telegram client plugins without network access, credentials, or live Telegram servers, we implement `MockTelegramClient`. It replaces `TelegramClient` and intercepts all outgoing calls, recording them for assertions:
*   **Outgoing Actions**: `sendMessage` (records in `sentMessages`), `edit` (records in `editedMessages`), `deleteMessages` (records in `deletedMessages`), and `markAsRead` (records in `markedAsRead`).
*   **RPC Method Invocation**: `invoke` intercepts core Telegram API calls:
    *   `Api.messages.SetBotCallbackAnswer`
    *   `Api.users.GetFullUser`
    *   `Api.channels.GetFullChannel`
    *   `Api.channels.EditBanned` (mute/kick actions)
    *   `Api.channels.EditAdmin` (admin promo/demo)
    *   `Api.messages.UpdatePinnedMessage`
*   **Event Simulation**: Exposes hooks to simulate incoming Telegram actions:
    *   `simulateNewMessage`: Simulates user commands, messages, replies, etc.
    *   `simulateCallbackQuery`: Simulates inline button clicks.
    *   `simulateIncomingJoin`: Simulates new user joins (triggers welcome events).
    *   `simulateIncomingLeave`: Simulates user leave/kicks (triggers goodbye events).

### 2. Database & File System Stubbing (`test/setupStubs.js`)

To ensure the test runner runs in complete isolation without polluting the disk or requiring a MongoDB instance:
*   **Mongoose Stubbing**: Overrides global mongoose methods:
    *   `connect` / `disconnect` are stubbed to emulate a successful connected state using an in-memory `mockMongoStore` array.
    *   `Model.find`, `Model.findOneAndUpdate`, `Model.updateOne`, and `Model.deleteOne` are mocked to query and update the in-memory array.
*   **File System Stubbing**: Overrides `fs` functions for `database.json`:
    *   `fs.existsSync`, `fs.readFileSync`, and `fs.writeFileSync` intercept operations targeting `database.json` and read/write from a local in-memory object (`mockJsonDb`), preventing any disk pollution.

### 3. Test Runner (`test/runner.js`)

*   **Setup**: Loads `test/setupStubs.js` first, overriding MongoDB and fs methods before the application loads.
*   **Injection**: Patches `UserbotClient.prototype.start` to inject `MockTelegramClient` and register handlers.
*   **Execution**: Iterates through the test registry, resets mock client state between tests, catches assert errors, prints formatted results, and outputs a summary.
*   **Exit Status**: Returns exit code `0` on success, or `1` if any test fails.

## Running the E2E Tests

To execute the test suite:
```bash
node test/runner.js
```
No external services, local databases, or internet connections are required.
