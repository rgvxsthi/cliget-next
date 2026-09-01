import { test } from "node:test";
import assert from "node:assert/strict";

import { defaultOptions, generateCommand } from "../lib/options.js";
import { aria2RpcPayload, optionMap } from "../lib/aria2-queue.js";
import { gopeedPayload } from "../lib/gopeed.js";
import { filterHeaders } from "../lib/headers.js";
import { escapeShellArg } from "../lib/shell.js";
import {
  getFilenameFromContentDisposition,
  getFilenameFromUrl,
  sanitizeFilename,
} from "../lib/filename.js";

const URL_ = "https://tunnel5.example.net/download/abc?sig=xyz";

const REQUEST = {
  url: URL_,
  method: "GET",
  filename: "Game.7z",
  payload: null,
  headers: [
    { name: "Host", value: "tunnel5.example.net" },
    { name: "User-Agent", value: "Mozilla/5.0" },
    { name: "Referer", value: "https://example.net/" },
    { name: "Cookie", value: "session=abc123" },
    { name: "Range", value: "bytes=0-1023" },
    { name: "Sec-Fetch-Mode", value: "navigate" },
    { name: "DNT", value: "1" },
    { name: "Accept-Encoding", value: "gzip, deflate" },
  ],
};

function gen(overrides = {}) {
  return generateCommand(REQUEST, {
    ...defaultOptions,
    wrapLines: false,
    ...overrides,
  });
}

test("header policy drops protocol-owned and noise headers", () => {
  const kept = filterHeaders(REQUEST.headers, defaultOptions).map((h) =>
    h.name.toLowerCase()
  );

  assert.deepEqual(kept, ["user-agent", "referer", "cookie"]);
});

test("Range is dropped even if the user empties the exclude list", () => {
  const kept = filterHeaders(REQUEST.headers, {
    excludeHeaders: "",
    trimNoiseHeaders: false,
  }).map((h) => h.name.toLowerCase());

  assert.ok(!kept.includes("range"));
  assert.ok(!kept.includes("host"));
  assert.ok(kept.includes("dnt"), "noise headers are kept when trim is off");
});

test("aria2 segments the download and keeps auth headers", () => {
  const cmd = gen({ command: "aria2" });

  assert.match(cmd, /--max-connection-per-server=16/);
  assert.match(cmd, /--split=16/);
  assert.match(cmd, /--min-split-size=1M/);
  assert.match(cmd, /--continue=true/);
  assert.match(cmd, /--auto-file-renaming=false/);
  assert.match(cmd, /--header 'Cookie: session=abc123'/);
  assert.match(cmd, /--out 'Game\.7z'/);
  assert.ok(!cmd.includes("Host:"), "must not replay the browser Host header");
  assert.ok(cmd.trimEnd().endsWith(`'${URL_}'`), "URL comes last");
});

test("aria2 connection count is clamped to what aria2 accepts", () => {
  assert.match(gen({ aria2Connections: "64" }), /--split=16/);
  assert.match(gen({ aria2Connections: "4" }), /--split=4/);
  assert.match(gen({ aria2Connections: "junk" }), /--split=16/);
});

test("aria2 tuning can be turned off", () => {
  const cmd = gen({ aria2Tuning: false });
  assert.ok(!cmd.includes("--split="));
  assert.match(cmd, /--header 'Cookie: session=abc123'/);
});

test("curl follows redirects and fails on HTTP errors", () => {
  const cmd = gen({ command: "curl" });

  assert.match(cmd, /--location/);
  assert.match(cmd, /--fail/);
  assert.match(cmd, /--continue-at -/);
  assert.match(cmd, /--globoff/);
  assert.match(cmd, /--cookie 'session=abc123'/);
});

test("wget resumes and retries", () => {
  const cmd = gen({ command: "wget" });

  assert.match(cmd, /--continue/);
  assert.match(cmd, /--tries=0/);
  assert.match(cmd, /--output-document 'Game\.7z'/);
});

test("wget asks the server for the filename when none was captured", () => {
  const cmd = generateCommand(
    { ...REQUEST, filename: null },
    { ...defaultOptions, command: "wget", wrapLines: false }
  );

  assert.match(cmd, /--content-disposition/);
});

