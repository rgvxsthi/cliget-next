"use strict";

import { api } from "./lib/browser.js";
import { COMMANDS, defaultOptions, generateCommand } from "./lib/options.js";
import { filterHeaders } from "./lib/headers.js";
import { aria2RpcPayload } from "./lib/aria2-queue.js";
import { gopeedPayload } from "./lib/gopeed.js";
import { ARIA2_BINARIES } from "./lib/aria2.js";

const app = document.getElementById("app");

const send = (...msg) => api.runtime.sendMessage(msg);

function fileSizeToText(size) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of [].concat(children))
    node.append(child instanceof Node ? child : document.createTextNode(child));
  return node;
}

function clear() {
  app.replaceChildren();
}

/* ------------------------------------------------------------------ */
/* Options form                                                        */
/* ------------------------------------------------------------------ */

const COMMON_FIELDS = [
  {
    key: "trimNoiseHeaders",
    type: "checkbox",
    label: "Drop tracking/noise headers",
    help: "Removes Sec-Fetch-*, DNT, client hints and other headers that carry no authentication.",
  },
  {
    key: "wrapLines",
    type: "checkbox",
    label: "Wrap long commands",
    help: "Break the command across lines with backslash continuations.",
  },
  {
    key: "doubleQuotes",
    type: "checkbox",
    label: "Escape with double-quotes",
    help: "For Windows cmd.exe, which has no single-quote syntax. Do NOT paste the result into a POSIX shell.",
  },
  {
    key: "excludeHeaders",
    type: "text",
    label: "Exclude headers",
    help: "Extra header names to leave out, separated by spaces.",
  },
];

const COMMAND_FIELDS = {
  aria2: [
    {
      key: "aria2Binary",
      type: "select",
      label: "Binary",
      options: ARIA2_BINARIES,
      help: "aria2-next is a maintained fork of aria2 with the same options.",
    },
    {
      key: "aria2Tuning",
      type: "checkbox",
      label: "Fast defaults",
      help: "Segmented download, resume, retries. Without this aria2 uses ONE connection.",
    },
    {
      key: "aria2Connections",
      type: "number",
      label: "Connections",
      min: 1,
      max: 16,
      help: "aria2 accepts at most 16 connections per server.",
    },
    {
      key: "aria2FileAllocation",
      type: "select",
      label: "File allocation",
      options: ["falloc", "prealloc", "trunc", "none"],
      help: "falloc is instant on ext4/btrfs/xfs/NTFS. Use none on FAT32/HFS+ or network shares.",
    },
    { key: "aria2Options", type: "text", label: "Extra arguments" },
  ],
  curl: [
    {
      key: "curlTuning",
      type: "checkbox",
      label: "Robust defaults",
      help: "Follow redirects, resume, retry, and fail on HTTP errors instead of saving the error page.",
    },
    { key: "curlOptions", type: "text", label: "Extra arguments" },
  ],
  wget: [
    { key: "wgetTuning", type: "checkbox", label: "Robust defaults" },
    { key: "wgetOptions", type: "text", label: "Extra arguments" },
  ],
  "aria2-rpc": [
    { key: "aria2RpcUrl", type: "text", label: "RPC endpoint" },
    { key: "aria2RpcSecret", type: "text", label: "RPC secret" },
    {
      key: "aria2Connections",
      type: "number",
      label: "Connections",
      min: 1,
      max: 16,
    },
  ],
  "aria2-input": [
    { key: "aria2QueueFile", type: "text", label: "Queue file" },
    {
      key: "aria2Binary",
      type: "select",
      label: "Binary",
      options: ARIA2_BINARIES,
    },
    {
      key: "aria2Connections",
      type: "number",
      label: "Connections",
      min: 1,
      max: 16,
    },
  ],
  gopeed: [
    { key: "gopeedUrl", type: "text", label: "Server" },
    { key: "gopeedToken", type: "text", label: "API token" },
    { key: "gopeedPath", type: "text", label: "Download path" },
    {
      key: "gopeedConnections",
      type: "number",
      label: "Connections",
      min: 1,
      max: 64,
      alias: "aria2Connections",
    },
  ],
};

function renderField(field, options, onChange) {
  const key = field.alias || field.key;
  const id = `f-${field.key}`;
  const row = el("div", {
    className: `field${field.type === "checkbox" ? " check" : ""}`,
  });
  const label = el(
    "label",
    { htmlFor: id, title: field.help || "" },
    field.label
  );

  let input;
  if (field.type === "select") {
    input = el("select", { id });
    for (const value of field.options)
      input.append(
        el("option", { value, selected: options[key] === value }, value)
      );
  } else {
    input = el("input", { id, type: field.type });
    if (field.type === "checkbox") input.checked = Boolean(options[key]);
    else input.value = options[key] ?? "";
    if (field.min != null) input.min = field.min;
    if (field.max != null) input.max = field.max;
  }

  input.title = field.help || "";
  input.addEventListener("change", () =>
    onChange({
      [key]: field.type === "checkbox" ? input.checked : input.value,
    })
  );

  if (field.type === "checkbox") row.append(input, label);
  else row.append(label, input);

  return row;
}

