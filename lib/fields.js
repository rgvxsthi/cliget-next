"use strict";

import { ARIA2_BINARIES, MAX_CONNECTIONS } from "./aria2.js";
import { GOPEED_MAX_CONNECTIONS } from "./gopeed.js";
import { COMMANDS } from "./options.js";

/**
 * One declarative entry per user-facing setting, shared by the popup (which
 * shows only the fields relevant to the selected command) and the settings
 * page (which shows all of them, grouped).
 */
export const FIELDS = {
  command: {
    type: "select",
    label: "Command",
    options: () => Object.keys(COMMANDS),
    optionLabel: (value) => COMMANDS[value].label,
    optionTitle: (value) => COMMANDS[value].help,
  },

  trimNoiseHeaders: {
    type: "checkbox",
    label: "Drop tracking/noise headers",
    help: "Removes Sec-Fetch-*, DNT, Sec-GPC and client hints. They carry no authentication.",
  },
  wrapLines: {
    type: "checkbox",
    label: "Wrap long commands",
    help: "Break the command across lines with backslash continuations.",
  },
  doubleQuotes: {
    type: "checkbox",
    label: "Escape with double-quotes",
    help: "For Windows cmd.exe, which has no single-quote syntax. Do NOT paste the result into a POSIX shell.",
  },
  excludeHeaders: {
    type: "text",
    label: "Exclude headers",
    help: "Extra header names to leave out, separated by spaces.",
  },

  connections: {
    type: "number",
    label: "Connections",
    min: 1,
    max: GOPEED_MAX_CONNECTIONS,
    help: `Parallel connections per download. aria2 clamps to ${MAX_CONNECTIONS}; Gopeed accepts up to ${GOPEED_MAX_CONNECTIONS}.`,
  },

  aria2Binary: {
    type: "select",
    label: "Binary",
    options: () => ARIA2_BINARIES,
    help: "aria2-next is a maintained fork of aria2 with the same options.",
  },
  aria2Tuning: {
    type: "checkbox",
    label: "Fast defaults",
    help: "Segmented download, resume, retries. Without this aria2 uses ONE connection.",
  },
  aria2FileAllocation: {
    type: "select",
    label: "File allocation",
    options: () => ["falloc", "prealloc", "trunc", "none"],
    help: "falloc is instant on ext4/btrfs/xfs/NTFS. Use none on FAT32/HFS+ or network shares.",
  },
  aria2Options: { type: "text", label: "Extra arguments" },

  curlTuning: {
    type: "checkbox",
    label: "Robust defaults",
    help: "Follow redirects, resume, retry, and fail on HTTP errors instead of saving the error page.",
  },
  curlOptions: { type: "text", label: "Extra arguments" },

  wgetTuning: {
    type: "checkbox",
    label: "Robust defaults",
    help: "Resume, unlimited retries, and ask the server for the filename.",
  },
  wgetOptions: { type: "text", label: "Extra arguments" },

  aria2RpcUrl: {
    type: "text",
    label: "RPC endpoint",
    help: "Start the daemon with --enable-rpc.",
  },
  aria2RpcSecret: {
    type: "password",
    label: "RPC secret",
    help: "Matches the daemon's --rpc-secret. Stored unencrypted in extension storage.",
  },
  aria2QueueFile: {
    type: "text",
    label: "Queue file",
    help: "Path the generated snippet appends to. Drain it with aria2c --input-file.",
  },

  gopeedUrl: { type: "text", label: "Server", help: "Gopeed's web address." },
  gopeedToken: {
    type: "password",
    label: "API token",
    help: "Only needed when Gopeed is started with -T. Stored unencrypted in extension storage.",
  },
  gopeedPath: {
    type: "text",
    label: "Download path",
    help: "Leave empty to use Gopeed's configured directory.",
  },
};

/** Fields the popup shows for each command, in order. */
export const COMMAND_FIELDS = {
  aria2: [
    "aria2Binary",
    "aria2Tuning",
    "connections",
    "aria2FileAllocation",
    "aria2Options",
  ],
  curl: ["curlTuning", "curlOptions"],
  wget: ["wgetTuning", "wgetOptions"],
  "aria2-rpc": ["aria2RpcUrl", "aria2RpcSecret", "connections"],
  "aria2-input": ["aria2QueueFile", "aria2Binary", "connections"],
  gopeed: ["gopeedUrl", "gopeedToken", "gopeedPath", "connections"],
};

/** Fields the popup shows regardless of command. */
export const COMMON_FIELDS = [
  "trimNoiseHeaders",
  "wrapLines",
  "doubleQuotes",
  "excludeHeaders",
];

/** Full layout of the settings page. */
export const SETTINGS_GROUPS = [
  {
    legend: "Default command",
    fields: ["command"],
    note: "Used for every new download. The popup can still override it per download.",
  },
  { legend: "All commands", fields: COMMON_FIELDS },
  {
    legend: "Speed",
    fields: ["connections"],
  },
  {
    legend: "aria2",
    fields: [
      "aria2Binary",
      "aria2Tuning",
      "aria2FileAllocation",
      "aria2Options",
    ],
  },
  { legend: "curl", fields: ["curlTuning", "curlOptions"] },
  { legend: "wget", fields: ["wgetTuning", "wgetOptions"] },
  {
    legend: "aria2 queue",
    fields: ["aria2RpcUrl", "aria2RpcSecret", "aria2QueueFile"],
    note: "aria2c --enable-rpc --rpc-listen-all=false --rpc-secret=… --daemon=true",
  },
  {
    legend: "Gopeed queue",
    fields: ["gopeedUrl", "gopeedToken", "gopeedPath"],
  },
];
