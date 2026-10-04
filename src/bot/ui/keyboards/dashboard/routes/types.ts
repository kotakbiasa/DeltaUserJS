/**
 * Kontrak kecil antar-modul route dashboard.
 *
 * Tiap modul route mengembalikan NOT_HANDLED bila `action` bukan miliknya,
 * sehingga router di handlers.ts bisa membedakan "tidak ditangani" dari
 * "ditangani tapi tidak mengembalikan nilai" (mis. cabang `noop`).
 */
export const NOT_HANDLED = Symbol('rich-route-not-handled');
