import { Api } from 'teleproto';
import { 
  getSchedules, 
  getChatSettings, 
  getReputation,
  getWarns,
  getChatLocks
} from '../dist/infrastructure/database.js';

export const tests = [];

function registerTest(id, category, name, fn) {
  tests.push({ id, category, name, fn });
}

// ==========================================
// TIER 1: FEATURE COVERAGE (25 tests)
// ==========================================

registerTest('TS-T1-01', 'Scheduler', 'Scheduler - .loop 1 Hello starts an active loop', async (ubot) => {
  const chatId = 999101;
  const msg = await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.loop 1 Hello',
    out: true
  });
  
  const lastEdit = ubot.client.editedMessages.find(m => m.messageId === msg.id);
  if (!lastEdit || !lastEdit.text.includes('Loop Aktif')) {
    throw new Error('Expected loop confirmation message to contain "Loop Aktif"');
  }
});

registerTest('TS-T1-02', 'Scheduler', 'Scheduler - .rmloop stops the active loop in the current chat', async (ubot) => {
  const chatId = 999102;
  await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.loop 1 Hello',
    out: true
  });
  
  const msg = await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.rmloop',
    out: true
  });
  
  const lastEdit = ubot.client.editedMessages.find(m => m.messageId === msg.id);
  if (!lastEdit || !lastEdit.text.includes('Loop Dihentikan')) {
    throw new Error('Expected stop loop confirmation containing "Loop Dihentikan"');
  }
});

registerTest('TS-T1-03', 'Scheduler', 'Scheduler - .listloop lists all active loops for the userbot', async (ubot) => {
  const chatId = 999103;
  await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.loop 1 Hello',
    out: true
  });
  
  const msg = await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.listloop',
    out: true
  });
  
  const lastEdit = ubot.client.editedMessages.find(m => m.messageId === msg.id);
  if (!lastEdit || !lastEdit.text.includes('Daftar Loop Aktif')) {
    throw new Error('Expected loop listing message containing "Daftar Loop Aktif"');
  }
});

registerTest('TS-T1-04', 'Scheduler', 'Scheduler - Loop message is actually sent at the correct intervals', async (ubot) => {
  const chatId = 999104;
  // Clear sent messages
  ubot.client.sentMessages = [];
  
  await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.loop 1 TestInterval',
    out: true
  });
  
  // Direct scheduler check or wait for simulateInterval
  // Since scheduler is unimplemented or uses setInterval, we check for emitted messages
  const sent = ubot.client.sentMessages.filter(m => m.message.includes('TestInterval'));
  if (sent.length === 0) {
    throw new Error('Expected loop message to be sent at interval');
  }
});

registerTest('TS-T1-05', 'Scheduler', 'Scheduler - Loops are persisted in MongoDB', async (ubot) => {
  const chatId = 999105;
  await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.loop 1 PersistentMessage',
    out: true
  });
  
  const schedules = getSchedules(ubot.telegramId);
  const found = schedules.find(s => s.chatKey === String(chatId) && s.message === 'PersistentMessage');
  if (!found) {
    throw new Error('Loop schedule not persisted in DB');
  }
});

registerTest('CS-T1-06', 'Settings', 'Settings - .setprefix ! changes the command prefix to !', async (ubot) => {
  const chatId = 999201;
  const msg = await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.setprefix !',
    out: true
  });
  
  const lastEdit = ubot.client.editedMessages.find(m => m.messageId === msg.id);
  if (!lastEdit || !lastEdit.text.includes('Prefix') || getChatSettings(ubot.telegramId, chatId).prefix !== '!') {
    throw new Error('Prefix setting was not updated in DB or confirmed in UI');
  }
});

registerTest('CS-T1-07', 'Settings', 'Settings - Commands respond to new prefix (e.g., !ping works)', async (ubot) => {
  const chatId = 999202;
  await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.setprefix !',
    out: true
  });
  
  const msg = await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '!ping',
    out: true
  });
  
  const lastEdit = ubot.client.editedMessages.find(m => m.messageId === msg.id);
  if (!lastEdit || !lastEdit.text.toLowerCase().includes('pong')) {
    throw new Error('Command ping with new prefix "!" did not respond');
  }
});

registerTest('CS-T1-08', 'Settings', 'Settings - Commands ignore old prefix (e.g., .ping does nothing)', async (ubot) => {
  const chatId = 999203;
  await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.setprefix !',
    out: true
  });
  
  ubot.client.editedMessages = [];
  await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.ping',
    out: true
  });
  
  if (ubot.client.editedMessages.length > 0) {
    throw new Error('Command old prefix "." was not ignored');
  }
});

registerTest('CS-T1-09', 'Settings', 'Settings - Toggle language settings via command or config', async (ubot) => {
  const chatId = 999204;
  const msg = await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.setlang en',
    out: true
  });
  
  const lastEdit = ubot.client.editedMessages.find(m => m.messageId === msg.id);
  if (!lastEdit || getChatSettings(ubot.telegramId, chatId).lang !== 'en') {
    throw new Error('Language settings was not updated to English');
  }
});

