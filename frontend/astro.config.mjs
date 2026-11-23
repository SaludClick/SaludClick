import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import { loadEnv } from "vite";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const backendUrl = process.env.BACKEND_URL || "http://localhost:3000";
const allowedPublic = new Set(["PUBLIC_API_URL", "PUBLIC_RECAPTCHA_SITE_KEY"]);
const publicDirectory = fileURLToPath(new URL("./public/", import.meta.url));
const publicExtensions = /\.(?:html|css|js|mjs|json|svg|png|jpe?g|webp|gif|ico|avif|woff2?|ttf|txt|xml|webmanifest)$/i;
const privateName = /^(?:\.|private(?:[_-]uploads)?|backups?|respaldos?|auditor[ií]as?|credentials)(?:[._-]|$)|(?:^|[._-])(?:private|backup|respaldo|dump|credentials?|secret)(?:[._-]|$)/i;

async function validatePublicAssets(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || privateName.test(entry.name) || entry.isSymbolicLink()) {
      throw new Error("El directorio público contiene un archivo privado u oculto.");
    }
    if (entry.isDirectory()) {
      await validatePublicAssets(join(directory, entry.name));
    } else if (!entry.isFile() || !publicExtensions.test(entry.name)) {
      throw new Error("El directorio público contiene un tipo de archivo ajeno al sitio.");
    }
  }
}

export default defineConfig({
  integrations: [react(), {
    name: "saludclick-public-assets",
    hooks: { "astro:build:start": () => validatePublicAssets(publicDirectory) }
  }],
  output: "static",
  build: {
    format: "file"
  },
  vite: {
    build: { sourcemap: false },
    plugins: [{
      name: "saludclick-public-env",
      configResolved({ mode, envDir }) {
        const values = loadEnv(mode, envDir, "PUBLIC_");
        const names = Object.keys(values);
        if (names.some(name => !allowedPublic.has(name))) {
          throw new Error("La configuración de Astro contiene una variable PUBLIC_ sin autorizar.");
        }
        if (values.PUBLIC_API_URL) {
          let url;
          try { url = new URL(values.PUBLIC_API_URL, "https://saludclick.invalid"); }
          catch { throw new Error("PUBLIC_API_URL no contiene una dirección válida."); }
          if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
            throw new Error("PUBLIC_API_URL debe contener una dirección sin credenciales ni parámetros.");
          }
        }
      }
    }],
    server: {
      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true
        },
        "/socket.io": {
          target: backendUrl,
          changeOrigin: true,
          ws: true
        }
      }
    },
    preview: {
      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true
        },
        "/socket.io": {
          target: backendUrl,
          changeOrigin: true,
          ws: true
        }
      }
    }
  }
});
