"use strict";

import { el } from "./dom.js";
import { FIELDS } from "./fields.js";

let uid = 0;

/**
 * Render one setting from the FIELDS registry.
 *
 * `onChange` receives a partial options object, so the same renderer drives
 * both the popup (which persists and re-renders) and the settings page (which
 * only persists).
 */
export function renderField(key, options, onChange) {
  const field = FIELDS[key];
  if (!field) throw new Error(`Unknown field: ${key}`);

  const id = `f-${key}-${++uid}`;
  const isCheckbox = field.type === "checkbox";

  const row = el("div", { className: `field${isCheckbox ? " check" : ""}` });
  const label = el(
    "label",
    { htmlFor: id, title: field.help || "" },
    field.label
  );

  let input;
  if (field.type === "select") {
    input = el("select", { id });
    for (const value of field.options()) {
      const option = el(
        "option",
        { value, selected: options[key] === value },
        field.optionLabel ? field.optionLabel(value) : value
      );
      if (field.optionTitle) option.title = field.optionTitle(value) || "";
      input.append(option);
    }
  } else {
    input = el("input", { id, type: field.type });
    if (isCheckbox) input.checked = Boolean(options[key]);
    else input.value = options[key] ?? "";
    if (field.min != null) input.min = field.min;
    if (field.max != null) input.max = field.max;
  }

  input.title = field.help || "";
  input.addEventListener("change", () =>
    onChange({ [key]: isCheckbox ? input.checked : input.value })
  );

  if (isCheckbox) row.append(input, label);
  else row.append(label, input);

  return row;
}

export function renderFieldset(legend, keys, options, onChange, note) {
  const fieldset = el("fieldset");
  if (legend) fieldset.append(el("legend", {}, legend));
  if (note) fieldset.append(el("p", { className: "hint" }, note));
  for (const key of keys) fieldset.append(renderField(key, options, onChange));
  return fieldset;
}