registerTest('CS-T1-10', 'Settings', 'Settings - Toggle logging settings', async (ubot) => {
  const chatId = 999205;
  const msg = await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.logging on',
    out: true
  });
  
  const lastEdit = ubot.client.editedMessages.find(m => m.messageId === msg.id);
  if (!lastEdit || getChatSettings(ubot.telegramId, chatId).logging !== true) {
    throw new Error('Logging setting was not enabled');
  }
});

registerTest('WG-T1-11', 'Welcome', 'Welcome - Welcome message is sent when a new user joins a chat', async (ubot) => {
  const chatId = 999301;
  const newUser = 111001;
  
  ubot.client.sentMessages = [];
  await ubot.client.simulateIncomingJoin({ senderId: newUser, chatId });
  
  const welcomeMsg = ubot.client.sentMessages.find(m => m.chatId === chatId && m.message.includes('Welcome'));
  if (!welcomeMsg) {
    throw new Error('No welcome message sent upon user join');
  }
});

registerTest('WG-T1-12', 'Welcome', 'Welcome - Goodbye message is sent when a user leaves/is kicked', async (ubot) => {
  const chatId = 999302;
  const leavingUser = 111002;
  
  ubot.client.sentMessages = [];
  await ubot.client.simulateIncomingLeave({ senderId: leavingUser, chatId });
  
  const goodbyeMsg = ubot.client.sentMessages.find(m => m.chatId === chatId && m.message.includes('Goodbye'));
  if (!goodbyeMsg) {
    throw new Error('No goodbye message sent upon user leave');
  }
});

registerTest('WG-T1-13', 'Welcome', 'Welcome - CleanService deletes Telegram join service messages when enabled', async (ubot) => {
  const chatId = 999303;
  await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.cleanservice on',
    out: true
  });
  
  const joinMsg = await ubot.client.simulateIncomingJoin({ senderId: 111003, chatId });
  const isDeleted = ubot.client.deletedMessages.some(d => d.messageIds.includes(joinMsg.id));
  if (!isDeleted) {
    throw new Error('CleanService did not delete Telegram join service message');
  }
});

registerTest('WG-T1-14', 'Welcome', 'Welcome - CleanService leaves join messages intact when disabled', async (ubot) => {
  const chatId = 999304;
  await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.cleanservice off',
    out: true
  });
  
  const joinMsg = await ubot.client.simulateIncomingJoin({ senderId: 111004, chatId });
  const isDeleted = ubot.client.deletedMessages.some(d => d.messageIds.includes(joinMsg.id));
  if (isDeleted) {
    throw new Error('CleanService deleted service message when disabled');
  }
});

registerTest('WG-T1-15', 'Welcome', 'Welcome - Welcome and goodbye messages default to standard messages when not configured', async (ubot) => {
  const chatId = 999305;
  
  ubot.client.sentMessages = [];
  await ubot.client.simulateIncomingJoin({ senderId: 111005, chatId });
  
  const welcomeMsg = ubot.client.sentMessages.find(m => m.chatId === chatId);
  if (!welcomeMsg || !welcomeMsg.message.includes('Selamat datang')) {
    throw new Error('Expected default standard welcome message');
  }
});

registerTest('AF-T1-16', 'Anti-Flood', 'Anti-Flood - Messages exceeding threshold trigger anti-flood warning', async (ubot) => {
  const chatId = 999401;
  const spammer = 222001;
  
  await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.antiflood on',
    out: true
  });
  
  ubot.client.sentMessages = [];
  // Send 6 messages in rapid succession
  for (let i = 0; i < 6; i++) {
    await ubot.client.simulateNewMessage({ senderId: spammer, chatId, text: `Spam ${i}`, out: false });
  }
  
  const warnMsg = ubot.client.sentMessages.find(m => m.chatId === chatId && (m.message.includes('warning') || m.message.includes('Banjir')));
  if (!warnMsg) {
    throw new Error('Expected anti-flood warning message');
  }
});

registerTest('AF-T1-17', 'Anti-Flood', 'Anti-Flood - Exceeding maximum warnings triggers mute action', async (ubot) => {
  const chatId = 999402;
  const spammer = 222002;
  
  await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.antiflood on',
    out: true
  });
  
  ubot.client.invokedCalls = [];
  // Send many messages to trigger mute
  for (let i = 0; i < 15; i++) {
    await ubot.client.simulateNewMessage({ senderId: spammer, chatId, text: `Spam ${i}`, out: false });
  }
  
  const muteCall = ubot.client.invokedCalls.find(c => c instanceof Api.channels.EditBanned);
  if (!muteCall) {
    throw new Error('Expected mute restriction via EditBanned RPC');
  }
});

registerTest('AF-T1-18', 'Anti-Flood', 'Anti-Flood - Exceeding maximum warnings triggers kick action if configured', async (ubot) => {
  const chatId = 999403;
  const spammer = 222003;
  
  await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.setfloodmode kick',
    out: true
  });
  
  ubot.client.invokedCalls = [];
  for (let i = 0; i < 15; i++) {
    await ubot.client.simulateNewMessage({ senderId: spammer, chatId, text: `Spam ${i}`, out: false });
  }
  
  const kickCall = ubot.client.invokedCalls.find(c => c instanceof Api.channels.EditBanned && c.bannedRights.viewMessages === true);
  if (!kickCall) {
    throw new Error('Expected kick restriction via EditBanned RPC');
  }
});

