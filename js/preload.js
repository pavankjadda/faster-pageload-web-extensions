"use strict";

// Prefetches same-origin pages the user is about to open: on hover/touch by default, or every
// link that scrolls into view when "Preload every visible link" is enabled.
// Approach based on instant.page by Alexandre Dieulot (https://instant.page/).
(() => {
  const HOVER_DELAY_MS = 65;
  // Touch devices fire a synthetic mouseover after touchstart; ignore it.
  const TOUCH_MOUSEOVER_GAP_MS = 1111;
  // Upper bound for viewport mode so link-heavy pages don't flood the server.
  const MAX_VIEWPORT_PRELOADS = 30;
  // GET links that commonly change state on the server must never be fetched speculatively.
  const UNSAFE_LINK =
    /(log|sign)[-_ ]?(out|off)|delete|destroy|remove|revoke|unsubscribe|unfollow|cancel|disconnect/i;

  const prefetchSupported = document.createElement("link").relList?.supports?.("prefetch");
  if (!prefetchSupported || !document.body) return;

  const preloaded = new Set();
  let lastTouchAt = -Infinity;
  let hoverTimer;

  function isPreloadable(anchor) {
    if (!anchor || !anchor.href || anchor.hasAttribute("download")) return false;
    if ("noInstant" in anchor.dataset) return false;
    if (anchor.protocol !== "http:" && anchor.protocol !== "https:") return false;
    // Firefox partitions its cache by top-level site, so cross-origin prefetches are never reused.
    if (anchor.origin !== location.origin) return false;
    // The current page itself, with or without a fragment.
    if (anchor.pathname + anchor.search === location.pathname + location.search) return false;
    return !UNSAFE_LINK.test(decodedPathAndQuery(anchor));
  }

  function decodedPathAndQuery(anchor) {
    const raw = anchor.pathname + anchor.search;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  function prefetch(url) {
    if (preloaded.has(url)) return;
    preloaded.add(url);
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = url;
    (document.head || document.documentElement).appendChild(link);
    console.debug("[faster pageload] prefetch", url);
  }

  function anchorFrom(event) {
    return event.target instanceof Element ? event.target.closest("a") : null;
  }

  function cancelHover(event) {
    if (event.relatedTarget && anchorFrom(event) === event.relatedTarget.closest?.("a")) return;
    clearTimeout(hoverTimer);
    hoverTimer = undefined;
  }

  const listenerOptions = { capture: true, passive: true };

  document.addEventListener(
    "touchstart",
    (event) => {
      lastTouchAt = performance.now();
      const anchor = anchorFrom(event);
      if (isPreloadable(anchor)) prefetch(anchor.href);
    },
    listenerOptions
  );

  document.addEventListener(
    "mouseover",
    (event) => {
      if (performance.now() - lastTouchAt < TOUCH_MOUSEOVER_GAP_MS) return;
      const anchor = anchorFrom(event);
      if (!isPreloadable(anchor) || preloaded.has(anchor.href)) return;
      // Same function reference each time, so repeated hovers don't stack listeners.
      anchor.addEventListener("mouseout", cancelHover, { passive: true });
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        prefetch(anchor.href);
        hoverTimer = undefined;
      }, HOVER_DELAY_MS);
    },
    listenerOptions
  );

  // Keyboard and fast clicks that never produced a hover still get a head start.
  document.addEventListener(
    "mousedown",
    (event) => {
      const anchor = anchorFrom(event);
      if (event.button === 0 && isPreloadable(anchor)) prefetch(anchor.href);
    },
    listenerOptions
  );

  function preloadVisibleLinks() {
    if (navigator.connection?.saveData) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        if (preloaded.size >= MAX_VIEWPORT_PRELOADS) {
          observer.disconnect();
          return;
        }
        observer.unobserve(entry.target);
        // Re-check: the page may have changed the link since it was observed.
        if (isPreloadable(entry.target)) prefetch(entry.target.href);
      }
    });
    for (const anchor of document.querySelectorAll("a[href]")) {
      if (isPreloadable(anchor)) observer.observe(anchor);
    }
  }

  browser.storage.sync.get("preloadViewport").then(
    ({ preloadViewport }) => {
      if (!preloadViewport) return;
      const whenIdle = window.requestIdleCallback
        ? (callback) => requestIdleCallback(callback, { timeout: 1500 })
        : (callback) => setTimeout(callback, 0);
      whenIdle(preloadVisibleLinks);
    },
    (error) => console.error("[faster pageload] Could not read settings:", error)
  );
})();
