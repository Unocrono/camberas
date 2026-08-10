import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Sello de la versión servida: la app lo enseña al pie para poder
  // distinguir de un vistazo "no está desplegado" de "mi móvil tiene
  // una copia vieja en caché" (ver docs/pwa-actualizacion-org.md)
  define: {
    __BUILD_TIME__: JSON.stringify(
      new Date().toLocaleString("es-ES", {
        timeZone: "Europe/Madrid",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    ),
  },
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "robots.txt", "timing-icon-192.png", "timing-icon-512.png", "gps-icon-192.png", "gps-icon-512.png", "org-icon-192.png", "org-icon-512.png"],
      manifest: false, // We'll handle manifests manually for multiple PWAs
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Manejador de push/notificationclick para Camberas Org
        importScripts: ["/push-sw.js"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24,
              },
            },
          },
        ],
        navigateFallback: "/index.html",
        navigateFallbackAllowlist: [/^\/timing/, /^\/track/, /^\/org$/, /^\/org\//],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
