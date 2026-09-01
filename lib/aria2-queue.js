"use strict";

import { escapeShellArg, joinCommand } from "./shell.js";
import { aria2Binary, requestPairs, tuningPairs } from "./aria2.js";

/**
 * Collapse the CLI-shaped pairs into the map that aria2 uses for both its
 * `--input-file` stanzas and the options object of `aria2.addUri`.
 *
 * `header` is the one key that legitimately repeats, so it becomes an array.
 * Every value must be a string: the RPC interface rejects numbers and bools.
 */
export function optionMap(headers, filename, options) {
  const map = {};

  for (const [key, value] of [
    ...tuningPairs(options),
    ...requestPairs(headers, filename),
  ]) {
    if (key === "header") (map.header ||= []).push(value);
    else map[key] = String(value);
  }

  return map;
}

/**
 * A queue entry for aria2's `--input-file`.
 *
 * The file is a plain append-only queue: each URI is followed by its options,
 * one per indented line. Drain it with
 *
 *     aria2c --input-file=<file> --max-concurrent-downloads=1 --save-session=...
 *
 * and aria2 downloads the entries in order. No daemon required, and the file
 * survives reboots -- which the RPC queue does not unless you configure
 * --save-session.
 */
export function aria2Input(url, method, headers, payload, filename, options) {
  if (method !== "GET") throw new Error("aria2 can only download with GET");

  const map = optionMap(headers, filename, options);
  const lines = [url];

  for (const [key, value] of Object.entries(map)) {
    if (Array.isArray(value))
      for (const v of value) lines.push(`  ${key}=${v}`);
    else lines.push(`  ${key}=${value}`);
  }

  const queueFile = options.aria2QueueFile || "~/aria2-queue.txt";
  const binary = aria2Binary(options);
  const body = lines.join("\n");

  // A quoted heredoc delimiter means the shell performs no expansion at all,
  // so cookies containing $ or ` are appended verbatim.
  return [
    `cat >> ${queueFile} <<'CLIGET_EOF'`,
    body,
    "CLIGET_EOF",
    "",
    `# then drain the queue with:`,
    `# ${binary} --input-file=${queueFile} --max-concurrent-downloads=1 --continue=true`,
  ].join("\n");
}

/**
 * Push straight into a running aria2 daemon's queue over JSON-RPC.
 *
 * Start the daemon once:
 *
 *     aria2c --enable-rpc --rpc-listen-all=false --rpc-secret=<token> \
 *            --continue=true --max-concurrent-downloads=3 --daemon
 *
 * Downloads then queue, survive the browser closing, and can be driven from a
 * web UI such as AriaNg.
 */
export function aria2RpcPayload(url, headers, filename, options) {
  const params = [];
  if (options.aria2RpcSecret) params.push(`token:${options.aria2RpcSecret}`);
  params.push([url], optionMap(headers, filename, options));

  return {
    jsonrpc: "2.0",
    id: "cliget",
    method: "aria2.addUri",
    params,
  };
}

export function aria2Rpc(url, method, headers, payload, filename, options) {
  if (method !== "GET") throw new Error("aria2 can only download with GET");

  const esc = (v) => escapeShellArg(v, options.doubleQuotes);
  const endpoint = options.aria2RpcUrl || "http://localhost:6800/jsonrpc";
  const body = JSON.stringify(aria2RpcPayload(url, headers, filename, options));

  const parts = [
    "curl",
    "--silent",
    "--show-error",
    "--fail",
    `--header ${esc("Content-Type: application/json")}`,
    `--data ${esc(body)}`,
    esc(endpoint),
  ];

  return joinCommand(parts, { wrap: options.wrapLines !== false });
}
