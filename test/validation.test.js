/**
 * Unit tests for validation schemas and utility functions
 * Run with: npm run test:unit
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Import validation schemas
import {
  validate,
  validatePartial,
  gcastSchema,
  adminActionSchema,
  noteSchema,
  scheduleSchema,
  welcomeSchema,
  afkSchema,
  reputationSchema,
  carbonSchema,
  stalkSchema,
  execSchema,
  positiveInt,
  telegramId,
  chatId,
} from '../dist/utils/validation.js';

// Test helper
function runValidationTests() {
  console.log('🧪 Running Validation Unit Tests...\n');
  
  let passed = 0;
  let failed = 0;

  function runTest(name, fn) {
    try {
      fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ❌ ${name}: ${e.message}`);
      failed++;
    }
  }

  // --- positiveInt ---
  runTest('positiveInt: accepts valid positive integer', () => {
    assert.equal(positiveInt.parse('5'), 5);
    assert.equal(positiveInt.parse(10), 10);
  });
  runTest('positiveInt: rejects zero', () => {
    assert.throws(() => positiveInt.parse('0'), /Too small|expected number to be >0/);
  });
  runTest('positiveInt: rejects negative', () => {
    assert.throws(() => positiveInt.parse('-1'), /Too small|expected number to be >0/);
  });
  runTest('positiveInt: rejects non-integer', () => {
    assert.throws(() => positiveInt.parse('1.5'), /expected int|Invalid input: expected int/);
  });

  // --- telegramId ---
  runTest('telegramId: accepts valid ID', () => {
    assert.equal(telegramId.parse('123456789'), 123456789);
  });
  runTest('telegramId: rejects zero', () => {
    assert.throws(() => telegramId.parse('0'), /min/);
  });

  // --- chatId ---
  runTest('chatId: accepts negative (groups) and positive', () => {
    assert.equal(chatId.parse('-1001234567890'), -1001234567890);
    assert.equal(chatId.parse('123456789'), 123456789);
  });

  // --- gcastSchema ---
  runTest('gcastSchema: accepts valid text', () => {
    const result = validate(gcastSchema, { text: 'Hello world' });
    assert.equal(result.text, 'Hello world');
  });
  runTest('gcastSchema: rejects empty text', () => {
    assert.throws(() => validate(gcastSchema, { text: '' }), /Too small|expected string to have >=1/);
  });
  runTest('gcastSchema: rejects too long text', () => {
    assert.throws(() => validate(gcastSchema, { text: 'a'.repeat(4097) }), /Too big|expected string to have <=4096/);
  });
  runTest('gcastSchema: accepts optional silent/pin', () => {
    const result = validate(gcastSchema, { text: 'Test', silent: true, pin: false });
    assert.equal(result.silent, true);
    assert.equal(result.pin, false);
  });

  // --- adminActionSchema ---
  runTest('adminActionSchema: accepts valid action', () => {
    const result = validate(adminActionSchema, { userId: 123, chatId: -100123, reason: 'spam', duration: 3600 });
    assert.equal(result.userId, 123);
    assert.equal(result.chatId, -100123);
    assert.equal(result.reason, 'spam');
    assert.equal(result.duration, 3600);
  });
  runTest('adminActionSchema: rejects missing userId', () => {
    assert.throws(() => validate(adminActionSchema, { chatId: -100123 }), /Invalid input: expected number|required/);
  });

  // --- noteSchema ---
  runTest('noteSchema: accepts valid note', () => {
    const result = validate(noteSchema, { name: 'welcome_msg', content: 'Welcome!' });
    assert.equal(result.name, 'welcome_msg');
    assert.equal(result.content, 'Welcome!');
  });
  runTest('noteSchema: rejects invalid name (special chars)', () => {
    assert.throws(() => validate(noteSchema, { name: 'bad@name', content: 'x' }), /must match pattern|Invalid string/);
  });
  runTest('noteSchema: rejects empty name', () => {
    assert.throws(() => validate(noteSchema, { name: '', content: 'x' }), /Too small|expected string to have >=1|must match pattern/);
  });

  // --- scheduleSchema ---
  runTest('scheduleSchema: accepts valid cron', () => {
    const result = validate(scheduleSchema, {
      name: 'daily_backup',
      cron: '0 2 * * *',
      message: 'Backup running',
      chatId: -100123,
    });
    assert.equal(result.name, 'daily_backup');
    assert.equal(result.cron, '0 2 * * *');
  });
  runTest('scheduleSchema: rejects invalid cron', () => {
    assert.throws(() => validate(scheduleSchema, {
      name: 'test', cron: 'invalid', message: 'x', chatId: 1
    }), /must match pattern|Invalid string/);
  });

  // --- welcomeSchema ---
  runTest('welcomeSchema: accepts valid welcome', () => {
    const result = validate(welcomeSchema, {
      chatId: -100123,
      enabled: true,
      message: 'Welcome!',
    });
    assert.equal(result.enabled, true);
  });
  runTest('welcomeSchema: accepts media object', () => {
    const result = validate(welcomeSchema, {
      chatId: -100123,
      enabled: true,
      media: { type: 'photo', fileId: 'abc123' },
    });
    assert.equal(result.media?.type, 'photo');
  });

  // --- afkSchema ---
  runTest('afkSchema: accepts valid afk with reason', () => {
    const result = validate(afkSchema, { reason: 'Sleeping' });
    assert.equal(result.reason, 'Sleeping');
  });
  runTest('afkSchema: accepts optional media', () => {
    const result = validate(afkSchema, {
      reason: 'Away',
      media: { type: 'animation', fileId: 'gif123' },
    });
    assert.equal(result.media?.type, 'animation');
  });

  // --- reputationSchema ---
  runTest('reputationSchema: accepts + action', () => {
    const result = validate(reputationSchema, {
      targetId: 456,
      chatId: -100123,
      action: '+',
    });
    assert.equal(result.action, '+');
  });
  runTest('reputationSchema: accepts - action', () => {
    const result = validate(reputationSchema, {
      targetId: 456,
      chatId: -100123,
      action: '-',
    });
    assert.equal(result.action, '-');
  });
  runTest('reputationSchema: rejects invalid action', () => {
    assert.throws(() => validate(reputationSchema, {
      targetId: 456, chatId: -100123, action: 'x'
    }), /Invalid option|expected one of/);
  });

  // --- carbonSchema ---
  runTest('carbonSchema: accepts valid code', () => {
    const result = validate(carbonSchema, { code: 'console.log("hello")' });
    assert.equal(result.code, 'console.log("hello")');
  });
  runTest('carbonSchema: accepts optional theme/language', () => {
    const result = validate(carbonSchema, {
      code: 'x',
      theme: 'dracula',
      language: 'typescript',
      lineNumbers: true,
    });
    assert.equal(result.theme, 'dracula');
    assert.equal(result.language, 'typescript');
    assert.equal(result.lineNumbers, true);
  });

  // --- stalkSchema ---
  runTest('stalkSchema: accepts valid params', () => {
    const result = validate(stalkSchema, {
      targetId: 789,
      chatId: -100123,
      limit: 50,
      search: 'hello',
    });
    assert.equal(result.limit, 50);
    assert.equal(result.search, 'hello');
  });

  // --- execSchema ---
  runTest('execSchema: accepts valid code', () => {
    const result = validate(execSchema, { code: '1+1', language: 'js' });
    assert.equal(result.code, '1+1');
    assert.equal(result.language, 'js');
  });
  runTest('execSchema: accepts optional timeout', () => {
    const result = validate(execSchema, { code: 'x', timeout: 5000 });
    assert.equal(result.timeout, 5000);
  });
  runTest('execSchema: rejects timeout > 30000', () => {
    assert.throws(() => validate(execSchema, { code: 'x', timeout: 50000 }), /Too big|expected number to be <=30000/);
  });

  // --- validatePartial ---
  runTest('validatePartial: accepts partial valid data', () => {
    const result = validatePartial(gcastSchema, { silent: true });
    assert.equal(result.silent, true);
    assert.equal(result.text, undefined);
  });
  runTest('validatePartial: rejects invalid partial data', () => {
    assert.throws(() => validatePartial(gcastSchema, { text: '' }), /Too small|expected string to have >=1/);
  });

  console.log(`\n📊 Unit Test Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runValidationTests();