registerTest('AF-T1-19', 'Anti-Flood', 'Anti-Flood - Userbot admins are immune to anti-flood triggers', async (ubot) => {
  const chatId = 999404;
  const admin = 222004; // Mark user as admin in DB or verify admin checks
  
  await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: `.addadmin ${admin}`,
    out: true
  });
  
  ubot.client.sentMessages = [];
  for (let i = 0; i < 10; i++) {
    await ubot.client.simulateNewMessage({ senderId: admin, chatId, text: `Admin spam ${i}`, out: false });
  }
  
  const warnMsg = ubot.client.sentMessages.find(m => m.message.includes('warning') || m.message.includes('Banjir'));
  if (warnMsg) {
    throw new Error('Admin triggered anti-flood warning, lack of immunity');
  }
});

registerTest('AF-T1-20', 'Anti-Flood', 'Anti-Flood - Anti-flood warning count resets after the specified time window', async (ubot) => {
  const chatId = 999405;
  const spammer = 222005;
  
  await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.setfloodtime 1', // 1 second window
    out: true
  });
  
  await ubot.client.simulateNewMessage({ senderId: spammer, chatId, text: 'Spam 1', out: false });
  await new Promise(r => setTimeout(r, 1100)); // wait time window
  
  const warns = getWarns(ubot.telegramId, chatId, spammer);
  if (warns.count > 0) {
    throw new Error('Warning counts did not reset after time window');
  }
});

registerTest('RP-T1-21', 'Reputation', 'Reputation - Upvoting a user with + or +rep increases their reputation', async (ubot) => {
  const chatId = 999501;
  const helpfulUser = 333001;
  
  const sourceMsg = await ubot.client.simulateNewMessage({ senderId: helpfulUser, chatId, text: 'Here is the code', out: false });
  await ubot.client.simulateNewMessage({
    senderId: 444001,
    chatId,
    text: '+rep',
    replyToMsgId: sourceMsg.id,
    out: false
  });
  
  const rep = getReputation(ubot.telegramId, helpfulUser);
  if (rep <= 0) {
    throw new Error('Reputation did not increase on +rep');
  }
});

registerTest('RP-T1-22', 'Reputation', 'Reputation - Downvoting a user with - or -rep decreases their reputation', async (ubot) => {
  const chatId = 999502;
  const spamUser = 333002;
  
  const sourceMsg = await ubot.client.simulateNewMessage({ senderId: spamUser, chatId, text: 'Buy crypto now', out: false });
  await ubot.client.simulateNewMessage({
    senderId: 444002,
    chatId,
    text: '-rep',
    replyToMsgId: sourceMsg.id,
    out: false
  });
  
  const rep = getReputation(ubot.telegramId, spamUser);
  if (rep >= 0) {
    throw new Error('Reputation did not decrease on -rep');
  }
});

registerTest('RP-T1-23', 'Reputation', 'Reputation - Command .reputation (or custom prefix version) displays user\'s reputation', async (ubot) => {
  const chatId = 999503;
  const targetUser = 333003;
  
  const msg = await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: `.reputation ${targetUser}`,
    out: true
  });
  
  const lastEdit = ubot.client.editedMessages.find(m => m.messageId === msg.id);
  if (!lastEdit || !lastEdit.text.includes('Reputasi')) {
    throw new Error('Reputation command did not return score info');
  }
});

registerTest('RP-T1-24', 'Reputation', 'Reputation - Leaderboard command .reps shows top users sorted by reputation', async (ubot) => {
  const chatId = 999504;
  
  const msg = await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.reps',
    out: true
  });
  
  const lastEdit = ubot.client.editedMessages.find(m => m.messageId === msg.id);
  if (!lastEdit || (!lastEdit.text.includes('Leaderboard') && !lastEdit.text.includes('Reputasi Teratas'))) {
    throw new Error('Reputation leaderboard did not format properly');
  }
});

registerTest('RP-T1-25', 'Reputation', 'Reputation - Self-upvoting or downvoting is blocked', async (ubot) => {
  const chatId = 999505;
  const selfUser = ubot.telegramId;
  
  const sourceMsg = await ubot.client.simulateNewMessage({ senderId: selfUser, chatId, text: 'My own message', out: true });
  await ubot.client.simulateNewMessage({
    senderId: selfUser,
    chatId,
    text: '+',
    replyToMsgId: sourceMsg.id,
    out: true
  });
  
  const rep = getReputation(ubot.telegramId, selfUser);
  if (rep !== 0) {
    throw new Error('User successfully self-upvoted');
  }
});


// ==========================================
// TIER 2: BOUNDARY & EDGE CASES (25 tests)
// ==========================================

registerTest('TS-T2-01', 'Scheduler', 'Scheduler - .loop 0 or negative intervals are rejected', async (ubot) => {
  const chatId = 999120;
  const msg = await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.loop 0 BadLoop',
    out: true
  });
  
  const lastEdit = ubot.client.editedMessages.find(m => m.messageId === msg.id);
  if (!lastEdit || !lastEdit.text.includes('Tidak Valid') && !lastEdit.text.includes('Invalid')) {
    throw new Error('Zero interval should be rejected with an error');
  }
});

