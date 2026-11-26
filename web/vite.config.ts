import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import Icons from "unplugin-icons/vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

const version = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    Icons({ compiler: "jsx", jsx: "react" }),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/app-icon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Stellwall",
        short_name: "Stellwall",
        description: "Einkauf, To-dos, Kalender und mehr für die Familie.",
        lang: "de",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f4f6f8",
        theme_color: "#1a1f29",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
  server: { proxy: { "/api": { target: "http://localhost:8080", ws: true } } },
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"], css: false },
});
