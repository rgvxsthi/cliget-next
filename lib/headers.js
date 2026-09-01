"use strict";

/**
 * Headers the download client must own. Replaying the browser's copy is
 * always wrong, so these are dropped regardless of user settings:
 *
 *   host                  derived from the URL; a stale value breaks
 *                         redirects and TLS SNI/virtual-host routing
 *   content-length        recomputed from the body actually sent
 *   connection,           hop-by-hop; meaningless on a new connection
 *   keep-alive,
 *   proxy-connection,
 *   te, upgrade,
 *   transfer-encoding
 *   range, if-range       the browser often requests a byte range for media.
 *                         Replaying it truncates the file and disables
 *                         parallel segmented downloading entirely.
 *   if-modified-since,    a 304 response leaves you with an empty file
 *   if-none-match
 */
export const PROTOCOL_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "keep-alive",
  "proxy-connection",
  "te",
  "upgrade",
  "transfer-encoding",
  "range",
  "if-range",
  "if-modified-since",
  "if-none-match",
]);

/**
 * Headers that are merely noise in a download command. They carry no
 * authentication and no server behaviour that matters off-browser, so they
 * are dropped by default to keep the command readable. Toggleable, because a
 * rare origin does fingerprint on them.
 */
export const NOISE_HEADERS = new Set([
  "dnt",
  "sec-gpc",
  "priority",
  "upgrade-insecure-requests",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-fetch-user",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "sec-ch-ua-platform-version",
  "sec-ch-ua-arch",
  "sec-ch-ua-bitness",
  "sec-ch-ua-full-version",
  "sec-ch-ua-full-version-list",
  "sec-ch-ua-model",
  "pragma",
  "cache-control",
]);

/**
 * Apply the header policy to a captured request.
 *
 * @param {{name: string, value: string}[]} headers
 * @param {{excludeHeaders?: string, trimNoiseHeaders?: boolean}} options
 */
export function filterHeaders(headers, options = {}) {
  const userExcluded = new Set(
    String(options.excludeHeaders || "")
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((h) => h.toLowerCase())
  );

  return (headers || []).filter((header) => {
    const name = header.name.toLowerCase();
    if (PROTOCOL_HEADERS.has(name)) return false;
    if (userExcluded.has(name)) return false;
    if (options.trimNoiseHeaders !== false && NOISE_HEADERS.has(name))
      return false;
    return true;
  });
}
