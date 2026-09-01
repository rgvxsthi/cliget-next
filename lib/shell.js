"use strict";

/**
 * Quote a single argument for a POSIX shell or for Windows cmd.exe.
 *
 * POSIX mode wraps in single quotes, which suppress every form of expansion,
 * so the only character needing care is the quote itself.
 *
 * Windows mode wraps in double quotes. cmd.exe does not expand `$` or
 * backticks, so escaping them would corrupt the value there -- but it does
 * mean a command generated in this mode is NOT safe to paste into a POSIX
 * shell. See the security note in README.md.
 */
export function escapeShellArg(arg, doubleQuotes) {
  const str = String(arg);

  if (doubleQuotes) return `"${str.replace(/["\\]/g, (m) => `\\${m}`)}"`;

  return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * curl treats [], {} in a URL as globbing syntax unless --globoff is passed.
 */
export function escapeCurlGlobbing(url) {
  return url.replace(/[[\]{}]/g, (m) => `\\${m}`);
}

/**
 * Join command fragments, wrapping to a readable width with line
 * continuations. Long download commands carry a lot of headers.
 */
export function joinCommand(parts, { wrap = true, width = 92 } = {}) {
  if (!wrap) return parts.join(" ");

  const lines = [];
  let line = "";

  for (const part of parts) {
    if (!line) line = part;
    else if (line.length + part.length + 1 <= width) line += ` ${part}`;
    else {
      lines.push(line);
      line = `  ${part}`;
    }
  }
  if (line) lines.push(line);

  return lines.join(" \\\n");
}
