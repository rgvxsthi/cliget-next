"use strict";

import { escapeShellArg, joinCommand } from "./shell.js";
import { connectionCount } from "./aria2.js";

/** Gopeed's own UI offers up to 64 connections per task. */
export const GOPEED_MAX_CONNECTIONS = 64;

/**
 * Gopeed (https://gopeed.com) is an actively developed Go download manager
 * with a persistent queue, a web UI and a REST API. Unlike aria2's JSON-RPC
 * it takes a plain REST body:
 *
 *     POST /api/v1/tasks
 *     { "req": { "url", "extra": { "method", "header" } },
 *       "opts": { "name", "path", "extra": { "connections" } } }
 *
 * Field names verified against pkg/rest/model/task.go and
 * pkg/protocol/http/model.go in GopeedLab/gopeed.
 */
export function gopeedPayload(url, headers, filename, options) {
  const header = {};
  for (const h of headers) header[h.name] = h.value;

  const opts = {
    extra: { connections: connectionCount(options, GOPEED_MAX_CONNECTIONS) },
  };
  if (filename) opts.name = filename;
  if (options.gopeedPath) opts.path = options.gopeedPath;

  return {
    req: { url, extra: { method: "GET", header } },
    opts,
  };
}

export function gopeed(url, method, headers, payload, filename, options) {
  if (method !== "GET") throw new Error("Gopeed can only download with GET");

  const esc = (v) => escapeShellArg(v, options.doubleQuotes);
  const base = (options.gopeedUrl || "http://localhost:9999").replace(
    /\/+$/,
    ""
  );

  const parts = [
    "curl",
    "--silent",
    "--show-error",
    "--fail",
    `--header ${esc("Content-Type: application/json")}`,
  ];

  if (options.gopeedToken)
    parts.push(`--header ${esc(`X-Api-Token: ${options.gopeedToken}`)}`);

  parts.push(
    `--data ${esc(JSON.stringify(gopeedPayload(url, headers, filename, options)))}`,
    esc(`${base}/api/v1/tasks`)
  );

  return joinCommand(parts, { wrap: options.wrapLines !== false });
}
