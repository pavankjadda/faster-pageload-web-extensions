# Faster Pageload

A Firefox add-on that makes browsing feel faster. When you hover over a link, it starts loading that page in the background. When you click (on average about 400 ms later), much of the page has already been downloaded, so it appears almost instantly.

Pages still load normally. The add-on just starts the download a little earlier, using the browser's built-in [link prefetching](https://developer.mozilla.org/en-US/docs/Glossary/Prefetch).

## Contents

- [Features](#features)
- [Installation](#installation)
- [Settings](#settings)
- [Checking that preloading works](#checking-that-preloading-works)
- [Troubleshooting](#troubleshooting)
- [What is not preloaded](#what-is-not-preloaded)
- [Privacy](#privacy)
- [Development](#development)
- [Credits](#credits)

## Features

| Feature | Default | What it does |
|---|---|---|
| Preload on hover | On | Prefetches a link 65 ms after the pointer rests on it. Also prefetches on touch (mobile) and on mouse down. |
| Preload every visible link | On | Also prefetches links as they scroll into view, up to 30 per page. Uses stricter rules than hover (see [What is not preloaded](#what-is-not-preloaded)). |
| Lazy-load images | Off | Marks images with `loading="lazy"` so off-screen images load only when you scroll near them. |
| Site blacklist | Empty | Turns the add-on off completely on the listed sites. |
| Toolbar switch | On | Clicking the rocket icon turns the add-on on or off everywhere. A grey rocket means it is off. |

## Installation

### From addons.mozilla.org

Search for **Faster Pageload** on [addons.mozilla.org](https://addons.mozilla.org/firefox/) and click **Add to Firefox**. A setup page opens after installation.

### From source, temporarily

Use this to try a local checkout. Firefox removes temporary add-ons when it restarts.

1. Clone this repository.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Click **Load Temporary Add-on…** and select `manifest.json` in the repository folder.

Alternatively, run `pnpm install && pnpm start` (see [Development](#development)). This starts a separate Firefox profile with the add-on loaded and reloads it whenever you change a file.

Firefox 91 or newer is required.

## Settings

Open the settings from `about:addons` → **Faster Pageload** → **Preferences**.

- **Preload every visible link.** On by default. It costs more bandwidth and puts more load on the sites you visit, so turn it off on metered connections. It is skipped automatically when the browser reports data-saver mode.
- **Lazyload images.** Saves bandwidth on long, image-heavy pages. Images that already set their own `loading` attribute are left alone.
- **Blacklist sites.** A comma-separated list of sites where the add-on should do nothing.
  - `www.example.com` matches exactly that host.
  - `*.example.com` matches `example.com` and all its subdomains.
  - You can paste a full URL such as `https://example.com:8080/path`. It is reduced to the host (`example.com`). Ports are ignored.
  - International domain names are stored in their punycode form.
  - If any entry is invalid, nothing is saved and the invalid entries are listed next to the **Save** button.

Changes apply straight away to pages you load afterwards. Pages that are already open keep their old behaviour until you reload them.

## Checking that preloading works

Preloading happens in the background, so there is nothing to see on the page itself. To check it:

1. Open a site with internal links, for example a news site or documentation pages.
2. Open the developer tools (<kbd>F12</kbd>) and go to the **Console** tab. Turn on the **Debug** level in the filter bar.
3. Hover over a link to another page on the **same site**. A line like this appears:

   ```
   [faster pageload] prefetch https://example.com/some/page
   ```

4. In the **Inspector** tab, open `<head>`. There is now a `<link rel="prefetch" href="…">` for that page.
5. In the **Network** tab, the prefetch request should appear. When you then click the link, the page should come from the cache. The **Transferred** column shows `cached`, unless the site forbids caching (see below).

If step 3 logs nothing, see [Troubleshooting](#troubleshooting) and [What is not preloaded](#what-is-not-preloaded).

## Troubleshooting

**Nothing is logged when I hover over links.**

- Check that the toolbar rocket is coloured, not grey. A grey rocket means the add-on is switched off.
- Check that the site is not in your blacklist.
- Reload the tab. Tabs opened before the add-on was installed, enabled or changed don't have the preloader yet.
- Make sure the link goes to the same site (same scheme, host and port). See [What is not preloaded](#what-is-not-preloaded).
- Content scripts don't run on Firefox's own pages (`about:`, `addons.mozilla.org`, the PDF viewer, reader view).

**The console shows `prefetch …` but no request appears, or the page is not faster.**

- Open `about:config` and make sure `network.prefetch-next` is `true`. This is the default, but privacy-hardened setups such as arkenfox, LibreWolf or some enterprise policies set it to `false`. Firefox ignores prefetch links while it is off.
- The site may send `Cache-Control: no-store` for its pages. Firefox downloads the prefetch but is not allowed to reuse it, so the click loads the page again. Many logged-in or highly dynamic pages do this, and the add-on can't change it.
- Firefox may postpone prefetches while the current page is still loading other resources.

**Image lazy loading doesn't seem to change anything.**

The add-on sets `loading="lazy"` on images while the page is loading. Firefox often starts downloading images from the original HTML before an add-on can change them, so on many pages the option only affects images that are added later. Pages that already lazy-load their images won't show a difference either.

## What is not preloaded

To avoid side effects and wasted downloads, the add-on skips these links:

- **Links to other sites.** Firefox keeps a separate cache for each website you visit, so a page prefetched from site A is never reused when you open it on site B.
- **Links that look like they change something on the server.** Prefetching a logout link would log you out, and prefetching a vote link would cast the vote. These links are skipped if the URL contains any of:
  - `logout`, `log_out`, `sign-out`, `signoff`
  - `delete`, `destroy`, `remove`, `revoke`, `cancel`, `disconnect`
  - `subscribe`, `unsubscribe`, `follow`, `unfollow`, `vote`, `like`, `unlike`
  - `approve`, `confirm`, `accept`, `reject`, `archive`, `toggle`, `token`
  - `mark-as-read` and similar
  - `add-to-cart` and similar

  This list is a heuristic, so some harmless links are skipped too. It can't catch every action link a site might have.
- **Links to the current page,** including `#section` anchors.
- **Download links** (`<a download>`), and links that are not `http`/`https` (`mailto:`, `javascript:`, …).
- **Links the site marked with `data-no-instant`.** This is the same opt-out attribute that instant.page uses.
- **An `http` link on an `https` page,** because it counts as a different origin.

When **Preload every visible link** prefetches a link you didn't hover over, it also skips:

- **Links with a query string** (`?…`). Most action links put their parameters there, so these wait for a hover.
- **Links marked `rel="ugc"` or `rel="nofollow"`,** which sites use for links written by users.
- **Links inside comment sections** (`#comments`, `.comments`, `.comment`, `[itemprop="comment"]`).

## Privacy

- The add-on collects no data and sends nothing anywhere. It only asks Firefox to fetch pages on the site you are already on.
- Settings are stored in `storage.sync`, so they follow your Firefox account if you use Firefox Sync.
- Prefetching means a site can see requests for pages you hovered over but never opened. If that matters for a site, add it to the blacklist.
- Permissions:
  - `storage`, to save settings.
  - `<all_urls>`, so the preloader can run on the pages you visit.

## Development

### Requirements

- Node.js 22 or newer.
- [pnpm](https://pnpm.io/). The version is pinned in `package.json` → `packageManager`.
- Firefox, for `pnpm start`.

### Commands

```sh
pnpm install     # install dev dependencies (jsdom, web-ext)
pnpm test        # run the unit tests (node:test + jsdom)
pnpm lint        # Mozilla's add-on linter (web-ext lint)
pnpm start       # launch Firefox with the add-on, reloads on file changes
pnpm package     # test + lint + build web-ext-artifacts/faster_pageload-<version>.zip
make store       # same as pnpm package
make clean       # remove build output
```

`web-ext-config.mjs` controls which files are left out of the packaged zip: tests, tooling and docs.

### Project layout

```
manifest.json         Manifest V2 add-on manifest
js/background.js      Reads settings, registers the content scripts with
                      contentScripts.register, handles the toolbar switch
js/preload.js         Content script (document_idle): hover/touch/viewport prefetching
js/lazy_images.js     Content script (document_start): adds loading="lazy" to images
js/options.js         Settings page logic, validates the blacklist
options.html          Settings page
static/setup.html     Page shown after installation
icons/                Toolbar icons (rocket.svg = on, rocket_da.svg = off)
test/                 Unit tests
```

### How it works

- **No static content scripts.** The background script registers the content scripts at runtime with `browser.contentScripts.register`. When the add-on is off, nothing is injected at all. The blacklist becomes `excludeMatches` patterns.
- **Settings apply without a reload.** Any change to the settings (`storage.onChanged`) re-registers the scripts. The new registrations are added before the old ones are removed, so no page loads without the scripts during the switch.
- **Preloading.** `preload.js` adds a `<link rel="prefetch">` element for the chosen URL. Firefox fetches it at low priority and reuses the cached response when you navigate there.

### Releasing

1. Bump `version` in both `manifest.json` and `package.json`.
2. Add an entry to `CHANGELOG.md`.
3. Run `pnpm package` and upload the zip from `web-ext-artifacts/` to addons.mozilla.org.

## Credits

- Add-on icon by [Freepik](https://www.flaticon.com/authors/freepik).
- The preloading approach is based on [instant.page](https://instant.page/) by Alexandre Dieulot ([MIT license](https://opensource.org/licenses/MIT)).