function renderOptions(options, onChange, onReset) {
  const wrap = el("div", { className: "options" });

  const commandRow = el("div", { className: "field" });
  const select = el("select", { id: "f-command" });
  for (const [value, meta] of Object.entries(COMMANDS))
    select.append(
      el(
        "option",
        { value, selected: options.command === value, title: meta.help },
        meta.label
      )
    );
  select.addEventListener("change", () => onChange({ command: select.value }));
  commandRow.append(el("label", { htmlFor: "f-command" }, "Command"), select);
  wrap.append(commandRow);

  const meta = COMMANDS[options.command];
  if (meta?.help) wrap.append(el("p", { className: "hint" }, meta.help));

  const specific = el("fieldset");
  specific.append(el("legend", {}, meta?.label || options.command));
  for (const field of COMMAND_FIELDS[options.command] || [])
    specific.append(renderField(field, options, onChange));
  wrap.append(specific);

  const common = el("fieldset");
  common.append(el("legend", {}, "All commands"));
  for (const field of COMMON_FIELDS)
    common.append(renderField(field, options, onChange));
  wrap.append(common);

  const reset = el("button", {}, "Reset to defaults");
  reset.addEventListener("click", onReset);
  wrap.append(reset);

  return wrap;
}

/* ------------------------------------------------------------------ */
/* Queue submission                                                    */
/* ------------------------------------------------------------------ */

const QUEUEABLE = new Set(["aria2-rpc", "gopeed"]);

async function submitToQueue(request, options) {
  const headers = filterHeaders(request.headers, options);

  if (options.command === "aria2-rpc") {
    const res = await fetch(options.aria2RpcUrl || defaultOptions.aria2RpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        aria2RpcPayload(request.url, headers, request.filename, options)
      ),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || "aria2 rejected it");
    return `Queued as ${json.result}`;
  }

  const base = (options.gopeedUrl || defaultOptions.gopeedUrl).replace(
    /\/+$/,
    ""
  );
  const res = await fetch(`${base}/api/v1/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.gopeedToken ? { "X-Api-Token": options.gopeedToken } : {}),
    },
    body: JSON.stringify(
      gopeedPayload(request.url, headers, request.filename, options)
    ),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.msg || `Gopeed error ${json.code}`);
  return "Queued in Gopeed";
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

function showCommand(request, options) {
  clear();

  const header = el("header");
  const back = el("button", {}, "← Back");
  back.addEventListener("click", () => start());
  header.append(back, el("h1", {}, request.filename || "download"));
  app.append(header);

  let command;
  try {
    command = generateCommand(request, options);
  } catch (err) {
    command = `# ${err.message}`;
  }

  const textArea = el("textarea", { spellcheck: false, value: command });
  app.append(textArea);

  const bar = el("div", { className: "bar" });
  const status = el("span", { className: "status" });

  const copy = el("button", { className: "primary" }, "Copy");
  copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(textArea.value);
    status.className = "status ok";
    status.textContent = "Copied";
  });
  bar.append(copy);

  if (QUEUEABLE.has(options.command)) {
    const queue = el("button", {}, "Send now");
    queue.addEventListener("click", async () => {
      queue.disabled = true;
      status.className = "status";
      status.textContent = "Sending…";
      try {
        status.textContent = await submitToQueue(request, options);
        status.className = "status ok";
      } catch (err) {
        status.className = "status error";
        status.textContent = err.message;
      } finally {
        queue.disabled = false;
      }
    });
    bar.append(queue);
  }

  bar.append(el("span", { className: "spacer" }), status);
  app.append(bar);

  const rerender = async (update) => {
    showCommand(request, await send("setOptions", update));
  };
  const reset = async () => showCommand(request, await send("resetOptions"));

  app.append(renderOptions(options, rerender, reset));

  textArea.focus();
  textArea.select();
}

function showList(list, highlight, options) {
  clear();

  app.append(
    el("header", {}, [
      el("h1", {}, "cliget"),
      (() => {
        const clearAll = el("button", {}, "Clear");
        clearAll.addEventListener("click", async () => {
          await send("clear");
          showList([], 0, options);
        });
        return clearAll;
      })(),
    ])
  );

  if (!list.length) {
    app.append(
      el("div", { className: "empty" }, "No downloads captured this session.")
    );
    return;
  }

  const container = el("div", { className: "list" });

  for (let i = list.length - 1; i >= 0; --i) {
    const request = list[i];
    const isNew = list.length - i <= highlight;

    const label = [el("span", {}, request.filename || request.url)];
    if (request.size)
      label.push(
        el("span", { className: "size" }, ` (${fileSizeToText(request.size)})`)
      );

    const button = el(
      "button",
      { className: `item${isNew ? " new" : ""}`, title: request.url },
      label
    );
    button.addEventListener("click", () => showCommand(request, options));
    container.append(button);
  }

  app.append(container);
}

async function start() {
  const [list, badge, options] = await Promise.all([
    send("getDownloadList"),
    api.action.getBadgeText({}),
    send("getOptions"),
  ]);

  await api.action.setBadgeText({ text: "" });
  showList(list, +badge || 0, options);
}

start();
