"use strict";

/**
 * Firefox exposes the promise-based `browser` namespace, Chrome exposes
 * `chrome`. Chrome's MV3 APIs return promises when no callback is given, so a
 * plain alias is enough -- no polyfill needed.
 */
export const api = globalThis.browser ?? globalThis.chrome;

/** storage.session keeps captured requests out of disk. */
export const sessionStore = api.storage.session ?? api.storage.local;
