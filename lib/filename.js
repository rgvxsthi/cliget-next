"use strict";

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/**
 * Strip anything that would let a server-supplied name escape the download
 * directory or collide with shell/OS reserved forms.
 */
export function sanitizeFilename(name) {
  if (!name) return null;

  let out = String(name)
    .replace(CONTROL_CHARS, "")
    .replace(/[\\/]+/g, "_")
    .replace(/^\.+/, "")
    .trim();

  if (!out || out === "." || out === "..") return null;

  // Windows reserves these device names with or without an extension.
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(out)) out = `_${out}`;

  return out.slice(0, 255);
}

/**
 * Parse a filename out of a Content-Disposition header.
 * Prefers RFC 5987 `filename*` (with optional language tag) over `filename`.
 */
export function getFilenameFromContentDisposition(header) {
  if (!header) return null;

  const extended = /filename\*\s*=\s*([^']*)'([^']*)'([^;\s]+)/i.exec(header);
  if (extended) {
    const encoded = extended[3];
    try {
      return sanitizeFilename(decodeURIComponent(encoded));
    } catch {
      return sanitizeFilename(encoded);
    }
  }

  const quoted = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(header);
  if (quoted) return sanitizeFilename(quoted[1].replace(/\\(.)/g, "$1"));

  const bare = /filename\s*=\s*([^;\s]+)/i.exec(header);
  if (bare) return sanitizeFilename(bare[1]);

  return null;
}

export function getFilenameFromUrl(url) {
  let path;
  try {
    path = new URL(url).pathname;
  } catch {
    const cut = url.search(/[?#]/);
    path = cut === -1 ? url : url.slice(0, cut);
  }

  const last = path.slice(path.lastIndexOf("/") + 1);
  if (!last) return null;

  try {
    return sanitizeFilename(decodeURIComponent(last));
  } catch {
    return sanitizeFilename(last);
  }
}
