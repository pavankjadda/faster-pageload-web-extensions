import { test } from "node:test";
import assert from "node:assert/strict";
import { runContentScript, prefetchedUrls, sleep } from "./helpers.mjs";

const PAGE = `<!doctype html><html><head></head><body>
  <a id="plain" href="/cart">cart</a>
  <a id="query" href="/search?q=shoes&page=2">search</a>
  <a id="external" href="https://other.example.test/page">external</a>
  <a id="logout" href="/account/logout">logout</a>
  <a id="sign-out" href="/users/sign_out">sign out</a>
  <a id="encoded" href="/session?do=log%5Fout">encoded logout</a>
  <a id="delete" href="/items?action=delete&id=7">delete</a>
  <a id="hash" href="#reviews">reviews</a>
  <a id="self" href="/products#">this page</a>
  <a id="download" href="/manual.pdf" download>manual</a>
  <a id="opt-out" href="/no" data-no-instant>opt out</a>
  <a id="mailto" href="mailto:help@example.test">mail</a>
  <a id="nested" href="/nested"><span id="inner">nested</span></a>
  <a id="vote" href="/posts/9/vote?dir=up">upvote</a>
  <a id="like" href="/posts/9/like">like</a>
  <a id="mark-read" href="/notifications/mark-as-read">mark read</a>
  <a id="add-to-cart" href="/cart/add_to_cart/42">buy</a>
  <a id="ugc" href="/user/someone" rel="ugc">user link</a>
  <section id="comments"><a id="in-comment" href="/spam-page">comment link</a></section>
</body></html>`;

function hover(window, element) {
  element.dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true }));
}

test("hovering a same-origin link prefetches it after the hover delay", async () => {
  const { window, document } = runContentScript("preload.js", { html: PAGE });
  hover(window, document.getElementById("plain"));
  assert.deepEqual(prefetchedUrls(document), [], "must not prefetch before the delay");
  await sleep(100);
  assert.deepEqual(prefetchedUrls(document), ["https://shop.example.test/cart"]);
});

test("links with query strings are prefetched", async () => {
  const { window, document } = runContentScript("preload.js", { html: PAGE });
  hover(window, document.getElementById("query"));
  await sleep(100);
  assert.deepEqual(prefetchedUrls(document), ["https://shop.example.test/search?q=shoes&page=2"]);
});

test("hovering a child element of a link prefetches the link", async () => {
  const { window, document } = runContentScript("preload.js", { html: PAGE });
  hover(window, document.getElementById("inner"));
  await sleep(100);
  assert.deepEqual(prefetchedUrls(document), ["https://shop.example.test/nested"]);
});

test("unsafe, external and non-navigational links are never prefetched", async () => {
  const { window, document } = runContentScript("preload.js", { html: PAGE });
  const skipped = ["external", "logout", "sign-out", "encoded", "delete", "hash", "self", "download", "opt-out", "mailto"];
  skipped.push("vote", "like", "mark-read", "add-to-cart");
  for (const id of skipped) {
    hover(window, document.getElementById(id));
    await sleep(100);
  }
  assert.deepEqual(prefetchedUrls(document), []);
});

test("leaving the link before the delay cancels the prefetch", async () => {
  const { window, document } = runContentScript("preload.js", { html: PAGE });
  const link = document.getElementById("plain");
  hover(window, link);
  link.dispatchEvent(new window.MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
  await sleep(100);
  assert.deepEqual(prefetchedUrls(document), []);
});

test("mousedown prefetches immediately and each URL is prefetched once", async () => {
  const { window, document } = runContentScript("preload.js", { html: PAGE });
  const link = document.getElementById("plain");
  link.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, button: 0 }));
  assert.deepEqual(prefetchedUrls(document), ["https://shop.example.test/cart"], "mousedown must not wait");
  hover(window, link);
  await sleep(100);
  assert.deepEqual(prefetchedUrls(document), ["https://shop.example.test/cart"]);
});

test("touchstart prefetches immediately and suppresses the synthetic mouseover", async () => {
  const { window, document } = runContentScript("preload.js", { html: PAGE });
  document.getElementById("plain").dispatchEvent(new window.Event("touchstart", { bubbles: true }));
  assert.deepEqual(prefetchedUrls(document), ["https://shop.example.test/cart"]);
  hover(window, document.getElementById("query"));
  await sleep(100);
  assert.deepEqual(prefetchedUrls(document), ["https://shop.example.test/cart"]);
});

test("viewport mode skips query strings and user-generated links", async () => {
  const { observed } = runContentScript("preload.js", { html: PAGE, storage: { preloadViewport: true } });
  await sleep(50);
  assert.deepEqual(
    observed.map((anchor) => anchor.id),
    ["plain", "nested"]
  );
});

test("hovering still prefetches links that viewport mode skips", async () => {
  const { window, document } = runContentScript("preload.js", { html: PAGE });
  for (const id of ["query", "ugc", "in-comment"]) {
    hover(window, document.getElementById(id));
    await sleep(100);
  }
  assert.equal(prefetchedUrls(document).length, 3);
});

test("viewport mode prefetches visible links, re-checks them and stops at the cap", async () => {
  const links = Array.from({ length: 40 }, (_, i) => `<a href="/p/${i}">${i}</a>`).join("");
  const { document, observers, observed } = runContentScript("preload.js", {
    html: `<body>${links}</body>`,
    storage: { preloadViewport: true },
  });
  await sleep(50);

  observed[0].href = "/account/logout";
  observed[1].href = "/p/1?ref=changed";
  observers[0].callback(observed.map((target) => ({ target, isIntersecting: true })));

  const urls = prefetchedUrls(document);
  assert.equal(urls.length, 30);
  assert.ok(!urls.some((url) => url.includes("logout") || url.includes("?")));
  assert.ok(observers[0].disconnected);
});

test("viewport mode is off by default", async () => {
  const { observed } = runContentScript("preload.js", { html: PAGE, storage: {} });
  await sleep(50);
  assert.equal(observed.length, 0);
});

test("a link retargeted during the hover delay is not prefetched", async () => {
  const { window, document } = runContentScript("preload.js", { html: PAGE });
  const link = document.getElementById("plain");
  hover(window, link);
  link.href = "/account/logout";
  await sleep(100);
  assert.deepEqual(prefetchedUrls(document), []);
});

test("a link removed during the hover delay is not prefetched", async () => {
  const { window, document } = runContentScript("preload.js", { html: PAGE });
  const link = document.getElementById("plain");
  hover(window, link);
  link.remove();
  await sleep(100);
  assert.deepEqual(prefetchedUrls(document), []);
});

test("a second injection into the same page is ignored", async () => {
  const { window, document, inject } = runContentScript("preload.js", { html: PAGE });
  inject();
  document.getElementById("plain").dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, button: 0 }));
  assert.equal(document.querySelectorAll('link[rel="prefetch"]').length, 1);
});

test("viewport mode picks up links added after load", async () => {
  const { document, observed } = runContentScript("preload.js", { html: "<body></body>", storage: { preloadViewport: true } });
  await sleep(50);
  const list = document.createElement("ul");
  list.innerHTML = '<li><a id="late" href="/late">late</a></li><li><a id="late-q" href="/late?x=1">q</a></li>';
  document.body.append(list);
  const direct = document.createElement("a");
  direct.id = "late-direct";
  direct.href = "/late-direct";
  document.body.append(direct);
  await sleep(0);
  assert.deepEqual(
    observed.map((anchor) => anchor.id),
    ["late", "late-direct"]
  );
});
