import fs from 'fs';
import path from 'path';

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      content = content.replace(/\\n\\n⚡ <i>\$\{settings\??\.custom_name \|\| 'DeltaUbotJS'\}<\/i>/g, '');
      content = content.replace(/\\n⚡ <i>\$\{settings\??\.custom_name \|\| 'DeltaUbotJS'\}<\/i>/g, '');
      content = content.replace(/⚡ <i>\$\{settings\??\.custom_name \|\| 'DeltaUbotJS'\}<\/i>/g, '');
      
      content = content.replace(/\\n\\n⚡ <i>DeltaUbotJS<\/i>/g, '');
      content = content.replace(/\\n\\n⚡ <i>\$\{botName\}<\/i>/g, '');
      
      fs.writeFileSync(fullPath, content);
    }
  }
}

processDir('src/userbot/plugins');
console.log('Done');