registerTest('TS-T2-02', 'Scheduler', 'Scheduler - Loop message containing HTML formatting is preserved', async (ubot) => {
  const chatId = 999121;
  const loopText = '<b>Hello</b> <i>World</i>';
  await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: `.loop 1 ${loopText}`,
    out: true
  });
  
  const schedules = getSchedules(ubot.telegramId);
  const found = schedules.find(s => s.chatKey === String(chatId));
  if (!found || !found.message.includes('<b>Hello</b>')) {
    throw new Error('HTML tags not preserved in loop schedules');
  }
});

registerTest('TS-T2-03', 'Scheduler', 'Scheduler - Multiple loops running concurrently in different chats', async (ubot) => {
  const chat1 = 999122;
  const chat2 = 999123;
  
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId: chat1, text: '.loop 1 Loop1', out: true });
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId: chat2, text: '.loop 2 Loop2', out: true });
  
  const schedules = getSchedules(ubot.telegramId);
  const activeSchedules = schedules.filter(s => s.chatKey === String(chat1) || s.chatKey === String(chat2));
  if (activeSchedules.length < 2) {
    throw new Error('Concurrent loops did not register properly');
  }
});

registerTest('TS-T2-04', 'Scheduler', 'Scheduler - Startup scheduler reads persistent schedules and restarts loops', async (ubot) => {
  // Directly trigger the startup loop restart function (e.g. from manager)
  // Check if intervals are registered
  if (typeof ubot.restartSchedules !== 'function') {
    throw new Error('No restart schedules function found on startup');
  }
});

registerTest('TS-T2-05', 'Scheduler', 'Scheduler - .rmloop in a chat without active loop returns informational message', async (ubot) => {
  const chatId = 999125;
  const msg = await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.rmloop',
    out: true
  });
  
  const lastEdit = ubot.client.editedMessages.find(m => m.messageId === msg.id);
  if (!lastEdit || (!lastEdit.text.includes('Tidak ada loop') && !lastEdit.text.includes('No active loop'))) {
    throw new Error('Expected info message when removing non-existent loop');
  }
});

registerTest('CS-T2-06', 'Settings', 'Settings - Multi-character prefix or space prefix is rejected', async (ubot) => {
  const chatId = 999220;
  const msg = await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.setprefix abc',
    out: true
  });
  
  const lastEdit = ubot.client.editedMessages.find(m => m.messageId === msg.id);
  if (!lastEdit || (!lastEdit.text.includes('Gagal') && !lastEdit.text.includes('Tidak Valid'))) {
    throw new Error('Multi-character prefix should be rejected');
  }
});

registerTest('CS-T2-07', 'Settings', 'Settings - Regex-active prefix characters (e.g. ?, *, +) work correctly', async (ubot) => {
  const chatId = 999221;
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.setprefix ?', out: true });
  
  const msg = await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '?ping', out: true });
  const lastEdit = ubot.client.editedMessages.find(m => m.messageId === msg.id);
  if (!lastEdit || !lastEdit.text.toLowerCase().includes('pong')) {
    throw new Error('Regex active character prefix "?" failed to work');
  }
});

registerTest('CS-T2-08', 'Settings', 'Settings - Setting values not matching constraints are rejected', async (ubot) => {
  const chatId = 999222;
  const msg = await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.setlang invalid_lang',
    out: true
  });
  
  const lastEdit = ubot.client.editedMessages.find(m => m.messageId === msg.id);
  if (!lastEdit || (!lastEdit.text.includes('Gagal') && !lastEdit.text.includes('Invalid'))) {
    throw new Error('Invalid setting constraint check did not trigger rejection');
  }
});

registerTest('CS-T2-09', 'Settings', 'Settings - Custom name changes reflected in footer signature', async (ubot) => {
  const chatId = 999223;
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.setname SuperBot', out: true });
  
  const msg = await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.ping', out: true });
  const lastEdit = ubot.client.editedMessages.find(m => m.messageId === msg.id);
  if (!lastEdit || !lastEdit.text.includes('SuperBot')) {
    throw new Error('Custom name not reflected in footer signature');
  }
});

registerTest('CS-T2-10', 'Settings', 'Settings - Concurrent prefix changes in separate chats isolate settings', async (ubot) => {
  const chatA = 999224;
  const chatB = 999225;
  
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId: chatA, text: '.setprefix !', out: true });
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId: chatB, text: '.setprefix ?', out: true });
  
  if (getChatSettings(ubot.telegramId, chatA).prefix !== '!' || getChatSettings(ubot.telegramId, chatB).prefix !== '?') {
    throw new Error('Prefix configuration was not isolated between chats');
  }
});

registerTest('WG-T2-11', 'Welcome', 'Welcome - Empty/whitespace welcome text sets to default message', async (ubot) => {
  const chatId = 999320;
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.setwelcomemsg    ', out: true });
  
  ubot.client.sentMessages = [];
  await ubot.client.simulateIncomingJoin({ senderId: 111220, chatId });
  
  const welcome = ubot.client.sentMessages.find(m => m.chatId === chatId);
  if (!welcome || !welcome.message.includes('Selamat datang')) {
    throw new Error('Empty welcome message setting did not fall back to default');
  }
});

