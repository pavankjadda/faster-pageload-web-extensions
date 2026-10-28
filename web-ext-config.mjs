// Shared by `pnpm lint`, `pnpm start` and `pnpm build`: only the add-on itself is packaged.
export default {
  ignoreFiles: [
    "test",
    "node_modules",
    "web-ext-artifacts",
    "package.json",
    "pnpm-lock.yaml",
    "web-ext-config.mjs",
    "Makefile",
    "CHANGELOG.md",
    "README.md",
    "faster_pageload.zip",
  ],
};
