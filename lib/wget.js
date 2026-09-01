"use strict";

import { escapeShellArg, joinCommand } from "./shell.js";
import { toQueryString } from "./form.js";

/**
 * wget follows redirects on its own but, like curl, is single-connection.
 * Use aria2 when throughput matters; these flags only make wget survivable
 * on a long transfer.
 */
function tuningFlags(options, filename) {
  const flags = [];

  if (options.wgetTuning !== false)
    flags.push(
      "--continue",
      "--tries=0",
      "--waitretry=5",
      "--retry-connrefused",
      "--timeout=60"
    );

  // Without this wget names the file after the URL path, which is wrong for
  // the tokenised download URLs this addon is usually pointed at.
  if (!filename) flags.push("--content-disposition");

  return flags;
}

export function wget(url, method, headers, payload, filename, options) {
  const esc = (v) => escapeShellArg(v, options.doubleQuotes);

  let contentType;
  const parts = ["wget"];

  parts.push(...tuningFlags(options, filename));

  for (const header of headers) {
    const name = header.name.toLowerCase();

    if (name === "content-type") {
      contentType = header.value.toLowerCase();
      let value = header.value;
      if (value.startsWith("multipart/form-data;")) value = value.slice(0, 19);
      parts.push(`--header ${esc(`${header.name}: ${value}`)}`);
    } else if (name === "referer") {
      parts.push(`--referer ${esc(header.value)}`);
    } else if (name === "user-agent") {
      parts.push(`--user-agent ${esc(header.value)}`);
    } else {
      parts.push(`--header ${esc(`${header.name}: ${header.value}`)}`);
    }
  }

  if (method !== "GET" || payload) parts.push(`--method ${method}`);

  if (payload) {
    if (payload.formData) {
      if (contentType && contentType.startsWith("multipart/form-data;"))
        throw new Error("wget cannot send multipart form data");

      parts.push(`--body-data ${esc(toQueryString(payload.formData))}`);
    } else if (payload.raw) {
      throw new Error("Unsupported upload data");
    }
  }

  if (filename) parts.push(`--output-document ${esc(filename)}`);

  if (options.wgetOptions) parts.push(options.wgetOptions);

  parts.push(esc(url));

  return joinCommand(parts, { wrap: options.wrapLines !== false });
}
