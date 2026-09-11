"use strict";

import { api, sessionStore } from "./lib/browser.js";
import { defaultOptions } from "./lib/options.js";
import {
  getFilenameFromContentDisposition,
  getFilenameFromUrl,
} from "./lib/filename.js";

const MAX_ITEMS = 20;
const STORE_KEY = "downloads";
const REQUEST_TTL_MS = 10000;

/**
 * Under MV3 the background context is not persistent: Chrome tears the
 * service worker down after ~30s idle and Firefox suspends the event page.
 * Anything that must outlive that goes to storage.session, which is cleared
 * when the browser closes -- the right lifetime for captured cookies.
 *
 * `currentRequests` deliberately stays in memory only. It holds in-flight
 * requests for at most a few seconds, and losing one just means that download
 * is not offered.
 */
const currentRequests = new Map();

async function readDownloads() {
  const stored = await sessionStore.get(STORE_KEY);
  return stored[STORE_KEY] || [];
}

async function writeDownloads(list) {
  await sessionStore.set({ [STORE_KEY]: list.slice(-MAX_ITEMS) });
}

export async function getOptions() {
  const stored = await api.storage.local.get();
  return { ...defaultOptions, ...stored };
}

async function setOptions(values) {
  await api.storage.local.set(values);
  return getOptions();
}

async function resetOptions() {
  await api.storage.local.clear();
  return getOptions();
}

function expireStaleRequests(now) {
  for (const [id, req] of currentRequests)
    if (req.timestamp + REQUEST_TTL_MS < now) currentRequests.delete(id);
}

const BADGE_MAX = 99;

/** The badge text doubles as the unseen count; "99+" still parses as 99. */
async function bumpBadge() {
  const count = (parseInt(await api.action.getBadgeText({}), 10) || 0) + 1;
  await api.action.setBadgeText({
    text: count > BADGE_MAX ? `${BADGE_MAX}+` : `${count}`,
  });
}

function isDownloadable(details) {
  return (
    (details.type === "main_frame" || details.type === "sub_frame") &&
    details.tabId >= 0
  );
}

function onBeforeRequest(details) {
  if (!isDownloadable(details)) return;

  const now = Date.now();
  expireStaleRequests(now);

  currentRequests.set(details.requestId, {
    id: details.requestId,
    method: details.method,
    url: details.url,
    timestamp: now,
    payload: details.requestBody,
  });
}

function onSendHeaders(details) {
  const req = currentRequests.get(details.requestId);

  if (req) {
    req.headers = details.requestHeaders;
    return;
  }

  if (!isDownloadable(details) || details.method !== "GET") return;

  const now = Date.now();
  expireStaleRequests(now);

  currentRequests.set(details.requestId, {
    id: details.requestId,
    method: details.method,
    url: details.url,
    timestamp: now,
    headers: details.requestHeaders,
  });
}

/** Content types the browser renders itself rather than downloading. */
const INLINE_TYPES = [
  "text/html",
  "text/plain",
  "image/",
  "application/xhtml",
  "application/xml",
];

async function onResponseStarted(details) {
  const request = currentRequests.get(details.requestId);
  if (!request) return;

  currentRequests.delete(details.requestId);

  if (details.statusCode !== 200 || details.fromCache) return;

  let contentType = "";
  let contentDisposition = "";

  for (const header of details.responseHeaders || []) {
    const name = header.name.toLowerCase();
    if (name === "content-type") contentType = header.value.toLowerCase();
    else if (name === "content-disposition") {
      contentDisposition = header.value.toLowerCase();
      request.filename = getFilenameFromContentDisposition(header.value);
    } else if (name === "content-length") request.size = +header.value;
  }

  const isAttachment = contentDisposition.startsWith("attachment");
  if (!isAttachment && INLINE_TYPES.some((t) => contentType.startsWith(t)))
    return;

  if (!request.filename) request.filename = getFilenameFromUrl(request.url);

  const list = await readDownloads();
  await writeDownloads([...list.filter((r) => r.id !== request.id), request]);
  await bumpBadge();
}

const handlers = {
  getOptions,
  setOptions,
  resetOptions,
  getDownloadList: readDownloads,
  clear: () => writeDownloads([]),
};

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const [name, ...args] = msg;
  const handler = handlers[name];
  if (!handler) return false;

  Promise.resolve(handler(...args)).then(sendResponse, (err) =>
    sendResponse({ error: err.message })
  );

  // Keep the message channel open for the async reply.
  return true;
});

api.webRequest.onBeforeRequest.addListener(
  onBeforeRequest,
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

api.webRequest.onSendHeaders.addListener(
  onSendHeaders,
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

api.webRequest.onResponseStarted.addListener(
  onResponseStarted,
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

// Without a listener here the follow-up request is reported with the old URL.
api.webRequest.onBeforeRedirect.addListener(() => {}, {
  urls: ["<all_urls>"],
});

api.webRequest.onErrorOccurred.addListener(
  (details) => currentRequests.delete(details.requestId),
  { urls: ["<all_urls>"] }
);

/**
 * Match the badge to the toolbar icon: the icon's navy on light themes, and the
 * light icon's grey with navy digits on dark ones. Chrome's service worker has
 * no matchMedia and its toolbar icon never swaps, so it keeps the navy badge.
 */
const BADGE_NAVY = "#1C274C";
const BADGE_LIGHT = "#E5E5E5";
const darkScheme = globalThis.matchMedia?.("(prefers-color-scheme: dark)");

function styleBadge() {
  const dark = darkScheme?.matches;
  api.action.setBadgeBackgroundColor({
    color: dark ? BADGE_LIGHT : BADGE_NAVY,
  });
  api.action.setBadgeTextColor({ color: dark ? BADGE_NAVY : "#FFFFFF" });
}

styleBadge();
darkScheme?.addEventListener("change", styleBadge);
