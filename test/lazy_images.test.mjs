import { test } from "node:test";
import assert from "node:assert/strict";
import { runContentScript, sleep } from "./helpers.mjs";

test("existing images become lazy, explicit loading attributes are kept", () => {
  const { document } = runContentScript("lazy_images.js", {
    html: `<body><img id="a" src="/a.png"><img id="b" src="/b.png" loading="eager"></body>`,
  });
  assert.equal(document.getElementById("a").getAttribute("loading"), "lazy");
  assert.equal(document.getElementById("b").getAttribute("loading"), "eager");
});

test("images added while the page is loading become lazy, including nested ones", async () => {
  const { document } = runContentScript("lazy_images.js", { html: `<body></body>` });
  const img = document.createElement("img");
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `<figure><img id="nested" src="/n.png"></figure>`;
  document.body.append(img, wrapper);
  await sleep(0);
  assert.equal(img.getAttribute("loading"), "lazy");
  assert.equal(document.getElementById("nested").getAttribute("loading"), "lazy");
});