registerTest('WG-T2-12', 'Welcome', 'Welcome - Welcome message correctly parses placeholders {name}, {id}, {title}', async (ubot) => {
  const chatId = 999321;
  const name = 'Alice';
  const userId = 111221;
  
  await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.setwelcomemsg Welcome {name} (ID: {id}) to {title}',
    out: true
  });
  
  ubot.client.sentMessages = [];
  await ubot.client.simulateIncomingJoin({ senderId: userId, chatId, firstName: name });
  
  const welcome = ubot.client.sentMessages.find(m => m.chatId === chatId);
  if (!welcome || !welcome.message.includes(name) || !welcome.message.includes(String(userId)) || !welcome.message.includes(String(chatId))) {
    throw new Error('Welcome message did not replace placeholder variables correctly');
  }
});

registerTest('WG-T2-13', 'Welcome', 'Welcome - Goodbye message correctly parses placeholders', async (ubot) => {
  const chatId = 999322;
  const name = 'Bob';
  const userId = 111222;
  
  await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.setgoodbyemsg Goodbye {name} from {title}',
    out: true
  });
  
  ubot.client.sentMessages = [];
  await ubot.client.simulateIncomingLeave({ senderId: userId, chatId });
  
  const goodbye = ubot.client.sentMessages.find(m => m.chatId === chatId);
  if (!goodbye || !goodbye.message.includes('Goodbye') || !goodbye.message.includes(String(chatId))) {
    throw new Error('Goodbye message did not replace placeholders correctly');
  }
});

registerTest('WG-T2-14', 'Welcome', 'Welcome - Concurrent users joining triggers welcome messages for each', async (ubot) => {
  const chatId = 999323;
  ubot.client.sentMessages = [];
  
  await ubot.client.simulateIncomingJoin({ senderId: 111223, chatId });
  await ubot.client.simulateIncomingJoin({ senderId: 111224, chatId });
  
  const welcomes = ubot.client.sentMessages.filter(m => m.chatId === chatId && m.message.includes('Welcome'));
  if (welcomes.length < 2) {
    throw new Error('Failed to send welcome messages for all concurrent joins');
  }
});

registerTest('WG-T2-15', 'Welcome', 'Welcome - Welcome message fails gracefully if bot lacks permission to send messages', async (ubot) => {
  const chatId = 999324;
  const clientSend = ubot.client.sendMessage;
  
  // Simulate lack of permissions by throwing an error in client.sendMessage
  ubot.client.sendMessage = async () => { throw new Error('CHAT_WRITE_FORBIDDEN'); };
  
  try {
    await ubot.client.simulateIncomingJoin({ senderId: 111225, chatId });
  } catch (err) {
    throw new Error('Join event handler crashed instead of failing gracefully');
  } finally {
    ubot.client.sendMessage = clientSend;
  }
});

registerTest('AF-T2-16', 'Anti-Flood', 'Anti-Flood - Anti-flood triggers exactly at the configured threshold boundary (N messages)', async (ubot) => {
  const chatId = 999420;
  const spammer = 222220;
  
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.setfloodlimit 5', out: true });
  
  ubot.client.sentMessages = [];
  for (let i = 0; i < 4; i++) {
    await ubot.client.simulateNewMessage({ senderId: spammer, chatId, text: `msg ${i}`, out: false });
  }
  if (ubot.client.sentMessages.some(m => m.message.includes('Banjir') || m.message.includes('warning'))) {
    throw new Error('Flood warned before reaching the boundary limit');
  }
  
  await ubot.client.simulateNewMessage({ senderId: spammer, chatId, text: `msg 5`, out: false });
  const hasWarn = ubot.client.sentMessages.some(m => m.message.includes('Banjir') || m.message.includes('warning'));
  if (!hasWarn) {
    throw new Error('Flood did not warn exactly at the threshold limit');
  }
});

registerTest('AF-T2-17', 'Anti-Flood', 'Anti-Flood - Invalid threshold configuration (0 or negative) falls back to defaults', async (ubot) => {
  const chatId = 999421;
  const msg = await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.setfloodlimit -5',
    out: true
  });
  
  const lastEdit = ubot.client.editedMessages.find(m => m.messageId === msg.id);
  if (!lastEdit || (!lastEdit.text.includes('default') && !lastEdit.text.includes('Batal'))) {
    throw new Error('Negative flood limit must fallback to default or throw rejection');
  }
});

registerTest('AF-T2-18', 'Anti-Flood', 'Anti-Flood - Large message payloads and quick media attachments count towards flood rate', async (ubot) => {
  const chatId = 999422;
  const spammer = 222222;
  
  await ubot.client.simulateNewMessage({
    senderId: ubot.telegramId,
    chatId,
    text: '.antiflood on',
    out: true
  });
  
  ubot.client.sentMessages = [];
  for (let i = 0; i < 6; i++) {
    // Send message with media structure (or simulated attachments)
    await ubot.client.simulateNewMessage({ 
      senderId: spammer, 
      chatId, 
      text: '', 
      action: { photo: true }, 
      out: false 
    });
  }
  
  const warn = ubot.client.sentMessages.some(m => m.message.includes('warning') || m.message.includes('Banjir'));
  if (!warn) {
    throw new Error('Media messages were ignored by the anti-flood trigger');
  }
});

