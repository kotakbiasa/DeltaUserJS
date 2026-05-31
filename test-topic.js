import { Bot } from 'grammy';
import config from './src/config.js';
(async () => {
  const bot = new Bot(config.botToken);
  try {
    const topic = await bot.api.createForumTopic(config.ownerId, "Registrations");
    console.log("Topic ID:", topic.message_thread_id);
  } catch (err) {
    console.error("Error:", err.message);
  }
})();
