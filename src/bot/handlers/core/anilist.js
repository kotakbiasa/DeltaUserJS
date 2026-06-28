import { InlineKeyboard, InlineQueryResultBuilder } from 'grammy';

const url = 'https://graphql.anilist.co';

async function fetchAnilist(query, variables) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const json = await response.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

// Queries
const characterQuery = `query ($search: String) {
  Character (search: $search) {
    name { full }
    siteUrl
    image { large }
    description
  }
}`;

const airingQuery = `query ($search: String) {
  Media (type: ANIME, search: $search) {
    id
    episodes
    title { romaji native }
    nextAiringEpisode { timeUntilAiring episode }
    siteUrl
    bannerImage
    coverImage { large }
  }
}`;

const mangaQuery = `query ($search: String) {
  Media (type: MANGA, search: $search) {
    id
    title { romaji native }
    description (asHtml: false)
    startDate { year }
    status
    averageScore
    genres
    bannerImage
    coverImage { large }
    siteUrl
  }
}`;

const animeQuery = `query ($search: String) {
  Media (type: ANIME, search: $search) {
    id
    title { romaji english }
    description (asHtml: false)
    startDate { year }
    episodes
    format
    status
    duration
    averageScore
    genres
    bannerImage
    coverImage { large }
    siteUrl
  }
}`;

function shorten(desc, max = 800) {
  if (!desc) return '';
  let clean = desc.replace(/<br>/g, '\n').replace(/<\/br>/g, '').replace(/<i>/g, '').replace(/<\/i>/g, '').replace(/__/g, '**').replace(/<[^>]+>/g, '');
  if (clean.length > max) return clean.substring(0, max) + '...';
  return clean;
}

function timeFormatter(ms) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  let str = '';
  if (days > 0) str += `${days}d `;
  if (hours > 0) str += `${hours}h `;
  if (minutes > 0) str += `${minutes}m `;
  str += `${seconds}s`;
  return str.trim();
}

