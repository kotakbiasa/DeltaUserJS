import { Api } from 'telegram';
import { helpRegistry } from './src/userbot/pluginRegistry.js';

function createHelpMenuMarkup() {
  const entries = Object.entries(helpRegistry || {});
  const rows = [];
  for (let i = 0; i < entries.length; i += 2) {
    const row = [];
    const [name1] = entries[i];
    row.push(new Api.KeyboardButtonCallback({ text: name1, data: Buffer.from(`help:${name1}`) }));
    if (i + 1 < entries.length) {
      const [name2] = entries[i + 1];
      row.push(new Api.KeyboardButtonCallback({ text: name2, data: Buffer.from(`help:${name2}`) }));
    }
    rows.push(new Api.KeyboardButtonRow({ buttons: row }));
  }
  return new Api.ReplyInlineMarkup({ rows });
}
console.log(createHelpMenuMarkup());