test("RPC payload is a valid aria2.addUri call", () => {
  const payload = aria2RpcPayload(
    URL_,
    filterHeaders(REQUEST.headers, defaultOptions),
    "Game.7z",
    { ...defaultOptions, aria2RpcSecret: "s3cret" }
  );

  assert.equal(payload.method, "aria2.addUri");
  assert.equal(payload.params[0], "token:s3cret");
  assert.deepEqual(payload.params[1], [URL_]);

  const opts = payload.params[2];
  assert.equal(opts.split, "16");
  assert.equal(opts.out, "Game.7z");
  assert.deepEqual(opts.header, ["Cookie: session=abc123"]);
  assert.ok(
    Object.values(opts).every((v) => typeof v === "string" || Array.isArray(v)),
    "aria2 RPC rejects non-string option values"
  );
});

test("RPC payload omits the token when no secret is set", () => {
  const payload = aria2RpcPayload(URL_, [], "x", defaultOptions);
  assert.deepEqual(payload.params[0], [URL_]);
});

test("input-file entry is a valid aria2 queue stanza", () => {
  const cmd = gen({ command: "aria2-input" });

  assert.match(cmd, /^cat >> ~\/aria2-queue\.txt <<'CLIGET_EOF'\n/);
  assert.match(cmd, new RegExp(`\n${URL_.replace(/[?]/g, "\\?")}\n`));
  assert.match(cmd, /\n {2}split=16\n/);
  assert.match(cmd, /\n {2}header=Cookie: session=abc123\n/);
  assert.match(cmd, /\nCLIGET_EOF\n/);
});

test("repeated header options survive the option map", () => {
  const map = optionMap(
    [
      { name: "Cookie", value: "a=1" },
      { name: "X-Token", value: "t" },
    ],
    null,
    defaultOptions
  );

  assert.deepEqual(map.header, ["Cookie: a=1", "X-Token: t"]);
});

test("shell escaping contains quotes and expansion", () => {
  assert.equal(escapeShellArg("it's", false), "'it'\\''s'");
  assert.equal(escapeShellArg("$(id)", false), "'$(id)'");
  assert.equal(escapeShellArg('a"b', true), '"a\\"b"');
});

test("filenames cannot escape the download directory", () => {
  assert.equal(sanitizeFilename("../../etc/passwd"), "_.._etc_passwd");
  assert.equal(sanitizeFilename("../"), "_");
  assert.equal(sanitizeFilename("con.txt"), "_con.txt");
});

test("content-disposition parsing", () => {
  assert.equal(
    getFilenameFromContentDisposition("attachment; filename*=UTF-8''a%20b.7z"),
    "a b.7z"
  );
  assert.equal(
    getFilenameFromContentDisposition(
      "attachment; filename*=UTF-8'en'report%2Epdf"
    ),
    "report.pdf"
  );
  assert.equal(
    getFilenameFromContentDisposition('attachment; filename="my file.zip"'),
    "my file.zip"
  );
  assert.equal(
    getFilenameFromContentDisposition("attachment; filename=plain.bin"),
    "plain.bin"
  );
  assert.equal(getFilenameFromContentDisposition("inline"), null);
});

test("url filename parsing", () => {
  assert.equal(
    getFilenameFromUrl("https://a.dev/x/My%20File.7z?s=1"),
    "My File.7z"
  );
  assert.equal(getFilenameFromUrl("https://a.dev/x/"), null);
});

test("aria2-next is a drop-in binary swap", () => {
  const cmd = gen({ aria2Binary: "aria2-next" });

  assert.ok(cmd.startsWith("aria2-next "));
  assert.match(cmd, /--split=16/);
  assert.match(
    gen({ command: "aria2-input", aria2Binary: "aria2-next" }),
    /# aria2-next --input-file=/
  );
});

test("an unknown aria2 binary falls back to aria2c", () => {
  assert.ok(gen({ aria2Binary: "rm -rf /" }).startsWith("aria2c "));
});

test("Gopeed payload matches the REST task schema", () => {
  const payload = gopeedPayload(
    URL_,
    filterHeaders(REQUEST.headers, defaultOptions),
    "Game.7z",
    { ...defaultOptions, aria2Connections: "32" }
  );

  assert.equal(payload.req.url, URL_);
  assert.equal(payload.req.extra.method, "GET");
  assert.equal(payload.req.extra.header.Cookie, "session=abc123");
  assert.equal(payload.opts.name, "Game.7z");
  assert.equal(payload.opts.extra.connections, 32);
});

test("Gopeed command posts to the tasks endpoint with the token", () => {
  const cmd = gen({
    command: "gopeed",
    gopeedToken: "tok",
    gopeedUrl: "http://box:9999/",
  });

  assert.match(cmd, /--header 'X-Api-Token: tok'/);
  assert.ok(cmd.trimEnd().endsWith("'http://box:9999/api/v1/tasks'"));
});
