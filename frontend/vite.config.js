import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "../src/lawftune/_frontend",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/status": "http://127.0.0.1:5293",
      "/healthz": "http://127.0.0.1:5293",
      "/config": "http://127.0.0.1:5293",
    },
  },
});
