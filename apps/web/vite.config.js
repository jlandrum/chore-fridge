import { defineConfig } from "vite";
import jsox from "@js-ox/compiler/vite";

export default defineConfig({
  plugins: [jsox()],
  base: "./",
  build: {
    target: "es2018",
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
