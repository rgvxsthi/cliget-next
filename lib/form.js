"use strict";

export function toQueryString(obj) {
  const parts = [];

  for (const [key, values] of Object.entries(obj)) {
    const list = Array.isArray(values) ? values : [values];
    for (const value of list)
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }

  return parts.join("&");
}
