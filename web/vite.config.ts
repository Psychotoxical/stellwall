import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import Icons from "unplugin-icons/vite";

export default defineConfig({
  plugins: [react(), Icons({ compiler: "jsx", jsx: "react" })],
  server: { proxy: { "/api": "http://localhost:8080" } },
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"], css: false },
});
