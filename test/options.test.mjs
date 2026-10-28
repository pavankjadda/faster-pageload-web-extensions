import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { readScript, sleep } from "./helpers.mjs";

function loadOptionsPage(stored = {}) {
  const html = readFileSync(new URL("../options.html", import.meta.url), "utf8").replace(/<script[^>]*><\/script>/, "");
  const { window } = new JSDOM(html, { runScripts: "outside-only" });
  const storage = { ...stored };
  window.browser = {
    storage: {
      sync: {
        get: async () => ({ ...storage }),
        set: async (values) => Object.assign(storage, values),
      },
    },
  };
  window.eval(readScript("options.js"));
  return { window, document: window.document, storage };
}

async function submitBlacklist(page, value) {
  page.document.getElementById("blacklistSites").value = value;
  page.document.querySelector("form").dispatchEvent(new page.window.Event("submit", { cancelable: true }));
  await sleep(0);
}

test("blacklist entries are reduced to hosts before saving", async () => {
  const page = loadOptionsPage();
  await submitBlacklist(page, " WWW.Example.test , https://shop.example.test:8443/cart, *.news.example.test, localhost:3000, www.example.test");
  assert.equal(page.storage.blacklistSites, "www.example.test,shop.example.test,*.news.example.test,localhost");
  assert.match(page.document.getElementById("status").textContent, /^Saved/);
});

test("international domain names are stored as punycode", async () => {
  const page = loadOptionsPage();
  await submitBlacklist(page, "bücher.example");
  assert.equal(page.storage.blacklistSites, "xn--bcher-kva.example");
});

test("invalid entries block saving and are reported", async () => {
  const page = loadOptionsPage({ blacklistSites: "kept.example.test" });
  await submitBlacklist(page, "good.example.test, not a host, *.");
  assert.equal(page.storage.blacklistSites, "kept.example.test");
  assert.match(page.document.getElementById("status").textContent, /Invalid blacklist entries: not a host, \*\./);
});
