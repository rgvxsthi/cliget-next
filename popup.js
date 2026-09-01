"use strict";

import { api } from "./lib/browser.js";
import { el } from "./lib/dom.js";
import { COMMANDS, defaultOptions, generateCommand } from "./lib/options.js";
import { COMMAND_FIELDS, COMMON_FIELDS } from "./lib/fields.js";
import { renderField, renderFieldset } from "./lib/form-ui.js";
import { filterHeaders } from "./lib/headers.js";
import { aria2RpcPayload } from "./lib/aria2-queue.js";
import { gopeedPayload } from "./lib/gopeed.js";

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

function clear() {
  app.replaceChildren();
}

function settingsButton() {
  const button = el("button", { title: "Open settings" }, "Settings");
  button.addEventListener("click", () => {
    api.runtime.openOptionsPage();
    window.close();
  });
  return button;
}

/* ------------------------------------------------------------------ */
/* Per-download options, collapsed by default                          */
/* ------------------------------------------------------------------ */

function renderOptions(options, onChange, onReset) {
  // <details> remembers nothing on its own, so the open state is a stored
  // preference: someone who tweaks flags on every download should not have to
  // re-open the panel each time.
  const wrap = el("details", {
    className: "options",
    open: Boolean(options.optionsExpanded),
  });

  wrap.append(el("summary", {}, "Options for this download"));
  wrap.addEventListener("toggle", () => {
    if (wrap.open !== Boolean(options.optionsExpanded))
      send("setOptions", { optionsExpanded: wrap.open });
  });

  const body = el("div", { className: "options-body" });
  body.append(renderField("command", options, onChange));

  const meta = COMMANDS[options.command];
  if (meta?.help) body.append(el("p", { className: "hint" }, meta.help));

  body.append(
    renderFieldset(
      meta?.label || options.command,
      COMMAND_FIELDS[options.command] || [],
      options,
      onChange
    ),
    renderFieldset("All commands", COMMON_FIELDS, options, onChange)
  );

  const footer = el("div", { className: "bar plain" });
  const reset = el("button", {}, "Reset to defaults");
  reset.addEventListener("click", onReset);
  footer.append(reset, el("span", { className: "spacer" }), settingsButton());
  body.append(footer);

  wrap.append(body);
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

  const back = el("button", {}, "← Back");
  back.addEventListener("click", () => start());
  app.append(
    el("header", {}, [back, el("h1", {}, request.filename || "download")])
  );

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

  const rerender = async (update) =>
    showCommand(request, await send("setOptions", update));
  const reset = async () => showCommand(request, await send("resetOptions"));

  app.append(renderOptions(options, rerender, reset));

  textArea.focus();
  textArea.select();
}

function showList(list, highlight, options) {
  clear();

  const clearAll = el("button", {}, "Clear");
  clearAll.addEventListener("click", async () => {
    await send("clear");
    showList([], 0, options);
  });

  app.append(
    el("header", {}, [
      el("h1", {}, "cliget"),
      el("span", { className: "spacer" }),
      settingsButton(),
      clearAll,
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
