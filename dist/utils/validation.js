/**
 * Validation schemas using Zod
 * Provides type-safe runtime validation for command parameters
 */
import { z } from 'zod';
// Common reusable schemas
export const positiveInt = z.coerce.number().int().positive();
export const nonNegativeInt = z.coerce.number().int().nonnegative();
export const telegramId = z.coerce.number().int().min(1);
export const chatId = z.coerce.number().int();
export const messageId = z.coerce.number().int().positive();
export const username = z.string().regex(/^[a-zA-Z0-9_]{5,32}$/).optional();
export const phoneNumber = z.string().regex(/^\+\d{10,15}$/);
// Command parameter schemas
export const gcastSchema = z.object({
    text: z.string().min(1).max(4096),
    silent: z.boolean().optional(),
    pin: z.boolean().optional(),
});
export const adminActionSchema = z.object({
    userId: telegramId,
    chatId: chatId,
    reason: z.string().max(256).optional(),
    duration: positiveInt.optional(), // seconds for mute/ban
});
export const noteSchema = z.object({
    name: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
    content: z.string().min(1).max(4096),
    type: z.enum(['text', 'photo', 'video', 'document', 'sticker']).optional(),
});
export const scheduleSchema = z.object({
    name: z.string().min(1).max(64),
    cron: z.string().regex(/^((\*|([0-9]|1[0-9]|2[0-3])|\*\/[0-9]+)\s+){4}(\*|([0-9]|1[0-9]|2[0-3])|\*\/[0-9]+)$/),
    message: z.string().min(1).max(4096),
    chatId: chatId,
});
export const welcomeSchema = z.object({
    chatId: chatId,
    enabled: z.boolean(),
    message: z.string().max(1024).optional(),
    media: z.object({
        type: z.enum(['photo', 'video', 'animation']),
        fileId: z.string(),
    }).optional(),
});
export const afkSchema = z.object({
    reason: z.string().max(256).optional(),
    media: z.object({
        type: z.enum(['photo', 'video', 'animation']),
        fileId: z.string(),
    }).optional(),
});
export const reputationSchema = z.object({
    targetId: telegramId,
    chatId: chatId,
    action: z.enum(['+', '-']),
});
export const carbonSchema = z.object({
    code: z.string().min(1).max(5000),
    theme: z.enum(['dracula', 'one-dark', 'github', 'monokai', 'solarized', 'vscode']).optional(),
    language: z.string().optional(),
    lineNumbers: z.boolean().optional(),
});
export const stalkSchema = z.object({
    targetId: telegramId,
    chatId: chatId,
    limit: positiveInt.max(100).optional(),
    search: z.string().optional(),
});
export const execSchema = z.object({
    code: z.string().min(1).max(10000),
    language: z.enum(['js', 'ts', 'sh']).optional(),
    timeout: positiveInt.max(30000).optional(), // ms
});
// Helper: validate and return typed result or throw with formatted error
export function validate(schema, data) {
    const result = schema.safeParse(data);
    if (!result.success) {
        const errors = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
        throw new Error(`Validation failed: ${errors}`);
    }
    return result.data;
}
// Helper: validate partial (for optional fields)
export function validatePartial(schema, data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const partialSchema = schema.partial();
    const result = partialSchema.safeParse(data);
    if (!result.success) {
        const errors = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
        throw new Error(`Validation failed: ${errors}`);
    }
    return result.data;
}
