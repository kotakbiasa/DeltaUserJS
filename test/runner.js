// 1. Load stubs before any other module imports to isolate DB and file system
import './setupStubs.js';

import userbotManager from '../src/userbot/engine/manager.js';
import { UserbotClient } from '../src/userbot/engine/client.js';
import { loadAllPlugins } from '../src/userbot/engine/pluginLoader.js';
import { MockTelegramClient } from './mockGramJS.js';
import { tests } from './e2e.test.js';

// 2. Override UserbotClient start method to bypass GramJS connection and inject mock client
let pluginsLoaded = false;
UserbotClient.prototype.start = async function() {
  if (!pluginsLoaded) {
    try {
      await loadAllPlugins();
    } catch (e) {
      console.warn('Warning loading plugins:', e.message);
    }
    pluginsLoaded = true;
  }
  
  this.client = new MockTelegramClient(this.telegramId);
  this.isActive = true;
  this.registerHandlers();
  console.log(`🤖 Mocked DeltaUbotJS [${this.telegramId}] started successfully.`);
};

import { saveUserbotSession, deleteUserbot as deleteUserbotSession } from '../src/core/database.js';

// 3. Execution Engine
async function runSuite() {
  console.log('============================================================');
  console.log('🏁 Starting DeltaUserJS E2E Testing Suite (Tiers 1-4)...');
  console.log(`📋 Total registered test cases: ${tests.length}`);
  console.log('============================================================\n');

  // Start the userbot instance for testing
  const testBotId = 12345;
  saveUserbotSession(testBotId, '00000', 'mock_session_string_12345');
  await userbotManager.startUserbot(testBotId, 'mock_session_string_12345');
  const ubot = userbotManager.clients.get(testBotId);

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const tc of tests) {
    // Reset mock client state before each test case to avoid pollution
    if (ubot && ubot.client) {
      ubot.client.sentMessages = [];
      ubot.client.editedMessages = [];
      ubot.client.deletedMessages = [];
      ubot.client.invokedCalls = [];
      ubot.client.markedAsRead = [];
    }

    try {
      console.log(`👉 Running [${tc.id}] ${tc.name}...`);
      await tc.fn(ubot);
      console.log(`  ✅ [PASS] ${tc.id}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ [FAIL] ${tc.id} -> ${err.message}`);
      failed++;
      failures.push({ id: tc.id, name: tc.name, category: tc.category, error: err.message });
    }
  }

  console.log('\n============================================================');
  console.log('📊 E2E TEST RUN SUMMARY');
  console.log('============================================================');
  console.log(`Total Run: ${tests.length}`);
  console.log(`Passed:    ${passed}`);
  console.log(`Failed:    ${failed}`);
  console.log('============================================================');

  if (failed > 0) {
    console.log('\n❌ FAILED TESTS DETAILS:');
    failures.forEach((f, idx) => {
      console.log(`${idx + 1}. [${f.id}] [${f.category}] ${f.name}`);
      console.log(`   Reason: ${f.error}`);
    });
    console.log('============================================================');
  }

  // Clean up
  await userbotManager.stopUserbot(testBotId);
  deleteUserbotSession(testBotId);

  // Exit appropriately
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite().catch(err => {
  console.error('💥 Fatal runner error:', err);
  process.exit(1);
});
