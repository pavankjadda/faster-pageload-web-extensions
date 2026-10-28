"use strict";

// Runs at document_start and marks images as natively lazy while the page is being parsed,
// so off-screen images are only fetched when they are about to scroll into view.
// Images that already have a loading attribute (e.g. loading="eager") are left untouched.
(() => {
  // See preload.js: guards against double injection while registrations are swapped.
  if (globalThis.fasterPageloadLazyImagesLoaded) return;
  globalThis.fasterPageloadLazyImagesLoaded = true;

  function makeLazy(img) {
    if (!img.hasAttribute("loading")) img.setAttribute("loading", "lazy");
  }

  function handleAddedNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.tagName === "IMG") {
      makeLazy(node);
    } else if (node.firstElementChild) {
      node.querySelectorAll("img").forEach(makeLazy);
    }
  }

  document.querySelectorAll("img").forEach(makeLazy);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) mutation.addedNodes.forEach(handleAddedNode);
  });
  observer.observe(document, { childList: true, subtree: true });

  // Images added after load are the page's own business; stop paying for the observer.
  window.addEventListener("load", () => observer.disconnect(), { once: true });
})();
