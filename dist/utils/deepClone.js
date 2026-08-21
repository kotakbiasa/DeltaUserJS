/**
 * Safe deep clone utility.
 *
 * Replaces `JSON.parse(JSON.stringify(obj))` which silently drops `undefined`,
 * `Map`, `Set`, `Date`, functions, and `BigInt`, and throws on circular refs.
 *
 * This implementation preserves `Date`, `Map`, `Set`, `RegExp`, and handles
 * circular references via a WeakMap tracker. `undefined`, functions, and
 * `BigInt` are still not cloned (they are not meaningful in persisted cache data).
 */
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    // Handle circular references
    const seen = new WeakMap();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function clone(value) {
        if (value === null || typeof value !== 'object') {
            return value;
        }
        // Return cached clone for circular refs
        if (seen.has(value)) {
            return seen.get(value);
        }
        // Date
        if (value instanceof Date) {
            return new Date(value.getTime());
        }
        // RegExp
        if (value instanceof RegExp) {
            return new RegExp(value.source, value.flags);
        }
        // Map
        if (value instanceof Map) {
            const copy = new Map();
            seen.set(value, copy);
            for (const [k, v] of value.entries()) {
                copy.set(clone(k), clone(v));
            }
            return copy;
        }
        // Set
        if (value instanceof Set) {
            const copy = new Set();
            seen.set(value, copy);
            for (const v of value.values()) {
                copy.add(clone(v));
            }
            return copy;
        }
        // Array
        if (Array.isArray(value)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const copy = [];
            seen.set(value, copy);
            for (let i = 0; i < value.length; i++) {
                copy[i] = clone(value[i]);
            }
            return copy;
        }
        // Plain object
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const copy = {};
        seen.set(value, copy);
        for (const key of Object.keys(value)) {
            copy[key] = clone(value[key]);
        }
        return copy;
    }
    return clone(obj);
}
