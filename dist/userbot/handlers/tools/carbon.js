const THEMES = [
    "3024-night", "a11y-dark", "blackboard", "base16-dark", "base16-light",
    "cobalt", "dracula", "duotone-dark", "hopscotch", "lucario", "material",
    "monokai", "night-owl", "nord", "oceanic-next", "one-light", "one-dark",
    "panda-syntax", "paraiso-dark", "seti", "shades-of-purple", "solarized",
    "solarized light", "synthwave-84", "twilight", "verminal", "vscode", "yeti", "zenburn"
];
// Helper to generate random RGBA
function randomRgb() {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return `rgba(${r}, ${g}, ${b}, 1)`;
}
// Map command to style configuration
function getCarbonConfig(theme, code) {
    const baseConfig = {
        code: code,
        language: "auto",
        fontFamily: "Fira Code",
        windowControls: true,
        widthAdjustment: true,
        lineNumbers: false,
        firstLineNumber: 1,
        exportSize: "2x",
        watermark: false,
        dropShadow: true,
        dropShadowOffsetY: "20px",
        dropShadowBlurRadius: "68px",
        fontSize: "14px"
    };
    if (theme === 'random') {
        const randTheme = THEMES[Math.floor(Math.random() * THEMES.length)];
        return { ...baseConfig, backgroundColor: randomRgb(), theme: randTheme };
    }
    // Check if theme matches special styles
    if (theme === 'synthwave-84') {
        return { ...baseConfig, backgroundColor: "rgba(249, 237, 212, 0)", theme: "synthwave-84", dropShadowBlurRadius: "0px", fontFamily: "IBM Plex Mono", fontSize: "14.5px" };
    }
    // Default theme
    return { ...baseConfig, backgroundColor: "rgba(171, 184, 195, 1)", theme: theme };
}
export default {
    name: 'carbon',
    version: '1.0.0',
    description: 'Membuat gambar source code yang indah (Carbon).',
    help: {
        title: 'Carbon Generator',
        description: 'Mengubah teks/kode menjadi gambar estetis menggunakan API Carbon.',
        usage: '`.carbon [-tema] <teks>` atau balas pesan dengan `.carbon [-tema]`',
        detail: 'Contoh: \n`.carbon -dracula console.log()`\n`.carbon -random test`\nDaftar tema yang bisa dipakai: material, nord, dracula, seti, vscode, one-dark, synthwave-84, dll.'
    },
    async execute(client, message, _settings, _telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        if (!message.message.toLowerCase().startsWith('.carbon')) {
            return;
        }
        let textCode = message.message.substring(7).trim();
        let theme = "seti"; // Default theme
        // Cek apakah ada flag tema (dimulai dengan '-')
        if (textCode.startsWith('-')) {
            const spaceIndex = textCode.indexOf(' ');
            let possibleTheme;
            if (spaceIndex !== -1) {
                possibleTheme = textCode.substring(1, spaceIndex).toLowerCase();
            }
            else {
                possibleTheme = textCode.substring(1).toLowerCase();
            }
            if (THEMES.includes(possibleTheme) || possibleTheme === 'random') {
                theme = possibleTheme;
                if (spaceIndex !== -1) {
                    textCode = textCode.substring(spaceIndex + 1).trim();
                }
                else {
                    textCode = "";
                }
            }
        }
        // Jika tidak ada teks kode, coba ambil dari pesan yang di-reply
        if (!textCode && message.replyToMsgId) {
            const replied = await message.getReplyMessage();
            if (replied && replied.message) {
                textCode = replied.message;
            }
        }
        if (!textCode) {
            await message.edit({ text: `❌ <b>Berikan kode yang ingin di-carbon!</b>`, parseMode: 'html' });
            return;
        }
        await message.edit({ text: `⏳ <b>Mencetak Carbon (Tema: ${theme})...</b>`, parseMode: 'html' });
        try {
            const payload = getCarbonConfig(theme, textCode);
            const response = await fetch('https://carbonara.solopov.dev/api/cook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                throw new Error(`API Error: ${response.statusText}`);
            }
            await message.edit({ text: `⏳ <b>Carbon selesai! Mengunggah gambar...</b>`, parseMode: 'html' });
            // Ambil gambar dalam bentuk buffer (byte-array)
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            await client.sendMessage(message.chatId, {
                message: "Here's your carbon!",
                file: { source: buffer, filename: 'carbon.png' },
                replyTo: message.replyToMsgId
            });
            // Hapus pesan loading
            try {
                await message.delete();
            }
            catch (_e) { /* empty */ }
        }
        catch (err) {
            await message.edit({
                text: `<blockquote>❌ <b>Gagal membuat carbon:</b> ${err.message}</blockquote>`,
                parseMode: 'html'
            });
        }
    }
};
