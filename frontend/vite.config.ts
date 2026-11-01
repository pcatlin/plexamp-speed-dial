import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { inlineWebManifest } from "./plugins/inlineWebManifest";

/** In Docker dev compose, set to http://api:8000 so Vite proxies to the API container. */
const apiProxyTarget = process.env.VITE_API_PROXY ?? "http://127.0.0.1:8000";
const useFilePolling = process.env.VITE_USE_POLLING === "1";

export default defineConfig({
  plugins: [react(), inlineWebManifest()],
  server: {
    ...(useFilePolling ? { watch: { usePolling: true } } : {}),
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