export function registerInlineAnilistHandlers(bot) {
  bot.on('inline_query', async (ctx, next) => {
    const query = ctx.inlineQuery.query;
    
    if (query.startsWith('anilist_')) {
      const parts = query.split('_');
      if (parts.length < 3) return ctx.answerInlineQuery([]);
      
      const cmd = parts[1];
      const search = parts.slice(2).join('_');
      
      try {
        let title = '';
        let text = '';
        let imageUrl = '';
        let siteUrl = '';

        if (cmd === 'anichar') {
          const data = await fetchAnilist(characterQuery, { search });
          const char = data.Character;
          if (!char) throw new Error('Karakter tidak ditemukan');
          
          title = char.name.full;
          imageUrl = char.image?.large;
          siteUrl = char.siteUrl;
          text = `👤 <b>${title}</b>\n\n<b>Deskripsi:</b>\n<blockquote expandable>${shorten(char.description, 800)}</blockquote>`;
        } 
        else if (cmd === 'airing') {
          const data = await fetchAnilist(airingQuery, { search });
          const media = data.Media;
          if (!media) throw new Error('Anime tidak ditemukan');
          
          title = media.title.romaji;
          siteUrl = media.siteUrl;
          imageUrl = media.bannerImage || media.coverImage?.large;
          
          text = `📺 <b>${title}</b> (<code>${media.title.native || ''}</code>)\n<blockquote>🆔 <b>ID:</b> <code>${media.id}</code>`;
          if (media.nextAiringEpisode) {
            text += `\n🎬 <b>Episode Berikutnya:</b> <code>${media.nextAiringEpisode.episode}</code>`;
            text += `\n⏳ <b>Tayang Dalam:</b> <code>${timeFormatter(media.nextAiringEpisode.timeUntilAiring * 1000)}</code></blockquote>`;
          } else {
            text += `\n🎬 <b>Total Episode:</b> <code>${media.episodes || '?'}</code>\n📡 <b>Status Tayang:</b> <code>Sudah Selesai / N/A</code></blockquote>`;
          }
        }
        else if (cmd === 'animanga') {
          const data = await fetchAnilist(mangaQuery, { search });
          const media = data.Media;
          if (!media) throw new Error('Manga tidak ditemukan');
          
          title = media.title.romaji;
          siteUrl = media.siteUrl;
          imageUrl = media.bannerImage || media.coverImage?.large;
          
          text = `📖 <b>${title}</b>`;
          if (media.title.native) text += ` (<code>${media.title.native}</code>)\n`;
          text += `<blockquote>`;
          if (media.startDate?.year) text += `📅 <b>Tahun:</b> <code>${media.startDate.year}</code>\n`;
          if (media.status) text += `📡 <b>Status:</b> <code>${media.status}</code>\n`;
          if (media.averageScore) text += `⭐️ <b>Skor:</b> <code>${media.averageScore}</code>\n`;
          if (media.genres?.length) text += `🎭 <b>Genre:</b> ${media.genres.join(', ')}\n`;
          text += `</blockquote>`;
          text += `\n<b>Sinopsis:</b>\n<blockquote expandable><i>${shorten(media.description, 600)}</i></blockquote>`;
        }
        else if (cmd === 'anime') {
          const data = await fetchAnilist(animeQuery, { search });
          const media = data.Media;
          if (!media) throw new Error('Anime tidak ditemukan');
          
          title = media.title.romaji;
          siteUrl = media.siteUrl || `https://anilist.co/anime/${media.id}`;
          imageUrl = media.bannerImage || media.coverImage?.large;
          
          text = `🎬 <b>${title}</b>`;
          if (media.title.english) text += ` (<i>${media.title.english}</i>)`;
          text += `\n<blockquote>📺 <b>Tipe:</b> <code>${media.format || 'N/A'}</code>`;
          if (media.genres?.length) text += `\n🎭 <b>Genre:</b> ${media.genres.join(', ')}`;
          text += `\n📡 <b>Status:</b> <code>${media.status || 'N/A'}</code>`;
          text += `\n🎬 <b>Episode:</b> <code>${media.episodes || '?'}</code>`;
          if (media.startDate?.year) text += `\n📅 <b>Tahun:</b> <code>${media.startDate.year}</code>`;
          if (media.averageScore) text += `\n⭐️ <b>Skor:</b> <code>${media.averageScore}</code>`;
          if (media.duration) text += `\n⏱ <b>Durasi:</b> <code>${media.duration} Menit</code></blockquote>`;
          text += `\n<b>Sinopsis:</b>\n<blockquote expandable><i>${shorten(media.description, 600)}</i></blockquote>`;
        }
        else {
          return ctx.answerInlineQuery([]);
        }

        const keyboard = new InlineKeyboard();
        if (siteUrl) {
          keyboard.url('🔍 Baca Selengkapnya di Anilist', siteUrl);
        }

        let result;
        if (imageUrl) {
          result = InlineQueryResultBuilder.photo('anilist_' + Date.now(), imageUrl, {
            thumbnail_url: imageUrl,
            title: title,
            caption: text,
            parse_mode: 'HTML',
            reply_markup: keyboard
          });
        } else {
          result = InlineQueryResultBuilder.article('anilist_' + Date.now(), title, {
            reply_markup: keyboard
          }).text(text, { parse_mode: 'HTML' });
        }

        await ctx.answerInlineQuery([result], { cache_time: 300, is_personal: false });
        return;

      } catch (err) {
        const result = InlineQueryResultBuilder.article('anilist_err', '❌ Error').text(`<blockquote>❌ <b>Gagal mencari Anilist:</b> ${err.message}</blockquote>`, { parse_mode: 'HTML' });
        await ctx.answerInlineQuery([result], { cache_time: 10 });
        return;
      }
    }
    
    return next();
  });
}
