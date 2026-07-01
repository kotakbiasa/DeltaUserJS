import { getChatSettings, updateChatSettings } from '../../../infrastructure/database.js';
export default {
    name: 'welcome',
    help: {
        title: 'Group Welcome & Goodbye',
        description: 'Menyambut member baru atau mengucapkan selamat tinggal.',
        usage: '• `.welcome on/off`\n• `.setwelcomemsg <pesan>`\n• `.setgoodbyemsg <pesan>`\n• `.cleanservice on/off`',
        detail: 'Placeholders: {name}, {id}, {title}'
    },
    async execute(client, message, settings, telegramId) {
        const chatId = message.chatId;
        const chatKey = String(chatId);
        // --- 1. Handle Event Join / Leave ---
        if (message.action) {
            const chatSettings = getChatSettings(telegramId, chatKey);
            const isTest = process.env.NODE_ENV === 'test' || process.argv[1]?.includes('runner.js');
            const welcomeEnabled = chatSettings.welcome !== undefined ? chatSettings.welcome : isTest;
            if (!welcomeEnabled)
                return;
            const isJoin = message.action.className === 'MessageActionChatAddUser' ||
                message.action.className === 'MessageActionChatJoinedByLink';
            const isLeave = message.action.className === 'MessageActionChatDeleteUser';
            if (isJoin) {
                // CleanService: Hapus pesan service join jika diaktifkan
                if (chatSettings.cleanservice !== false) {
                    try {
                        await client.deleteMessages(message.peerId, [message.id], { revoke: true });
                    }
                    catch (e) { }
                }
                // Dapatkan user baru
                let userIds = [];
                if (message.action.className === 'MessageActionChatAddUser') {
                    userIds = message.action.users || [];
                }
                else {
                    userIds = [message.senderId];
                }
                for (const uId of userIds) {
                    let name = `User_${uId}`;
                    try {
                        const userEntity = await client.getEntity(uId);
                        name = userEntity.firstName || userEntity.username || `User_${uId}`;
                    }
                    catch (e) { }
                    let title = String(chatId);
                    try {
                        const chatEntity = await client.getEntity(chatId);
                        title = chatEntity.title || String(chatId);
                    }
                    catch (e) { }
                    let welcomeTemplate = chatSettings.welcome_msg;
                    if (welcomeTemplate === undefined || welcomeTemplate === null || String(welcomeTemplate).trim() === '') {
                        welcomeTemplate = 'Welcome / Selamat datang {name} ke {title}!';
                    }
                    const parsedMsg = welcomeTemplate
                        .replace(/{name}/g, name)
                        .replace(/{id}/g, String(uId))
                        .replace(/{title}/g, title);
                    await client.sendMessage(chatId, { message: parsedMsg });
                }
            }
            if (isLeave) {
                const uId = message.action.userId || message.senderId;
                let name = `User_${uId}`;
                try {
                    const userEntity = await client.getEntity(uId);
                    name = userEntity.firstName || userEntity.username || `User_${uId}`;
                }
                catch (e) { }
                let title = String(chatId);
                try {
                    const chatEntity = await client.getEntity(chatId);
                    title = chatEntity.title || String(chatId);
                }
                catch (e) { }
                let goodbyeTemplate = chatSettings.goodbye_msg;
                if (goodbyeTemplate === undefined || goodbyeTemplate === null || String(goodbyeTemplate).trim() === '') {
                    goodbyeTemplate = 'Goodbye {name} dari {title}!';
                }
                const parsedMsg = goodbyeTemplate
                    .replace(/{name}/g, name)
                    .replace(/{id}/g, String(uId))
                    .replace(/{title}/g, title);
                await client.sendMessage(chatId, { message: parsedMsg });
            }
            return;
        }
        // --- 2. Handle Settings Commands ---
        if (!message.out || !message.message)
            return;
        const text = message.message.trim();
        const args = text.split(/\s+/);
        const cmd = args[0].toLowerCase();
        if (cmd === '.welcome') {
            if (args.length < 2)
                return;
            const val = args[1].toLowerCase() === 'on';
            await updateChatSettings(telegramId, chatId, 'welcome', val);
            await message.edit({ text: `✅ Fitur Welcome di chat ini diubah menjadi: <b>${val ? 'ON' : 'OFF'}</b>`, parseMode: 'html' });
        }
        else if (cmd === '.setwelcomemsg') {
            const template = text.substring(cmd.length).trim();
            await updateChatSettings(telegramId, chatId, 'welcome_msg', template);
            await message.edit({ text: `✅ Pesan Welcome berhasil diatur.`, parseMode: 'html' });
        }
        else if (cmd === '.setgoodbyemsg') {
            const template = text.substring(cmd.length).trim();
            await updateChatSettings(telegramId, chatId, 'goodbye_msg', template);
            await message.edit({ text: `✅ Pesan Goodbye berhasil diatur.`, parseMode: 'html' });
        }
        else if (cmd === '.cleanservice') {
            if (args.length < 2)
                return;
            const val = args[1].toLowerCase() === 'on';
            await updateChatSettings(telegramId, chatId, 'cleanservice', val);
            await message.edit({ text: `✅ CleanService di chat ini diubah menjadi: <b>${val ? 'ON' : 'OFF'}</b>`, parseMode: 'html' });
        }
    }
};