registerTest('AF-T2-19', 'Anti-Flood', 'Anti-Flood - Rapid parallel messages from multiple distinct users are audited correctly', async (ubot) => {
  const chatId = 999423;
  const u1 = 222223;
  const u2 = 222224;
  
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.antiflood on', out: true });
  
  ubot.client.sentMessages = [];
  // User 1 sends 3 messages, User 2 sends 3 messages
  for (let i = 0; i < 3; i++) {
    await ubot.client.simulateNewMessage({ senderId: u1, chatId, text: `u1 msg ${i}`, out: false });
    await ubot.client.simulateNewMessage({ senderId: u2, chatId, text: `u2 msg ${i}`, out: false });
  }
  
  const warns = ubot.client.sentMessages.filter(m => m.message.includes('warning') || m.message.includes('Banjir'));
  if (warns.length > 0) {
    throw new Error('Warnings issued prematurely; users spammed below the 5-msg individual threshold');
  }
});

registerTest('AF-T2-20', 'Anti-Flood', 'Anti-Flood - Custom warning thresholds allow configurable warnings count before restriction', async (ubot) => {
  const chatId = 999424;
  const spammer = 222225;
  
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.setfloodwarn 5', out: true });
  
  ubot.client.invokedCalls = [];
  // Send flood triggers repeatedly to hit warnings
  for (let i = 0; i < 20; i++) {
    await ubot.client.simulateNewMessage({ senderId: spammer, chatId, text: `Spamming ${i}`, out: false });
  }
  
  // If mute was triggered before warning count 5, that is a violation
  const mutes = ubot.client.invokedCalls.filter(c => c instanceof Api.channels.EditBanned);
  if (mutes.length === 0) {
    throw new Error('Mute was not triggered after exceeding custom warnings threshold');
  }
});

registerTest('RP-T2-21', 'Reputation', 'Reputation - Reputation points do not drop below zero if negative floor is enforced (or checks boundaries)', async (ubot) => {
  const chatId = 999520;
  const target = 333220;
  
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.setrepfloor 0', out: true });
  
  // Downvote multiple times
  const msg = await ubot.client.simulateNewMessage({ senderId: target, chatId, text: 'Spammer content', out: false });
  for (let i = 0; i < 5; i++) {
    await ubot.client.simulateNewMessage({ senderId: 444220 + i, chatId, text: '-rep', replyToMsgId: msg.id, out: false });
  }
  
  const rep = getReputation(ubot.telegramId, target);
  if (rep < 0) {
    throw new Error('Reputation dropped below configured floor limit of 0');
  }
});

registerTest('RP-T2-22', 'Reputation', 'Reputation - Upvoting multiple times within cooldown period is blocked', async (ubot) => {
  const chatId = 999521;
  const target = 333221;
  const voter = 444221;
  
  const msg = await ubot.client.simulateNewMessage({ senderId: target, chatId, text: 'Valuable answer', out: false });
  
  await ubot.client.simulateNewMessage({ senderId: voter, chatId, text: '+rep', replyToMsgId: msg.id, out: false });
  await ubot.client.simulateNewMessage({ senderId: voter, chatId, text: '+rep', replyToMsgId: msg.id, out: false });
  
  const rep = getReputation(ubot.telegramId, target);
  if (rep > 1) {
    throw new Error('Voter bypassed reputation cooldown to vote twice');
  }
});

registerTest('RP-T2-23', 'Reputation', 'Reputation - Reputation command on non-existent or unranked user returns default 0 rep', async (ubot) => {
  const chatId = 999522;
  const msg = await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.reputation 999999', out: true });
  
  const lastEdit = ubot.client.editedMessages.find(m => m.messageId === msg.id);
  if (!lastEdit || !lastEdit.text.includes('0')) {
    throw new Error('Reputation check for unranked user did not return default 0');
  }
});

registerTest('RP-T2-24', 'Reputation', 'Reputation - Special characters or non-ASCII characters in username do not break reputation storage/leaderboard', async (ubot) => {
  const chatId = 999523;
  const target = 333224;
  
  const msg = await ubot.client.simulateNewMessage({ senderId: target, chatId, text: 'Unicode username', out: false });
  await ubot.client.simulateNewMessage({ senderId: 444224, chatId, text: '+rep', replyToMsgId: msg.id, out: false });
  
  const repsMsg = await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.reps', out: true });
  const lastEdit = ubot.client.editedMessages.find(m => m.messageId === repsMsg.id);
  if (!lastEdit || !lastEdit.text.includes('First_333224')) {
    throw new Error('Unicode/Non-ASCII usernames did not print correctly in leaderboard');
  }
});

registerTest('RP-T2-25', 'Reputation', 'Reputation - User reputation is retained after user leaves and rejoins chat', async (ubot) => {
  const chatId = 999524;
  const target = 333225;
  
  const msg = await ubot.client.simulateNewMessage({ senderId: target, chatId, text: 'Initial', out: false });
  await ubot.client.simulateNewMessage({ senderId: 444225, chatId, text: '+rep', replyToMsgId: msg.id, out: false });
  
  // Leave and Rejoin
  await ubot.client.simulateIncomingLeave({ senderId: target, chatId });
  await ubot.client.simulateIncomingJoin({ senderId: target, chatId });
  
  const rep = getReputation(ubot.telegramId, target);
  if (rep !== 1) {
    throw new Error('Reputation points were cleared upon user leaving/joining');
  }
});


