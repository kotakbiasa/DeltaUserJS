function getLatexFormula(query) {
  const match = query.match(/^(?:latex|math)\s+([\s\S]+)/i);
  return match ? match[1].trim() : '';
}

/**
 * Register LaTeX rich message inline handler.
 */
export function registerInlineLatexHandlers(bot) {
  bot.on('inline_query', async (ctx, next) => {
    const query = ctx.inlineQuery.query.trim();
    const formula = getLatexFormula(query);

    if (!formula) {
      return next();
    }

    await ctx.answerInlineQuery([{
      type: 'article',
      id: `latex-${Buffer.from(formula).toString('base64url').slice(0, 32)}`,
      title: 'LaTeX Rich Message',
      description: formula,
      input_message_content: {
        rich_message: {
          markdown: `$$${formula}$$`,
          skip_entity_detection: true,
        }
      }
    }], {
      cache_time: 0
    });
  });
}
