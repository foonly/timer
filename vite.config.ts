import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import svgLoader from "vite-svg-loader";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    // The frontend calls the backend via relative "/api/..." paths (same as production, where
    // nginx proxies /api to the Go service) - proxy it here too so `pnpm run dev` talks to
    // `make dev-backend` (port 8080 by default) without needing a separate base URL/CORS dance.
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
  plugins: [
    vue(),
    svgLoader(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["src/assets/hourglass.svg"],
      manifest: {
        name: "Foonlys Hierarchical Timer",
        short_name: "Timer",
        description: "Foonlys Hierarchical Timer",
        theme_color: "#000000",
        icons: [
          {
            src: "src/assets/hourglass.svg",
            sizes: "all",
            type: "image/svg",
          },
        ],
      },
    }),
  ],
});
