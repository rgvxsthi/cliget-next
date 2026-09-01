"use strict";

import { curl } from "./curl.js";
import { wget } from "./wget.js";
import { aria2 } from "./aria2.js";
import { aria2Input, aria2Rpc } from "./aria2-queue.js";
import { gopeed } from "./gopeed.js";
import { filterHeaders } from "./headers.js";

export const defaultOptions = {
  // aria2 is the only backend here that segments a download across many
  // connections, so it is the sensible default for anything large.
  command: "aria2",

  doubleQuotes: false,
  wrapLines: true,
  trimNoiseHeaders: true,
  excludeHeaders: "Accept-Encoding",

  curlOptions: "",
  curlTuning: true,

  wgetOptions: "",
  wgetTuning: true,

  aria2Options: "",
  aria2Tuning: true,
  aria2Connections: "16",
  aria2FileAllocation: "falloc",
  // aria2c, or aria2-next (the maintained fork).
  aria2Binary: "aria2c",

  aria2QueueFile: "~/aria2-queue.txt",
  aria2RpcUrl: "http://localhost:6800/jsonrpc",
  aria2RpcSecret: "",

  gopeedUrl: "http://localhost:9999",
  gopeedToken: "",
  gopeedPath: "",
};

export const COMMANDS = {
  aria2: {
    label: "aria2",
    help: "Segmented, resumable download. The fastest option here.",
    generate: aria2,
  },
  curl: {
    label: "curl",
    help: "Single connection. Follows redirects and fails loudly on HTTP errors.",
    generate: curl,
  },
  wget: {
    label: "wget",
    help: "Single connection, resumable.",
    generate: wget,
  },
  "aria2-rpc": {
    label: "queue (RPC)",
    help: "Push into a running aria2 daemon's download queue over JSON-RPC.",
    generate: aria2Rpc,
  },
  "aria2-input": {
    label: "queue (file)",
    help: "Append to an aria2 --input-file queue. No daemon needed.",
    generate: aria2Input,
  },
  gopeed: {
    label: "queue (Gopeed)",
    help: "Push into a running Gopeed server's queue over its REST API.",
    generate: gopeed,
  },
};

export function generateCommand(request, options) {
  const command = COMMANDS[options.command] || COMMANDS.aria2;
  const headers = filterHeaders(request.headers, options);

  return command.generate(
    request.url,
    request.method,
    headers,
    request.payload,
    request.filename,
    options
  );
}
