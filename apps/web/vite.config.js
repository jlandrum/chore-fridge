import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { defineConfig } from "vite";
import jsox from "@js-ox/compiler/vite";

const require = createRequire(import.meta.url);
const emojiDataFile = require.resolve("emoji-picker-element-data/en/emojibase/data.json");

function emojiData() {
  return {
    name: "emoji-data",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/emoji-data.json") return next();
        res.setHeader("Content-Type", "application/json");
        res.end(readFileSync(emojiDataFile));
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "emoji-data.json",
        source: readFileSync(emojiDataFile),
      });
    },
  };
}

export default defineConfig({
  plugins: [jsox(), emojiData()],
  base: "./",
  css: {
    transformer: "lightningcss",
    lightningcss: {
      // Family Hub / Tizen Internet is Chromium 85–108 on most fridges.
      targets: { chrome: 85 << 16 },
    },
  },
  build: {
    target: "es2018",
    cssMinify: "lightningcss",
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8080",
    },
  },
});
