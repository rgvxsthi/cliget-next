"use strict";

import { escapeShellArg, joinCommand } from "./shell.js";

/** aria2 refuses more than 16 connections to a single server. */
export const MAX_CONNECTIONS = 16;

export function connectionCount(options, max = MAX_CONNECTIONS) {
  const n = parseInt(options.connections, 10);
  if (!Number.isFinite(n) || n < 1) return Math.min(MAX_CONNECTIONS, max);
  return Math.min(n, max);
}

/**
 * `aria2-next` is a maintained fork of aria2 (aria2 upstream has been
 * dormant). It keeps the same option surface, so every mode here works
 * against either binary.
 */
export const ARIA2_BINARIES = ["aria2c", "aria2-next"];

export function aria2Binary(options) {
  return ARIA2_BINARIES.includes(options.aria2Binary)
    ? options.aria2Binary
    : "aria2c";
}

/**
 * The tuning aria2 should have used by default.
 *
 * Returned as key/value pairs without the leading `--` so the same set can be
 * rendered as CLI flags, as an `--input-file` stanza, or as the options object
 * of an `aria2.addUri` RPC call.
 *
 *   max-connection-per-server / split
 *       aria2 defaults to a SINGLE connection, which is the entire reason an
 *       unconfigured aria2c is no faster than curl. Segmenting is the win.
 *   min-split-size
 *       The 20M default means a 100M file is only ever cut into 5 pieces.
 *   continue / auto-file-renaming
 *       Together these make a re-run resume rather than start `file.1.iso`.
 *   file-allocation=falloc
 *       Instant preallocation on ext4/btrfs/xfs/NTFS, and it keeps a large
 *       file from fragmenting under 16 concurrent writers. Not supported on
 *       FAT32/HFS+ or some network shares -- switch to `none` there.
 *   max-tries=0 + max-file-not-found=3
 *       Retry transient network failures forever (long downloads outlive
 *       flaky links) but give up quickly if the URL is simply dead.
 */
export function tuningPairs(options) {
  if (options.aria2Tuning === false) return [];

  const n = connectionCount(options);

  return [
    ["max-connection-per-server", String(n)],
    ["split", String(n)],
    ["min-split-size", "1M"],
    ["continue", "true"],
    ["auto-file-renaming", "false"],
    ["file-allocation", options.aria2FileAllocation || "falloc"],
    ["disk-cache", "64M"],
    ["max-tries", "0"],
    ["retry-wait", "5"],
    ["max-file-not-found", "3"],
    ["timeout", "60"],
    ["connect-timeout", "15"],
  ];
}

/**
 * Header/option pairs derived from the captured request, shared by every
 * aria2 output mode.
 */
export function requestPairs(headers, filename) {
  const pairs = [];

  for (const header of headers) {
    const name = header.name.toLowerCase();
    if (name === "referer") pairs.push(["referer", header.value]);
    else if (name === "user-agent") pairs.push(["user-agent", header.value]);
    else pairs.push(["header", `${header.name}: ${header.value}`]);
  }

  if (filename) pairs.push(["out", filename]);

  return pairs;
}

export function aria2(url, method, headers, payload, filename, options) {
  if (method !== "GET") throw new Error("aria2 can only download with GET");

  const esc = (v) => escapeShellArg(v, options.doubleQuotes);
  const parts = [aria2Binary(options)];

  for (const [key, value] of tuningPairs(options))
    parts.push(`--${key}=${value}`);

  for (const [key, value] of requestPairs(headers, filename))
    parts.push(`--${key} ${esc(value)}`);

  if (options.aria2Options) parts.push(options.aria2Options);

  parts.push(esc(url));

  return joinCommand(parts, { wrap: options.wrapLines !== false });
}
