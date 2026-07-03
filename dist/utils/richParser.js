import { InlineKeyboard } from 'grammy';
/**
 * Menerjemahkan teks dengan format (mirip Rose Bot) menjadi teks bersih + Inline Keyboard
 * @param {string} text - Teks mentah berformat
 * @param {Object} userContext - Context user yang memicu (ctx.from)
 * @param {Object} chatContext - Context grup (ctx.chat)
 * @returns {Object} { text: string, keyboard: InlineKeyboard | null }
 */
export function parseRichText(text, userContext = {}, chatContext = {}) {
    let parsedText = String(text || '');
    // 1. Replace Variables
    const placeholders = {
        '{first_name}': userContext.first_name || '',
        '{last_name}': userContext.last_name || '',
        '{fullname}': `${userContext.first_name || ''} ${userContext.last_name || ''}`.trim(),
        '{username}': userContext.username ? `@${userContext.username}` : '',
        '{id}': userContext.id || '',
        '{chat_title}': chatContext.title || '',
        '{chat_id}': chatContext.id || '',
    };
    for (const [key, value] of Object.entries(placeholders)) {
        // case insensitive replacement for variables
        parsedText = parsedText.replace(new RegExp(key, 'gi'), value);
    }
    // 2. Parse Inline Buttons
    // Format: [Text](buttonurl://link.com) atau [Text](buttonurl://link.com:same)
    const buttonRegex = /\[([^\]]+)\]\(buttonurl:\/\/([^)]+)\)/g;
    const keyboard = new InlineKeyboard();
    let hasButtons = false;
    let currentRow = [];
    parsedText = parsedText.replace(buttonRegex, (match, btnText, btnUrl) => {
        hasButtons = true;
        let url = btnUrl.trim();
        let isSame = false;
        if (url.endsWith(':same')) {
            isSame = true;
            url = url.slice(0, -5).trim();
        }
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        if (isSame && currentRow.length > 0) {
            currentRow.push(InlineKeyboard.url(btnText.trim(), url));
        }
        else {
            if (currentRow.length > 0) {
                keyboard.row(...currentRow);
            }
            currentRow = [InlineKeyboard.url(btnText.trim(), url)];
        }
        return ''; // Hilangkan syntax tombol dari teks chat
    });
    // Tambahkan baris terakhir
    if (currentRow.length > 0) {
        keyboard.row(...currentRow);
    }
    return {
        text: parsedText.trim(),
        keyboard: hasButtons ? keyboard : null
    };
}
