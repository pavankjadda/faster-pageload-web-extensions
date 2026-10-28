# Changelog

## 1.9.0

- Fixed: links are now preloaded on most sites. The bundled instant.page script only preloaded same-origin links without query strings, so most links were skipped. It has been replaced by a built-in preloader that also handles query strings and skips logout/delete-style links.
- Fixed: "Preload every visible link" now works. The option was saved but never read. It preloads up to 30 visible links per page and is now on by default. Installs that saved the settings page before keep their stored value.
- Fixed: the toolbar on/off switch and the site blacklist now apply to preloading as well, not only to image lazy loading.
- Fixed: pages no longer throw an error when no blacklist has been saved yet.
- Changed: blacklist entries are validated when you save. Pasted URLs are reduced to their host, wildcard entries such as `*.example.com` are supported, and invalid entries are shown instead of being ignored without notice.
- Changed: image lazy loading now uses the browser's native `loading="lazy"`, applied while the page loads. The old approach delayed image requests for up to 15 seconds and shared state between tabs.
- Changed: settings apply immediately without reloading the add-on.
- Changed: the `webRequest`, `webRequestBlocking` and `web_accessible_resources` entries were removed from the manifest because they are no longer needed.
- Changed: the setup page now points to the setting that controls prefetching (`network.prefetch-next`).
