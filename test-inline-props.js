import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import config from './src/config.js';
import userbotManager from './src/userbot/manager.js';
import { getUserbotSession } from './src/database/db.js';

(async () => {
  const sessionData = getUserbotSession(1025855210);
  const client = new TelegramClient(new StringSession(sessionData.session), config.apiId, config.apiHash, { connectionRetries: 1 });
  await client.connect();
  const results = await client.inlineQuery("PanelDeltaUbot", "help");
  if (results && results.length > 0) {
    console.log(Object.keys(results[0]));
    console.log(typeof results[0].click);
  } else {
    console.log("No results");
  }
  process.exit();
})();
