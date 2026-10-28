import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

export function readScript(name) {
  return readFileSync(new URL(`../js/${name}`, import.meta.url), "utf8");
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs a content script inside a jsdom page with a minimal `browser` API stub.
export function runContentScript(name, { html, url = "https://shop.example.test/products", storage = {} } = {}) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;

  // jsdom has no prefetch support, IntersectionObserver or requestIdleCallback.
  window.DOMTokenList.prototype.supports = (token) => token === "prefetch";
  const observed = [];
  const observers = [];
  window.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe(target) {
      observed.push(target);
    }
    unobserve() {}
    disconnect() {
      this.disconnected = true;
    }
  };
  window.browser = { storage: { sync: { get: async () => ({ ...storage }) } } };

  const inject = () => window.eval(readScript(name));
  inject();
  return { window, document: window.document, observed, observers, inject };
}

export function prefetchedUrls(document) {
  return [...document.querySelectorAll('link[rel="prefetch"]')].map((link) => link.href);
}
