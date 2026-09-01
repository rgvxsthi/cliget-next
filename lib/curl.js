"use strict";

import { escapeShellArg, joinCommand } from "./shell.js";

/**
 * curl opens exactly one connection and cannot segment a download, so the
 * useful tuning here is about not silently producing a broken file:
 *
 *   --location    Download links very often 302 to a CDN. Without this curl
 *                 saves the redirect stub instead of the file.
 *   --fail        Without it an HTTP 403/500 error page is written to disk
 *                 under your filename and looks like a successful download.
 *   --continue-at Resume a partial file instead of restarting.
 *   --retry*      Survive transient network failures.
 *   --globoff     Treat [] and {} in the URL literally rather than as curl
 *                 range/list globbing syntax.
 */
function tuningFlags(options) {
  if (options.curlTuning === false) return ["--location"];

  return [
    "--location",
    "--globoff",
    "--fail",
    "--continue-at -",
    "--retry 5",
    "--retry-delay 5",
    "--retry-connrefused",
    "--connect-timeout 15",
  ];
}

export function curl(url, method, headers, payload, filename, options) {
  const esc = (v) => escapeShellArg(v, options.doubleQuotes);

  let contentType;
  const parts = ["curl"];

  parts.push(...tuningFlags(options));

  for (const header of headers) {
    const name = header.name.toLowerCase();

    if (name === "content-type") {
      contentType = header.value.toLowerCase();
      let value = header.value;
      // curl regenerates the multipart boundary itself.
      if (value.startsWith("multipart/form-data;")) value = value.slice(0, 19);
      parts.push(`--header ${esc(`${header.name}: ${value}`)}`);
    } else if (name === "referer") {
      parts.push(`--referer ${esc(header.value)}`);
    } else if (name === "cookie") {
      parts.push(`--cookie ${esc(header.value)}`);
    } else if (name === "user-agent") {
      parts.push(`--user-agent ${esc(header.value)}`);
    } else {
      parts.push(`--header ${esc(`${header.name}: ${header.value}`)}`);
    }
  }

  if (method !== "GET" || payload) parts.push(`--request ${method}`);

  if (payload) {
    if (payload.formData) {
      const flag =
        contentType && contentType.startsWith("multipart/form-data;")
          ? "--form-string"
          : "--data-urlencode";

      for (const [key, values] of Object.entries(payload.formData))
        for (const value of values)
          parts.push(`${flag} ${esc(`${encodeURIComponent(key)}=${value}`)}`);
    } else if (payload.raw) {
      throw new Error("Unsupported upload data");
    }
  }

  if (filename) parts.push(`--output ${esc(filename)}`);
  else parts.push("--remote-name --remote-header-name");

  if (options.curlOptions) parts.push(options.curlOptions);

  parts.push(esc(url));

  return joinCommand(parts, { wrap: options.wrapLines !== false });
}
