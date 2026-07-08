/**
 * Permission helpers for bot handlers.
 * Extracted from handlers to avoid duplication.
 */
import config from '../config.js';
/**
 * Check if a user ID is the bot owner (from .env OWNER_ID).
 */
export function isOwner(userId) {
    return userId === config.ownerId;
}
/**
 * Check if the current context's user is a GROUP admin (creator or administrator).
 * Returns false if the chat is private or on API error.
 * NOTE: This checks GROUP admin status, NOT bot owner. Use isOwner() for that!
 */
export async function isAdmin(ctx) {
    if (!ctx.chat || ctx.chat.type === 'private')
        return false;
    try {
        const member = await ctx.getChatMember(ctx.from.id);
        return ['creator', 'administrator'].includes(member.status);
    }
    catch (err) {
        return false;
    }
}
/**
 * Check if a specific user is a group admin (creator or administrator).
 * Returns false if the chat is not a group or on API error.
 */
export async function isGroupAdmin(ctx, userId) {
    try {
        const member = await ctx.api.getChatMember(ctx.chat.id, userId);
        return ['creator', 'administrator'].includes(member.status);
    }
    catch (err) {
        return false;
    }
}
/**
 * Check if the bot itself is an admin in the current chat.
 */
export async function isBotAdmin(ctx) {
    if (!ctx.chat || ctx.chat.type === 'private')
        return false;
    try {
        const botMember = await ctx.getChatMember(ctx.me.id);
        return botMember.status === 'administrator';
    }
    catch (err) {
        return false;
    }
}
/**
 * Middleware: only allow bot owner to proceed.
 */
export function ownerOnly() {
    return async (ctx, next) => {
        const userId = ctx.from?.id;
        if (userId && isOwner(userId))
            return next();
        return ctx.reply('❌ Command ini hanya untuk Owner.');
    };
}
/**
 * Middleware: only allow group admins (or bot owner) to proceed.
 */
export function adminOnly() {
    return async (ctx, next) => {
        const userId = ctx.from?.id;
        if (!userId)
            return;
        if (isOwner(userId) || await isAdmin(ctx)) {
            return next();
        }
        return ctx.reply('❌ Anda bukan admin.');
    };
}
