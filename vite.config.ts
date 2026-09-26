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
        // SIN html en la precaché (26-sep-2026). Con index.html precacheado,
        // el service worker servía la página de SU publicación sin preguntar
        // al servidor: al abrir el navegador tras una publicación nueva, esa
        // página vieja pedía hojas de estilo y trozos que ya no existen en el
        // servidor y la web salía sin estilos hasta un Ctrl+F5 (que se salta
        // el service worker). Los .js/.css llevan el hash en el nombre: esos
        // sí se precachean, son inmutables.
        globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Manejador de push/notificationclick para Camberas Org
        importScripts: ["/push-sw.js"],
        runtimeCaching: [
          // Las páginas, SIEMPRE del servidor mientras haya red (así apuntan
          // a los .css/.js de la publicación vigente). La copia guardada solo
          // se usa sin cobertura: /org y /timing siguen abriendo en la
          // montaña si ya se abrieron antes con red.
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "paginas",
              networkTimeoutSeconds: 6,
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
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
        // Sin index.html precacheado no hay fallback de navegación: de eso se
        // encarga la regla NetworkFirst de arriba
        navigateFallback: null,
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Un único paquete de 6 MB tumbaba la compilación de Lovable por
    // memoria (15-ago: "build failed with exit status 1" justo tras el
    // "built in 21s"). Separando las librerías pesadas, rollup trabaja
    // con trozos manejables y el navegador solo baja lo que usa.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Forma de función y no de objeto: con el objeto, rollup metía en el
        // primer trozo listado (mapbox) los módulos compartidos (los
        // ayudantes commonjs) y en "charts" el propio React, así que cualquier
        // página, también la web propia de una carrera, arrastraba mapbox
        // (1,6 MB) y recharts (0,5 MB). Con la función cada librería va a su
        // trozo y solo a su trozo; lo compartido lo reparte rollup.
        manualChunks(id: string) {
          const ruta = id.replace(/\\/g, "/");
          // Ayudantes commonjs de rollup (módulo virtual): los usan react,
          // supabase, mapbox…; si no se fijan acaban fundidos en "charts".
          if (ruta.includes("commonjsHelpers")) return "react";
          if (!ruta.includes("/node_modules/")) return undefined;
          // clsx, tailwind-merge y cva son diminutos y los usa todo; si se
          // dejan sueltos, rollup (experimentalMinChunkSize) los funde con el
          // trozo que primero los carga, que era "charts", y la portada
          // volvía a arrastrar recharts. Van con React, que siempre se baja.
          if (/\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|clsx|tailwind-merge|class-variance-authority)\//.test(ruta)) return "react";
          if (ruta.includes("/node_modules/mapbox-gl/")) return "mapbox";
          if (/\/node_modules\/(recharts|victory-vendor|d3-[a-z-]+)\//.test(ruta)) return "charts";
          if (ruta.includes("/node_modules/@supabase/")) return "supabase";
          if (ruta.includes("/node_modules/@tanstack/")) return "query";
          return undefined;
        },
      },
    },
  },
}));
