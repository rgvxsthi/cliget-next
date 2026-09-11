"use strict";

import { api } from "./lib/browser.js";
import { el } from "./lib/dom.js";
import { SETTINGS_GROUPS } from "./lib/fields.js";
import { renderFieldset } from "./lib/form-ui.js";

const app = document.getElementById("app");

const send = (...msg) => api.runtime.sendMessage(msg);

let saveTimer;

function flashSaved(status) {
  status.className = "status ok";
  status.textContent = "Saved";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    status.textContent = "";
  }, 1600);
}

function render(options) {
  app.replaceChildren();

  const status = el("span", { className: "status" });

  app.append(
    el("header", {}, [
      el("h1", {}, "cliget-next settings"),
      el("span", { className: "spacer" }),
      status,
    ])
  );

  app.append(
    el(
      "p",
      { className: "hint intro" },
      "These are the defaults for every captured download. The popup can override any of them for a single download."
    )
  );

  // Changing a value re-reads the stored options but does NOT re-render: a
  // full re-render would steal focus from the field being edited.
  const onChange = async (update) => {
    await send("setOptions", update);
    flashSaved(status);
  };

  const form = el("div", { className: "options-body" });
  for (const group of SETTINGS_GROUPS)
    form.append(
      renderFieldset(group.legend, group.fields, options, onChange, group.note)
    );
  app.append(form);

  const bar = el("div", { className: "bar plain" });
  const reset = el("button", {}, "Reset all to defaults");
  reset.addEventListener("click", async () =>
    render(await send("resetOptions"))
  );
  bar.append(reset);
  app.append(bar);
}

send("getOptions").then(render);