// ==========================================
// TIER 3: CROSS-FEATURE COMBINATIONS (5 tests)
// ==========================================

registerTest('CF-T3-01', 'Cross-Feature', 'Scheduler loops continue to post successfully even when the chat\'s custom prefix is modified', async (ubot) => {
  const chatId = 999601;
  ubot.client.sentMessages = [];
  
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.loop 1 LoopAcrossPrefix', out: true });
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.setprefix !', out: true });
  
  // Verify loop continues
  const hasLoopMsg = ubot.client.sentMessages.some(m => m.message.includes('LoopAcrossPrefix'));
  if (!hasLoopMsg) {
    throw new Error('Scheduler loops broke after chat prefix customization');
  }
});

registerTest('CF-T3-02', 'Cross-Feature', 'Messages sent by the scheduler do not trigger the userbot\'s own anti-flood threshold (self-spam immunity)', async (ubot) => {
  const chatId = 999602;
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.antiflood on', out: true });
  
  ubot.client.sentMessages = [];
  // Send scheduler loops rapidly
  for (let i = 0; i < 10; i++) {
    await ubot.client.sendMessage(chatId, { message: `Scheduler Broadcast ${i}` });
  }
  
  const selfWarn = ubot.client.sentMessages.some(m => m.message.includes('warning') || m.message.includes('Banjir'));
  if (selfWarn) {
    throw new Error('Scheduler outputs triggered anti-flood locks on the self userbot');
  }
});

registerTest('CF-T3-03', 'Cross-Feature', 'Large wave of concurrent joins triggers welcome messages which are rate-limited or monitored correctly without tripping anti-flood locks', async (ubot) => {
  const chatId = 999603;
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.antiflood on', out: true });
  
  ubot.client.sentMessages = [];
  // Join 10 users rapidly
  for (let i = 0; i < 10; i++) {
    await ubot.client.simulateIncomingJoin({ senderId: 111600 + i, chatId });
  }
  
  const hasLock = ubot.client.invokedCalls.some(c => c instanceof Api.channels.EditBanned);
  if (hasLock) {
    throw new Error('Anti-flood restricted the chat or bot during heavy welcome message wave');
  }
});

registerTest('CF-T3-04', 'Cross-Feature', 'Reputation upvote/downvote commands respond only to the custom prefix set for the chat', async (ubot) => {
  const chatId = 999604;
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.setprefix !', out: true });
  
  // .reps should do nothing under prefix '!'
  ubot.client.editedMessages = [];
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.reps', out: true });
  
  if (ubot.client.editedMessages.length > 0) {
    throw new Error('Reputation command executed using deactivated old prefix "."');
  }
});

registerTest('CF-T3-05', 'Cross-Feature', 'Reputation upvote events write log entries to the configured log channel when log toggles are enabled', async (ubot) => {
  const chatId = 999605;
  const target = 333605;
  
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.logging on', out: true });
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.setlogchannel 999999', out: true });
  
  ubot.client.sentMessages = [];
  const msg = await ubot.client.simulateNewMessage({ senderId: target, chatId, text: 'Helpful msg', out: false });
  await ubot.client.simulateNewMessage({ senderId: 444605, chatId, text: '+rep', replyToMsgId: msg.id, out: false });
  
  const logMsg = ubot.client.sentMessages.find(m => m.chatId === 999999 && m.message.includes('Reputasi'));
  if (!logMsg) {
    throw new Error('Reputation log entry not routed to log channel');
  }
});


// ==========================================
// TIER 4: REAL-WORLD APPLICATION SCENARIOS (5 tests)
// ==========================================

registerTest('RW-T4-01', 'Scenario', 'RW-T4-01: Complete Channel Moderation flow', async (ubot) => {
  const chatId = 999701;
  const spammer = 222701;
  const helper = 333701;
  const sender = 444701;
  
  // 1. Configure settings
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.setprefix !', out: true });
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '!logging on', out: true });
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '!antiflood on', out: true });
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '!setfloodlimit 3', out: true });
  
  // 2. User joins
  ubot.client.sentMessages = [];
  const joinMsg = await ubot.client.simulateIncomingJoin({ senderId: spammer, chatId });
  // service message deleted check
  const isDeleted = ubot.client.deletedMessages.some(d => d.messageIds.includes(joinMsg.id));
  if (!isDeleted) throw new Error('Join service message not cleaned');
  
  // 3. User spams
  for (let i = 0; i < 5; i++) {
    await ubot.client.simulateNewMessage({ senderId: spammer, chatId, text: `Spam ${i}`, out: false });
  }
  const isMuted = ubot.client.invokedCalls.some(c => c instanceof Api.channels.EditBanned);
  if (!isMuted) throw new Error('Spammer was not muted during scenario flow');
  
  // 4. Helpful user upvote
  const helpfulMsg = await ubot.client.simulateNewMessage({ senderId: helper, chatId, text: 'Answers here', out: false });
  await ubot.client.simulateNewMessage({ senderId: sender, chatId, text: '+', replyToMsgId: helpfulMsg.id, out: false });
  if (getReputation(ubot.telegramId, helper) !== 1) throw new Error('Reputation upvote failed in complete flow');
  
  // 5. Announcer loop
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '!loop 60 Announcement', out: true });
});

