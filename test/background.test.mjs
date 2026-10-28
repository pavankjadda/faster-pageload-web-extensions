import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readScript, sleep } from "./helpers.mjs";

// Loads background.js against a fake WebExtension API and returns the recorded calls.
async function loadBackground(stored, { failLazyRegistration = false } = {}) {
  const storage = { ...stored };
  const registered = [];
  const listeners = { clicked: [], changed: [] };
  const icons = [];
  const fail = { lazyRegistration: failLazyRegistration };

  const browser = {
    storage: {
      sync: {
        get: async (keys) => Object.fromEntries(keys.filter((key) => key in storage).map((key) => [key, storage[key]])),
        set: async (values) => {
          const changes = {};
          for (const [key, newValue] of Object.entries(values)) {
            changes[key] = { oldValue: storage[key], newValue };
            storage[key] = newValue;
          }
          // Firefox fires onChanged asynchronously.
          setTimeout(() => listeners.changed.forEach((listener) => listener(changes, "sync")), 0);
        },
      },
      onChanged: { addListener: (listener) => listeners.changed.push(listener) },
    },
    contentScripts: {
      register: async (options) => {
        if (fail.lazyRegistration && options.js[0].file === "js/lazy_images.js") throw new Error("register failed");
        const registration = { options, active: true, unregister: async () => (registration.active = false) };
        registered.push(registration);
        return registration;
      },
    },
    browserAction: {
      setIcon: ({ path }) => icons.push(path),
      setTitle: () => {},
      onClicked: { addListener: (listener) => listeners.clicked.push(listener) },
    },
    runtime: { onInstalled: { addListener: () => {} }, getURL: (path) => path },
    tabs: { create: () => {} },
  };

  const context = vm.createContext({ browser, console: { ...console, warn: () => {}, error: () => {} } });
  vm.runInContext(readScript("background.js"), context);
  await settle();

  // Arrays created inside the vm context have a different prototype; copy them into this realm.
  const activeScripts = () =>
    registered
      .filter((registration) => registration.active)
      .map(({ options }) => ({
        file: options.js[0].file,
        runAt: options.runAt,
        excludeMatches: options.excludeMatches && [...options.excludeMatches],
      }));

  return { storage, listeners, icons, fail, activeScripts };
}

// Lets the storage events and the background's apply queue run to completion.
const settle = () => sleep(20);

test("defaults register only the preloader", async () => {
  const { activeScripts, icons } = await loadBackground({});
  assert.deepEqual(activeScripts(), [{ file: "js/preload.js", runAt: "document_idle", excludeMatches: undefined }]);
  assert.equal(icons.at(-1), "icons/rocket.svg");
});

test("lazy loading registers the image script at document_start", async () => {
  const { activeScripts } = await loadBackground({ imgLazyLoad: true });
  assert.deepEqual(
    activeScripts().map(({ file, runAt }) => [file, runAt]),
    [
      ["js/preload.js", "document_idle"],
      ["js/lazy_images.js", "document_start"],
    ]
  );
});

test("blacklisted hosts are excluded from every script and invalid entries are dropped", async () => {
  const { activeScripts } = await loadBackground({
    imgLazyLoad: true,
    blacklistSites: "www.example.test, *.news.example.test,https://bad/entry,,",
  });
  for (const script of activeScripts()) {
    assert.deepEqual(script.excludeMatches, ["*://www.example.test/*", "*://*.news.example.test/*"]);
  }
});

test("toolbar toggle applies through storage.onChanged", async () => {
  const { listeners, storage, activeScripts, icons } = await loadBackground({ imgLazyLoad: true });

  listeners.clicked[0]();
  await settle();
  assert.equal(storage.active, false);
  assert.deepEqual(activeScripts(), []);
  assert.equal(icons.at(-1), "icons/rocket_da.svg");

  listeners.clicked[0]();
  await settle();
  assert.equal(storage.active, true);
  assert.equal(activeScripts().length, 2);
  assert.equal(icons.at(-1), "icons/rocket.svg");
});

test("a fast double click toggles twice", async () => {
  const { listeners, storage, activeScripts } = await loadBackground({});
  listeners.clicked[0]();
  listeners.clicked[0]();
  await settle();
  assert.equal(storage.active, true);
  assert.equal(activeScripts().length, 1);
});

test("a failed registration keeps the previous scripts", async () => {
  const { activeScripts, fail, listeners } = await loadBackground({});
  fail.lazyRegistration = true;
  listeners.changed.forEach((listener) => listener({ imgLazyLoad: { newValue: true } }, "sync"));
  await settle();
  assert.deepEqual(
    activeScripts().map(({ file }) => file),
    ["js/preload.js"]
  );
});
