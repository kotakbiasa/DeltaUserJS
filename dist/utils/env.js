/**
 * Environment helpers.
 *
 * `isTestEnv` is evaluated ONCE at module load so every consumer sees the same
 * value for the lifetime of the process. Previously this check was duplicated
 * inline across welcome/antiflood/reputation handlers and re-read
 * process.env/process.argv on every message — inconsistent and easy to drift.
 */
export const isTestEnv = process.env.NODE_ENV === 'test' ||
    Boolean(process.argv[1]?.includes('runner.js'));
