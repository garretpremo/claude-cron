import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const SERVER_PORT = process.env.SERVER_PORT ?? "8787";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${SERVER_PORT}`,
        changeOrigin: true,
        ws: false,
        // SSE works through the proxy without special config in vite 5+
      },
    },
  },
});
