import { defineConfig } from "astro/config";
import react from "@astrojs/react";

const backendUrl = process.env.BACKEND_URL || "http://localhost:3000";

export default defineConfig({
  integrations: [react()],
  output: "static",
  build: {
    format: "file"
  },
  vite: {
    server: {
      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true
        }
      }
    },
    preview: {
      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true
        }
      }
    }
  }
});
