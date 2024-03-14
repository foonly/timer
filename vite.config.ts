import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import svgLoader from "vite-svg-loader";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    svgLoader(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["src/assets/hourglass.svg"],
      manifest: {
        name: "Foonlys Hierarchical Timer",
        short_name: "FHT",
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