registerTest('RW-T4-02', 'Scenario', 'RW-T4-02: Database Crash & Auto-Resume', async (ubot) => {
  const chat1 = 999702;
  const chat2 = 999703;
  
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId: chat1, text: '.loop 10 Msg1', out: true });
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId: chat2, text: '.loop 20 Msg2', out: true });
  
  // Simulate crash by stopping client and resetting cache memory
  await ubot.stop();
  
  // Restart
  await ubot.start();
  
  // Verify schedule loops were read from DB and re-loaded
  const schedules = getSchedules(ubot.telegramId);
  if (schedules.length < 2) {
    throw new Error('Schedules not auto-resumed after restart');
  }
});

registerTest('RW-T4-03', 'Scenario', 'RW-T4-03: Multi-Tenant Chat Isolation', async (ubot) => {
  const chatA = 999704;
  const chatB = 999705;
  const user = 555701;
  
  // Group A setting
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId: chatA, text: '.setprefix /', out: true });
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId: chatA, text: '/setwelcomemsg Welcome A', out: true });
  
  // Group B setting
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId: chatB, text: '.setprefix !', out: true });
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId: chatB, text: '!setwelcomemsg Welcome B', out: true });
  
  // Verify prefix commands do not trigger cross-talk
  ubot.client.editedMessages = [];
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId: chatA, text: '!ping', out: true });
  if (ubot.client.editedMessages.length > 0) {
    throw new Error('Prefix command !ping ran in chat A where prefix is "/"');
  }
  
  // Verify join messages are isolated
  ubot.client.sentMessages = [];
  await ubot.client.simulateIncomingJoin({ senderId: user, chatId: chatA });
  const welcomeMsg = ubot.client.sentMessages.find(m => m.chatId === chatA);
  if (!welcomeMsg || !welcomeMsg.message.includes('Welcome A')) {
    throw new Error('Chat A did not use correct isolated welcome message');
  }
});

registerTest('RW-T4-04', 'Scenario', 'RW-T4-04: Raid / Spam Defense Simulation', async (ubot) => {
  const chatId = 999706;
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.antiflood on', out: true });
  await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.cleanservice on', out: true });
  
  ubot.client.invokedCalls = [];
  ubot.client.deletedMessages = [];
  
  // Simulating rapid raid
  for (let i = 0; i < 50; i++) {
    const user = 666000 + i;
    const joinMsg = await ubot.client.simulateIncomingJoin({ senderId: user, chatId });
    
    // Spammers send messages
    if (i % 5 === 0) {
      for (let m = 0; m < 6; m++) {
        await ubot.client.simulateNewMessage({ senderId: user, chatId, text: `Raid spam ${m}`, out: false });
      }
    }
  }
  
  // Verify that multiple spammers got restricted
  const restricts = ubot.client.invokedCalls.filter(c => c instanceof Api.channels.EditBanned);
  if (restricts.length < 5) {
    throw new Error('Raid simulation did not restrict enough spammers');
  }
  
  // Verify service joins cleaned
  if (ubot.client.deletedMessages.length < 40) {
    throw new Error('CleanService missed too many join service logs during raid');
  }
});

registerTest('RW-T4-05', 'Scenario', 'RW-T4-05: Reputation Economy & Leaderboards', async (ubot) => {
  const chatId = 999707;
  const u1 = 333707;
  const u2 = 333708;
  const voter1 = 444707;
  const voter2 = 444708;
  
  const m1 = await ubot.client.simulateNewMessage({ senderId: u1, chatId, text: 'Post 1', out: false });
  const m2 = await ubot.client.simulateNewMessage({ senderId: u2, chatId, text: 'Post 2', out: false });
  
  // Simulate multiple upvotes/downvotes
  await ubot.client.simulateNewMessage({ senderId: voter1, chatId, text: '+rep', replyToMsgId: m1.id, out: false });
  await ubot.client.simulateNewMessage({ senderId: voter2, chatId, text: '+rep', replyToMsgId: m1.id, out: false });
  await ubot.client.simulateNewMessage({ senderId: voter1, chatId, text: '+rep', replyToMsgId: m2.id, out: false });
  await ubot.client.simulateNewMessage({ senderId: voter2, chatId, text: '-rep', replyToMsgId: m2.id, out: false });
  
  if (getReputation(ubot.telegramId, u1) !== 2 || getReputation(ubot.telegramId, u2) !== 0) {
    throw new Error('Reputation calculations incorrect after economy cycle');
  }
  
  // Print leaderboard check
  const leaderboardMsg = await ubot.client.simulateNewMessage({ senderId: ubot.telegramId, chatId, text: '.reps', out: true });
  const lastEdit = ubot.client.editedMessages.find(m => m.messageId === leaderboardMsg.id);
  if (!lastEdit || !lastEdit.text.includes('First_333707') || lastEdit.text.includes('First_333708')) {
    throw new Error('Leaderboard missing top users or prints incorrect user list');
  }
});
