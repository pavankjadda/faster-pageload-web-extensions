"use strict";

const DEFAULT_SETTINGS = {
  active: true,
  imgLazyLoad: false,
  preloadViewport: false,
  blacklistSites: "",
};

// "example.com", "www.example.com" or "*.example.com"; anything else is not a valid match-pattern host.
// options.js validates with the same pattern; this is the safety net for older stored values.
const BLACKLIST_HOST = /^(\*\.)?[a-z0-9_-]+(\.[a-z0-9_-]+)*$/;

let registeredScripts = [];
let applyQueue = Promise.resolve();

async function getSettings() {
  const stored = await browser.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...stored };
}

function toExcludeMatches(blacklistSites) {
  return blacklistSites
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => {
      if (BLACKLIST_HOST.test(host)) return true;
      if (host) console.warn(`[faster pageload] Ignoring invalid blacklist entry: ${host}`);
      return false;
    })
    .map((host) => `*://${host}/*`);
}

function updateBrowserAction(active) {
  browser.browserAction.setIcon({ path: active ? "icons/rocket.svg" : "icons/rocket_da.svg" });
  browser.browserAction.setTitle({ title: active ? "Faster Pageload (on)" : "Faster Pageload (off)" });
}

// Content scripts are registered at runtime so that the on/off switch and the blacklist
// apply to every feature, and setting changes take effect without reloading the extension.
// The new set is registered before the old one is removed, so pages never load without scripts,
// and a failed registration leaves the previous set in place.
async function registerContentScripts(settings) {
  const previous = registeredScripts;
  const next = [];

  try {
    if (settings.active) {
      const target = { matches: ["<all_urls>"] };
      const excludeMatches = toExcludeMatches(settings.blacklistSites);
      if (excludeMatches.length > 0) target.excludeMatches = excludeMatches;

      next.push(
        await browser.contentScripts.register({
          ...target,
          js: [{ file: "js/preload.js" }],
          runAt: "document_idle",
        })
      );

      if (settings.imgLazyLoad) {
        next.push(
          await browser.contentScripts.register({
            ...target,
            js: [{ file: "js/lazy_images.js" }],
            runAt: "document_start",
          })
        );
      }
    }
  } catch (error) {
    await Promise.allSettled(next.map((script) => script.unregister()));
    throw error;
  }

  registeredScripts = next;
  await Promise.allSettled(previous.map((script) => script.unregister()));
}

// Serializes setting changes and toggles so concurrent events can't interleave.
function enqueue(task) {
  applyQueue = applyQueue
    .then(task)
    .catch((error) => console.error("[faster pageload] Failed to apply settings:", error));
  return applyQueue;
}

function applySettings() {
  return enqueue(async () => {
    const settings = await getSettings();
    updateBrowserAction(settings.active);
    await registerContentScripts(settings);
  });
}

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    browser.tabs.create({ url: browser.runtime.getURL("static/setup.html") });
  }
});

browser.browserAction.onClicked.addListener(() =>
  enqueue(async () => {
    const { active } = await getSettings();
    await browser.storage.sync.set({ active: !active });
  })
);

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync") applySettings();
});

applySettings();
