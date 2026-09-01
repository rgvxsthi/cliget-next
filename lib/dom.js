"use strict";

export function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of [].concat(children))
    node.append(child instanceof Node ? child : document.createTextNode(child));
  return node;
}
